import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  bucketByPeriod,
  fetchAdDaily,
  formatDate,
  groupCampaigns,
  isLive,
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

const SCOPES = [
  { key: 'live', label: 'Live ads' },
  { key: 'all', label: 'All ads' },
]

const num = (v) => (v || 0).toLocaleString()
const dollars = (v) => `$${(v || 0).toFixed(2)}`

// One metric set for every level of the tree, so a campaign row and an ad row
// line up under the same headings.
function MetricCells({ row, isAd, hasVideo }) {
  return (
    <>
      <td className="px-3 py-2 text-right font-medium text-slate-900 whitespace-nowrap">
        {dollars(row.spend)}
      </td>
      <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">{num(row.impressions)}</td>
      <td className="px-3 py-2 text-right text-slate-500 whitespace-nowrap">
        {/* Reach dedupes people, so it cannot be summed up the tree. */}
        {isAd ? num(row.reach) : '—'}
      </td>
      <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">{num(row.clicks)}</td>
      <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">
        {row.ctr > 0 ? `${row.ctr.toFixed(2)}%` : '—'}
      </td>
      <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">
        {row.cpc > 0 ? dollars(row.cpc) : '—'}
      </td>
      <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">
        {row.cpm > 0 ? dollars(row.cpm) : '—'}
      </td>
      <td className="px-3 py-2 text-right font-medium text-slate-900 whitespace-nowrap">
        {row.leads}
      </td>
      <td className="px-3 py-2 text-right font-medium text-slate-900 whitespace-nowrap">
        {row.cpl > 0 ? dollars(row.cpl) : '—'}
      </td>
      {hasVideo && (
        <>
          <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">
            {isAd && row.isVideo ? num(row.videoPlays) : '—'}
          </td>
          <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">
            {isAd && row.avgWatch != null ? `${row.avgWatch.toFixed(1)}s` : '—'}
          </td>
          <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">
            {isAd && row.holdRate != null ? `${row.holdRate.toFixed(1)}%` : '—'}
          </td>
        </>
      )}
    </>
  )
}

function LiveBadge({ live, total }) {
  const allLive = live === total
  return (
    <span
      className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${
        live === 0
          ? 'bg-slate-100 text-slate-500'
          : allLive
            ? 'bg-green-100 text-green-800'
            : 'bg-amber-100 text-amber-800'
      }`}
    >
      {live === 0 ? 'none live' : allLive ? `${live} live` : `${live} of ${total} live`}
    </span>
  )
}

function CampaignTree({ campaigns, hasVideo }) {
  // Campaigns start open when there are only a couple, collapsed when the
  // account has a long history — otherwise the table opens to a wall of rows.
  const [open, setOpen] = useState(() =>
    campaigns.length <= 2 ? new Set(campaigns.map((c) => c.id)) : new Set()
  )
  const [openSets, setOpenSets] = useState(() => new Set())

  const toggle = (set, setter) => (id) =>
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleCampaign = toggle(open, setOpen)
  const toggleSet = toggle(openSets, setOpenSets)

  return (
    <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-3 py-2 text-left font-semibold text-slate-900 min-w-[240px]">
              Campaign / Ad set / Ad
            </th>
            {['Spend', 'Impr.', 'Reach', 'Clicks', 'CTR', 'CPC', 'CPM', 'Leads', 'Cost/lead'].map(
              (h) => (
                <th key={h} className="px-3 py-2 text-right font-semibold text-slate-900 whitespace-nowrap">
                  {h}
                </th>
              )
            )}
            {hasVideo &&
              ['Plays', 'Avg watch', 'Hold rate'].map((h) => (
                <th key={h} className="px-3 py-2 text-right font-semibold text-slate-900 whitespace-nowrap">
                  {h}
                </th>
              ))}
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => {
            const isOpen = open.has(c.id)
            return (
              <Fragment key={c.id}>
                <tr
                  onClick={() => toggleCampaign(c.id)}
                  className="border-b border-slate-200 bg-slate-50/60 hover:bg-slate-100 cursor-pointer"
                >
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center">
                      <span className="text-slate-400 w-4 flex-shrink-0">{isOpen ? '▾' : '▸'}</span>
                      <span className="font-bold text-slate-900">{c.name}</span>
                      <LiveBadge live={c.liveAds} total={c.adCount} />
                    </span>
                  </td>
                  <MetricCells row={c} isAd={false} hasVideo={hasVideo} />
                </tr>

                {isOpen &&
                  c.adsets.map((a) => {
                    const setOpen2 = openSets.has(a.id)
                    return (
                      <Fragment key={a.id}>
                        <tr
                          onClick={() => toggleSet(a.id)}
                          className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                        >
                          <td className="px-3 py-2 pl-7">
                            <span className="inline-flex items-center">
                              <span className="text-slate-400 w-4 flex-shrink-0">
                                {setOpen2 ? '▾' : '▸'}
                              </span>
                              <span className="font-semibold text-slate-700">{a.name}</span>
                              <LiveBadge live={a.liveAds} total={a.ads.length} />
                            </span>
                          </td>
                          <MetricCells row={a} isAd={false} hasVideo={hasVideo} />
                        </tr>

                        {setOpen2 &&
                          a.ads.map((ad) => (
                            <tr key={ad.ad_id} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="px-3 py-2 pl-14 max-w-[280px]">
                                <p className="text-slate-800 truncate" title={ad.ad_name}>
                                  {ad.isVideo && '🎬 '}
                                  {ad.ad_name || ad.ad_id}
                                  {!ad.live && (
                                    <span className="ml-2 text-[10px] text-slate-500">
                                      {ad.status?.toLowerCase().replace(/_/g, ' ')}
                                    </span>
                                  )}
                                </p>
                              </td>
                              <MetricCells row={ad} isAd hasVideo={hasVideo} />
                            </tr>
                          ))}
                      </Fragment>
                    )
                  })}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function AdPerformanceSection({ clientId }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [range, setRange] = useState('30')
  const [scope, setScope] = useState('live')
  const [period, setPeriod] = useState('week')
  const [metricKey, setMetricKey] = useState('spend')

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

  // One filter feeds the tiles, the chart and the tree, so the headline number
  // always matches what the table below it adds up to.
  const scoped = useMemo(
    () => (rows ? (scope === 'live' ? rows.filter((r) => isLive(r.effective_status)) : rows) : []),
    [rows, scope]
  )

  const ads = useMemo(() => summariseAds(scoped), [scoped])
  const buckets = useMemo(() => bucketByPeriod(scoped, period), [scoped, period])
  const campaigns = useMemo(() => groupCampaigns(scoped), [scoped])

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
        <div className="flex flex-wrap gap-1.5">
          {SCOPES.map((sc) => (
            <button
              key={sc.key}
              onClick={() => setScope(sc.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                scope === sc.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {sc.label}
            </button>
          ))}
          <span className="w-px bg-slate-200 mx-1 self-stretch" />
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

      {scoped.length === 0 ? (
        <p className="text-slate-500 text-sm py-6 text-center">
          {rows.length === 0
            ? 'No ad data yet. It fills in on the next Meta sync.'
            : 'No live ads in this range — switch to All ads to see paused history.'}
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

          <CampaignTree campaigns={campaigns} hasVideo={hasVideo} />

          <p className="text-[11px] text-slate-500 mt-3">
            {scope === 'live'
              ? 'Showing ads that are still running. Switch to All ads for paused and finished ones.'
              : 'Showing every ad with recorded spend, including paused and finished ones.'}{' '}
            Reach shows only on ad rows — Meta dedupes it per person, so it cannot be added up
            across a campaign the way spend and clicks can.
            {hasVideo && (
              <>
                {' '}Plays, avg watch and hold rate apply to video ads only. Avg watch is weighted
                by plays, so check the play count before reading it: a few seconds off a handful of
                plays is noise, not a hook.
              </>
            )}
          </p>
        </>
      )}
    </div>
  )
}
