// The weekly executive status: every client on one page, last week against
// the week before, with the big points and nothing else.
//
// Pure. It takes the Client status rows (src/lib/clientStatus.js: the flags,
// the video board's row, the pipeline) and four weeks of ad days, and gives
// back one row per client: how the ads stand, the week's spend, leads and
// cost per lead with the change, a trend over four weeks, whether a new ad
// is needed, and up to three key points in plain words. Worst first, so the
// Monday meeting starts with what needs a decision and ends with the wins.
//
// The week is the LAST 7 DAYS through yesterday against the 7 before, not a
// calendar week ("make this last 7 days, not week by week dates"): looked at
// on any day, it is the most recent full week of data. Four such windows
// back to back make the trend. scripts/check-weekly-status.mjs runs it in
// Node; the team-digest Edge Function folds it into Monday's brief.

import { addDays, weekRangeLabel } from './dates.js'
import { tierLabel } from './clientTiers.js'

export const WEEKS = 4

export const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`
const pct = (now, before) => (before > 0 ? ((now - before) / before) * 100 : null)
const round = (n) => Math.round(Math.abs(n))

/**
 * The first day of the report window and of the three windows before it,
 * oldest first. Each window is 7 days; the report window ends yesterday
 * (today's numbers are never complete). weeksBack 0 is the last 7 days,
 * 1 is the 7 before that, and so on.
 */
export function reportWeeks(day, weeksBack = 0) {
  const last = addDays(day, -7 * (1 + weeksBack))
  return [3, 2, 1, 0].map((i) => addDays(last, -7 * i))
}

/** Spend and leads from the rows dated inside the week that starts on `monday`. rows: [{ date, leads, spend }]. */
export function weekTotals(rows = [], monday) {
  const end = addDays(monday, 6)
  let spend = 0
  let leads = 0
  for (const r of rows) {
    if (!r || r.date < monday || r.date > end) continue
    spend += Number(r.spend) || 0
    leads += Number(r.leads) || 0
  }
  return { week: monday, spend, leads, cpl: leads > 0 ? spend / leads : 0 }
}

/**
 * Up, down or steady, from four weeks of totals (oldest first).
 *
 * Leads are the number that matters, cost per lead second. A move of a fifth
 * week over week is a trend; three weeks in one direction is a trend however
 * small each step; two weeks of spend with no lead at all is down, whatever
 * the arithmetic says. Anything else is steady. Nothing spent for two weeks
 * is no trend at all.
 */
export function trendOf(weeks = []) {
  const now = weeks[weeks.length - 1] || { spend: 0, leads: 0, cpl: 0 }
  const prev = weeks[weeks.length - 2] || { spend: 0, leads: 0, cpl: 0 }
  if (!(now.spend > 0) && !(prev.spend > 0)) return { key: 'none', label: 'No ads', why: '' }
  if (now.spend > 0 && now.leads === 0 && prev.leads === 0) return { key: 'down', label: 'Down', why: 'No leads two weeks running' }

  const last3 = weeks.slice(-3).map((w) => w.leads)
  if (last3.length === 3) {
    if (last3[2] > last3[1] && last3[1] > last3[0] && last3[2] >= 3) return { key: 'up', label: 'Up', why: 'Leads up three weeks running' }
    if (last3[2] < last3[1] && last3[1] < last3[0] && last3[0] >= 3) return { key: 'down', label: 'Down', why: 'Leads down three weeks running' }
  }

  const lead = pct(now.leads, prev.leads)
  const cpl = pct(now.cpl, prev.cpl)
  if (prev.leads === 0 && now.leads >= 2) return { key: 'up', label: 'Up', why: `${now.leads} leads after none the week before` }
  if (lead !== null && lead >= 20) return { key: 'up', label: 'Up', why: `Leads up ${round(lead)}% on the week` }
  if (lead !== null && lead <= -20) return { key: 'down', label: 'Down', why: `Leads down ${round(lead)}% on the week` }
  if (cpl !== null && cpl <= -20 && (lead === null || lead >= -5)) return { key: 'up', label: 'Up', why: `Cost per lead down ${round(cpl)}%` }
  if (cpl !== null && cpl >= 25 && (lead === null || lead <= 5)) return { key: 'down', label: 'Down', why: `Cost per lead up ${round(cpl)}%` }
  return { key: 'flat', label: 'Steady', why: '' }
}

/** How the ads stand, from the status row and the report week's totals. */
export function adStatusOf(row, now) {
  const c = row.client || {}
  const flags = row.flags || []
  if (c.paused_at) return { key: 'paused', label: 'Paused', tone: 'slate' }
  if (flags.some((f) => f.key === 'account')) return { key: 'account', label: 'Account disabled', tone: 'red' }
  const quiet = flags.find((f) => f.key === 'ads-off')
  if (quiet) return { key: 'quiet', label: 'Ads stopped', tone: 'red', detail: quiet.label }
  if (!c.meta_ads_active && !(now.spend > 0)) {
    return row.result?.launched ? { key: 'off', label: 'Not running', tone: 'slate' } : { key: 'onboarding', label: 'Onboarding', tone: 'slate' }
  }
  if (!(now.spend > 0)) return { key: 'nospend', label: 'No spend last week', tone: 'amber' }
  return { key: 'running', label: 'Running', tone: 'green' }
}

/** Whether a new ad is needed, from the video board's row. */
export function creativeOf(row) {
  const d = row.drop
  // Only a live client owes a fresh ad; one still onboarding has nothing to be behind on.
  if (!d || !d.hasMeta || d.paused || !row.client?.meta_ads_active) return { key: 'none', label: '', tone: 'slate', needAd: false }
  const waiting = d.waiting?.length || 0
  if (waiting > 0) {
    return d.behind
      ? { key: 'clip', label: `${waiting} clip${waiting === 1 ? '' : 's'} waiting, ${d.daysSince} days since an ad`, tone: 'red', needAd: true }
      : { key: 'clip', label: `${waiting} clip${waiting === 1 ? '' : 's'} waiting to publish`, tone: 'purple', needAd: false }
  }
  if (d.state === 'never') return { key: 'need', label: 'No ad yet', tone: 'red', needAd: true }
  if (d.state === 'stale' || d.behind) return { key: 'need', label: `New ad needed: ${d.daysSince} days`, tone: 'red', needAd: true }
  return { key: 'fresh', label: d.daysSince === 0 ? 'New ad today' : `New ad ${d.daysSince}d ago`, tone: 'green', needAd: false }
}

/** Up to three points in plain words: what matters about this client this week. */
export function keyPoints({ row, ads, creative, trend, now, prev }) {
  const flags = row.flags || []
  const out = []
  const byKey = (k) => flags.find((f) => f.key === k)
  if (ads.key === 'account') out.push(byKey('account')?.label || 'Ad account disabled')
  if (ads.key === 'quiet') out.push(byKey('ads-off')?.label || 'Ads stopped')
  const noLeads = byKey('no-leads')
  if (noLeads) out.push(`${noLeads.label}, ${money(row.leads?.spend14 || 0)} spent in two weeks`)
  if (trend.why && !(noLeads && trend.key === 'down')) out.push(trend.why)
  else if (trend.key === 'flat' && now.leads > 0) out.push(`${now.leads} lead${now.leads === 1 ? '' : 's'} at ${money(now.cpl)} each, about the same as the week before`)
  if (creative.key === 'need') out.push(creative.label.startsWith('No ad') ? 'No ad has gone out yet' : `No new ad in ${row.drop?.daysSince} days`)
  if (creative.key === 'clip') out.push(creative.needAd ? `A clip is waiting and the last ad was ${row.drop?.daysSince} days ago` : `${creative.label.replace(/^1 clip waiting/, 'A clip is waiting')}`)
  const pay = byKey('payment')
  if (pay) out.push(pay.label)
  // A chase is a point only while they are onboarding. On a running client
  // an open client-side step is housekeeping, not this week's news.
  const waiting = byKey('waiting')
  if (waiting && ads.key === 'onboarding') out.push(`${waiting.label}: ${waiting.detail}`)
  else if (ads.key === 'onboarding' && row.result?.next) out.push(`Next: ${row.result.next.title}`)
  if (ads.key === 'nospend' && prev.spend > 0) out.push(`Spent ${money(prev.spend)} the week before, nothing last week`)
  if (out.length === 0) out.push(ads.key === 'running' ? 'Running clean' : ads.label)
  return out.slice(0, 3)
}

const RANK = { account: 0, quiet: 0, down: 1, need: 2, nospend: 3, onboarding: 5, off: 5, paused: 6, flat: 7, up: 8 }

/** Worst first: ads off, then a down trend, then a new ad needed, then the rest; bigger spend first inside a rank. */
export function weeklyOrder(a, b) {
  return a.rank - b.rank || b.now.spend - a.now.spend || String(a.client.name).localeCompare(String(b.client.name))
}

/**
 * The whole report.
 *
 *   statusRows  clientStatus() rows (src/lib/statusRows.js)
 *   metaRows    ad_daily rows { client_id, date, leads, spend }
 *   googleRows  google_campaign_daily rows { client_id, date, conversions, cost }
 *   lsaRows     weekly_kpis rows with channel LSA { client_id, week_of, leads, ad_spend }
 *   day         'YYYY-MM-DD' today
 *   weeksBack   0 for the last complete week, 1 for the one before, ...
 */
export function buildWeeklyStatus({ statusRows = [], metaRows = [], googleRows = [], lsaRows = [], day, weeksBack = 0 }) {
  const weeks = reportWeeks(day, weeksBack)
  const byClient = new Map()
  const push = (id, row) => {
    if (!byClient.has(id)) byClient.set(id, [])
    byClient.get(id).push(row)
  }
  for (const r of metaRows) push(r.client_id, { date: r.date, leads: r.leads, spend: r.spend })
  for (const r of googleRows) push(r.client_id, { date: r.date, leads: r.conversions, spend: r.cost })
  // LSA is logged by hand, one row a calendar week, dated by its Monday. It
  // lands in whichever 7-day window holds that Monday: close enough for a
  // number that is typed in once a week.
  for (const r of lsaRows) push(r.client_id, { date: r.week_of, leads: r.leads, spend: r.ad_spend })

  const rows = statusRows
    .filter((s) => s.client && !s.client.archived && !s.client.is_internal)
    .map((s) => {
      const days = byClient.get(s.client.id) || []
      const totals = weeks.map((w) => weekTotals(days, w))
      const now = totals[totals.length - 1]
      const prev = totals[totals.length - 2]
      const trend = trendOf(totals)
      const ads = adStatusOf(s, now)
      const creative = creativeOf(s)
      const points = keyPoints({ row: s, ads, creative, trend, now, prev })
      const rankKey = ads.key === 'account' || ads.key === 'quiet' ? ads.key : trend.key === 'down' ? 'down' : creative.needAd ? 'need' : ads.key === 'nospend' ? 'nospend' : ads.key === 'running' ? trend.key : ads.key
      return {
        client: s.client,
        tier: s.tier,
        tierName: tierLabel(s.tier),
        status: s,
        weeks: totals,
        now,
        prev,
        change: { spend: pct(now.spend, prev.spend), leads: pct(now.leads, prev.leads), cpl: pct(now.cpl, prev.cpl) },
        trend,
        ads,
        creative,
        points,
        rank: RANK[rankKey] ?? 7,
      }
    })
    .sort(weeklyOrder)

  return { day, weeksBack, weeks, week: weeks[weeks.length - 1], label: weekRangeLabel(weeks[weeks.length - 1]), prevLabel: weekRangeLabel(weeks[weeks.length - 2]), rows, totals: agencyTotals(rows) }
}

/** The numbers across the book. */
export function agencyTotals(rows = []) {
  const sum = (pick) => rows.reduce((n, r) => n + (pick(r) || 0), 0)
  const spend = sum((r) => r.now.spend)
  const leads = sum((r) => r.now.leads)
  const prevSpend = sum((r) => r.prev.spend)
  const prevLeads = sum((r) => r.prev.leads)
  const cpl = leads > 0 ? spend / leads : 0
  const prevCpl = prevLeads > 0 ? prevSpend / prevLeads : 0
  return {
    clients: rows.length,
    running: rows.filter((r) => r.ads.key === 'running').length,
    spend,
    leads,
    cpl,
    prevSpend,
    prevLeads,
    prevCpl,
    change: { spend: pct(spend, prevSpend), leads: pct(leads, prevLeads), cpl: pct(cpl, prevCpl) },
    up: rows.filter((r) => r.trend.key === 'up').length,
    down: rows.filter((r) => r.trend.key === 'down').length,
    needAds: rows.filter((r) => r.creative.needAd).length,
    adsOff: rows.filter((r) => r.ads.key === 'account' || r.ads.key === 'quiet').length,
    needCall: rows.filter((r) => r.status.needsContact).length,
  }
}

const arrow = (change, lowerIsBetter = false) => {
  if (change === null || change === undefined || !Number.isFinite(change)) return ''
  if (Math.abs(change) < 0.5) return ' (same)'
  const up = change > 0
  const word = up ? 'up' : 'down'
  const good = lowerIsBetter ? !up : up
  return ` (${word} ${round(change)}%${good ? '' : ''})`
}

/** One line per client, for the copy button, the email and Slack. */
export function weeklyLine(r) {
  const nums = r.now.spend > 0 || r.now.leads > 0 ? `${money(r.now.spend)}${arrow(r.change.spend)}, ${r.now.leads} lead${r.now.leads === 1 ? '' : 's'}${arrow(r.change.leads)}${r.now.leads > 0 ? ` at ${money(r.now.cpl)}${arrow(r.change.cpl, true)}` : ''}` : 'no spend'
  const bits = [r.ads.label, nums]
  if (r.trend.key === 'up' || r.trend.key === 'down') bits.push(r.trend.label.toLowerCase())
  if (r.creative.label) bits.push(r.creative.label)
  return `${r.client.name}: ${bits.join(' · ')}. ${r.points.join('. ')}.`
}

/** The whole report as plain text: the totals, then the clients in order under three headings. */
export function weeklyText(report, { appUrl = '' } = {}) {
  const t = report.totals
  const head = [
    `WEEKLY STATUS · ${report.label}`,
    `${money(t.spend)} spent${arrow(t.change.spend)} · ${t.leads} leads${arrow(t.change.leads)} · ${t.leads > 0 ? `${money(t.cpl)} per lead${arrow(t.change.cpl, true)}` : 'no leads'} · ${t.running} of ${t.clients} running`,
    `${t.up} trending up · ${t.down} down · ${t.needAds} need a new ad · ${t.adsOff} with ads off · ${t.needCall} need a call`,
  ]
  const groups = [
    ['NEEDS A DECISION', report.rows.filter((r) => r.rank <= 3)],
    ['NOT RUNNING YET', report.rows.filter((r) => r.rank >= 5 && r.rank <= 6)],
    ['STEADY', report.rows.filter((r) => r.rank === 7)],
    ['TRENDING UP', report.rows.filter((r) => r.rank === 8)],
  ]
  const body = groups.filter(([, rows]) => rows.length).map(([name, rows]) => [`${name} (${rows.length})`, ...rows.map((r) => `• ${weeklyLine(r)}`)].join('\n'))
  return [head.join('\n'), ...body, appUrl ? `${appUrl}/weekly` : ''].filter(Boolean).join('\n\n')
}
