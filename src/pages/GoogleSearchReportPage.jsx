import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import DailyChart from '../components/DailyChart'
import StatTile from '../components/StatTile'
import { Badge, Button, Card, Table, THead, TBody, Tr, Th, Td } from '../components/ui'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/pagedQuery'
import { money } from '../lib/queries'
import { LOWER_IS_BETTER, buildDailySeries, daysAgo, pctChange } from '../lib/dailySeries'
import {
  campaignReport,
  clientReport,
  connection,
  dailyRows,
  inRange,
  keywordsAcross,
  kpis,
  lastSynced,
  negativesAcross,
  spendByType,
} from '../lib/googleSearchReport'
import { buildGoogleAdsAccessMessage, buildGoogleAdsLinkWalkthrough } from '../lib/googleAdsAccessMessage'
import CopySetupMessageButton from '../components/CopySetupMessageButton'
import GoogleAdsIdInput from '../components/GoogleAdsIdInput'
import { explainSyncError } from '../lib/googleAdsId'
import { AGENCY_EMAIL } from '../lib/agencyEmail'

/**
 * Google Search across every client, on a page of its own.
 *
 * Reports is the "how are we doing" page for Meta; this is the same page for
 * Google, with the numbers Google has that Meta does not (impressions, CTR,
 * cost per click, conversion value) and the two things that make search
 * different: the keywords that are losing and the searches to block.
 *
 * Totals come from campaign grain, so every campaign type is counted. The
 * keyword and search-term lists sit beside them and are never added in.
 */
const RANGES = [
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
]

const METRICS = [
  {
    key: 'spend',
    label: 'Spend',
    format: (v) => money(v),
    axis: (v) => (v >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `$${Math.round(v)}`),
  },
  { key: 'leads', label: 'Leads', format: (v) => v.toFixed(v % 1 === 0 ? 0 : 1), axis: (v) => String(v) },
  { key: 'clicks', label: 'Clicks', format: (v) => String(Math.round(v)), axis: (v) => String(v) },
  { key: 'cpl', label: 'Cost per lead', format: (v) => (v > 0 ? `$${v.toFixed(2)}` : '—'), axis: (v) => `$${Math.round(v)}` },
]

const usd = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const int = (n) => Number(n || 0).toLocaleString('en-US')
const pct = (n) => `${Number(n || 0).toFixed(1)}%`
const dash = (v, f) => (v > 0 ? f(v) : '—')

const STATE = {
  live: { label: 'Live', tone: 'success' },
  'no-access': { label: 'No access yet', tone: 'warning' },
  'no-data': { label: 'Connected, no spend', tone: 'info' },
  'not-connected': { label: 'No ID yet', tone: 'neutral' },
}

const VERDICT = {
  waste: { label: 'Not converting', cls: 'bg-red-100 text-red-800' },
  expensive: { label: 'Too expensive', cls: 'bg-amber-100 text-amber-800' },
  winner: { label: 'Winner', cls: 'bg-green-100 text-green-800' },
}

function whenLabel(iso) {
  if (!iso) return 'never'
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function GoogleSearchReportPage() {
  const [days, setDays] = useState(30)
  const [metricKey, setMetricKey] = useState('spend')
  const [clients, setClients] = useState([])
  const [campaignRows, setCampaignRows] = useState([])
  const [keywordRows, setKeywordRows] = useState([])
  const [termRows, setTermRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncNote, setSyncNote] = useState('')

  const windowStart = daysAgo(days - 1)
  const prevStart = daysAgo(days * 2 - 1)
  const prevEnd = daysAgo(days)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      // Twice the range for the campaign rows, so every tile has a previous
      // window to compare with. Keywords and terms only need the window.
      const [clientsRes, campaigns, keywords, terms] = await Promise.all([
        supabase.from('clients').select('id,name,google_ads_customer_id,google_ads_sync_error,google_ads_synced_at,archived,is_internal,paused_at').order('name'),
        fetchAllRows(() =>
          supabase.from('google_campaign_daily').select('*').gte('date', prevStart).order('date').order('id')
        ),
        fetchAllRows(() =>
          supabase.from('google_keyword_daily').select('*').gte('date', windowStart).order('date').order('id')
        ),
        fetchAllRows(() =>
          supabase.from('google_search_term_daily').select('*').gte('date', windowStart).order('date').order('id')
        ),
      ])
      if (clientsRes.error) throw clientsRes.error
      setClients(clientsRes.data || [])
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
  }, [days])

  const handleSync = async () => {
    setSyncing(true)
    setSyncNote('')
    setError('')
    try {
      const { data, error: err } = await supabase.functions.invoke('google-daily-sync', { body: { days: Math.min(days, 90) } })
      if (err) throw new Error(err.message || 'The sync function did not answer.')
      if (data?.error) throw new Error(data.error)
      const results = data?.results || []
      const good = results.filter((r) => !r.error)
      const bad = results.filter((r) => r.error)
      const found = data?.discovered?.saved?.length || 0
      setSyncNote(
        data?.note ||
          `Synced ${good.length} ${good.length === 1 ? 'client' : 'clients'}` +
            (found ? `, found ${found} new ${found === 1 ? 'account' : 'accounts'}` : '') +
            (bad.length ? `. ${bad.length} failed: ${bad.map((r) => `${r.client}: ${r.error}`).join(' · ')}` : '.')
      )
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  const link = useMemo(() => connection(clients), [clients])
  const synced = useMemo(() => lastSynced(campaignRows), [campaignRows])

  // Clients only, like the rest of Reports: our own businesses have real
  // spend but folding it in would overstate what we run for clients.
  const clientOnly = useMemo(() => {
    const skip = new Set(clients.filter((c) => c.archived || c.is_internal).map((c) => c.id))
    return campaignRows.filter((r) => !skip.has(r.client_id))
  }, [clients, campaignRows])

  const nowRows = useMemo(() => inRange(clientOnly, windowStart), [clientOnly, windowStart])
  const prevRows = useMemo(() => inRange(clientOnly, prevStart, prevEnd), [clientOnly, prevStart, prevEnd])
  const now = useMemo(() => kpis(nowRows), [nowRows])
  const before = useMemo(() => kpis(prevRows), [prevRows])

  const daily = useMemo(() => buildDailySeries(dailyRows(nowRows), windowStart, daysAgo(0)), [nowRows, windowStart])
  const metric = METRICS.find((m) => m.key === metricKey)

  const rows = useMemo(
    () => clientReport({ clients, campaignRows, keywordRows, termRows, since: windowStart }),
    [clients, campaignRows, keywordRows, termRows, windowStart]
  )
  const campaigns = useMemo(() => campaignReport(campaignRows, clients, windowStart), [campaignRows, clients, windowStart])
  const types = useMemo(() => spendByType(campaignRows, clients, windowStart), [campaignRows, clients, windowStart])
  const keywords = useMemo(() => keywordsAcross(keywordRows, clients, windowStart), [keywordRows, clients, windowStart])
  const negatives = useMemo(() => negativesAcross(termRows, clients, windowStart), [termRows, clients, windowStart])
  const waste = keywords.filter((k) => k.verdict === 'waste')
  const winners = keywords.filter((k) => k.verdict === 'winner')
  const wasted = waste.reduce((s, k) => s + k.cost, 0)
  const savable = negatives.reduce((s, t) => s + t.cost, 0)
  const withData = rows.filter((r) => r.state === 'live').length

  const actions = (
    <div className="flex min-w-0 max-w-full gap-1.5 overflow-x-auto pb-1">
      <Button onClick={handleSync} disabled={syncing} className="whitespace-nowrap">
        {syncing ? 'Syncing…' : '↻ Sync Google'}
      </Button>
      <span className="mx-0.5 w-px bg-slate-200" />
      {RANGES.map((r) => (
        <Button key={r.days} variant={days === r.days ? 'dark' : 'outline'} onClick={() => setDays(r.days)} className="whitespace-nowrap">
          {r.label}
        </Button>
      ))}
    </div>
  )

  return (
    <Layout
      title="Google Search"
      subtitle={`Last ${days} days · ${withData} ${withData === 1 ? 'client' : 'clients'} with data · ${money(now.spend)} spend · ${now.leads} leads`}
      actions={actions}
    >
      <Link to="/reports" className="mb-3 inline-block text-sm text-blue-600 hover:text-blue-800">
        ← All reports
      </Link>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">Error: {error}</div>}
      {syncNote && <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">{syncNote}</div>}

      {/* Who is in. First, because until a client is linked nothing below
          can say anything about them, and that is the most common reason a
          number here looks low. */}
      <Card className="mb-4" tone={link.waiting.length || link.noAccess.length ? 'warning' : 'success'}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <p className="text-sm font-semibold text-slate-900">
            {link.connected.length} of {link.total} clients connected
            {link.noAccess.length > 0 && <span className="ml-1 font-normal text-amber-800">· {link.noAccess.length} with no access yet</span>}
            <span className="ml-2 font-normal text-slate-500">· last synced {whenLabel(synced)}</span>
          </p>
          {(link.waiting.length > 0 || link.noAccess.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              <CopySetupMessageButton message={buildGoogleAdsAccessMessage()} label="Copy access request" />
              <CopySetupMessageButton message={buildGoogleAdsLinkWalkthrough()} label="Copy step-by-step" />
            </div>
          )}
        </div>

        {(link.waiting.length > 0 || link.noAccess.length > 0) && (
          <>
            <p className="mt-1.5 text-xs text-slate-600">
              Send the message: the client adds {AGENCY_EMAIL} as a user and replies with their customer ID. Accept the
              invite in that inbox, then put the ID in beside their name. It saves and syncs on the spot.
            </p>
            {/* One row per client still to do, with the box right there, so
                the ID goes in where the gap is shown. */}
            <div className="mt-3 divide-y divide-amber-200/70 rounded-lg border border-amber-200 bg-white/70">
              {[...link.noAccess, ...link.waiting].map((c) => (
                <div key={c.id} className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
                  <div className="min-w-0 sm:w-56">
                    <Link to={`/client/${c.id}#google-search`} className="block truncate text-sm font-medium text-slate-900 hover:text-blue-700">
                      {c.name}
                    </Link>
                    <p className="text-[11px] text-slate-500">
                      {c.google_ads_sync_error ? 'ID saved, Google refused us' : 'No ID yet'}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <GoogleAdsIdInput client={c} onSaved={load} compact />
                    {c.google_ads_sync_error && (
                      <p className="mt-1 text-[11px] text-amber-800">{explainSyncError(c.google_ads_sync_error)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            <StatTile label="Spend" value={money(now.spend)} delta={pctChange(now.spend, before.spend)} />
            <StatTile label="Leads" value={now.leads} delta={pctChange(now.leads, before.leads)} />
            <StatTile label="Cost per lead" value={dash(now.cpl, usd)} delta={pctChange(now.cpl, before.cpl)} lowerIsBetter={LOWER_IS_BETTER.has('cpl')} />
            <StatTile label="Conversion value" value={money(now.value)} delta={pctChange(now.value, before.value)} sub={now.value ? undefined : 'No values reported'} />
            <StatTile label="Clicks" value={int(now.clicks)} delta={pctChange(now.clicks, before.clicks)} />
            <StatTile label="Impressions" value={int(now.impressions)} delta={pctChange(now.impressions, before.impressions)} />
            <StatTile label="Click-through rate" value={dash(now.ctr, pct)} delta={pctChange(now.ctr, before.ctr)} />
            <StatTile label="Cost per click" value={dash(now.cpc, usd)} delta={pctChange(now.cpc, before.cpc)} lowerIsBetter />
          </div>

          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 md:p-5">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-bold text-slate-900">{metric.label} by day</h2>
                <p className="text-xs text-slate-500">Google Ads · every campaign type · clients only</p>
              </div>
              <div className="flex gap-1.5">
                {METRICS.map((m) => (
                  <Button key={m.key} size="sm" variant={metricKey === m.key ? 'primary' : 'secondary'} onClick={() => setMetricKey(m.key)}>
                    {m.label}
                  </Button>
                ))}
              </div>
            </div>
            <DailyChart series={daily} metric={metric} />
          </div>

          {/* The three numbers that say what to DO, next to where the money
              goes. Wasted and savable overlap, so they are two facts, never a
              sum. */}
          <div className="mb-6 grid gap-3 md:grid-cols-3 md:gap-4">
            <Card tone={waste.length ? 'danger' : 'default'}>
              <p className="text-xs font-medium text-slate-500">Keywords not converting</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{money(wasted)}</p>
              <p className="mt-1 text-xs text-slate-500">
                {waste.length ? `on ${waste.length} ${waste.length === 1 ? 'keyword' : 'keywords'} across ${new Set(waste.map((k) => k.clientId)).size} ${new Set(waste.map((k) => k.clientId)).size === 1 ? 'client' : 'clients'}` : 'Nothing over the line'}
              </p>
            </Card>
            <Card tone={negatives.length ? 'warning' : 'default'}>
              <p className="text-xs font-medium text-slate-500">Searches worth blocking</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{money(savable)}</p>
              <p className="mt-1 text-xs text-slate-500">
                {negatives.length ? `${negatives.length} ${negatives.length === 1 ? 'term' : 'terms'}, ${negatives.filter((t) => t.certain).length} certain` : 'No search terms to block'}
              </p>
            </Card>
            <Card>
              <p className="text-xs font-medium text-slate-500">Where the spend goes</p>
              {types.length === 0 ? (
                <p className="mt-1 text-sm text-slate-500">No campaigns in this range.</p>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {types.slice(0, 4).map((t) => (
                    <li key={t.type} className="flex items-center gap-2 text-xs">
                      <span className="w-28 truncate text-slate-700">{t.type}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <span className="block h-full rounded-full bg-blue-600" style={{ width: `${t.share}%` }} />
                      </span>
                      <span className="w-10 text-right tabular-nums text-slate-600">{Math.round(t.share)}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <h2 className="mb-3 font-bold text-slate-900">Every client</h2>
          <div className="mb-6">
            <Table>
              <THead>
                <tr>
                  <Th>Client</Th>
                  <Th>Status</Th>
                  <Th numeric>Spend</Th>
                  <Th numeric>Leads</Th>
                  <Th numeric>Cost/lead</Th>
                  <Th numeric>Clicks</Th>
                  <Th numeric>CTR</Th>
                  <Th numeric>CPC</Th>
                  <Th numeric>Conv. rate</Th>
                  <Th numeric>Campaigns</Th>
                  <Th numeric>Wasted</Th>
                  <Th numeric>Blockable</Th>
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => {
                  const st = STATE[r.state]
                  const muted = r.state !== 'live'
                  return (
                    <Tr key={r.id} className={muted ? 'opacity-70' : ''}>
                      <Td>
                        <Link to={`/client/${r.id}#google-search`} className="font-medium text-blue-600 hover:text-blue-800">
                          {r.name}
                        </Link>
                        {r.paused && <span className="ml-1.5 text-[10px] text-amber-700">⏸ paused</span>}
                      </Td>
                      <Td>
                        <span title={r.syncError ? explainSyncError(r.syncError) : undefined}><Badge tone={st.tone}>{st.label}</Badge></span>
                      </Td>
                      <Td numeric className="font-medium">{muted ? '—' : money(r.spend)}</Td>
                      <Td numeric className="font-medium">{muted ? '—' : r.leads}</Td>
                      <Td numeric>{muted ? '—' : dash(r.cpl, usd)}</Td>
                      <Td numeric muted>{muted ? '—' : int(r.clicks)}</Td>
                      <Td numeric muted>{muted ? '—' : dash(r.ctr, pct)}</Td>
                      <Td numeric muted>{muted ? '—' : dash(r.cpc, usd)}</Td>
                      <Td numeric muted>{muted ? '—' : dash(r.convRate, pct)}</Td>
                      <Td numeric muted>{muted ? '—' : `${r.activeCampaigns}/${r.campaigns}`}</Td>
                      <Td numeric className={r.wasted > 0 ? 'font-medium text-red-700' : 'text-slate-400'}>{muted ? '—' : r.wasted > 0 ? money(r.wasted) : '$0'}</Td>
                      <Td numeric className={r.blockable > 0 ? 'font-medium text-amber-700' : 'text-slate-400'}>{muted ? '—' : r.blockable}</Td>
                    </Tr>
                  )
                })}
              </TBody>
            </Table>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Campaigns reads active/total. Wasted is spend on keywords with nothing to show for it; Blockable is search terms
              worth adding as negatives. The two overlap, so they are never added together.
            </p>
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">
                Block these searches <span className="font-normal text-slate-500">· top {Math.min(12, negatives.length)} across clients</span>
              </h3>
              {negatives.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing to block in this range.</p>
              ) : (
                <ul className="space-y-1">
                  {negatives.slice(0, 12).map((t) => (
                    <li key={`${t.clientId}|${t.term}`} className={`flex flex-wrap items-baseline gap-x-2 rounded-lg border px-2.5 py-1.5 text-xs ${t.certain ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
                      <span className="font-medium text-slate-900">{t.term}</span>
                      <span className="text-slate-500">{t.clientName}</span>
                      <span className="ml-auto tabular-nums text-slate-700">{usd(t.cost)}</span>
                      {t.certain && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-800">certain</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">
                Keywords to act on <span className="font-normal text-slate-500">· losing first, then winners</span>
              </h3>
              {waste.length === 0 && winners.length === 0 ? (
                <p className="text-sm text-slate-500">No keyword has enough spend to judge yet.</p>
              ) : (
                <ul className="space-y-1">
                  {[...waste.slice(0, 8), ...winners.slice(0, 4)].map((k) => {
                    const v = VERDICT[k.verdict]
                    return (
                      <li key={`${k.clientId}|${k.key}`} className="flex flex-wrap items-baseline gap-x-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
                        <span className="font-medium text-slate-900">{k.keyword}</span>
                        <span className="text-slate-400">{k.matchType?.toLowerCase()}</span>
                        <span className="text-slate-500">{k.clientName}</span>
                        <span className="ml-auto tabular-nums text-slate-700">
                          {usd(k.cost)} · {k.conversions} conv{k.cpl != null ? ` · ${usd(k.cpl)} each` : ''}
                        </span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${v.cls}`} title={k.signal}>{v.label}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          </div>

          <h2 className="mb-3 font-bold text-slate-900">Every campaign</h2>
          {campaigns.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <p className="text-slate-500">
                No campaign data in this range. {link.connected.length === 0 ? 'Connect a client first.' : 'Run Sync Google, or wait for tonight.'}
              </p>
            </div>
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Client</Th>
                  <Th>Campaign</Th>
                  <Th>Type</Th>
                  <Th>Status</Th>
                  <Th numeric>Spend</Th>
                  <Th numeric>Leads</Th>
                  <Th numeric>Cost/lead</Th>
                  <Th numeric>Clicks</Th>
                  <Th numeric>CTR</Th>
                  <Th numeric>CPC</Th>
                  <Th numeric>Value</Th>
                </tr>
              </THead>
              <TBody>
                {campaigns.slice(0, 60).map((c) => (
                  <Tr key={c.key}>
                    <Td>
                      <Link to={`/client/${c.clientId}#google-search`} className="text-blue-600 hover:text-blue-800">{c.clientName}</Link>
                    </Td>
                    <Td className="max-w-[260px] truncate" title={c.name}>{c.name}</Td>
                    <Td muted>{c.type}</Td>
                    <Td>
                      <Badge tone={c.status === 'ENABLED' ? 'success' : 'neutral'}>{c.status === 'ENABLED' ? 'Active' : c.status.toLowerCase() || '—'}</Badge>
                    </Td>
                    <Td numeric className="font-medium">{money(c.spend)}</Td>
                    <Td numeric className="font-medium">{c.leads}</Td>
                    <Td numeric>{dash(c.cpl, usd)}</Td>
                    <Td numeric muted>{int(c.clicks)}</Td>
                    <Td numeric muted>{dash(c.ctr, pct)}</Td>
                    <Td numeric muted>{dash(c.cpc, usd)}</Td>
                    <Td numeric muted>{c.value > 0 ? money(c.value) : '—'}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </>
      )}
    </Layout>
  )
}
