import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import UnmappedAccountsPanel from '../components/UnmappedAccountsPanel'
import {
  fetchKPIHistory,
  fetchLiveAdRows,
  formatDate,
  getMonday,
  money,
  shortWeekLabel,
} from '../lib/queries'
import { runMetaSync, summariseSync } from '../lib/metaSync'

// Live mode reads per-ad rows so it can filter on ad status; All-time reads the
// account-level weekly KPIs, which reach further back. Each mode is sourced
// from wherever it is actually accurate rather than forcing one table to do both.
const SCOPES = [
  { key: 'live', label: 'Live ads' },
  { key: 'all', label: 'All time' },
]

const RANGES = [
  { weeks: 4, label: '4 weeks' },
  { weeks: 8, label: '8 weeks' },
  { weeks: 12, label: '12 weeks' },
]

const METRICS = [
  { key: 'spend', label: 'Ad spend', format: (v) => money(v) },
  { key: 'leads', label: 'Leads', format: (v) => String(v) },
  { key: 'cpl', label: 'Cost per lead', format: (v) => (v > 0 ? `$${v.toFixed(2)}` : '—') },
]

// Bar heights are in pixels on purpose — a percentage height would need a
// parent with a definite height, which a flex-grown column doesn't give us.
const MAX_BAR_PX = 150

function BarChart({ rows, metric }) {
  const max = Math.max(...rows.map((r) => r[metric.key]), 0)

  if (rows.length === 0) {
    return <p className="text-slate-500 text-sm">No KPI data in this range yet.</p>
  }

  return (
    <div className="flex items-end gap-1.5 md:gap-3 overflow-x-auto pb-1">
      {rows.map((row) => {
        const value = row[metric.key]
        const barPx = max > 0 ? Math.max((value / max) * MAX_BAR_PX, 3) : 3
        return (
          <div
            key={row.week}
            className="flex-1 min-w-[38px] flex flex-col items-center justify-end gap-1.5"
          >
            <span className="text-[10px] font-semibold text-slate-700 whitespace-nowrap">
              {metric.format(value)}
            </span>
            <div
              className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition"
              style={{ height: `${barPx}px` }}
              title={`${row.week}: ${metric.format(value)}`}
            />
            <span className="text-[10px] text-slate-500 whitespace-nowrap">
              {shortWeekLabel(row.week)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ChannelCard({ channel, spend, leads }) {
  const cpl = leads > 0 ? spend / leads : 0
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="font-semibold text-slate-900 mb-3">{channel}</p>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-lg font-bold text-slate-900">{money(spend)}</p>
          <p className="text-xs text-slate-500">Spend</p>
        </div>
        <div>
          <p className="text-lg font-bold text-slate-900">{leads}</p>
          <p className="text-xs text-slate-500">Leads</p>
        </div>
        <div>
          <p className="text-lg font-bold text-slate-900">
            {cpl > 0 ? `$${cpl.toFixed(2)}` : '—'}
          </p>
          <p className="text-xs text-slate-500">Cost/lead</p>
        </div>
      </div>
    </div>
  )
}

function PerformanceTable({ rows, nameHeader, onOpen, showLsa }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-900">
              <th className="px-4 py-3 text-left font-semibold">{nameHeader}</th>
              <th className="px-4 py-3 text-right font-semibold">Meta spend</th>
              {showLsa && <th className="px-4 py-3 text-right font-semibold">LSA spend</th>}
              <th className="px-4 py-3 text-right font-semibold">Total spend</th>
              <th className="px-4 py-3 text-right font-semibold">Leads</th>
              <th className="px-4 py-3 text-right font-semibold">Cost/lead</th>
              <th className="px-4 py-3 text-right font-semibold">
                <span className="sr-only">Ad breakdown</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={(e) => {
                  // The name cell is a real link — let it handle its own click
                  // (and cmd-click) rather than navigating twice.
                  if (e.target.closest('a')) return
                  onOpen(row.id)
                }}
                className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition cursor-pointer"
              >
                <td className="px-4 py-3">
                  <Link
                    to={`/client/${row.id}#ad-performance`}
                    className="font-medium text-blue-600 hover:text-blue-800"
                  >
                    {row.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right text-slate-600">{money(row.metaSpend)}</td>
                {showLsa && (
                  <td className="px-4 py-3 text-right text-slate-600">{money(row.lsaSpend)}</td>
                )}
                <td className="px-4 py-3 text-right font-medium">{money(row.spend)}</td>
                <td className="px-4 py-3 text-right font-medium">{row.leads}</td>
                <td className="px-4 py-3 text-right font-medium">
                  {row.cpl > 0 ? `$${row.cpl.toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap text-xs font-medium text-blue-600">
                  View ads →
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const navigate = useNavigate()
  const openAds = (id) => navigate(`/client/${id}#ad-performance`)
  const [kpis, setKpis] = useState([])
  const [liveRows, setLiveRows] = useState([])
  const [scope, setScope] = useState('live')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [weeks, setWeeks] = useState(8)
  const [metricKey, setMetricKey] = useState('spend')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState('')

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult('')
    setError('')
    try {
      const summary = summariseSync(await runMetaSync())
      setSyncResult(summary)
      setKpis(await fetchKPIHistory(weeks))
    } catch (err) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    const since = formatDate(
      new Date(getMonday(new Date()).getTime() - (weeks - 1) * 7 * 86400000)
    )
    Promise.all([fetchKPIHistory(weeks), fetchLiveAdRows(since)])
      .then(([k, live]) => {
        setKpis(k)
        setLiveRows(live)
        setError('')
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [weeks])

  const metric = METRICS.find((m) => m.key === metricKey)

  // Horizon HVAC and Horizon Water Co are ours, not clients. Their spend is
  // real and worth seeing, but folding it into agency totals would overstate
  // what we run for clients — so every headline number below covers clients
  // only, and the internal businesses get their own table.
  // Live per-ad rows are reshaped into the weekly_kpis shape (one row per
  // client per week, channel Meta) so every aggregate below is source-agnostic.
  const liveAsKpis = useMemo(() => {
    const byKey = new Map()
    for (const r of liveRows) {
      const [y, m, d] = r.date.split('-').map(Number)
      const week = formatDate(getMonday(new Date(y, m - 1, d)))
      const key = `${r.client_id}|${week}`
      const row = byKey.get(key) || {
        id: key,
        client_id: r.client_id,
        week_of: week,
        channel: 'Meta',
        ad_spend: 0,
        leads: 0,
        clients: r.clients,
      }
      row.ad_spend += Number(r.spend) || 0
      row.leads += r.leads || 0
      byKey.set(key, row)
    }
    return [...byKey.values()]
  }, [liveRows])

  const active = scope === 'live' ? liveAsKpis : kpis

  const clientKpis = useMemo(() => active.filter((k) => !k.clients?.is_internal), [active])
  const internalKpis = useMemo(() => active.filter((k) => k.clients?.is_internal), [active])

  const weeklyRows = useMemo(() => {
    const byWeek = {}
    for (const kpi of clientKpis) {
      const row = (byWeek[kpi.week_of] ||= { week: kpi.week_of, spend: 0, leads: 0 })
      row.spend += kpi.ad_spend || 0
      row.leads += kpi.leads || 0
    }
    return Object.values(byWeek)
      .sort((a, b) => a.week.localeCompare(b.week))
      .map((r) => ({ ...r, cpl: r.leads > 0 ? r.spend / r.leads : 0 }))
  }, [clientKpis])

  const rollUpByClient = (rows) => {
    const byClient = {}
    for (const kpi of rows) {
      const row = (byClient[kpi.client_id] ||= {
        id: kpi.client_id,
        name: kpi.clients?.name || 'Unknown',
        spend: 0,
        leads: 0,
        metaSpend: 0,
        lsaSpend: 0,
      })
      row.spend += kpi.ad_spend || 0
      row.leads += kpi.leads || 0
      if (kpi.channel === 'Meta') row.metaSpend += kpi.ad_spend || 0
      else row.lsaSpend += kpi.ad_spend || 0
    }
    return Object.values(byClient)
      .map((r) => ({ ...r, cpl: r.leads > 0 ? r.spend / r.leads : 0 }))
      .sort((a, b) => b.leads - a.leads)
  }

  const clientRows = useMemo(() => rollUpByClient(clientKpis), [clientKpis])
  const internalRows = useMemo(() => rollUpByClient(internalKpis), [internalKpis])

  const totals = weeklyRows.reduce(
    (acc, r) => ({ spend: acc.spend + r.spend, leads: acc.leads + r.leads }),
    { spend: 0, leads: 0 }
  )

  const channelTotals = useMemo(() => {
    const t = { Meta: { spend: 0, leads: 0 }, LSA: { spend: 0, leads: 0 } }
    for (const kpi of clientKpis) {
      const bucket = t[kpi.channel]
      if (!bucket) continue
      bucket.spend += kpi.ad_spend || 0
      bucket.leads += kpi.leads || 0
    }
    return t
  }, [clientKpis])

  const rangeButtons = (
    <div className="flex gap-1.5">
      <button
        onClick={handleSync}
        disabled={syncing}
        className="px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition"
      >
        {syncing ? 'Syncing...' : '↻ Sync Meta'}
      </button>
      {SCOPES.map((sc) => (
        <button
          key={sc.key}
          onClick={() => setScope(sc.key)}
          className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
            scope === sc.key
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
          }`}
        >
          {sc.label}
        </button>
      ))}
      <span className="w-px bg-slate-200 mx-0.5" />
      {RANGES.map((r) => (
        <button
          key={r.weeks}
          onClick={() => setWeeks(r.weeks)}
          className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
            weeks === r.weeks
              ? 'bg-slate-900 text-white'
              : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  )

  return (
    <Layout
      title="Performance Reports"
      subtitle={`Last ${weeks} weeks · ${
        scope === 'live' ? 'live ads only' : 'all ads'
      } · ${money(totals.spend)} spend · ${totals.leads} leads`}
      actions={rangeButtons}
    >
      <UnmappedAccountsPanel />
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 mb-4">
          Error: {error}
        </div>
      )}

      {syncResult && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 mb-4 text-sm">
          {syncResult}
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 mb-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
              <h2 className="font-bold text-slate-900">Weekly trend</h2>
              <div className="flex gap-1.5">
                {METRICS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setMetricKey(m.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      metricKey === m.key
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <BarChart rows={weeklyRows} metric={metric} />
          </div>

          <h2 className="font-bold text-slate-900 mb-3">Channel breakdown</h2>
          <div className="grid md:grid-cols-2 gap-3 md:gap-4 mb-6">
            <ChannelCard
              channel="Meta Ads"
              spend={channelTotals.Meta.spend}
              leads={channelTotals.Meta.leads}
            />
            <ChannelCard
              channel="Google LSA"
              spend={channelTotals.LSA.spend}
              leads={channelTotals.LSA.leads}
            />
          </div>

          <h2 className="font-bold text-slate-900 mb-3">Client performance</h2>
          {clientRows.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
              <p className="text-slate-500">
                No KPI data logged yet. Log weekly KPIs on a client page to see reports here.
              </p>
            </div>
          ) : (
            <PerformanceTable rows={clientRows} nameHeader="Client" onOpen={openAds} showLsa={scope === 'all'} />
          )}

          {internalRows.length > 0 && (
            <>
              <div className="flex items-baseline gap-2 mt-6 mb-3">
                <h2 className="font-bold text-slate-900">My businesses</h2>
                <span className="text-xs text-slate-500">
                  Not clients — excluded from the totals and charts above
                </span>
              </div>
              <PerformanceTable
                rows={internalRows}
                nameHeader="Business"
                onOpen={openAds}
                showLsa={scope === 'all'}
              />
            </>
          )}
        </>
      )}
    </Layout>
  )
}
