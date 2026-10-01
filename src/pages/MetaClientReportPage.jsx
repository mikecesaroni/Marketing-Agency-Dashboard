import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import MetricLineChart from '../components/reports/MetricLineChart'
import { Scorecard, SortTable } from '../components/reports/ClientReportParts'
import { DarkButton, Panel, Pill, Segmented } from '../components/reports/kit'
import { CHANNELS, compactMoney } from '../lib/channels'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/pagedQuery'
import { daysAgo, pctChange } from '../lib/dailySeries'
import { isLive } from '../lib/queries'
import { inRange, metaKpis } from '../lib/metaReport'
import { togglePick } from '../lib/clientReportKit'
import { META_CLIENT_METRICS, adSetsFor, adsFor, metaCampaignsFor, metaDayTotals, placementsFor } from '../lib/metaClientReport'
import { runMetaSync, summariseSync } from '../lib/metaSync'
import AdPreviewModal from '../components/AdPreviewModal'

/**
 * One client's Meta ads, laid out like the Ads Manager overview: scorecards
 * across the top (click one or two to chart them), the chart, then
 * campaigns, ad sets, ads, placements and days as tabs. Every column header
 * sorts. The Google Ads client page is the same page for Google.
 *
 * Opened from a client's name on the Meta report, which passes its Live /
 * All scope along so the numbers match the row that was clicked.
 */
const RANGES = [
  { value: 7, label: '7d' },
  { value: 14, label: '14d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
]

const SCOPES = [
  { value: 'live', label: 'Live ads' },
  { value: 'all', label: 'All ads' },
]

const TABS = [
  { value: 'campaigns', label: 'Campaigns' },
  { value: 'adsets', label: 'Ad sets' },
  { value: 'ads', label: 'Ads' },
  { value: 'placements', label: 'Placements' },
  { value: 'days', label: 'Days' },
]

const B = CHANNELS.meta.color

const int = (n) => Math.round(Number(n || 0)).toLocaleString('en-US')
const usd = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct = (n) => `${Number(n || 0).toFixed(2)}%`

function fmt(kind, v, axis = false) {
  const n = Number(v || 0)
  if (axis) {
    if (kind === 'money' || kind === 'usd') return n >= 1000 ? compactMoney(n) : `$${n % 1 === 0 ? n : n.toFixed(2)}`
    if (kind === 'pct') return `${n % 1 === 0 ? n : n.toFixed(1)}%`
    return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n % 1 === 0 ? n : n.toFixed(1))
  }
  if (kind === 'int') return int(n)
  if (kind === 'money' || kind === 'usd') return usd(n)
  if (kind === 'pct') return pct(n)
  return String(n)
}

const RATIOS = new Set(['cpl', 'ctr', 'cpc', 'cpm'])
const M = Object.fromEntries(META_CLIENT_METRICS.map((m) => [m.key, m]))
const cell = (key, row) => (RATIOS.has(key) && !(row[key] > 0) ? '—' : fmt(M[key].kind, row[key]))
const num = (key, label, opts = {}) => ({ key, label, numeric: true, render: (r) => cell(key, r), ...opts })

const VERDICT = {
  dead: { label: 'No leads', tone: 'danger' },
  expensive: { label: 'Too expensive', tone: 'warning' },
  winner: { label: 'Winner', tone: 'success' },
}

function statusPill(live, status) {
  if (live) return <Pill tone="success">Active</Pill>
  const s = String(status || '').replace(/_/g, ' ').toLowerCase()
  return <Pill tone="neutral">{s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Off'}</Pill>
}

export default function MetaClientReportPage({ switcher }) {
  const { clientId } = useParams()
  // Range and scope live in the address, so the Meta / Google Ads switch
  // keeps them and a copied link opens on the same view.
  const [params, setParams] = useSearchParams()
  const days = RANGES.some((r) => r.value === Number(params.get('days'))) ? Number(params.get('days')) : 30
  const scope = params.get('scope') === 'live' ? 'live' : 'all'
  const setParam = (key, value) => {
    const next = new URLSearchParams(params)
    next.set(key, String(value))
    setParams(next, { replace: true })
  }
  const setDays = (d) => setParam('days', d)
  const setScope = (s) => setParam('scope', s)
  const [picked, setPicked] = useState(['leads', 'spend'])
  const [tab, setTab] = useState('campaigns')
  const [client, setClient] = useState(null)
  const [adRows, setAdRows] = useState([])
  const [platformRows, setPlatformRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [note, setNote] = useState('')
  // The ad whose preview and leads are open, as the modal wants it.
  const [openAd, setOpenAd] = useState(null)

  const today = daysAgo(0)
  const since = daysAgo(days - 1)
  const prevStart = daysAgo(days * 2 - 1)
  const prevEnd = daysAgo(days)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [c, ads, platforms] = await Promise.all([
        supabase.from('clients').select('id,name,meta_ad_account_id,meta_pixel_id,paused_at').eq('id', clientId).maybeSingle(),
        fetchAllRows(() =>
          supabase
            .from('ad_daily')
            .select('id, client_id, date, ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name, effective_status, spend, leads, impressions, clicks, video_2s_views, video_p100')
            .eq('client_id', clientId)
            .gte('date', prevStart)
            .order('date')
            .order('id')
        ),
        fetchAllRows(() =>
          supabase.from('ad_platform_client_daily').select('client_id, date, platform, spend, leads, impressions, clicks').eq('client_id', clientId).gte('date', since).order('date').order('platform')
        ).catch(() => []),
      ])
      if (c.error) throw c.error
      setClient(c.data || null)
      setAdRows(ads)
      setPlatformRows(platforms)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, days])

  const sync = async () => {
    setSyncing(true)
    setNote('')
    setError('')
    try {
      setNote(summariseSync(await runMetaSync(clientId)))
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  const rows = useMemo(() => (scope === 'all' ? adRows : adRows.filter((r) => isLive(r.effective_status))), [adRows, scope])
  const now = useMemo(() => metaKpis(inRange(rows, since, today)), [rows, since, today])
  const prev = useMemo(() => inRange(rows, prevStart, prevEnd), [rows, prevStart, prevEnd])
  const before = useMemo(() => metaKpis(prev), [prev])
  const daily = useMemo(() => metaDayTotals(rows, since, today), [rows, since, today])

  const campaigns = useMemo(() => (client ? metaCampaignsFor(client, rows, since, today) : []), [client, rows, since, today])
  const adSets = useMemo(() => adSetsFor(rows, since, today), [rows, since, today])
  const ads = useMemo(() => (client ? adsFor(client, rows, since, today) : []), [client, rows, since, today])
  const placements = useMemo(() => (client ? placementsFor(client, platformRows, since, today) : []), [client, platformRows, since, today])

  const noAccount = client && !String(client.meta_ad_account_id || '').replace(/\D/g, '')
  const counts = { campaigns: campaigns.length, adsets: adSets.length, ads: ads.length, placements: placements.length }

  const actions = (
    <div className="flex min-w-0 max-w-full items-center gap-2 overflow-x-auto pb-1">
      <DarkButton onClick={sync} disabled={syncing || noAccount}>{syncing ? 'Syncing…' : '↻ Sync'}</DarkButton>
      <Segmented options={SCOPES} value={scope} onChange={setScope} />
      <Segmented options={RANGES} value={days} onChange={setDays} />
    </div>
  )

  return (
    <Layout
      tone="dark"
      title={client?.name || 'Client'}
      subtitle={client ? `Meta${client.meta_ad_account_id ? ` · act_${client.meta_ad_account_id}` : ''}${client.meta_ad_account_id ? (client.meta_pixel_id ? ` · pixel ${client.meta_pixel_id}` : ' · no pixel yet') : ''} · last ${days} days · ${scope === 'live' ? 'live ads only' : 'all ads'}` : 'Meta'}
      actions={actions}
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {switcher}
        {client && <Link to={`/client/${client.id}`} className="text-slate-400 hover:text-white">Client page →</Link>}
        {client?.paused_at && <span className="text-amber-300">⏸ On pause</span>}
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}
      {note && <div className="mb-4 rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-100">{note}</div>}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/[0.04]" />)}
        </div>
      ) : !client ? (
        <Panel className="p-8 text-center text-sm text-slate-400">No client with that link.</Panel>
      ) : noAccount ? (
        <Panel channel="meta" className="p-6">
          <p className="text-lg font-semibold text-white">No Meta ad account connected yet</p>
          <p className="mt-1 text-sm text-slate-400">Add their ad account on the client page, and the morning sync fills this in.</p>
          <Link to={`/client/${client.id}`} className="mt-4 inline-block rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-900">Open client page</Link>
        </Panel>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {META_CLIENT_METRICS.map((m) => (
              <Scorecard
                key={m.key}
                channel="meta"
                label={m.label}
                value={cell(m.key, now)}
                delta={prev.length ? pctChange(now[m.key], before[m.key]) : null}
                lowerIsBetter={m.lowerIsBetter}
                on={picked.includes(m.key)}
                onClick={() => setPicked((p) => togglePick(p, m.key))}
              />
            ))}
          </div>

          <Panel className="p-4 md:p-5">
            {picked.map((key, i) => (
              <div key={key} className={i ? 'mt-4 border-t border-white/[0.06] pt-4' : ''}>
                <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: B }} />
                  {M[key].label} <span className="font-normal text-slate-500">by day</span>
                </p>
                <MetricLineChart
                  points={daily.map((d) => ({ date: d.date, value: d[key] }))}
                  label={M[key].label}
                  color={B}
                  height={picked.length > 1 ? 170 : 230}
                  format={(v, axis) => fmt(M[key].kind, v, axis)}
                />
              </div>
            ))}
            <p className="mt-2 text-[11px] text-slate-500">Click the cards above to change what is charted. Pick two to see them one under the other.</p>
          </Panel>

          <section>
            <div className="mb-3 overflow-x-auto pb-1">
              <Segmented options={TABS.map((t) => ({ ...t, label: counts[t.value] ? `${t.label} · ${counts[t.value]}` : t.label }))} value={tab} onChange={setTab} />
            </div>

            {tab === 'campaigns' && (
              <SortTable
                rows={campaigns}
                rowKey={(r) => r.key}
                initial={{ key: 'spend', dir: 'desc' }}
                empty="No campaign spend in this range. Try All ads, a longer range, or Sync."
                columns={[
                  { key: 'name', label: 'Campaign', className: 'max-w-[280px] truncate font-medium text-white' },
                  { key: 'liveAds', label: 'Live ads', numeric: true, muted: true, render: (r) => `${r.liveAds}/${r.ads}` },
                  num('spend', 'Spent', { className: 'font-semibold text-white' }),
                  num('leads', 'Leads'),
                  num('cpl', 'Cost / lead'),
                  num('impressions', 'Impr.', { muted: true }),
                  num('clicks', 'Clicks', { muted: true }),
                  num('ctr', 'CTR', { muted: true }),
                  num('cpc', 'CPC', { muted: true }),
                  num('cpm', 'CPM', { muted: true }),
                ]}
              />
            )}

            {tab === 'adsets' && (
              <SortTable
                rows={adSets}
                rowKey={(r) => r.id}
                initial={{ key: 'spend', dir: 'desc' }}
                empty="No ad set data in this range."
                columns={[
                  { key: 'name', label: 'Ad set', className: 'max-w-[240px] truncate font-medium text-white' },
                  { key: 'campaign', label: 'Campaign', muted: true, className: 'max-w-[200px] truncate' },
                  { key: 'liveAds', label: 'Live ads', numeric: true, muted: true, render: (r) => `${r.liveAds}/${r.ads}` },
                  num('spend', 'Spent', { className: 'font-semibold text-white' }),
                  num('leads', 'Leads'),
                  num('cpl', 'Cost / lead'),
                  num('impressions', 'Impr.', { muted: true }),
                  num('ctr', 'CTR', { muted: true }),
                  num('cpc', 'CPC', { muted: true }),
                ]}
              />
            )}

            {tab === 'ads' && (
              <>
                <p className="mb-2 text-[11px] text-slate-500">Verdicts are against this client&apos;s own cost per lead for the range. Hook and hold are video only.</p>
                <SortTable
                  rows={ads}
                  rowKey={(r) => r.id}
                  initial={{ key: 'spend', dir: 'desc' }}
                  empty="No ad data in this range."
                  columns={[
                    {
                      key: 'name',
                      label: 'Ad',
                      className: 'max-w-[260px] truncate font-medium text-white',
                      render: (r) => (
                        <button type="button" onClick={() => setOpenAd({ ad_id: r.id, ad_name: r.name, spend: r.spend, leads: r.leads })} title="See the ad and who filled in its form" className="truncate text-left hover:text-sky-300 hover:underline">
                          {r.name}
                        </button>
                      ),
                    },
                    { key: 'live', label: 'Status', render: (r) => statusPill(r.live, r.status) },
                    { key: 'verdict', label: 'Verdict', render: (r) => (r.verdict ? <Pill tone={VERDICT[r.verdict].tone} title={r.why}>{VERDICT[r.verdict].label}</Pill> : <span className="text-slate-600">—</span>) },
                    num('spend', 'Spent', { className: 'font-semibold text-white' }),
                    num('leads', 'Leads'),
                    num('cpl', 'Cost / lead'),
                    num('ctr', 'CTR', { muted: true }),
                    num('cpm', 'CPM', { muted: true }),
                    { key: 'hookRate', label: 'Hook', numeric: true, muted: true, render: (r) => (r.isVideo && r.hookRate > 0 ? pct(r.hookRate) : '—') },
                    { key: 'holdRate', label: 'Hold', numeric: true, muted: true, render: (r) => (r.isVideo && r.holdRate > 0 ? pct(r.holdRate) : '—') },
                  ]}
                />
              </>
            )}

            {tab === 'placements' && (
              <SortTable
                rows={placements}
                rowKey={(r) => r.key}
                initial={{ key: 'spend', dir: 'desc' }}
                empty="No placement data in this range."
                columns={[
                  { key: 'label', label: 'Placement', className: 'font-medium text-white' },
                  { key: 'share', label: 'Share of spend', numeric: true, muted: true, render: (r) => `${Math.round(r.share)}%` },
                  num('spend', 'Spent', { className: 'font-semibold text-white' }),
                  num('leads', 'Leads'),
                  num('cpl', 'Cost / lead'),
                  num('ctr', 'CTR', { muted: true }),
                ]}
              />
            )}

            {tab === 'days' && (
              <SortTable
                rows={[...daily].reverse()}
                rowKey={(r) => r.date}
                initial={{ key: 'date', dir: 'desc' }}
                empty="No days in this range."
                columns={[
                  { key: 'date', label: 'Day', className: 'whitespace-nowrap font-medium text-white', render: (r) => new Date(`${r.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) },
                  num('spend', 'Spent', { className: 'font-semibold text-white' }),
                  num('leads', 'Leads'),
                  num('cpl', 'Cost / lead'),
                  num('impressions', 'Impr.', { muted: true }),
                  num('clicks', 'Clicks', { muted: true }),
                  num('ctr', 'CTR', { muted: true }),
                  num('cpc', 'CPC', { muted: true }),
                  num('cpm', 'CPM', { muted: true }),
                ]}
              />
            )}
          </section>
        </div>
      )}
      {openAd && <AdPreviewModal clientId={clientId} ad={openAd} since={since} onClose={() => setOpenAd(null)} />}
    </Layout>
  )
}
