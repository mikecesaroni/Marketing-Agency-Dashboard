// Channel identity and the dark report theme, in one place.
//
// Every report surface colours a channel the same way, so a reader who has
// learned "Meta is blue" never has to relearn it: tiles, the stacked daily
// chart, the mix bar, the dots in the tables. Colour follows the channel,
// never its rank, so a range with no Google spend does not repaint Meta.
//
// Validated with the dataviz palette checker against the dark surface below
// (all pairs, since the mix bar and the tables put all three side by side):
// lightness band, chroma floor, CVD separation (worst ΔE 9.4), normal-vision
// floor (worst ΔE 20.9) and 3:1 contrast all PASS.

export const CHANNELS = {
  meta: { key: 'meta', label: 'Meta', long: 'Meta Ads', color: '#3987e5', soft: 'rgba(57,135,229,0.14)', ring: 'rgba(57,135,229,0.35)' },
  google: { key: 'google', label: 'Google', long: 'Google Ads', color: '#199e70', soft: 'rgba(25,158,112,0.14)', ring: 'rgba(25,158,112,0.35)' },
  lsa: { key: 'lsa', label: 'LSA', long: 'Google LSA', color: '#d95926', soft: 'rgba(217,89,38,0.14)', ring: 'rgba(217,89,38,0.35)' },
}

export const CHANNEL_ORDER = ['meta', 'google', 'lsa']

// The report surface. The chart surface is the panel colour, which is what
// the palette was validated against.
export const DARK = {
  page: '#070b14',
  panel: '#0f1626',
  grid: '#1e293b',
  axis: '#64748b',
  trend: '#cbd5e1',
}

/** DailyChart's theme for a channel on the dark surface. */
export function chartTheme(channelKey) {
  const c = CHANNELS[channelKey] || CHANNELS.meta
  return {
    bar: c.color,
    trend: DARK.trend,
    grid: DARK.grid,
    axis: DARK.axis,
    ring: DARK.panel,
    dark: true,
  }
}

/** Compact money for tiles and axes: $950, $12.4k, $1.2M. */
export function compactMoney(n) {
  const v = Number(n || 0)
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 10_000) return `$${Math.round(v / 1000)}k`
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`
  return `$${Math.round(v)}`
}

/**
 * Share of a total per channel, for the mix bar. Channels with nothing are
 * dropped rather than drawn as a zero sliver; shares are of the channels
 * shown and add to 100.
 */
export function channelMix(values) {
  const total = CHANNEL_ORDER.reduce((s, k) => s + Math.max(0, Number(values[k] || 0)), 0)
  return CHANNEL_ORDER.filter((k) => Number(values[k] || 0) > 0).map((k) => ({
    key: k,
    value: Number(values[k] || 0),
    share: total > 0 ? (Number(values[k] || 0) / total) * 100 : 0,
  }))
}

/**
 * Two daily series on one date axis, for the stacked channel chart. Days
 * with nothing in either are kept, so the axis is continuous.
 */
export function mergeDaily(metaSeries, googleSeries, key) {
  const g = new Map((googleSeries || []).map((r) => [r.date, Number(r[key] || 0)]))
  return (metaSeries || []).map((r) => {
    const meta = Number(r[key] || 0)
    const google = g.get(r.date) || 0
    return { date: r.date, meta, google, total: meta + google }
  })
}

/** "Aug 31 to Sep 29", the dates the headline numbers cover. */
export function rangeLabel(since, until) {
  const f = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${f(since)} to ${f(until)}`
}
