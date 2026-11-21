// The client dashboard: the ranges, the maths on what client_dashboard_load
// returns, and the words under every number. Plain JavaScript (the one
// import is plain too), so scripts/check-client-dashboard.mjs can load it
// in Node.
import { publicLink } from './publicSite.js'
//
// The page is for a business owner, not for us. Same rules as the weekly
// report: short sentences, everyday words, no hype, and the same argument
// made every time: the return on the leads is the number that matters.

export const RANGES = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
]
export const DEFAULT_DAYS = 30

const pad = (n) => String(n).padStart(2, '0')
export const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fromIso = (s) => {
  const [y, m, d] = String(s).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function daysAgo(n, today = new Date()) {
  const t = typeof today === 'string' ? fromIso(today) : new Date(today)
  return isoDay(new Date(t.getFullYear(), t.getMonth(), t.getDate() - n))
}

/** This range and the one before it, the same length, ending today. */
export function windowFor(days, today = new Date()) {
  return {
    days,
    from: daysAgo(days - 1, today),
    to: daysAgo(0, today),
    prevFrom: daysAgo(days * 2 - 1, today),
    prevTo: daysAgo(days, today),
  }
}

/** Percent change, null when there is nothing to compare against. */
export function pctChange(now, before) {
  if (!before) return null
  return Math.round(((now - before) / before) * 100)
}

const num = (v) => Number(v || 0) || 0
const r2 = (n) => Math.round(n * 100) / 100

/** Spend, leads, impressions, clicks and the two rates. */
export function rates(t) {
  const spend = r2(num(t.spend))
  const leads = Math.round(num(t.leads) * 10) / 10
  const impressions = Math.round(num(t.impressions))
  const clicks = Math.round(num(t.clicks))
  return {
    spend,
    leads,
    impressions,
    clicks,
    cpl: leads > 0 ? r2(spend / leads) : 0,
    ctr: impressions > 0 ? r2((clicks / impressions) * 100) : 0,
  }
}

export const between = (rows, from, to) => (rows || []).filter((r) => r.date >= from && r.date <= to)

/** Totals for a set of day rows: all channels together, and each on its own. */
export function sumDays(rows) {
  const meta = { spend: 0, leads: 0, impressions: 0, clicks: 0 }
  const google = { spend: 0, leads: 0, impressions: 0, clicks: 0 }
  for (const r of rows || []) {
    meta.spend += num(r.meta_spend)
    meta.leads += num(r.meta_leads)
    meta.impressions += num(r.meta_impressions)
    meta.clicks += num(r.meta_clicks)
    google.spend += num(r.google_spend)
    google.leads += num(r.google_leads)
    google.impressions += num(r.google_impressions)
    google.clicks += num(r.google_clicks)
  }
  const all = rates({
    spend: meta.spend + google.spend,
    leads: meta.leads + google.leads,
    impressions: meta.impressions + google.impressions,
    clicks: meta.clicks + google.clicks,
  })
  return { ...all, meta: rates(meta), google: rates(google) }
}

/**
 * One row per day from `from` to `to`, Meta and Google side by side, for
 * the stacked daily chart. Days with nothing are kept so the axis is
 * continuous.
 */
export function dailySeries(rows, from, to, key = 'leads') {
  const by = new Map((rows || []).map((r) => [r.date, r]))
  const out = []
  for (let d = from; d <= to; d = daysAgo(-1, d)) {
    const r = by.get(d) || {}
    const meta = r2(num(r[`meta_${key}`]))
    const google = r2(num(r[`google_${key}`]))
    out.push({ date: d, meta, google, total: r2(meta + google) })
  }
  return out
}

/** Average spend per calendar day over a range. */
export function perDay(spend, days) {
  const n = Math.max(1, Number(days) || 1)
  return r2(num(spend) / n)
}

/**
 * The ad's name as it is in the ad account, whole. This used to keep only the
 * last "|" part ("WC_Summer | 2026-10-08 | AC died? Same-day" became "AC
 * died? Same-day"), which turned a video named for its angle into just
 * "Offer led" with nothing to tell it from the next one.
 */
export function cleanAdName(name) {
  return String(name || '').trim() || 'Untitled ad'
}

/** The ads that ran in a range, most leads first, cheapest first on a tie. */
export function adsFor(ads, days, limit = 10) {
  return (ads || [])
    .filter((a) => Number(a.w) === Number(days) && (num(a.spend) > 0 || num(a.leads) > 0))
    .map((a) => ({ key: a.key, channel: a.channel, name: cleanAdName(a.name), publishedOn: a.published_on || null, ...rates(a) }))
    .sort((x, y) => y.leads - x.leads || x.spend - y.spend || x.name.localeCompare(y.name))
    .slice(0, limit)
}

/**
 * Which ads are working, in one word, judged against the client's own
 * average cost per lead for the range. Every verdict carries a label and a
 * sentence, never a colour on its own.
 */
/**
 * A landing page address the way a person reads it on a card: no scheme,
 * no www, no tracking query, no trailing slash. "belknapheating.com/fall"
 * for https://www.belknapheating.com/fall/?utm_source=fb. Anything that is
 * not a web address comes back empty.
 */
export function landingLabel(url) {
  const s = String(url || '').trim()
  if (!/^https?:\/\//i.test(s)) return ''
  try {
    const u = new URL(s)
    const host = u.hostname.replace(/^www\./i, '')
    const path = u.pathname.replace(/\/+$/, '')
    return `${host}${path}`.slice(0, 80)
  } catch {
    return ''
  }
}

export function adVerdict(ad, avgCpl) {
  const cpl = num(avgCpl)
  // Within a fifth of the average counts as working: cost per lead moves
  // around week to week, and the best ad is often a touch over the mean.
  if (ad.leads > 0 && (cpl <= 0 || ad.cpl <= cpl * 1.2)) {
    return { key: 'working', label: 'Working', tone: 'success', note: 'Brought leads at around your average cost per lead or better.' }
  }
  if (ad.leads > 0 && ad.cpl > cpl * 1.5) {
    return { key: 'costly', label: 'Costly', tone: 'warning', note: 'Brought leads, but at well over your average cost per lead.' }
  }
  if (ad.leads > 0) {
    return { key: 'fair', label: 'Fair', tone: 'info', note: 'Brought leads a little over your average cost per lead.' }
  }
  if (ad.spend >= Math.max(25, cpl)) {
    return { key: 'none', label: 'No leads yet', tone: 'neutral', note: 'Has spent enough to expect a lead and has not brought one. On our list to refresh or pause.' }
  }
  return { key: 'early', label: 'Too early', tone: 'neutral', note: 'Has not spent enough yet to judge.' }
}

export const VERDICT_LEGEND = 'Working means leads at around your average cost per lead for this range or better. Costly means well over it. No leads yet means it has spent enough to expect one.'

/** The Monday of the week a date is in. */
export function mondayOf(iso) {
  const d = fromIso(iso)
  const dow = d.getDay()
  const back = dow === 0 ? 6 : dow - 1
  return isoDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - back))
}

/** LSA is logged by the week, so a range takes the weeks it touches. */
export function lsaFor(lsa, from, to) {
  const monday = mondayOf(from)
  const rows = (lsa || []).filter((r) => r.week_of >= monday && r.week_of <= to)
  return rates({
    spend: rows.reduce((s, r) => s + num(r.spend), 0),
    leads: rows.reduce((s, r) => s + num(r.leads), 0),
    impressions: 0,
    clicks: 0,
  })
}

// ---------------------------------------------------------------------------
// The revenue tracker: what the jobs from these leads were worth, by month.
//
// The client logs two numbers for a month on the dashboard itself: how many
// of the leads became jobs, and what those jobs were worth. `months` is what
// client_dashboard_load returns: one row per month over all time with the
// ad spend and leads, and jobs / revenue / source when the month is logged
// (source 'month' for their own entry, 'weeks' for weekly answers added up).
//
// A month is LOGGED or it is not. Zero jobs and $0 is an answer ("none of
// them booked") and counts as logged; a month nobody has touched does not.
// Every total is taken over logged months only, with the ad spend for those
// same months, so an unanswered month can never make the return look worse
// than it is.
// ---------------------------------------------------------------------------

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** The first day of the month a date is in, as 'YYYY-MM-01'. */
export const monthStart = (iso) => `${String(iso).slice(0, 7)}-01`

/** 'October 2026', or 'Oct 2026' short. */
export function monthLabel(iso, short = false) {
  const [y, m] = String(iso).split('-').map(Number)
  const name = MONTH_NAMES[(m || 1) - 1] || ''
  return `${short ? name.slice(0, 3) : name} ${y}`
}

const nextMonth = (iso) => {
  const [y, m] = String(iso).split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`
}

/**
 * The months the tracker shows, newest first: every month from the first
 * one with ad spend or a logged figure through this month, with the gaps
 * filled so a month the ads were off still has a row.
 */
export function revenueMonths(months, today = new Date()) {
  const thisMonth = monthStart(typeof today === 'string' ? today : isoDay(today))
  const byMonth = new Map((months || []).map((m) => [monthStart(m.month), m]))
  const known = [...byMonth.keys()].filter((k) => k <= thisMonth).sort()
  const first = known.find((k) => num(byMonth.get(k).spend) > 0 || num(byMonth.get(k).leads) > 0 || byMonth.get(k).source) || thisMonth
  const out = []
  for (let k = first; k <= thisMonth; k = nextMonth(k)) {
    const row = byMonth.get(k) || {}
    const logged = Boolean(row.source)
    const spend = r2(num(row.spend))
    const leads = Math.round(num(row.leads) * 10) / 10
    const jobs = logged ? Math.round(num(row.jobs)) : null
    const revenue = logged ? r2(num(row.revenue)) : null
    out.push({
      month: k,
      label: monthLabel(k),
      current: k === thisMonth,
      spend,
      leads,
      logged,
      source: row.source || null,
      jobs,
      revenue,
      // Dollars back per ad dollar. Nothing to divide by in a month the ads
      // did not spend, and a blank beats a made-up number.
      back: logged && spend > 0 ? r2(revenue / spend) : null,
      // Jobs can outnumber the leads we counted (a phone call we never saw),
      // and "140% of leads" helps nobody, so it is only shown when it reads.
      closeRate: logged && leads > 0 && jobs <= leads ? Math.round((jobs / leads) * 100) : null,
      perJob: logged && jobs > 0 ? r2(revenue / jobs) : null,
    })
  }
  return out.reverse()
}

/** Everything logged so far, against the ad spend for those same months. */
export function revenueTotals(rows) {
  const logged = (rows || []).filter((r) => r.logged)
  const revenue = r2(logged.reduce((s, r) => s + r.revenue, 0))
  const spend = r2(logged.reduce((s, r) => s + r.spend, 0))
  const jobs = logged.reduce((s, r) => s + r.jobs, 0)
  const leads = Math.round(logged.reduce((s, r) => s + r.leads, 0) * 10) / 10
  const best = logged.filter((r) => r.revenue > 0).sort((a, b) => b.revenue - a.revenue)[0] || null
  return { months: logged.length, revenue, spend, jobs, leads, back: spend > 0 ? r2(revenue / spend) : null, best }
}

/**
 * The month to ask about: the newest FINISHED month that had leads or ad
 * spend and has no figure. This month is never nagged about, because it is
 * not over; it can still be logged "so far".
 */
export function monthToLog(rows) {
  return (rows || []).find((r) => !r.current && !r.logged && (r.leads > 0 || r.spend > 0)) || null
}

/**
 * What one client has logged, for the team's view in the CRM: how much, over
 * how many months, the last month they logged, and whether last month (the
 * one a monthly check-in would ask about) is in.
 * rows: that client's client_revenue_months rows [{ month, jobs, revenue }].
 */
export function revenueLogSummary(rows, today = new Date()) {
  const thisMonth = monthStart(typeof today === 'string' ? today : isoDay(today))
  const [y, m] = thisMonth.split('-').map(Number)
  const lastMonth = m === 1 ? `${y - 1}-12-01` : `${y}-${pad(m - 1)}-01`
  const list = (rows || []).map((r) => ({ month: monthStart(r.month), jobs: Math.round(num(r.jobs)), revenue: r2(num(r.revenue)) })).sort((a, b) => b.month.localeCompare(a.month))
  return {
    months: list.length,
    revenue: r2(list.reduce((s, r) => s + r.revenue, 0)),
    jobs: list.reduce((s, r) => s + r.jobs, 0),
    latest: list[0] ? { ...list[0], label: monthLabel(list[0].month) } : null,
    lastMonth,
    lastMonthLabel: monthLabel(lastMonth),
    lastMonthLogged: list.some((r) => r.month === lastMonth),
  }
}

/** The loader's months with one month just saved folded in, so the page shows it without reloading. */
export function mergeRevenueMonth(months, saved) {
  const key = monthStart(saved.month)
  const list = [...(months || [])]
  const i = list.findIndex((m) => monthStart(m.month) === key)
  const row = { ...(i >= 0 ? list[i] : { month: key, spend: 0, leads: 0 }), jobs: saved.jobs, revenue: saved.revenue, source: 'month' }
  if (i >= 0) list[i] = row
  else list.push(row)
  return list
}

/**
 * What somebody typed for money, as a number: "$12,500", "12500.50" and
 * "12.5k" all work. null when it is not a number at all, so an empty box is
 * never saved as zero by accident.
 */
export function parseMoney(text) {
  const t = String(text ?? '').trim().toLowerCase().replace(/[$,\s]/g, '')
  if (!t) return null
  const m = t.match(/^(\d+(?:\.\d+)?)(k)?$/)
  if (!m) return null
  return r2(Number(m[1]) * (m[2] ? 1000 : 1))
}

/** A whole number of jobs, or null when it is not one. */
export function parseCount(text) {
  const t = String(text ?? '').trim()
  return /^\d{1,6}$/.test(t) ? Number(t) : null
}

/** Why a month's entry cannot be saved yet, or '' when it can. */
export function revenueEntryProblem(jobsText, revenueText) {
  const jobs = parseCount(jobsText)
  const revenue = parseMoney(revenueText)
  if (jobs === null) return 'Enter how many jobs, as a whole number. 0 is fine.'
  if (revenue === null) return 'Enter what they were worth in dollars. 0 is fine.'
  if (jobs === 0 && revenue > 0) return 'That is revenue with no jobs. How many jobs was it?'
  return ''
}

/**
 * Meta's rendered preview arrives as an <iframe> snippet. Only its address
 * and size are used, in an iframe the page makes itself, so nothing from
 * the snippet is ever written into the page as markup.
 */
export function previewFrame(html) {
  const s = String(html || '')
  const src = s.match(/src="([^"]+)"/)?.[1]
  // Meta serves these from www. or business.facebook.com; only facebook.com itself is trusted.
  if (!src || !/^https:\/\/([a-z0-9-]+\.)*facebook\.com\//i.test(src.replace(/&amp;/g, '&'))) return null
  const width = Number(s.match(/width="(\d+)"/)?.[1]) || 320
  const height = Number(s.match(/height="(\d+)"/)?.[1]) || 640
  return { src: src.replace(/&amp;/g, '&'), width, height }
}

/** The newest weekly report with a link, for "tell us how the leads did". */
export const money = (n) => {
  const v = Number(n || 0)
  const whole = Math.abs(v) >= 100 || Number.isInteger(v)
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`
}

/**
 * The private link for a token. On the client-facing address when one is
 * set (VITE_PUBLIC_APP_URL), so the link never carries the CRM's own.
 */
export function dashboardLink(token, origin) {
  if (origin) return `${String(origin).replace(/\/+$/, '')}/dashboard/${token}`
  return publicLink(`/dashboard/${token}`)
}

/** A fresh token, made in the browser, for "New link". */
export function newToken() {
  const bytes = new Uint8Array(18)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * What each number is, why it matters, what good looks like, and what we do
 * with it. Shown when a tile is clicked, and in the glossary at the bottom.
 */
export const METRIC_GUIDE = [
  {
    key: 'spend',
    label: 'Spend',
    what: 'What the ads cost over this period, across Meta and Google, pulled straight from the ad accounts. It matches what the platforms bill you.',
    why: 'It is the cost side of the only question that matters: are the jobs these ads bring in worth more than this?',
    good: 'Steady spend with leads holding or rising. More spend is only a problem when leads do not follow it.',
    we: 'We set the daily budgets and move money toward the ads and channels that bring the cheapest booked jobs.',
  },
  {
    key: 'leads',
    label: 'Leads',
    what: 'People who called, filled in a form or sent a message because of an ad. One lead is one person, however many times they got in touch.',
    why: 'Leads are the raw material for jobs. The number only pays off when the right people are reached and called back fast.',
    good: 'A steady flow you can keep up with, answered within minutes. Speed to call back is the biggest thing you control, and it decides who books.',
    we: 'We watch which ads and areas the leads come from and cut the ones that bring the wrong people.',
  },
  {
    key: 'cpl',
    label: 'Cost per lead',
    what: 'Ad spend divided by leads: what one lead cost on average over this period.',
    why: 'It shows whether the ads are getting more or less efficient. It cannot tell you whether the leads were any good, which is why we ask about booked jobs every week.',
    good: 'Lower is better, but only next to your close rate and job value. A $90 lead that becomes a $9,000 install beats a $30 lead that never books.',
    we: 'When it climbs for two weeks running we refresh the ads or the targeting before it gets expensive.',
  },
  {
    key: 'impressions',
    label: 'Impressions',
    what: 'How many times your ad was shown. Showings, not people: one person can count three times.',
    why: 'It is your reach. Without enough showings nobody sees the offer, and none of the other numbers get a chance.',
    good: 'Enough to feed a steady lead flow. Very high impressions with few clicks means the ad is being scrolled past.',
    we: 'We use it to catch ad fatigue, the same people seeing the same ad too often, and to size the budget to the area.',
  },
  {
    key: 'clicks',
    label: 'Clicks',
    what: 'How many times someone tapped the ad to call, message or open your page.',
    why: 'A click is interest. It is the step between seeing the ad and becoming a lead.',
    good: 'Clicks that turn into leads. Plenty of clicks with few leads points at the page or the form, not the ad.',
    we: 'Where clicks are high and leads are low we fix the landing page or the form before touching the ad.',
  },
  {
    key: 'ctr',
    label: 'Click rate',
    what: 'Out of every 100 people who saw the ad, how many tapped it.',
    why: 'It is the quickest read on whether the ad itself works: the picture, the words and the offer.',
    good: 'Around 1% is normal for home services. 2% or more is strong. Under 0.8% usually means the ad needs refreshing.',
    we: 'A low click rate is the signal to make new ads, which is part of every month.',
  },
  {
    key: 'return',
    label: 'Return on the ads',
    what: 'Revenue from booked jobs divided by the ad spend for the same weeks: dollars back for every dollar spent.',
    why: 'This is the number that decides whether to spend more or less. Cheap leads are not the goal. Booked jobs are.',
    good: 'Most home-services owners want at least $4 back for every $1 once the account has settled. Early weeks run lower while the ads learn.',
    we: 'Only you know this number. Log each month on this page: how many of the leads became jobs and what they were worth. Rough numbers are fine.',
  },
]

export const guideFor = (key) => METRIC_GUIDE.find((g) => g.key === key) || null
