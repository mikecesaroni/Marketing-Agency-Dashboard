import { useEffect, useMemo, useState } from 'react'
import {
  bucketByPeriod,
  fetchAdDaily,
  formatDate,
  money,
  summariseAds,
  withDerived,
} from '../lib/queries'

const RANGES = [
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: 'all', label: 'Lifetime', days: null },
]

const METRICS = [
  { key: 'spend', label: 'Spend', fmt: (v) => money(v) },
  { key: 'leads', label: 'Leads', fmt: (v) => String(v) },
  { key: 'cpl', label: 'Cost / lead', fmt: (v) => (v > 0 ? `$${v.toFixed(2)}` : '—') },
  { key: 'impressions', label: 'Impressions', fmt: (v) => v.toLocaleString() },
  { key: 'clicks', label: 'Clicks', fmt: (v) => v.toLocaleString() },
  { key: 'ctr', label: 'CTR', fmt: (v) => (v > 0 ? `${v.toFixed(2)}%` : '—') },
]

const MAX_BAR_PX = 140

function Tile({ label, value, sub }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
      <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold text-slate-900 mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  )
}

function Chart({ buckets, metric, period }) {
  const max = Math.max(...buckets.map((b) => b[metric.key]), 0)

  if (buckets.length === 0) {
    return <p className="text-slate-500 text-sm py-8 text-center">No data in this range.</p>
  }

  const label = (key) => {
    const [y, m, d] = key.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    if (period === 'month') {
      // Apostrophe-year, because "Jun 26" reads as the 26th of June next to
      // week labels that genuinely are month-and-day.
      return `${date.toLocaleDateString('en-US', { month: 'short' })} '${String(y).slice(-2)}`
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="flex items-end gap-1.5 md:gap-3 overflow-x-auto pb-1">
      {buckets.map((b) => {
        const value = b[metric.key]
        const px = max > 0 ? Math.max((value / max) * MAX_BAR_PX, 3) : 3
        return (
          <div
            key={b.key}
            className="flex-1 min-w-[44px] flex flex-col items-center justify-end gap-1.5"
          >
            <span className="text-[10px] font-semibold text-slate-700 whitespace-nowrap">
              {metric.fmt(value)}
            </span>
            <div
              className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition"
              style={{ height: `${px}px` }}
              title={`${label(b.key)}: ${metric.fmt(value)}`}
            />
            <span className="text-[10px] text-slate-500 whitespace-nowrap">{label(b.key)}</span>
          </div>
        )
      })}
    </div>
  )
}

const VIDEO_ONLY = new Set(['videoPlays', 'avgWatch', 'holdRate'])

const COLUMNS = [
  { key: 'spend', label: 'Spend', fmt: (a) => `$${a.spend.toFixed(2)}`, num: true },
  { key: 'impressions', label: 'Impr.', fmt: (a) => a.impressions.toLocaleString(), num: true },
  { key: 'reach', label: 'Reach', fmt: (a) => a.reach.toLocaleString(), num: true },
  { key: 'clicks', label: 'Clicks', fmt: (a) => a.clicks.toLocaleString(), num: true },
  { key: 'ctr', label: 'CTR', fmt: (a) => (a.ctr > 0 ? `${a.ctr.toFixed(2)}%` : '—'), num: true },
  { key: 'cpc', label: 'CPC', fmt: (a) => (a.cpc > 0 ? `$${a.cpc.toFixed(2)}` : '—'), num: true },
  { key: 'cpm', label: 'CPM', fmt: (a) => (a.cpm > 0 ? `$${a.cpm.toFixed(2)}` : '—'), num: true },
  { key: 'leads', label: 'Leads', fmt: (a) => String(a.leads), num: true },
  { key: 'cpl', label: 'Cost/lead', fmt: (a) => (a.cpl > 0 ? `$${a.cpl.toFixed(2)}` : '—'), num: true },
  {
    key: 'videoPlays',
    label: 'Plays',
    fmt: (a) => (a.isVideo ? a.videoPlays.toLocaleString() : '—'),
    num: true,
  },
  {
    key: 'avgWatch',
    label: 'Avg watch',
    fmt: (a) => (a.avgWatch != null ? `${a.avgWatch.toFixed(1)}s` : '—'),
    num: true,
  },
  {
    key: 'holdRate',
    label: 'Hold rate',
    fmt: (a) => (a.holdRate != null ? `${a.holdRate.toFixed(1)}%` : '—'),
    num: true,
  },
]

export default function AdPerformanceSection({ clientId }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [range, setRange] = useState('30')
  const [period, setPeriod] = useState('week')
  const [metricKey, setMetricKey] = useState('spend')
  const [sort, setSort] = useState({ key: 'spend', dir: 'desc' })

  useEffect(() => {
    const days = RANGES.find((r) => r.key === range).days
    let since = null
    if (days) {
      const d = new Date()
      d.setDate(d.getDate() - days)
      since = formatDate(d)
    }
    fetchAdDaily(clientId, since)
      .then((r) => {
        setRows(r)
        setError('')
      })
      .catch((err) => setError(err.message))
  }, [clientId, range])

  const ads = useMemo(() => (rows ? summariseAds(rows) : []), [rows])
  const buckets = useMemo(() => (rows ? bucketByPeriod(rows, period) : []), [rows, period])

  const totals = useMemo(() => {
    const t = ads.reduce(
      (acc, a) => ({
        spend: acc.spend + a.spend,
        leads: acc.leads + a.leads,
        impressions: acc.impressions + a.impressions,
        clicks: acc.clicks + a.clicks,
        reach: acc.reach + a.reach,
      }),
      { spend: 0, leads: 0, impressions: 0, clicks: 0, reach: 0 }
    )
    return withDerived(t)
  }, [ads])

  const sorted = useMemo(() => {
    const list = [...ads]
    list.sort((a, b) => {
      const av = a[sort.key] ?? -1
      const bv = b[sort.key] ?? -1
      if (typeof av === 'string') return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sort.dir === 'asc' ? av - bv : bv - av
    })
    return list
  }, [ads, sort])

  const toggleSort = (key) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))

  const metric = METRICS.find((m) => m.key === metricKey)
  const hasVideo = ads.some((a) => a.isVideo)

  if (error) {
    return (
      <div className="bg-white rounded-lg md:rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
        <h2 className="text-lg md:text-xl font-bold text-slate-900 mb-2">Ad Performance</h2>
        <p className="text-sm text-red-700">
          {error.toLowerCase().includes('ad_daily')
            ? 'Run supabase/ad-performance.sql in the Supabase SQL Editor to enable per-ad tracking.'
            : error}
        </p>
      </div>
    )
  }

  if (!rows) return null

  return (
    <div className="bg-white rounded-lg md:rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h2 className="text-lg md:text-xl font-bold text-slate-900">Ad Performance</h2>
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                range === r.key
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-slate-500 text-sm py-6 text-center">
          No ad data yet. It fills in on the next Meta sync.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
            <Tile label="Spend" value={`$${totals.spend.toFixed(2)}`} />
            <Tile
              label="Leads"
              value={totals.leads}
              sub={totals.cpl > 0 ? `$${totals.cpl.toFixed(2)} each` : null}
            />
            <Tile
              label="Impressions"
              value={totals.impressions.toLocaleString()}
              sub={`${totals.reach.toLocaleString()} reached`}
            />
            <Tile
              label="CTR"
              value={totals.ctr > 0 ? `${totals.ctr.toFixed(2)}%` : '—'}
              sub={totals.cpc > 0 ? `$${totals.cpc.toFixed(2)} / click` : null}
            />
          </div>

          <div className="border border-slate-200 rounded-lg p-3 md:p-4 mb-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div className="flex gap-1">
                {METRICS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setMetricKey(m.key)}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                      metricKey === m.key
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                {['week', 'month'].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium capitalize transition ${
                      period === p
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {p}ly
                  </button>
                ))}
              </div>
            </div>
            <Chart buckets={buckets} metric={metric} period={period} />
          </div>

          <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-3 py-2 text-left font-semibold text-slate-900 sticky left-0 bg-slate-50">
                    Ad
                  </th>
                  {COLUMNS.map((c) => {
                    // Video-only columns stay hidden until there's a video ad,
                    // rather than showing a column of dashes.
                    if (VIDEO_ONLY.has(c.key) && !hasVideo) return null
                    return (
                      <th
                        key={c.key}
                        onClick={() => toggleSort(c.key)}
                        className="px-3 py-2 text-right font-semibold text-slate-900 cursor-pointer hover:text-blue-600 whitespace-nowrap"
                      >
                        {c.label}
                        {sort.key === c.key && (sort.dir === 'desc' ? ' ↓' : ' ↑')}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {sorted.map((a) => (
                  <tr key={a.ad_id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 sticky left-0 bg-white max-w-[220px]">
                      <p className="font-medium text-slate-900 truncate" title={a.ad_name}>
                        {a.isVideo && '🎬 '}
                        {a.ad_name || a.ad_id}
                      </p>
                    </td>
                    {COLUMNS.map((c) => {
                      if (VIDEO_ONLY.has(c.key) && !hasVideo) return null
                      return (
                        <td
                          key={c.key}
                          className="px-3 py-2 text-right text-slate-700 whitespace-nowrap"
                        >
                          {c.fmt(a)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasVideo && (
            <p className="text-[11px] text-slate-500 mt-3">
              Plays, avg watch and hold rate apply to video ads only — image ads show a dash
              rather than a zero. Avg watch is weighted by plays, so check the play count before
              reading it: a few seconds off a handful of plays is noise, not a hook.
            </p>
          )}
        </>
      )}
    </div>
  )
}
