import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import UnmappedAccountsPanel from '../components/UnmappedAccountsPanel'
import MonthlyReportsPanel from '../components/MonthlyReportsPanel'
import {
  fetchAdRowsForRange,
  formatDate,
  getMonday,
  isLive,
  money,
} from '../lib/queries'
import { LOWER_IS_BETTER, buildDailySeries, daysAgo, pctChange, totals as sumSeries } from '../lib/dailySeries'
import DailyChart from '../components/DailyChart'
import StatTile from '../components/StatTile'
import { Button, Card, Table, THead, TBody, Tr, Th, Td } from '../components/ui'
import { runMetaSync, summariseSync } from '../lib/metaSync'

// Live mode reads per-ad rows so it can filter on ad status; All-time reads the
// account-level weekly KPIs, which reach further back. Each mode is sourced
// from wherever it is actually accurate rather than forcing one table to do both.
// Both scopes read the same daily rows and differ only on ad status, so the
// toggle is a filter rather than a different source. It used to switch between
// ad_daily and weekly_kpis, which meant the two scopes silently covered
// different date ranges and could not be compared.
const SCOPES = [
  { key: 'live', label: 'Live ads' },
  { key: 'all', label: 'All ads' },
]

const RANGES = [
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
]

// axis() is separate from format(): an axis tick wants $1.2K where a tooltip
// wants $1,240, and cramming both into one formatter makes one of them wrong.
const METRICS = [
  {
    key: 'spend',
    label: 'Ad spend',
    format: (v) => money(v),
    axis: (v) => (v >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `$${Math.round(v)}`),
  },
  { key: 'leads', label: 'Leads', format: (v) => v.toFixed(v % 1 === 0 ? 0 : 1), axis: (v) => String(v) },
  {
    key: 'cpl',
    label: 'Cost per lead',
    format: (v) => (v > 0 ? `$${v.toFixed(2)}` : '—'),
    axis: (v) => `$${Math.round(v)}`,
  },
]

function ChannelCard({ channel, spend, leads }) {
  const cpl = leads > 0 ? spend / leads : 0
  return (
    <Card>
      <p className="mb-3 text-sm font-semibold tracking-tight text-slate-900">{channel}</p>
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
    </Card>
  )
}

function PerformanceTable({ rows, nameHeader, onOpen, showLsa }) {
  return (
    <Table>
      <THead>
        <tr>
          <Th>{nameHeader}</Th>
          <Th numeric>Meta spend</Th>
          {showLsa && <Th numeric>LSA spend</Th>}
          <Th numeric>Total spend</Th>
          <Th numeric>Leads</Th>
          <Th numeric>Cost/lead</Th>
          <Th numeric>{'\u00a0'}</Th>
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <Tr
            key={row.id}
            onClick={(e) => {
              // The name cell is a real link — let it handle its own click
              // (and cmd-click) rather than navigating twice.
              if (e.target.closest('a')) return
              onOpen(row.id)
            }}
            className="cursor-pointer"
          >
            <Td>
              <Link
                to={`/client/${row.id}#ad-performance`}
                className="font-medium text-blue-600 hover:text-blue-800"
              >
                {row.name}
              </Link>
            </Td>
            <Td numeric muted>
              {money(row.metaSpend)}
            </Td>
            {showLsa && (
              <Td numeric muted>
                {money(row.lsaSpend)}
              </Td>
            )}
            <Td numeric className="font-medium">
              {money(row.spend)}
            </Td>
            <Td numeric className="font-medium">
              {row.leads}
            </Td>
            <Td numeric className="font-medium">
              {row.cpl > 0 ? `$${row.cpl.toFixed(2)}` : '—'}
            </Td>
            <Td numeric className="whitespace-nowrap text-xs font-medium text-blue-600">
              View ads →
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  )
}

export default function ReportsPage() {
  const navigate = useNavigate()
  const openAds = (id) => navigate(`/client/${id}#ad-performance`)
  const [adRows, setAdRows] = useState([])
  const [scope, setScope] = useState('live')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [days, setDays] = useState(30)
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
      setAdRows(await fetchAdRowsForRange(daysAgo(days * 2 - 1)))
    } catch (err) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  // Twice the range is fetched so each stat can be compared with the window
  // immediately before it. One extra query beats a second round trip when the
  // reader switches range.
  useEffect(() => {
    setLoading(true)
    const since = daysAgo(days * 2 - 1)
    fetchAdRowsForRange(since)
      .then((rows) => {
        setAdRows(rows)
        setError('')
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [days])

  const metric = METRICS.find((m) => m.key === metricKey)

  // Horizon HVAC and Horizon Water Co are ours, not clients. Their spend is
  // real and worth seeing, but folding it into agency totals would overstate
  // what we run for clients — so every headline number below covers clients
  // only, and the internal businesses get their own table.
  // Live per-ad rows are reshaped into the weekly_kpis shape (one row per
  // client per week, channel Meta) so every aggregate below is source-agnostic.
  // Scope is applied here rather than in the query, so switching is instant.
  const scopedRows = useMemo(
    () => (scope === 'live' ? adRows.filter((r) => isLive(r.effective_status)) : adRows),
    [adRows, scope]
  )

  const windowStart = daysAgo(days - 1)
  const prevStart = daysAgo(days * 2 - 1)
  const prevEnd = daysAgo(days)

  // Twice the range is fetched for the comparison, so the page has to be
  // explicit about which half it is showing. Every number below the range
  // buttons comes from currentRows; only the deltas look at prevRows.
  const currentRows = useMemo(
    () => scopedRows.filter((r) => r.date >= windowStart),
    [scopedRows, windowStart]
  )
  const prevRows = useMemo(
    () => scopedRows.filter((r) => r.date >= prevStart && r.date <= prevEnd),
    [scopedRows, prevStart, prevEnd]
  )

  const liveAsKpis = useMemo(() => {
    const byKey = new Map()
    for (const r of currentRows) {
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
  }, [currentRows])

  const active = liveAsKpis

  const clientKpis = useMemo(() => active.filter((k) => !k.clients?.is_internal), [active])
  const internalKpis = useMemo(() => active.filter((k) => k.clients?.is_internal), [active])

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

  // Client rows only: the internal businesses have real spend, but folding it
  // into the headline would overstate what we run for clients.
  const daily = useMemo(
    () =>
      buildDailySeries(
        currentRows.filter((r) => !r.clients?.is_internal),
        windowStart,
        daysAgo(0)
      ),
    [currentRows, windowStart]
  )
  const previous = useMemo(
    () =>
      buildDailySeries(
        prevRows.filter((r) => !r.clients?.is_internal),
        prevStart,
        prevEnd
      ),
    [prevRows, prevStart, prevEnd]
  )

  const now = useMemo(() => sumSeries(daily), [daily])
  const before = useMemo(() => sumSeries(previous), [previous])
  const totals = { spend: now.spend, leads: now.leads }

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
    // Scrolls within itself on a phone. min-w-0 is the part that matters: as a
    // flex item this defaults to min-width:auto, which refuses to shrink below
    // its content no matter what max-width says, and the whole page goes
    // sideways with it.
    <div className="flex gap-1.5 min-w-0 max-w-full overflow-x-auto pb-1">
      <Button onClick={handleSync} disabled={syncing} className="whitespace-nowrap">
        {syncing ? 'Syncing...' : '↻ Sync Meta'}
      </Button>
      {SCOPES.map((sc) => (
        <Button
          key={sc.key}
          variant={scope === sc.key ? 'primary' : 'outline'}
          onClick={() => setScope(sc.key)}
          className="whitespace-nowrap"
        >
          {sc.label}
        </Button>
      ))}
      <span className="w-px bg-slate-200 mx-0.5" />
      {RANGES.map((r) => (
        <Button
          key={r.days}
          variant={days === r.days ? 'dark' : 'outline'}
          onClick={() => setDays(r.days)}
          className="whitespace-nowrap"
        >
          {r.label}
        </Button>
      ))}
    </div>
  )

  return (
    <Layout
      title="Performance Reports"
      subtitle={`Last ${days} days · ${
        scope === 'live' ? 'live ads only' : 'all ads'
      } · ${money(totals.spend)} spend · ${totals.leads} leads`}
      actions={rangeButtons}
    >
      <UnmappedAccountsPanel />
      <MonthlyReportsPanel />
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-4">
            <StatTile
              label="Ad spend"
              value={money(now.spend)}
              delta={pctChange(now.spend, before.spend)}
            />
            <StatTile label="Leads" value={now.leads} delta={pctChange(now.leads, before.leads)} />
            <StatTile
              label="Cost per lead"
              value={now.cpl > 0 ? `$${now.cpl.toFixed(2)}` : '—'}
              delta={pctChange(now.cpl, before.cpl)}
              lowerIsBetter={LOWER_IS_BETTER.has('cpl')}
            />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 mb-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div>
                <h2 className="font-bold text-slate-900">{metric.label} by day</h2>
                <p className="text-xs text-slate-500">
                  Meta · {scope === 'live' ? 'live ads only' : 'all ads'} · clients only
                </p>
              </div>
              <div className="flex gap-1.5">
                {METRICS.map((m) => (
                  <Button
                    key={m.key}
                    size="sm"
                    variant={metricKey === m.key ? 'primary' : 'secondary'}
                    onClick={() => setMetricKey(m.key)}
                  >
                    {m.label}
                  </Button>
                ))}
              </div>
            </div>
            <DailyChart series={daily} metric={metric} />
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
