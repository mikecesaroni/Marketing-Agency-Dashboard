import { formatDate } from './queries'

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
