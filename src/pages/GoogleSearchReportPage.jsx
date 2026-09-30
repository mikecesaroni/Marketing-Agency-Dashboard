import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import DailyChart from '../components/DailyChart'
import { DTable, DTd, DTh, DTr, DarkButton, Eyebrow, KpiTile, Panel, Pill, SectionTitle, Segmented } from '../components/reports/kit'
import { CHANNELS, chartTheme, compactMoney } from '../lib/channels'
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
import { explainSyncError, isAccessError } from '../lib/googleAdsId'
import { AGENCY_EMAIL, AGENCY_EMAIL_DOMAIN } from '../lib/agencyEmail'

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
  { value: 14, label: '14d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
]

const METRICS = [
  {
    key: 'spend',
    label: 'Spend',
    format: (v) => money(v),
    axis: (v) => compactMoney(v),
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
  waste: { label: 'Not converting', tone: 'danger' },
  expensive: { label: 'Too expensive', tone: 'warning' },
  winner: { label: 'Winner', tone: 'success' },
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

  const spark = (k) => daily.map((d) => d[k])
  const G = CHANNELS.google.color
  const todo = [...link.noAccess, ...link.waiting]

  const actions = (
    <div className="flex min-w-0 max-w-full items-center gap-2 overflow-x-auto pb-1">
      <DarkButton onClick={handleSync} disabled={syncing}>{syncing ? 'Syncing…' : '↻ Sync Google'}</DarkButton>
      <Segmented options={RANGES} value={days} onChange={setDays} />
    </div>
  )

  return (
    <Layout
      tone="dark"
      title="Google Ads"
      subtitle={`Last ${days} days · ${withData} ${withData === 1 ? 'client' : 'clients'} with data · ${money(now.spend)} spend · ${now.leads} leads`}
      actions={actions}
    >
      <Link to="/reports" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
        ← All channels
      </Link>

      {error && <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">Error: {error}</div>}
      {syncNote && <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{syncNote}</div>}

      <div className="space-y-6">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-white/[0.04]" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiTile channel="google" label="Spend" value={money(now.spend)} delta={pctChange(now.spend, before.spend)} spark={spark('spend')} />
              <KpiTile channel="google" label="Leads" value={now.leads} delta={pctChange(now.leads, before.leads)} spark={spark('leads')} />
              <KpiTile channel="google" label="Cost per lead" value={dash(now.cpl, usd)} delta={pctChange(now.cpl, before.cpl)} lowerIsBetter={LOWER_IS_BETTER.has('cpl')} spark={spark('cpl')} />
              <KpiTile channel="google" label="Conversion value" value={money(now.value)} delta={pctChange(now.value, before.value)} sub={now.value ? undefined : 'No values reported'} />
              <KpiTile channel="google" label="Clicks" value={int(now.clicks)} delta={pctChange(now.clicks, before.clicks)} spark={spark('clicks')} />
              <KpiTile channel="google" label="Impressions" value={int(now.impressions)} delta={pctChange(now.impressions, before.impressions)} spark={spark('impressions')} />
              <KpiTile channel="google" label="Click-through rate" value={dash(now.ctr, pct)} delta={pctChange(now.ctr, before.ctr)} spark={spark('ctr')} />
              <KpiTile channel="google" label="Cost per click" value={dash(now.cpc, usd)} delta={pctChange(now.cpc, before.cpc)} lowerIsBetter />
            </div>

            <Panel className="p-5">
              <SectionTitle
                channel="google"
                title={`${metric.label} by day`}
                sub="Every campaign type · clients only · daily columns with a 7-day average"
                right={<Segmented size="sm" options={METRICS.map((m) => ({ value: m.key, label: m.label }))} value={metricKey} onChange={setMetricKey} />}
              />
              <DailyChart series={daily} metric={metric} theme={chartTheme('google')} />
            </Panel>

            {/* WHAT TO DO. Wasted and savable overlap, so two facts, never a sum. */}
            <div className="grid gap-4 md:grid-cols-3">
              <Panel className="p-5">
                <Eyebrow>Keywords not converting</Eyebrow>
                <p className={`mt-2 text-3xl font-semibold ${waste.length ? 'text-rose-300' : 'text-white'}`}>{money(wasted)}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {waste.length ? `on ${waste.length} ${waste.length === 1 ? 'keyword' : 'keywords'} across ${new Set(waste.map((k) => k.clientId)).size} ${new Set(waste.map((k) => k.clientId)).size === 1 ? 'client' : 'clients'}` : 'Nothing over the line'}
                </p>
              </Panel>
              <Panel className="p-5">
                <Eyebrow>Searches worth blocking</Eyebrow>
                <p className={`mt-2 text-3xl font-semibold ${negatives.length ? 'text-amber-300' : 'text-white'}`}>{money(savable)}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {negatives.length ? `${negatives.length} ${negatives.length === 1 ? 'term' : 'terms'}, ${negatives.filter((t) => t.certain).length} certain` : 'No search terms to block'}
                </p>
              </Panel>
              <Panel className="p-5">
                <Eyebrow>Where the spend goes</Eyebrow>
                {types.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No campaigns in this range.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {types.slice(0, 4).map((t) => (
                      <li key={t.type} className="flex items-center gap-2 text-xs">
                        <span className="w-28 truncate text-slate-300">{t.type}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                          <span className="block h-full rounded-full" style={{ width: `${t.share}%`, background: G }} />
                        </span>
                        <span className="w-10 text-right tabular-nums text-slate-400">{Math.round(t.share)}%</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <section>
              <SectionTitle title="Every client" sub="Campaigns reads active/total · Wasted and Blockable overlap, so they are never added together" />
              <DTable>
                <thead>
                  <tr>
                    <DTh>Client</DTh>
                    <DTh>Status</DTh>
                    <DTh numeric>Spend</DTh>
                    <DTh numeric>Leads</DTh>
                    <DTh numeric>Cost/lead</DTh>
                    <DTh numeric>Clicks</DTh>
                    <DTh numeric>CTR</DTh>
                    <DTh numeric>CPC</DTh>
                    <DTh numeric>Conv. rate</DTh>
                    <DTh numeric>Campaigns</DTh>
                    <DTh numeric>Wasted</DTh>
                    <DTh numeric>Blockable</DTh>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const st = STATE[r.state]
                    const off = r.state !== 'live'
                    return (
                      <DTr key={r.id}>
                        <DTd className="whitespace-nowrap">
                          <Link to={`/reports/client/${r.id}?channel=google`} className="font-medium text-white hover:text-emerald-300">{r.name}</Link>
                          {r.paused && <span className="ml-1.5 text-[10px] text-amber-300">⏸ paused</span>}
                          <Link to={`/reports/client/${r.id}/keyword-plan`} title="Build their Google Ads keyword plan" className="ml-2 text-[11px] font-medium text-emerald-300/80 hover:text-white">✦ plan</Link>
                        </DTd>
                        <DTd><Pill tone={st.tone} title={r.syncError ? explainSyncError(r.syncError) : undefined}>{st.label}</Pill></DTd>
                        <DTd numeric className="font-semibold text-white">{off ? '—' : money(r.spend)}</DTd>
                        <DTd numeric>{off ? '—' : r.leads}</DTd>
                        <DTd numeric>{off ? '—' : dash(r.cpl, usd)}</DTd>
                        <DTd numeric muted>{off ? '—' : int(r.clicks)}</DTd>
                        <DTd numeric muted>{off ? '—' : dash(r.ctr, pct)}</DTd>
                        <DTd numeric muted>{off ? '—' : dash(r.cpc, usd)}</DTd>
                        <DTd numeric muted>{off ? '—' : dash(r.convRate, pct)}</DTd>
                        <DTd numeric muted>{off ? '—' : `${r.activeCampaigns}/${r.campaigns}`}</DTd>
                        <DTd numeric className={r.wasted > 0 ? 'font-medium text-rose-300' : 'text-slate-500'}>{off ? '—' : r.wasted > 0 ? money(r.wasted) : '$0'}</DTd>
                        <DTd numeric className={r.blockable > 0 ? 'font-medium text-amber-300' : 'text-slate-500'}>{off ? '—' : r.blockable}</DTd>
                      </DTr>
                    )
                  })}
                </tbody>
              </DTable>
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel className="p-5">
                <SectionTitle title="Block these searches" sub={`Top ${Math.min(12, negatives.length)} across clients · certain ones first`} />
                {negatives.length === 0 ? (
                  <p className="text-sm text-slate-500">Nothing to block in this range.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {negatives.slice(0, 12).map((t) => (
                      <li key={`${t.clientId}|${t.term}`} className={`flex flex-wrap items-baseline gap-x-2 rounded-lg border px-3 py-2 text-xs ${t.certain ? 'border-rose-500/25 bg-rose-500/[0.06]' : 'border-white/[0.07] bg-white/[0.02]'}`}>
                        <span className="font-medium text-white">{t.term}</span>
                        <span className="text-slate-500">{t.clientName}</span>
                        <span className="ml-auto tabular-nums text-slate-200">{usd(t.cost)}</span>
                        {t.certain && <Pill tone="danger">certain</Pill>}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel className="p-5">
                <SectionTitle title="Keywords to act on" sub="Losing first, then winners" />
                {waste.length === 0 && winners.length === 0 ? (
                  <p className="text-sm text-slate-500">No keyword has enough spend to judge yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {[...waste.slice(0, 8), ...winners.slice(0, 4)].map((k) => {
                      const v = VERDICT[k.verdict]
                      return (
                        <li key={`${k.clientId}|${k.key}`} className="flex flex-wrap items-baseline gap-x-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-xs">
                          <span className="font-medium text-white">{k.keyword}</span>
                          <span className="text-slate-500">{k.matchType?.toLowerCase()}</span>
                          <span className="text-slate-500">{k.clientName}</span>
                          <span className="ml-auto tabular-nums text-slate-200">
                            {usd(k.cost)} · {k.conversions} conv{k.cpl != null ? ` · ${usd(k.cpl)} each` : ''}
                          </span>
                          <Pill tone={v.tone} title={k.signal}>{v.label}</Pill>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Panel>
            </div>

            <section>
              <SectionTitle title="Every campaign" sub="Across every client · biggest spend first" />
              {campaigns.length === 0 ? (
                <Panel className="p-8 text-center text-sm text-slate-500">
                  No campaign data in this range. {link.connected.length === 0 ? 'Connect a client first.' : 'Run Sync Google, or wait for tonight.'}
                </Panel>
              ) : (
                <DTable>
                  <thead>
                    <tr>
                      <DTh>Client</DTh>
                      <DTh>Campaign</DTh>
                      <DTh>Type</DTh>
                      <DTh>Status</DTh>
                      <DTh numeric>Spend</DTh>
                      <DTh numeric>Leads</DTh>
                      <DTh numeric>Cost/lead</DTh>
                      <DTh numeric>Clicks</DTh>
                      <DTh numeric>CTR</DTh>
                      <DTh numeric>CPC</DTh>
                      <DTh numeric>Value</DTh>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.slice(0, 60).map((c) => (
                      <DTr key={c.key}>
                        <DTd className="whitespace-nowrap"><Link to={`/reports/client/${c.clientId}?channel=google`} className="text-white hover:text-emerald-300">{c.clientName}</Link></DTd>
                        <DTd className="max-w-[260px] truncate" title={c.name}>{c.name}</DTd>
                        <DTd muted>{c.type}</DTd>
                        <DTd><Pill tone={c.status === 'ENABLED' ? 'success' : 'neutral'}>{c.status === 'ENABLED' ? 'Active' : c.status.toLowerCase() || '—'}</Pill></DTd>
                        <DTd numeric className="font-semibold text-white">{money(c.spend)}</DTd>
                        <DTd numeric>{c.leads}</DTd>
                        <DTd numeric>{dash(c.cpl, usd)}</DTd>
                        <DTd numeric muted>{int(c.clicks)}</DTd>
                        <DTd numeric muted>{dash(c.ctr, pct)}</DTd>
                        <DTd numeric muted>{dash(c.cpc, usd)}</DTd>
                        <DTd numeric muted>{c.value > 0 ? money(c.value) : '—'}</DTd>
                      </DTr>
                    ))}
                  </tbody>
                </DTable>
              )}
            </section>
          </>
        )}

        {/* WHO IS IN. At the bottom (asked for 2026-09-28): the numbers
            are what the page is opened for, and connecting a client is a
            job done once per client. */}
        <Panel channel="google" className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Eyebrow>Connected accounts</Eyebrow>
              <p className="mt-2 text-3xl font-semibold text-white">
                {link.connected.length}
                <span className="text-lg font-normal text-slate-500"> of {link.total} clients connected</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {link.noAccess.length > 0 && <span className="text-amber-300">{link.noAccess.length} with no access yet · </span>}
                last synced {whenLabel(synced)}
              </p>
            </div>
            {todo.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <CopySetupMessageButton message={buildGoogleAdsAccessMessage()} label="Copy access request" onDark />
                <CopySetupMessageButton message={buildGoogleAdsLinkWalkthrough()} label="Copy step-by-step" onDark />
              </div>
            )}
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5">
            <span className="block h-full rounded-full" style={{ width: `${link.total ? (link.connected.length / link.total) * 100 : 0}%`, background: G }} />
          </div>

          {todo.length > 0 && (
            <>
              <p className="mt-4 text-xs text-slate-400">
                Send the message: the client allows {AGENCY_EMAIL_DOMAIN} on their Security tab, adds {AGENCY_EMAIL} as a user and replies with their customer ID. Accept the
                invite in that inbox, then put the ID in beside their name. It saves and syncs on the spot.
              </p>
              {/* One row per client still to do, with the box right there. */}
              <div className="mt-3 divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.07] bg-black/20">
                {todo.map((c) => (
                  <div key={c.id} className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                    <div className="min-w-0 sm:w-56">
                      <Link to={`/client/${c.id}#google-search`} className="block truncate text-sm font-medium text-white hover:text-emerald-300">{c.name}</Link>
                      <p className="text-[11px] text-slate-500">{isAccessError(c.google_ads_sync_error) ? 'ID saved, Google refused us' : 'No ID yet'}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <GoogleAdsIdInput client={c} onSaved={load} compact dark />
                      {c.google_ads_sync_error && <p className="mt-1 text-[11px] text-amber-300/90">{explainSyncError(c.google_ads_sync_error)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>
    </Layout>
  )
}
