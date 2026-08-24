// Shared by the browser app and the monthly-report Edge Function.
//
// It lives here rather than in src/lib because a Deno function cannot import
// from the Vite app, and a second copy would drift: the numbers a client
// receives by email have to be the same numbers the CRM shows on screen.
// Self-contained on purpose, so neither side pulls a chain of app modules.

export const LIVE_STATUSES = ['ACTIVE', 'WITH_ISSUES']

export function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Turns ad_daily rows into one row per calendar day.
 *
 * Gap-filling is the important part. Meta returns nothing for a day with no
 * delivery, so plotting the rows as they arrive silently compresses the x-axis:
 * a week with three quiet days would draw the same width as a full week, and
 * the shape of the trend would be a lie. Missing days are real zeros.
 */
export function buildDailySeries(rows, from, to) {
  const byDate = new Map()

  for (const r of rows) {
    const d = String(r.date).slice(0, 10)
    const b = byDate.get(d) || { date: d, spend: 0, leads: 0, clicks: 0, impressions: 0 }
    b.spend += Number(r.spend) || 0
    b.leads += Number(r.leads) || 0
    b.clicks += Number(r.clicks) || 0
    b.impressions += Number(r.impressions) || 0
    byDate.set(d, b)
  }

  const out = []
  const cursor = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)

  while (cursor <= end) {
    const key = formatDate(cursor)
    const b = byDate.get(key) || { date: key, spend: 0, leads: 0, clicks: 0, impressions: 0 }
    out.push({
      ...b,
      // Derived per day from that day's own totals, never averaged across days.
      cpl: b.leads > 0 ? b.spend / b.leads : 0,
      ctr: b.impressions > 0 ? (b.clicks / b.impressions) * 100 : 0,
    })
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

/**
 * Trailing average, for the days where a full window exists.
 *
 * Daily lead counts are small integers that bounce between 0 and 5, so the raw
 * columns show noise rather than direction. Earlier days return null rather
 * than a partial-window average: averaging two days and calling it a 7-day
 * average would put a confident line on the least reliable part of the chart.
 */
export function rollingAverage(series, key, window = 7) {
  return series.map((row, i) => {
    if (i < window - 1) return { date: row.date, value: null }
    let sum = 0
    for (let j = i - window + 1; j <= i; j++) sum += series[j][key] || 0
    return { date: row.date, value: sum / window }
  })
}

// Rates come from the totals, never from averaging daily rates: a $2 day and a
// $200 day would otherwise count equally toward cost per lead.
export function totals(series) {
  const t = series.reduce(
    (a, r) => ({
      spend: a.spend + r.spend,
      leads: a.leads + r.leads,
      clicks: a.clicks + r.clicks,
      impressions: a.impressions + r.impressions,
    }),
    { spend: 0, leads: 0, clicks: 0, impressions: 0 }
  )
  return {
    ...t,
    cpl: t.leads > 0 ? t.spend / t.leads : 0,
    ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0,
  }
}

/**
 * Percentage change against the previous window of the same length.
 *
 * Returns null rather than 0 when there is nothing to compare against, so the
 * UI can stay silent instead of claiming a flat trend it cannot see.
 */
export function pctChange(current, previous) {
  if (!previous) return null
  return ((current - previous) / previous) * 100
}

// For cost per lead, down is the good direction. Everything else is up.
export const LOWER_IS_BETTER = new Set(['cpl'])

export function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return formatDate(d)
}

// Inlined, table-based, no script and no web fonts. Mail clients strip <style>
// blocks, ignore flexbox, and Outlook still lays out with tables, so the report
// is built the way email has always been built rather than the way the app is.
const INK = '#0F172A'
const MUTED = '#64748B'
const LINE = '#E2E8F0'
const BAR = '#2A78D6'
const CHART_H = 120

const money = (n) =>
  `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Deliberately strict. A malformed address does not bounce cleanly, it silently
// fails or lands the domain in a spam trap, so a bad one skips the send.
export function validEmail(value) {
  const v = String(value || '').trim()
  return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(v)
}

/** The calendar month before `today`, which is what a report sent on the 1st covers. */
export function reportMonth(today = new Date()) {
  const end = new Date(today.getFullYear(), today.getMonth(), 0)
  const start = new Date(end.getFullYear(), end.getMonth(), 1)
  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return {
    from: iso(start),
    to: iso(end),
    key: iso(start),
    label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    days: end.getDate(),
  }
}

/** The month before that, for the comparison figures. */
export function previousMonth(month) {
  const [y, m] = month.key.split('-').map(Number)
  return reportMonth(new Date(y, m - 1, 1))
}

/**
 * Decides whether a client should get a report at all.
 *
 * "Live" is read from the ad's status now, not during the month: a client whose
 * ads have all stopped does not want a report about a month that has ended, and
 * that is the case this rule exists to catch. Every rejection carries a reason
 * so the send log says why rather than leaving a silent gap.
 */
export function eligibility({ client, intake, rows }) {
  if (client.archived) return { ok: false, reason: 'archived' }
  if (client.is_internal) return { ok: false, reason: 'internal business, not a client' }
  if (!client.meta_ads_active) return { ok: false, reason: 'Meta ads switched off in the CRM' }

  const spend = rows.reduce((a, r) => a + (Number(r.spend) || 0), 0)
  if (spend <= 0) return { ok: false, reason: 'no Meta spend in the month' }

  const live = rows.some((r) => LIVE_STATUSES.includes(r.effective_status))
  if (!live) return { ok: false, reason: 'no live ads — campaigns have stopped' }

  const email = intake?.contact_email
  if (!email) return { ok: false, reason: 'no contact email on the intake form' }
  if (!validEmail(email)) return { ok: false, reason: `contact email is not valid: ${email}` }

  return { ok: true, email: String(email).trim() }
}

/** Everything the email needs, worked out once so the HTML is pure formatting. */
export function buildReportModel({ client, month, rows, prevRows = [] }) {
  const series = buildDailySeries(rows, month.from, month.to)
  const now = totals(series)
  // Over the PREVIOUS month's window, not this one. Bucketing July rows into
  // August's dates drops every one of them, which reads as "no earlier data"
  // and silently removes the comparison from every report.
  const prev = previousMonth(month)
  const before = totals(buildDailySeries(prevRows, prev.from, prev.to))

  // Per ad, so the report can name what actually worked rather than just
  // reporting a total.
  const byAd = new Map()
  for (const r of rows) {
    const a = byAd.get(r.ad_id) || { name: r.ad_name || 'Untitled ad', spend: 0, leads: 0 }
    a.spend += Number(r.spend) || 0
    a.leads += Number(r.leads) || 0
    byAd.set(r.ad_id, a)
  }
  const ads = [...byAd.values()]
    .map((a) => ({ ...a, cpl: a.leads > 0 ? a.spend / a.leads : 0 }))
    .sort((x, y) => y.leads - x.leads || x.cpl - y.cpl)

  return {
    client,
    month,
    series,
    totals: now,
    deltas: {
      spend: pctChange(now.spend, before.spend),
      leads: pctChange(now.leads, before.leads),
      cpl: pctChange(now.cpl, before.cpl),
    },
    hadPrevious: before.spend > 0,
    topAds: ads.filter((a) => a.leads > 0).slice(0, 5),
    bestDay: series.reduce((a, r) => (r.leads > (a?.leads ?? -1) ? r : a), null),
  }
}

// Mail clients cannot render an SVG, so the chart is table cells with a
// coloured block sized in pixels. It survives Gmail, Outlook and Apple Mail
// because there is nothing clever in it.
function chartHtml(series) {
  const max = Math.max(...series.map((r) => r.leads), 1)
  const width = Math.max(4, Math.floor(520 / series.length) - 2)

  const cells = series
    .map((r) => {
      const h = Math.round((r.leads / max) * CHART_H)
      const block = h > 0
        ? `<div style="width:${width}px;height:${h}px;background:${BAR};border-radius:2px 2px 0 0;font-size:0;line-height:0;">&nbsp;</div>`
        : `<div style="width:${width}px;height:1px;background:${LINE};font-size:0;line-height:0;">&nbsp;</div>`
      const day = Number(r.date.slice(8))
      const label = series.length <= 31 && (day === 1 || day % 7 === 0) ? String(day) : '&nbsp;'
      return (
        `<td valign="bottom" style="padding:0 1px;text-align:center;">${block}` +
        `<div style="font-size:9px;color:${MUTED};padding-top:4px;">${label}</div></td>`
      )
    })
    .join('')

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">` +
    `<tr>${cells}</tr></table>`
  )
}

function deltaHtml(value, lowerIsBetter = false) {
  if (value == null || !Number.isFinite(value)) return ''
  const up = value > 0
  const flat = Math.abs(value) < 0.5
  const good = flat ? null : lowerIsBetter ? !up : up
  const colour = good === null ? MUTED : good ? '#15803D' : '#B91C1C'
  const arrow = flat ? '±' : up ? '▲' : '▼'
  return `<span style="color:${colour};font-size:12px;"> ${arrow} ${Math.abs(value).toFixed(0)}%</span>`
}

function statCell(label, value, delta) {
  return (
    `<td width="33%" style="padding:14px 10px;border:1px solid ${LINE};border-radius:8px;">` +
    `<div style="font-size:12px;color:${MUTED};">${label}</div>` +
    `<div style="font-size:22px;font-weight:700;color:${INK};padding-top:2px;">${value}${delta}</div>` +
    `</td>`
  )
}

/**
 * The email body.
 *
 * Text is escaped on the way in: ad names and campaign names come back from
 * Meta and end up inside markup, so they are data rather than HTML.
 */
export function renderReportHtml(model, { agencyName = 'Round Table Management' } = {}) {
  const { client, month, totals, deltas, series, topAds, bestDay, hadPrevious } = model
  const cpl = totals.cpl > 0 ? money(totals.cpl) : '—'

  const adRows = topAds
    .map(
      (a, i) =>
        `<tr style="background:${i % 2 ? '#F8FAFC' : '#FFFFFF'};">` +
        `<td style="padding:8px 10px;font-size:13px;color:${INK};">${esc(a.name)}</td>` +
        `<td align="right" style="padding:8px 10px;font-size:13px;color:${INK};">${a.leads}</td>` +
        `<td align="right" style="padding:8px 10px;font-size:13px;color:${INK};">${money(a.spend)}</td>` +
        `<td align="right" style="padding:8px 10px;font-size:13px;color:${INK};">${a.cpl > 0 ? money(a.cpl) : '—'}</td>` +
        `</tr>`
    )
    .join('')

  return `<!doctype html><html><body style="margin:0;padding:0;background:#F1F5F9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F1F5F9;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;font-family:Arial,Helvetica,sans-serif;">

<tr><td style="padding:28px 28px 8px;">
  <div style="font-size:13px;color:${MUTED};letter-spacing:.4px;text-transform:uppercase;">${esc(month.label)} report</div>
  <div style="font-size:24px;font-weight:700;color:${INK};padding-top:4px;">${esc(client.name)}</div>
</td></tr>

<tr><td style="padding:16px 28px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="6" border="0"><tr>
  ${statCell('Ad spend', money(totals.spend), hadPrevious ? deltaHtml(deltas.spend) : '')}
  ${statCell('Leads', String(totals.leads), hadPrevious ? deltaHtml(deltas.leads) : '')}
  ${statCell('Cost per lead', cpl, hadPrevious ? deltaHtml(deltas.cpl, true) : '')}
  </tr></table>
  ${
    hadPrevious
      ? `<div style="font-size:11px;color:${MUTED};padding-top:8px;">Compared with the previous month.</div>`
      : `<div style="font-size:11px;color:${MUTED};padding-top:8px;">First full month, so there is nothing to compare against yet.</div>`
  }
</td></tr>

<tr><td style="padding:24px 28px 0;">
  <div style="font-size:15px;font-weight:700;color:${INK};padding-bottom:10px;">Leads by day</div>
  ${chartHtml(series)}
</td></tr>

${
  topAds.length
    ? `<tr><td style="padding:24px 28px 0;">
  <div style="font-size:15px;font-weight:700;color:${INK};padding-bottom:8px;">What brought the leads in</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:8px;overflow:hidden;">
    <tr style="background:#F1F5F9;">
      <td style="padding:8px 10px;font-size:12px;font-weight:700;color:${INK};">Ad</td>
      <td align="right" style="padding:8px 10px;font-size:12px;font-weight:700;color:${INK};">Leads</td>
      <td align="right" style="padding:8px 10px;font-size:12px;font-weight:700;color:${INK};">Spend</td>
      <td align="right" style="padding:8px 10px;font-size:12px;font-weight:700;color:${INK};">Cost/lead</td>
    </tr>${adRows}
  </table>
</td></tr>`
    : ''
}

${
  bestDay && bestDay.leads > 0
    ? `<tr><td style="padding:20px 28px 0;">
  <div style="padding:12px 14px;background:#EFF6FF;border-radius:8px;font-size:13px;color:${INK};">
    Best day was ${esc(new Date(`${bestDay.date}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }))} with ${bestDay.leads} ${bestDay.leads === 1 ? 'lead' : 'leads'}.
  </div>
</td></tr>`
    : ''
}

<tr><td style="padding:24px 28px 28px;">
  <div style="border-top:1px solid ${LINE};padding-top:14px;font-size:12px;color:${MUTED};line-height:1.6;">
    Figures cover ${esc(month.label)} and come straight from your Meta ad account.
    Reply to this email with any questions and we'll get straight back to you.
    <div style="padding-top:8px;">— ${esc(agencyName)}</div>
  </div>
</td></tr>

</table></td></tr></table></body></html>`
}

export function renderSubject(model) {
  const { client, month, totals } = model
  return `${client.name} — ${month.label}: ${totals.leads} ${totals.leads === 1 ? 'lead' : 'leads'} from ${money(totals.spend)}`
}

// Ad and campaign names come from Meta and go straight into markup.
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
