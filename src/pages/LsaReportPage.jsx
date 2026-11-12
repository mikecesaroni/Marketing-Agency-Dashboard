import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import DailyChart from '../components/DailyChart'
import CopySetupMessageButton from '../components/CopySetupMessageButton'
import { DTable, DTd, DTh, DTr, DarkButton, Eyebrow, KpiTile, Panel, Pill, SectionTitle, Segmented } from '../components/reports/kit'
import { chartTheme, compactMoney } from '../lib/channels'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/pagedQuery'
import { formatDate, getMonday, money } from '../lib/queries'
import { buildDailySeries, daysAgo, pctChange } from '../lib/dailySeries'
import { inRange } from '../lib/googleSearchReport'
import { STATES, leadsInRange, lsaClientReport, lsaConnection, lsaDailyRows, lsaKpis, lsaRows, recentLeads } from '../lib/lsaReport'
import { buildLsaSetupMessage } from '../lib/lsaSetupMessage'
import { AGENCY_EMAIL } from '../lib/agencyEmail'

/**
 * Local Services Ads across every client, on a page of its own.
 *
 * 2026-11-12: "build the LSA KPI pull and do whatever you see as best for
 * seeing LSA data and who's connected, who's not, etc, KPIs". The nightly
 * Google sync reads the Local Services campaigns (spend by day) and the
 * leads themselves (each call, message or booking, whether Google charged
 * for it, whether it was credited back, its status), so this page can say
 * the two things LSA is judged on, charged leads and cost per charged
 * lead, and who is connected at all.
 *
 * The rules are in src/lib/lsaReport.js; scripts/check-lsa-report.mjs pins
 * them.
 */
const RANGES = [
  { value: 7, label: '7d' },
  { value: 14, label: '14d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
]

const METRICS = [
  { key: 'spend', label: 'Spend', format: (v) => money(v), axis: (v) => compactMoney(v) },
  { key: 'leads', label: 'Leads', format: (v) => String(Math.round(v)), axis: (v) => String(v) },
]

const usd = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dash = (v, f) => (v > 0 ? f(v) : '—')
const dashed = (id) => (id ? String(id).replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3') : '')

function whenLabel(iso) {
  if (!iso) return 'never'
  const d = new Date(String(iso).replace(' ', 'T'))
  if (Number.isNaN(d)) return String(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function LsaReportPage() {
  const [days, setDays] = useState(30)
  const [metricKey, setMetricKey] = useState('spend')
  const [clients, setClients] = useState([])
  const [campaignRows, setCampaignRows] = useState([])
  const [leads, setLeads] = useState([])
  const [handRows, setHandRows] = useState([])
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
      // Twice the range, so every tile has the window before it to compare
      // with. A missing table (the SQL not applied yet) must not blank the page.
      const [clientsRes, campaigns, leadRows, hand] = await Promise.all([
        supabase.from('clients').select('id,name,archived,is_internal,paused_at,tier,lsa_active,lsa_customer_id,google_ads_customer_id,lsa_synced_at,lsa_sync_error').order('name'),
        fetchAllRows(() =>
          supabase.from('google_campaign_daily').select('client_id,customer_id,date,campaign_id,campaign_name,campaign_type,campaign_status,cost,conversions,clicks,impressions').gte('date', prevStart).order('date').order('id')
        ),
        fetchAllRows(() => supabase.from('lsa_leads').select('*').gte('created_date', prevStart).order('created_date').order('id')).catch(() => []),
        supabase
          .from('weekly_kpis')
          .select('client_id, week_of, ad_spend, leads')
          .eq('channel', 'LSA')
          .gte('week_of', formatDate(getMonday(new Date(`${prevStart}T00:00:00`))))
          .then(({ data }) => data || [], () => []),
      ])
      if (clientsRes.error) throw clientsRes.error
      setClients(clientsRes.data || [])
      setCampaignRows(campaigns)
      setLeads(leadRows)
      setHandRows(hand)
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

  // The same nightly sync the Google page runs: every connected account,
  // every campaign type, the Local Services leads, and discovery of accounts
  // linked since last time (a Local Services account of its own included).
  const handleSync = async () => {
    setSyncing(true)
    setSyncNote('')
    setError('')
    try {
      const { data, error: err } = await supabase.functions.invoke('google-daily-sync', { body: { days: Math.min(days, 90) } })
      if (err) throw new Error(err.message || 'The sync function did not answer.')
      if (data?.error) throw new Error(data.error)
      const results = data?.results || []
      const withLsa = results.filter((r) => r.lsa)
      const leadsN = withLsa.reduce((s, r) => s + (r.lsa?.leads || 0), 0)
      const bad = results.filter((r) => r.error || r.lsa?.error)
      const foundLsa = data?.discovered?.saved_lsa?.length || 0
      setSyncNote(
        data?.note ||
          `Synced ${results.length} ${results.length === 1 ? 'client' : 'clients'}; ${withLsa.length} with Local Services, ${leadsN} ${leadsN === 1 ? 'lead' : 'leads'} read` +
            (foundLsa ? `, ${foundLsa} new Local Services ${foundLsa === 1 ? 'account' : 'accounts'} found` : '') +
            (bad.length ? `. ${bad.length} with a problem: ${bad.map((r) => `${r.client}: ${r.error || r.lsa?.error}`).join(' · ')}` : '.')
      )
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  // Clients only, like the rest of Reports.
  const clientOnly = useMemo(() => {
    const skip = new Set(clients.filter((c) => c.archived || c.is_internal).map((c) => c.id))
    return { rows: lsaRows(campaignRows).filter((r) => !skip.has(r.client_id)), leads: leads.filter((l) => !skip.has(l.client_id)) }
  }, [clients, campaignRows, leads])

  const nowRows = useMemo(() => inRange(clientOnly.rows, windowStart), [clientOnly, windowStart])
  const prevRows = useMemo(() => inRange(clientOnly.rows, prevStart, prevEnd), [clientOnly, prevStart, prevEnd])
  const nowLeads = useMemo(() => leadsInRange(clientOnly.leads, windowStart), [clientOnly, windowStart])
  const prevLeads = useMemo(() => leadsInRange(clientOnly.leads, prevStart, prevEnd), [clientOnly, prevStart, prevEnd])
  const now = useMemo(() => lsaKpis(nowRows, nowLeads), [nowRows, nowLeads])
  const before = useMemo(() => lsaKpis(prevRows, prevLeads), [prevRows, prevLeads])
  const daily = useMemo(() => buildDailySeries(lsaDailyRows(nowRows, nowLeads), windowStart, daysAgo(0)), [nowRows, nowLeads, windowStart])
  const metric = METRICS.find((m) => m.key === metricKey)
  const spark = (k) => daily.map((d) => d[k])

  const rows = useMemo(() => lsaClientReport({ clients, campaignRows, leads, handRows, since: windowStart, today: daysAgo(0) }), [clients, campaignRows, leads, handRows, windowStart])
  // Our own businesses (Horizon HVAC's Local Services lives in its Search
  // account), as rows of their own under the clients: not in the tiles, not
  // in the counts, but not invisible either ("why is Google LSA blank").
  const ourRows = useMemo(
    () => lsaClientReport({ clients: clients.filter((c) => c.is_internal && !c.archived).map((c) => ({ ...c, is_internal: false })), campaignRows, leads, handRows, since: windowStart, today: daysAgo(0) }),
    [clients, campaignRows, leads, handRows, windowStart]
  )
  const link = useMemo(() => lsaConnection(rows), [rows])
  const latest = useMemo(() => recentLeads(nowLeads, clients, 30), [nowLeads, clients])
  const todo = rows.filter((r) => r.state === 'marked' || r.state === 'not-connected' || r.state === 'by-hand')
  const handOnly = rows.filter((r) => r.state === 'by-hand')
  const handTotals = handOnly.reduce((s, r) => ({ spend: s.spend + (r.hand?.spend || 0), leads: s.leads + (r.hand?.leads || 0) }), { spend: 0, leads: 0 })

  const actions = (
    <div className="flex min-w-0 max-w-full items-center gap-2 overflow-x-auto pb-1">
      <DarkButton onClick={handleSync} disabled={syncing}>{syncing ? 'Syncing…' : '↻ Sync Google'}</DarkButton>
      <Segmented options={RANGES} value={days} onChange={setDays} />
    </div>
  )

  return (
    <Layout
      tone="dark"
      title="Local Services"
      subtitle={`Last ${days} days · ${link.live} ${link.live === 1 ? 'client' : 'clients'} live${link.stopped ? ` · ${link.stopped} stopped` : ''} · ${money(now.spend)} spend · ${now.leads} leads · ${now.charged} charged`}
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
            {/* THE NUMBERS. Charged leads and cost per charged lead are what LSA is
                judged on: Google bills per lead, and credits back the junk. */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <KpiTile channel="lsa" label="Spend" value={money(now.spend)} delta={pctChange(now.spend, before.spend)} spark={spark('spend')} />
              <KpiTile channel="lsa" label="Leads" value={now.leads} delta={pctChange(now.leads, before.leads)} spark={spark('leads')} sub={now.fromLeadRows ? undefined : 'From campaign conversions'} />
              <KpiTile channel="lsa" label="Charged leads" value={now.fromLeadRows ? now.charged : '—'} delta={now.fromLeadRows ? pctChange(now.charged, before.charged) : null} sub={now.fromLeadRows ? undefined : 'No lead rows synced yet'} />
              <KpiTile channel="lsa" label="Cost per charged lead" value={dash(now.cpcl, usd)} delta={pctChange(now.cpcl, before.cpcl)} lowerIsBetter sub={now.cpcl ? undefined : `Cost per lead ${dash(now.cpl, usd)}`} />
              <KpiTile channel="lsa" label="Booked" value={now.fromLeadRows ? now.booked : '—'} delta={now.fromLeadRows ? pctChange(now.booked, before.booked) : null} sub={now.fromLeadRows ? `${now.credited} credited back` : 'Needs the lead rows'} />
            </div>

            <Panel className="p-5">
              <SectionTitle
                channel="lsa"
                title={`${metric.label} by day`}
                sub="Synced Local Services campaigns · clients only · daily columns with a 7-day average"
                right={<Segmented size="sm" options={METRICS.map((m) => ({ value: m.key, label: m.label }))} value={metricKey} onChange={setMetricKey} />}
              />
              <DailyChart series={daily} metric={metric} theme={chartTheme('lsa')} />
            </Panel>

            {/* WHO IS CONNECTED. */}
            <section>
              <SectionTitle
                title="Every client"
                sub={`${link.live} live · ${link.stopped} stopped · ${link.connected} connected and quiet · ${link.byHand} logged by hand · ${link.marked} marked live with nothing connected · ${link.notConnected} not connected`}
              />
              <DTable>
                <thead>
                  <tr>
                    <DTh>Client</DTh>
                    <DTh>Status</DTh>
                    <DTh>Account</DTh>
                    <DTh numeric>Spend</DTh>
                    <DTh numeric>Leads</DTh>
                    <DTh numeric>Charged</DTh>
                    <DTh numeric>Booked</DTh>
                    <DTh numeric>Cost / charged lead</DTh>
                    <DTh>Last lead</DTh>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const s = STATES[r.state]
                    return (
                      <DTr key={r.id} data-lsa-client={r.name}>
                        <DTd className="whitespace-nowrap">
                          <Link to={`/client/${r.id}`} className="font-medium text-white hover:text-sky-300">{r.name}</Link>
                        </DTd>
                        <DTd>
                          <Pill tone={s.tone} title={r.syncError || undefined}>{s.label}</Pill>
                          {r.state === 'stopped' && (
                            <span className="ml-2 text-[11px] text-amber-300/90">
                              {r.stoppedWhy === 'paused' ? `paused in Google, last spend ${r.lastDate}` : `no spend for ${r.quietDays} days`}
                            </span>
                          )}
                          {r.syncError && <span className="ml-2 text-[11px] text-amber-300/90">lead read failed</span>}
                        </DTd>
                        <DTd className="whitespace-nowrap text-xs text-slate-400">
                          {r.account ? `${dashed(r.account)}${r.inSearchAccount ? ' · with Search' : ''}` : r.state === 'by-hand' ? 'weekly log' : '—'}
                        </DTd>
                        <DTd numeric muted={!r.spend && !r.hand}>{r.spend ? money(r.spend) : r.hand ? `${money(r.hand.spend)} (by hand)` : '—'}</DTd>
                        <DTd numeric muted={!r.leads && !r.hand}>{r.leads || (r.hand ? `${r.hand.leads} (by hand)` : '—')}</DTd>
                        <DTd numeric muted={!r.fromLeadRows}>{r.fromLeadRows ? r.charged : '—'}</DTd>
                        <DTd numeric muted={!r.fromLeadRows}>{r.fromLeadRows ? r.booked : '—'}</DTd>
                        <DTd numeric>{dash(r.cpcl, usd)}</DTd>
                        <DTd className="whitespace-nowrap text-xs text-slate-400">{r.lastLead ? whenLabel(r.lastLead) : r.lastDate ? `spent ${r.lastDate}` : '—'}</DTd>
                      </DTr>
                    )
                  })}
                </tbody>
              </DTable>
              {handOnly.length > 0 && (
                <p className="mt-2 text-[11px] text-slate-500">
                  Logged by hand in this range: {money(handTotals.spend)} and {handTotals.leads} {handTotals.leads === 1 ? 'lead' : 'leads'} across {handOnly.length} {handOnly.length === 1 ? 'client' : 'clients'}, not in the tiles above. Connect their Local Services account and the sync takes over.
                </p>
              )}
            </section>

            {ourRows.length > 0 && (
              <section data-our-lsa>
                <SectionTitle title="My businesses" sub="Not clients · left out of the tiles and the counts above" />
                <DTable>
                  <thead>
                    <tr>
                      <DTh>Business</DTh>
                      <DTh>Status</DTh>
                      <DTh>Account</DTh>
                      <DTh numeric>Spend</DTh>
                      <DTh numeric>Leads</DTh>
                      <DTh numeric>Charged</DTh>
                      <DTh numeric>Booked</DTh>
                      <DTh numeric>Cost / charged lead</DTh>
                      <DTh>Last lead</DTh>
                    </tr>
                  </thead>
                  <tbody>
                    {ourRows.map((r) => {
                      const s = STATES[r.state]
                      return (
                        <DTr key={r.id} data-lsa-ours={r.name}>
                          <DTd className="whitespace-nowrap">
                            <Link to={`/client/${r.id}`} className="font-medium text-white hover:text-sky-300">{r.name}</Link>
                          </DTd>
                          <DTd>
                            <Pill tone={s.tone} title={r.syncError || undefined}>{s.label}</Pill>
                            {r.state === 'stopped' && (
                              <span className="ml-2 text-[11px] text-amber-300/90">
                                {r.stoppedWhy === 'paused' ? `paused in Google, last spend ${r.lastDate}` : `no spend for ${r.quietDays} days`}
                              </span>
                            )}
                          </DTd>
                          <DTd className="whitespace-nowrap text-xs text-slate-400">{r.account ? `${dashed(r.account)}${r.inSearchAccount ? ' · with Search' : ''}` : '—'}</DTd>
                          <DTd numeric muted={!r.spend}>{r.spend ? money(r.spend) : '—'}</DTd>
                          <DTd numeric muted={!r.leads}>{r.leads || '—'}</DTd>
                          <DTd numeric muted={!r.fromLeadRows}>{r.fromLeadRows ? r.charged : '—'}</DTd>
                          <DTd numeric muted={!r.fromLeadRows}>{r.fromLeadRows ? r.booked : '—'}</DTd>
                          <DTd numeric>{dash(r.cpcl, usd)}</DTd>
                          <DTd className="whitespace-nowrap text-xs text-slate-400">{r.lastLead ? whenLabel(r.lastLead) : r.lastDate ? `spent ${r.lastDate}` : '—'}</DTd>
                        </DTr>
                      )
                    })}
                  </tbody>
                </DTable>
              </section>
            )}

            {/* THE LEADS THEMSELVES, newest first. */}
            <section>
              <SectionTitle title="Latest leads" sub="Each call, message or booking Google reported · charged means Google billed for it · credited means the charge came back" />
              {latest.length === 0 ? (
                <Panel className="p-8 text-center text-sm text-slate-500">No Local Services leads synced in this range yet. The leads arrive with the nightly sync, from every account that carries a Local Services campaign.</Panel>
              ) : (
                <DTable>
                  <thead>
                    <tr>
                      <DTh>When</DTh>
                      <DTh>Client</DTh>
                      <DTh>Kind</DTh>
                      <DTh>Status</DTh>
                      <DTh>Billing</DTh>
                    </tr>
                  </thead>
                  <tbody>
                    {latest.map((l) => (
                      <DTr key={`${l.clientId}:${l.id}`}>
                        <DTd className="whitespace-nowrap text-xs text-slate-400">{whenLabel(l.at)}</DTd>
                        <DTd className="whitespace-nowrap"><Link to={`/client/${l.clientId}`} className="text-white hover:text-sky-300">{l.clientName}</Link></DTd>
                        <DTd>{l.kind}</DTd>
                        <DTd>{l.status}</DTd>
                        <DTd>{l.credited ? <Pill tone="info">Credited back</Pill> : l.charged ? <Pill tone="success">Charged</Pill> : <Pill tone="neutral">Not charged</Pill>}</DTd>
                      </DTr>
                    ))}
                  </tbody>
                </DTable>
              )}
            </section>

            {/* HOW A CLIENT GETS CONNECTED. */}
            <Panel className="p-5" data-lsa-connect>
              <Eyebrow>Connecting a client&rsquo;s Local Services</Eyebrow>
              <p className="mt-2 text-sm text-slate-300">
                The sync reads whatever Google Ads accounts our login can see. A client&rsquo;s Local Services lives either inside their Search account (then it is already here, as Horizon HVAC&rsquo;s is) or in an account of its own. For an account of its own, the client adds <span className="text-white">{AGENCY_EMAIL}</span> as a user on it (Local Services dashboard, the gear, Account access, Users; the allowed-domains step first) or we link it under the manager account. The next nightly run finds it by name, saves it on the client, and starts reading its campaigns and leads. The setup message below walks the client through their part.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <CopySetupMessageButton message={buildLsaSetupMessage()} />
                {todo.length > 0 && (
                  <span className="text-xs text-slate-400">
                    Still to connect: {todo.map((r) => `${r.name}${r.state === 'marked' ? ' (marked live)' : r.state === 'by-hand' ? ' (logging by hand)' : ''}`).join(', ')}
                  </span>
                )}
              </div>
            </Panel>
          </>
        )}
      </div>
    </Layout>
  )
}
