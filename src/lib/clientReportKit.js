// The parts both per-client ad pages share (Google Ads and Meta): picking
// scorecards to chart, the days in a window, and sorting a table by a
// column the way clicking an Ads Manager header does.
//
// Pure: the check scripts import it.

/** How many tiles can be picked at once: one chart each, stacked. */
export const MAX_PICKED = 2

/**
 * Toggle a tile. Picking a third drops the oldest pick, the way Google's
 * scorecards do; the last one standing cannot be unpicked, so there is
 * always a chart.
 */
export function togglePick(picked, key) {
  if (picked.includes(key)) return picked.length > 1 ? picked.filter((k) => k !== key) : picked
  const next = [...picked, key]
  return next.length > MAX_PICKED ? next.slice(next.length - MAX_PICKED) : next
}

/** Every calendar day from since to until, inclusive, as YYYY-MM-DD. */
export function dateRange(since, until) {
  const out = []
  if (!since || !until || since > until) return out
  const d = new Date(`${since}T00:00:00Z`)
  const end = new Date(`${until}T00:00:00Z`)
  while (d <= end && out.length < 1000) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

/**
 * Sort rows by a column, the way clicking a Google Ads header does. Text
 * sorts A to Z first; numbers biggest first. Ties keep their order.
 */
export function sortRows(rows, key, dir) {
  if (!key) return rows
  const list = [...(rows || [])]
  const sample = list.find((r) => r[key] != null)?.[key]
  const text = typeof sample === 'string'
  const d = dir || (text ? 'asc' : 'desc')
  const sign = d === 'asc' ? 1 : -1
  return list
    .map((r, i) => [r, i])
    .sort(([a, ia], [b, ib]) => {
      const x = a[key]
      const y = b[key]
      if (x == null && y == null) return ia - ib
      if (x == null) return 1
      if (y == null) return -1
      const c = text ? String(x).localeCompare(String(y)) : Number(x) - Number(y)
      return c * sign || ia - ib
    })
    .map(([r]) => r)
}

/** Meta when they have an ad account, else Google Ads when they have an ID, else Meta. */
export function defaultChannel(client) {
  const has = (v) => Boolean(String(v || '').replace(/\D/g, ''))
  if (has(client?.meta_ad_account_id)) return 'meta'
  if (has(client?.google_ads_customer_id)) return 'google'
  return 'meta'
}
