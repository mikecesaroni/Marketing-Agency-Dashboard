// The client dashboard: the ranges, the maths on what client_dashboard_load
// returns, and the words under every number. Plain JavaScript with no
// imports, so scripts/check-client-dashboard.mjs can load it in Node.
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

/** "WC_Summer | 2026-10-08 | AC died? Same-day" shows as "AC died? Same-day". */
export function cleanAdName(name) {
  const s = String(name || '').replace(/^wc_/i, '')
  const parts = s
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean)
  return (parts.length > 1 ? parts[parts.length - 1] : s.trim()) || 'Untitled ad'
}

/** The ads that ran in a range, most leads first, cheapest first on a tie. */
export function adsFor(ads, days, limit = 10) {
  return (ads || [])
    .filter((a) => Number(a.w) === Number(days) && (num(a.spend) > 0 || num(a.leads) > 0))
    .map((a) => ({ key: a.key, channel: a.channel, name: cleanAdName(a.name), ...rates(a) }))
    .sort((x, y) => y.leads - x.leads || x.spend - y.spend || x.name.localeCompare(y.name))
    .slice(0, limit)
}

/**
 * Which ads are working, in one word, judged against the client's own
 * average cost per lead for the range. Every verdict carries a label and a
 * sentence, never a colour on its own.
 */
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

/** Dollars back per dollar, from the weeks the client told us about. */
export function returnStory(weeks) {
  const answered = (weeks || []).filter((w) => num(w.revenue) > 0 && num(w.spend) > 0)
  const spend = answered.reduce((s, w) => s + num(w.spend), 0)
  const revenue = answered.reduce((s, w) => s + num(w.revenue), 0)
  const jobs = answered.reduce((s, w) => s + num(w.jobs_booked), 0)
  return { answered: answered.length, spend: r2(spend), revenue: r2(revenue), jobs, back: spend > 0 ? r2(revenue / spend) : 0 }
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
export const latestReport = (weeks) => (weeks || []).find((w) => w.token) || null

export const money = (n) => {
  const v = Number(n || 0)
  const whole = Math.abs(v) >= 100 || Number.isInteger(v)
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`
}

/** The private link for a token. */
export function dashboardLink(token, origin) {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : 'https://marketing-agency-dashboard.netlify.app')
  return `${base}/dashboard/${token}`
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
    we: 'Only you know this number. Answer the Monday email with how many leads booked and what they were worth, and it shows here.',
  },
]

export const guideFor = (key) => METRIC_GUIDE.find((g) => g.key === key) || null
