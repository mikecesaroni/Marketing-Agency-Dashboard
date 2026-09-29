import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Layout from '../components/Layout'
import MetricLineChart from '../components/reports/MetricLineChart'
import { Scorecard, SortTable } from '../components/reports/ClientReportParts'
import { DarkButton, Panel, Pill, Segmented } from '../components/reports/kit'
import { CHANNELS, compactMoney } from '../lib/channels'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/pagedQuery'
import { daysAgo, pctChange } from '../lib/dailySeries'
import { kpis, inRange } from '../lib/googleSearchReport'
import { CLIENT_METRICS, adGroupsFor, campaignsFor, dayTotals, keywordsFor, termsFor, togglePick } from '../lib/googleClientReport'
import { dashedId, explainSyncError, isAccessError } from '../lib/googleAdsId'
import { readFunctionError } from '../lib/functionError'

/**
 * One client's Google Ads, laid out like the Google Ads overview screen:
 * scorecards across the top (click one or two to chart them), the chart,
 * then campaigns, ad groups, keywords, search terms and days as tabs.
 * Every column header sorts.
 *
 * Opened from a client's name on the Google Ads report.
 */
const RANGES = [
  { value: 7, label: '7d' },
  { value: 14, label: '14d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
]

const TABS = [
  { value: 'campaigns', label: 'Campaigns' },
  { value: 'adgroups', label: 'Ad groups' },
  { value: 'keywords', label: 'Keywords' },
  { value: 'terms', label: 'Search terms' },
  { value: 'days', label: 'Days' },
]

const G = CHANNELS.google.color

const int = (n) => Math.round(Number(n || 0)).toLocaleString('en-US')
const usd = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct = (n) => `${Number(n || 0).toFixed(2)}%`
const dec = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })

/** Values in the tiles and tables. A ratio with nothing under it is a dash, like Google. */
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
  return dec(n)
}

const RATIOS = new Set(['ctr', 'cpc', 'cpl', 'convRate'])
const cell = (m, row) => (RATIOS.has(m.key) && !(row[m.key] > 0) ? '—' : fmt(m.kind, row[m.key]))

function whenLabel(iso) {
  if (!iso) return 'never'
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function GoogleClientReportPage() {
  const { clientId } = useParams()
  const [days, setDays] = useState(30)
  const [picked, setPicked] = useState(['clicks', 'spend'])
  const [tab, setTab] = useState('campaigns')
  const [client, setClient] = useState(null)
  const [campaignRows, setCampaignRows] = useState([])
  const [keywordRows, setKeywordRows] = useState([])
  const [termRows, setTermRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [note, setNote] = useState('')

  const today = daysAgo(0)
  const since = daysAgo(days - 1)
  const prevStart = daysAgo(days * 2 - 1)
  const prevEnd = daysAgo(days)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [c, campaigns, keywords, terms] = await Promise.all([
        supabase.from('clients').select('id,name,google_ads_customer_id,google_ads_sync_error,google_ads_synced_at,paused_at').eq('id', clientId).maybeSingle(),
        fetchAllRows(() => supabase.from('google_campaign_daily').select('*').eq('client_id', clientId).gte('date', prevStart).order('date').order('id')),
        fetchAllRows(() => supabase.from('google_keyword_daily').select('*').eq('client_id', clientId).gte('date', since).order('date').order('id')),
        fetchAllRows(() => supabase.from('google_search_term_daily').select('*').eq('client_id', clientId).gte('date', since).order('date').order('id')),
      ])
      if (c.error) throw c.error
      setClient(c.data || null)
      setCampaignRows(campaigns)
      setKeywordRows(keywords)
      setTermRows(terms)
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
      const { data, error: err } = await supabase.functions.invoke('google-daily-sync', { body: { client_id: clientId, days: Math.max(30, Math.min(days * 2, 180)) } })
      if (err) {
        const { detail } = await readFunctionError(err)
        throw new Error(detail || 'The Google sync did not answer.')
      }
      const line = (data?.results || [])[0]
      if (line?.error) setError(explainSyncError(line.error))
      else setNote(line ? `Synced. ${usd(line.spend)} and ${dec(line.leads)} conversions in the sync window.` : 'Synced.')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  const nowRows = useMemo(() => inRange(campaignRows, since, today), [campaignRows, since, today])
  const prevRows = useMemo(() => inRange(campaignRows, prevStart, prevEnd), [campaignRows, prevStart, prevEnd])
  const now = useMemo(() => kpis(nowRows), [nowRows])
  const before = useMemo(() => kpis(prevRows), [prevRows])
  const daily = useMemo(() => dayTotals(campaignRows, since, today), [campaignRows, since, today])
  const hasPrev = prevRows.length > 0

  const campaigns = useMemo(() => (client ? campaignsFor(client, campaignRows, since, today) : []), [client, campaignRows, since, today])
  const adGroups = useMemo(() => adGroupsFor(keywordRows, since, today), [keywordRows, since, today])
  const keywords = useMemo(() => keywordsFor(keywordRows, since), [keywordRows, since])
  const terms = useMemo(() => termsFor(termRows, since, today), [termRows, since, today])

  const name = client?.name || 'Client'
  const noId = client && !client.google_ads_customer_id
  const locked = client && isAccessError(client.google_ads_sync_error)

  const actions = (
    <div className="flex min-w-0 max-w-full items-center gap-2 overflow-x-auto pb-1">
      <DarkButton onClick={sync} disabled={syncing || noId}>{syncing ? 'Syncing…' : '↻ Sync'}</DarkButton>
      <Segmented options={RANGES} value={days} onChange={setDays} />
    </div>
  )

  return (
    <Layout
      tone="dark"
      title={name}
      subtitle={client ? `Google Ads${client.google_ads_customer_id ? ` · ${dashedId(client.google_ads_customer_id)}` : ''} · last ${days} days · synced ${whenLabel(client.google_ads_synced_at)}` : 'Google Ads'}
      actions={actions}
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {client && <Link to={`/client/${client.id}`} className="text-slate-400 hover:text-white">Client page →</Link>}
        {client?.paused_at && <span className="text-amber-300">⏸ On pause</span>}
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}
      {note && <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{note}</div>}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/[0.04]" />)}
        </div>
      ) : !client ? (
        <Panel className="p-8 text-center text-sm text-slate-400">No client with that link.</Panel>
      ) : noId || locked ? (
        <Panel channel="google" className="p-6">
          <p className="text-lg font-semibold text-white">{noId ? 'No Google Ads account connected yet' : 'Google has not let us in yet'}</p>
          <p className="mt-1 text-sm text-slate-400">{noId ? 'Add their customer ID on the client page or at the bottom of the Google Ads report.' : explainSyncError(client.google_ads_sync_error)}</p>
          <Link to={`/client/${client.id}#google-search`} className="mt-4 inline-block rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-900">Open their Google panel</Link>
        </Panel>
      ) : (
        <div className="space-y-5">
          {/* SCORECARDS. Click to chart; up to two at once, like Google. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CLIENT_METRICS.map((m) => {
              const on = picked.includes(m.key)
              const d = hasPrev ? pctChange(now[m.key], before[m.key]) : null
              return (
                <Scorecard
                  key={m.key}
                  label={m.label}
                  value={cell(m, now)}
                  delta={d}
                  lowerIsBetter={m.lowerIsBetter}
                  on={on}
                  onClick={() => setPicked((p) => togglePick(p, m.key))}
                />
              )
            })}
          </div>

          <Panel className="p-4 md:p-5">
            {picked.map((key, i) => {
              const m = CLIENT_METRICS.find((x) => x.key === key)
              return (
                <div key={key} className={i ? 'mt-4 border-t border-white/[0.06] pt-4' : ''}>
                  <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: G }} />
                    {m.label} <span className="font-normal text-slate-500">by day</span>
                  </p>
                  <MetricLineChart
                    points={daily.map((d) => ({ date: d.date, value: d[key] }))}
                    label={m.label}
                    color={G}
                    height={picked.length > 1 ? 170 : 230}
                    format={(v, axis) => fmt(m.kind, v, axis)}
                  />
                </div>
              )
            })}
            <p className="mt-2 text-[11px] text-slate-500">Click the cards above to change what is charted. Pick two to see them one under the other.</p>
          </Panel>

          <section>
            <div className="mb-3 overflow-x-auto pb-1">
              <Segmented options={TABS.map((t) => ({ ...t, label: `${t.label}${countOf(t.value, { campaigns, adGroups, keywords, terms, daily })}` }))} value={tab} onChange={setTab} />
            </div>
            {tab === 'campaigns' && <CampaignsTable rows={campaigns} />}
            {tab === 'adgroups' && <AdGroupsTable rows={adGroups} />}
            {tab === 'keywords' && <KeywordsTable rows={keywords} />}
            {tab === 'terms' && <TermsTable rows={terms} />}
            {tab === 'days' && <DaysTable rows={daily} />}
          </section>
        </div>
      )}
    </Layout>
  )
}

function countOf(tab, lists) {
  const n = { campaigns: lists.campaigns.length, adgroups: lists.adGroups.length, keywords: lists.keywords.length, terms: lists.terms.length }[tab]
  return n ? ` · ${n}` : ''
}



const M = Object.fromEntries(CLIENT_METRICS.map((m) => [m.key, m]))
const num = (key, label, opts = {}) => ({ key, label, numeric: true, render: (r) => cell(M[key], r), ...opts })

function CampaignsTable({ rows }) {
  return (
    <SortTable
      rows={rows}
      rowKey={(r) => r.key}
      initial={{ key: 'spend', dir: 'desc' }}
      empty="No campaign data in this range. Try Sync, or a longer range."
      columns={[
        { key: 'name', label: 'Campaign', className: 'max-w-[280px] truncate font-medium text-white' },
        { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'ENABLED' ? 'success' : 'neutral'}>{r.status === 'ENABLED' ? 'Active' : r.status ? r.status.charAt(0) + r.status.slice(1).toLowerCase() : '—'}</Pill> },
        { key: 'type', label: 'Type', muted: true },
        num('clicks', 'Clicks'),
        num('impressions', 'Impr.', { muted: true }),
        num('ctr', 'CTR', { muted: true }),
        num('cpc', 'Avg. CPC', { muted: true }),
        num('spend', 'Cost', { className: 'font-semibold text-white' }),
        num('leads', 'Conv.'),
        num('cpl', 'Cost / conv.'),
        num('convRate', 'Conv. rate', { muted: true }),
      ]}
    />
  )
}

function AdGroupsTable({ rows }) {
  return (
    <>
      <p className="mb-2 text-[11px] text-slate-500">Built from keyword data, so these are Search ad groups only.</p>
      <SortTable
        rows={rows}
        rowKey={(r) => r.id}
        initial={{ key: 'spend', dir: 'desc' }}
        empty="No Search ad group data in this range."
        columns={[
          { key: 'name', label: 'Ad group', className: 'max-w-[240px] truncate font-medium text-white' },
          { key: 'campaign', label: 'Campaign', muted: true, className: 'max-w-[200px] truncate' },
          { key: 'keywords', label: 'Keywords', numeric: true, muted: true },
          num('clicks', 'Clicks'),
          num('impressions', 'Impr.', { muted: true }),
          num('ctr', 'CTR', { muted: true }),
          num('cpc', 'Avg. CPC', { muted: true }),
          num('spend', 'Cost', { className: 'font-semibold text-white' }),
          num('leads', 'Conv.'),
          num('cpl', 'Cost / conv.'),
        ]}
      />
    </>
  )
}

const VERDICT = {
  waste: { label: 'Not converting', tone: 'danger' },
  expensive: { label: 'Too expensive', tone: 'warning' },
  winner: { label: 'Winner', tone: 'success' },
  young: { label: 'Too early', tone: 'neutral' },
  ok: { label: 'OK', tone: 'info' },
}

function KeywordsTable({ rows }) {
  return (
    <SortTable
      rows={rows}
      rowKey={(r) => r.key}
      initial={{ key: 'cost', dir: 'desc' }}
      empty="No keyword data in this range."
      columns={[
        { key: 'keyword', label: 'Keyword', className: 'max-w-[240px] truncate font-medium text-white' },
        { key: 'matchType', label: 'Match', muted: true, render: (r) => String(r.matchType || '').toLowerCase() || '—' },
        { key: 'adGroup', label: 'Ad group', muted: true, className: 'max-w-[180px] truncate' },
        { key: 'verdict', label: 'Verdict', render: (r) => <Pill tone={VERDICT[r.verdict]?.tone} title={r.signal}>{VERDICT[r.verdict]?.label || r.verdict}</Pill> },
        { key: 'clicks', label: 'Clicks', numeric: true, render: (r) => int(r.clicks) },
        { key: 'impressions', label: 'Impr.', numeric: true, muted: true, render: (r) => int(r.impressions) },
        { key: 'ctr', label: 'CTR', numeric: true, muted: true, render: (r) => (r.ctr > 0 ? pct(r.ctr) : '—') },
        { key: 'cpc', label: 'Avg. CPC', numeric: true, muted: true, render: (r) => (r.cpc > 0 ? usd(r.cpc) : '—') },
        { key: 'cost', label: 'Cost', numeric: true, className: 'font-semibold text-white', render: (r) => usd(r.cost) },
        { key: 'conversions', label: 'Conv.', numeric: true, render: (r) => dec(r.conversions) },
        { key: 'cpl', label: 'Cost / conv.', numeric: true, render: (r) => (r.cpl != null ? usd(r.cpl) : '—') },
      ]}
    />
  )
}

function TermsTable({ rows }) {
  const blocking = rows.filter((r) => r.block).length
  return (
    <>
      <p className="mb-2 text-[11px] text-slate-500">
        What people actually typed. Google hides the term on some clicks, so these never add up to the campaign totals.
        {blocking ? ` ${blocking} flagged to block.` : ''}
      </p>
      <SortTable
        rows={rows}
        rowKey={(r) => r.term}
        initial={{ key: 'spend', dir: 'desc' }}
        empty="No search term data in this range."
        columns={[
          { key: 'term', label: 'Search term', className: 'max-w-[260px] truncate font-medium text-white' },
          { key: 'keyword', label: 'Matched keyword', muted: true, className: 'max-w-[180px] truncate' },
          {
            key: 'status',
            label: 'Added / excluded',
            render: (r) =>
              r.block ? (
                <Pill tone={r.block === 'certain' ? 'danger' : 'warning'} title={r.why}>{r.block === 'certain' ? 'Block this' : 'Consider blocking'}</Pill>
              ) : r.status === 'added' ? (
                <Pill tone="success">Added</Pill>
              ) : r.status === 'excluded' ? (
                <Pill tone="neutral">Excluded</Pill>
              ) : (
                <span className="text-slate-600">None</span>
              ),
          },
          num('clicks', 'Clicks'),
          num('impressions', 'Impr.', { muted: true }),
          num('ctr', 'CTR', { muted: true }),
          num('cpc', 'Avg. CPC', { muted: true }),
          num('spend', 'Cost', { className: 'font-semibold text-white' }),
          num('leads', 'Conv.'),
        ]}
      />
    </>
  )
}

function DaysTable({ rows }) {
  return (
    <SortTable
      rows={[...rows].reverse()}
      rowKey={(r) => r.date}
      initial={{ key: 'date', dir: 'desc' }}
      empty="No days in this range."
      columns={[
        { key: 'date', label: 'Day', className: 'whitespace-nowrap font-medium text-white', render: (r) => new Date(`${r.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) },
        num('clicks', 'Clicks'),
        num('impressions', 'Impr.', { muted: true }),
        num('ctr', 'CTR', { muted: true }),
        num('cpc', 'Avg. CPC', { muted: true }),
        num('spend', 'Cost', { className: 'font-semibold text-white' }),
        num('leads', 'Conv.'),
        num('cpl', 'Cost / conv.'),
        num('convRate', 'Conv. rate', { muted: true }),
      ]}
    />
  )
}
