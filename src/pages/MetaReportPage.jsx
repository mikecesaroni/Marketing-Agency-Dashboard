import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import DailyChart from '../components/DailyChart'
import { DTable, DTd, DTh, DTr, DarkButton, Delta, Eyebrow, KpiTile, Panel, Pill, SectionTitle, Segmented, Sparkline } from '../components/reports/kit'
import { CHANNELS, chartTheme, compactMoney, rangeLabel } from '../lib/channels'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/pagedQuery'
import { isLive, money } from '../lib/queries'
import { LOWER_IS_BETTER, buildDailySeries, daysAgo, pctChange } from '../lib/dailySeries'
import { adsToActOn, inRange, metaCampaignReport, metaClientReport, metaConnection, metaKpis, platformSplit } from '../lib/metaReport'
import { runMetaSync, summariseSync } from '../lib/metaSync'
import { accountStatusLabel, accountStatusOk } from '../lib/adHealth'

/**
 * Meta across every client, on a page of its own. The Reports hub shows
 * Meta next to the other channels; this is everything Meta reports that the
 * hub has no room for: CTR, CPC, CPM and hook rate, where the ads ran, the
 * ads worth a decision, every client and every campaign.
 *
 * All from ad_daily (one row per ad per day), so these totals are the same
 * numbers the hub and the client pages show. The placement split comes from
 * a per-client roll-up of ad_platform_daily and covers all ads.
 */
const SCOPES = [
  { value: 'live', label: 'Live ads' },
  { value: 'all', label: 'All ads' },
]

const RANGES = [
  { value: 7, label: '7d' },
  { value: 14, label: '14d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
]

const METRICS = [
  { key: 'spend', label: 'Spend', format: (v) => money(v), axis: (v) => compactMoney(v) },
  { key: 'leads', label: 'Leads', format: (v) => v.toFixed(v % 1 === 0 ? 0 : 1), axis: (v) => String(v) },
  { key: 'clicks', label: 'Clicks', format: (v) => String(Math.round(v)), axis: (v) => String(v) },
  { key: 'cpl', label: 'Cost per lead', format: (v) => (v > 0 ? `$${v.toFixed(2)}` : '—'), axis: (v) => `$${Math.round(v)}` },
]

const usd = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const int = (n) => Number(n || 0).toLocaleString('en-US')
const pct = (n) => `${Number(n || 0).toFixed(1)}%`
const dash = (v, f) => (v > 0 ? f(v) : '—')

const STATE = {
  live: { label: 'Running', tone: 'success' },
  'no-spend': { label: 'No spend', tone: 'info' },
  'no-account': { label: 'No ad account', tone: 'neutral' },
}

const PIXEL = {
  'on-file': { label: 'Pixel on file', tone: 'success' },
  missing: { label: 'No pixel', tone: 'warning' },
}

const VERDICT = {
  dead: { label: 'No leads', tone: 'danger' },
  expensive: { label: 'Too expensive', tone: 'warning' },
  winner: { label: 'Winner', tone: 'success' },
}

export default function MetaReportPage() {
  const [days, setDays] = useState(30)
  const [scope, setScope] = useState('live')
  const [metricKey, setMetricKey] = useState('spend')
  const [clients, setClients] = useState([])
  const [adRows, setAdRows] = useState([])
  const [platformRows, setPlatformRows] = useState([])
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
      // Twice the range for the ad rows, so every tile has the window before
      // it to compare with. Placements only need the window.
      const [clientsRes, ads, platforms] = await Promise.all([
        supabase.from('clients').select('id,name,meta_ad_account_id,meta_pixel_id,archived,is_internal,paused_at').order('name'),
        fetchAllRows(() =>
          supabase
            .from('ad_daily')
            .select('id, client_id, date, ad_id, ad_name, campaign_id, campaign_name, effective_status, spend, leads, impressions, clicks, video_2s_views')
            .gte('date', prevStart)
            .order('date')
            .order('id')
        ),
        fetchAllRows(() =>
          supabase.from('ad_platform_client_daily').select('client_id, date, platform, spend, leads, impressions, clicks').gte('date', windowStart).order('date').order('client_id').order('platform')
        ).catch(() => []),
      ])
      if (clientsRes.error) throw clientsRes.error
      setClients(clientsRes.data || [])
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
  }, [days])

  const handleSync = async () => {
    setSyncing(true)
    setSyncNote('')
    setError('')
    try {
      setSyncNote(summariseSync(await runMetaSync()))
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  const link = useMemo(() => metaConnection(clients), [clients])

  // Clients only, as on the rest of Reports: our own businesses have real
  // spend but folding it in would overstate what we run for clients.
  const clientRows = useMemo(() => {
    const skip = new Set(clients.filter((c) => c.archived || c.is_internal).map((c) => c.id))
    return adRows.filter((r) => !skip.has(r.client_id) && (scope === 'all' || isLive(r.effective_status)))
  }, [clients, adRows, scope])

  const nowRows = useMemo(() => inRange(clientRows, windowStart), [clientRows, windowStart])
  const prevRows = useMemo(() => inRange(clientRows, prevStart, prevEnd), [clientRows, prevStart, prevEnd])
  const now = useMemo(() => metaKpis(nowRows), [nowRows])
  const before = useMemo(() => metaKpis(prevRows), [prevRows])
  const daily = useMemo(() => buildDailySeries(nowRows, windowStart, daysAgo(0)), [nowRows, windowStart])
  const metric = METRICS.find((m) => m.key === metricKey)
  const spark = (k) => daily.map((d) => d[k])

  const rows = useMemo(() => metaClientReport({ clients, rows: nowRows, since: windowStart }), [clients, nowRows, windowStart])
  const campaigns = useMemo(() => metaCampaignReport(nowRows, clients, windowStart), [nowRows, clients, windowStart])
  const ads = useMemo(() => adsToActOn(nowRows, clients, { since: windowStart }), [nowRows, clients, windowStart])
  const platforms = useMemo(() => platformSplit(platformRows, clients, windowStart), [platformRows, clients, windowStart])
  const dead = ads.filter((a) => a.verdict === 'dead')
  const winners = ads.filter((a) => a.verdict === 'winner')
  const deadSpend = dead.reduce((s, a) => s + a.spend, 0)
  const running = rows.filter((r) => r.state === 'live').length
  const B = CHANNELS.meta.color

  const actions = (
    <div className="flex min-w-0 max-w-full items-center gap-2 overflow-x-auto pb-1">
      <DarkButton onClick={handleSync} disabled={syncing}>{syncing ? 'Syncing…' : '↻ Sync Meta'}</DarkButton>
      <Segmented options={SCOPES} value={scope} onChange={setScope} />
      <Segmented options={RANGES} value={days} onChange={setDays} />
    </div>
  )

  return (
    <Layout
      tone="dark"
      title="Meta Ads"
      subtitle={`Last ${days} days · ${scope === 'live' ? 'live ads only' : 'all ads'} · ${running} ${running === 1 ? 'client' : 'clients'} running · ${money(now.spend)} spend · ${now.leads} leads`}
      actions={actions}
    >
      <Link to="/reports" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
        ← All channels
      </Link>

      {error && <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">Error: {error}</div>}
      {syncNote && <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{syncNote}</div>}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-white/[0.04]" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {/* LEADS FIRST, like Reports (asked for 2026-09-29): the range and
              its dates right under the number, spend and cost per lead beside. */}
          <Panel channel="meta" className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Eyebrow>Meta · leads · last {days} days</Eyebrow>
                <p className="mt-2 text-5xl font-semibold tracking-tight text-white md:text-6xl">
                    {Math.round(now.leads).toLocaleString('en-US')}
                    <span className="ml-2 text-2xl font-medium text-slate-400 md:text-3xl">{Math.round(now.leads) === 1 ? 'lead' : 'leads'}</span>
                  </p>
                <p className="mt-1 text-xs text-slate-500">{rangeLabel(windowStart, daysAgo(0))}</p>
                <Delta value={pctChange(now.leads, before.leads)} />
              </div>
              <div className="grid grid-cols-2 gap-6 text-right">
                <div>
                  <Eyebrow>Ad spend</Eyebrow>
                  <p className="mt-2 text-3xl font-semibold text-white">{money(now.spend)}</p>
                  <Delta value={pctChange(now.spend, before.spend)} align="right" />
                </div>
                <div>
                  <Eyebrow>Cost per lead</Eyebrow>
                  <p className="mt-2 text-3xl font-semibold text-white">{dash(now.cpl, usd)}</p>
                  <Delta value={pctChange(now.cpl, before.cpl)} lowerIsBetter={LOWER_IS_BETTER.has('cpl')} align="right" />
                </div>
              </div>
            </div>
            <div className="mt-5">
              <Sparkline values={spark('leads')} channel="meta" height={44} />
            </div>
          </Panel>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <KpiTile channel="meta" label="Click-through rate" value={dash(now.ctr, pct)} delta={pctChange(now.ctr, before.ctr)} spark={spark('ctr')} />
            <KpiTile channel="meta" label="Clicks" value={int(now.clicks)} delta={pctChange(now.clicks, before.clicks)} spark={spark('clicks')} />
            <KpiTile channel="meta" label="Cost per click" value={dash(now.cpc, usd)} delta={pctChange(now.cpc, before.cpc)} lowerIsBetter />
            <KpiTile channel="meta" label="Cost per 1,000 views" value={dash(now.cpm, usd)} delta={pctChange(now.cpm, before.cpm)} lowerIsBetter spark={spark('impressions')} sub={now.cpm ? undefined : 'No impressions'} />
            <KpiTile channel="meta" label="Hook rate · video" value={dash(now.hookRate, pct)} delta={pctChange(now.hookRate, before.hookRate)} sub={now.hookRate ? undefined : 'No video ads in range'} />
          </div>

          <Panel className="p-5">
            <SectionTitle
              channel="meta"
              title={`${metric.label} by day`}
              sub={`${scope === 'live' ? 'Live ads only' : 'All ads'} · clients only · daily columns with a 7-day average`}
              right={<Segmented size="sm" options={METRICS.map((m) => ({ value: m.key, label: m.label }))} value={metricKey} onChange={setMetricKey} />}
            />
            <DailyChart series={daily} metric={metric} theme={chartTheme('meta')} />
          </Panel>

          <div className="grid gap-4 md:grid-cols-3">
            <Panel className="p-5">
              <Eyebrow>Ads spending, no leads</Eyebrow>
              <p className={`mt-2 text-3xl font-semibold ${dead.length ? 'text-rose-300' : 'text-white'}`}>{money(deadSpend)}</p>
              <p className="mt-1 text-xs text-slate-500">
                {dead.length ? `on ${dead.length} ${dead.length === 1 ? 'ad' : 'ads'} across ${new Set(dead.map((a) => a.clientId)).size} ${new Set(dead.map((a) => a.clientId)).size === 1 ? 'client' : 'clients'}` : 'Every ad with real spend has a lead'}
              </p>
            </Panel>
            <Panel className="p-5">
              <Eyebrow>Winning ads</Eyebrow>
              <p className={`mt-2 text-3xl font-semibold ${winners.length ? 'text-emerald-300' : 'text-white'}`}>{winners.length}</p>
              <p className="mt-1 text-xs text-slate-500">
                {winners.length ? `3+ leads at under three quarters of the ${dash(now.cpl, usd)} average` : 'None clear of the average yet'}
              </p>
            </Panel>
            <Panel className="p-5">
              <Eyebrow>Where the ads ran · all ads</Eyebrow>
              {platforms.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No placement data in this range.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {platforms.slice(0, 5).map((p) => (
                    <li key={p.key} className="text-xs">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate text-slate-300">{p.label}</span>
                        <span className="tabular-nums text-slate-400">
                          <span className="text-white">{Math.round(p.share)}%</span> · {dash(p.cpl, usd)} a lead
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/5">
                        <span className="block h-full rounded-full" style={{ width: `${p.share}%`, background: B }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <section>
            <SectionTitle title="Every client" sub="Live ads reads live/total ads that spent · hook rate is 2-second video views over impressions" />
            <DTable>
              <thead>
                <tr>
                  <DTh>Client</DTh>
                  <DTh>Status · pixel</DTh>
                  <DTh numeric>Spend</DTh>
                  <DTh numeric>Leads</DTh>
                  <DTh numeric>Cost/lead</DTh>
                  <DTh numeric>Impressions</DTh>
                  <DTh numeric>CTR</DTh>
                  <DTh numeric>CPC</DTh>
                  <DTh numeric>CPM</DTh>
                  <DTh numeric>Hook rate</DTh>
                  <DTh numeric>Live ads</DTh>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = STATE[r.state]
                  const off = r.state !== 'live'
                  return (
                    <DTr key={r.id}>
                      <DTd className="whitespace-nowrap">
                        <Link to={`/reports/client/${r.id}?channel=meta&scope=${scope}`} className="font-medium text-white hover:text-sky-300">{r.name}</Link>
                        {r.paused && <span className="ml-1.5 text-[10px] text-amber-300">⏸ paused</span>}
                      </DTd>
                      <DTd className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <Pill tone={st.tone}>{st.label}</Pill>
                          {!accountStatusOk(r.accountStatus) && (
                            <Pill tone="danger" title="Meta's status for the ad account itself, from the nightly check">
                              account {accountStatusLabel(r.accountStatus)}
                            </Pill>
                          )}
                          {PIXEL[r.pixel] && (
                            <Pill tone={PIXEL[r.pixel].tone} title={r.pixelId ? `Pixel ${r.pixelId}` : 'The ad account has no pixel Meta can see yet'}>
                              {PIXEL[r.pixel].label}{r.pixelId ? ` …${r.pixelId.slice(-4)}` : ''}
                            </Pill>
                          )}
                        </span>
                      </DTd>
                      <DTd numeric className="font-semibold text-white">{off ? '—' : money(r.spend)}</DTd>
                      <DTd numeric>{off ? '—' : r.leads}</DTd>
                      <DTd numeric>{off ? '—' : dash(r.cpl, usd)}</DTd>
                      <DTd numeric muted>{off ? '—' : int(r.impressions)}</DTd>
                      <DTd numeric muted>{off ? '—' : dash(r.ctr, pct)}</DTd>
                      <DTd numeric muted>{off ? '—' : dash(r.cpc, usd)}</DTd>
                      <DTd numeric muted>{off ? '—' : dash(r.cpm, usd)}</DTd>
                      <DTd numeric muted>{off ? '—' : dash(r.hookRate, pct)}</DTd>
                      <DTd numeric muted>{off ? '—' : `${r.liveAds}/${r.ads}`}</DTd>
                    </DTr>
                  )
                })}
              </tbody>
            </DTable>
          </section>

          <Panel className="p-5">
            <SectionTitle title="Ads to act on" sub={`Losing first, then winners · judged against the ${dash(now.cpl, usd)} average cost per lead`} />
            {ads.length === 0 ? (
              <p className="text-sm text-slate-500">No ad is far enough from the average to call yet.</p>
            ) : (
              <ul className="grid gap-1.5 lg:grid-cols-2">
                {ads.slice(0, 16).map((a) => {
                  const v = VERDICT[a.verdict]
                  return (
                    <li key={a.key} className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg border px-3 py-2 text-xs ${a.verdict === 'dead' ? 'border-rose-500/25 bg-rose-500/[0.06]' : 'border-white/[0.07] bg-white/[0.02]'}`}>
                      <span className="min-w-0 max-w-full truncate font-medium text-white" title={a.name}>{a.name}</span>
                      <span className="text-slate-500">{a.clientName}</span>
                      {!a.live && <span className="text-slate-500">· not live</span>}
                      <span className="ml-auto tabular-nums text-slate-200">
                        {money(a.spend)} · {a.leads} {a.leads === 1 ? 'lead' : 'leads'}{a.cpl ? ` · ${usd(a.cpl)} each` : ''}
                      </span>
                      <Pill tone={v.tone} title={a.why}>{v.label}</Pill>
                    </li>
                  )
                })}
              </ul>
            )}
            {ads.length > 16 && <p className="mt-2 text-[11px] text-slate-500">and {ads.length - 16} more.</p>}
          </Panel>

          <section>
            <SectionTitle title="Every campaign" sub="Across every client · biggest spend first" />
            {campaigns.length === 0 ? (
              <Panel className="p-8 text-center text-sm text-slate-500">No Meta spend in this range.</Panel>
            ) : (
              <DTable>
                <thead>
                  <tr>
                    <DTh>Client</DTh>
                    <DTh>Campaign</DTh>
                    <DTh numeric>Spend</DTh>
                    <DTh numeric>Leads</DTh>
                    <DTh numeric>Cost/lead</DTh>
                    <DTh numeric>Clicks</DTh>
                    <DTh numeric>CTR</DTh>
                    <DTh numeric>CPC</DTh>
                    <DTh numeric>Live ads</DTh>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.slice(0, 60).map((c) => (
                    <DTr key={c.key}>
                      <DTd className="whitespace-nowrap"><Link to={`/reports/client/${c.clientId}?channel=meta&scope=${scope}`} className="text-white hover:text-sky-300">{c.clientName}</Link></DTd>
                      <DTd className="max-w-[280px] truncate" title={c.name}>{c.name}</DTd>
                      <DTd numeric className="font-semibold text-white">{money(c.spend)}</DTd>
                      <DTd numeric>{c.leads}</DTd>
                      <DTd numeric>{dash(c.cpl, usd)}</DTd>
                      <DTd numeric muted>{int(c.clicks)}</DTd>
                      <DTd numeric muted>{dash(c.ctr, pct)}</DTd>
                      <DTd numeric muted>{dash(c.cpc, usd)}</DTd>
                      <DTd numeric muted>{`${c.liveAds}/${c.ads}`}</DTd>
                    </DTr>
                  ))}
                </tbody>
              </DTable>
            )}
          </section>

          {/* Who has no ad account on file. At the bottom, like Google's:
              a job done once per client. */}
          <Panel channel="meta" className="p-5">
            <Eyebrow>Ad accounts on file</Eyebrow>
            <p className="mt-2 text-3xl font-semibold text-white">
              {link.connected.length}
              <span className="text-lg font-normal text-slate-500"> of {link.total} clients</span>
            </p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5">
              <span className="block h-full rounded-full" style={{ width: `${link.total ? (link.connected.length / link.total) * 100 : 0}%`, background: B }} />
            </div>
            {link.missing.length > 0 && (
              <p className="mt-3 text-xs text-slate-400">
                No Meta ad account yet:{' '}
                {link.missing.map((c, i) => (
                  <span key={c.id}>
                    {i > 0 && ', '}
                    <Link to={`/client/${c.id}`} className="text-sky-300 hover:underline">{c.name}</Link>
                  </span>
                ))}
                . Open the client and use the Meta ad account card (Detect from Meta finds it).
              </p>
            )}

            <div className="mt-5 border-t border-white/[0.06] pt-4">
              <Eyebrow>Pixels on file</Eyebrow>
              <p className="mt-2 text-2xl font-semibold text-white">
                {link.withPixel.length}
                <span className="text-base font-normal text-slate-500"> of {link.connected.length} with an ad account</span>
              </p>
              {link.noPixel.length > 0 && (
                <p className="mt-2 text-xs text-slate-400">
                  Once a pixel is shared to a client&apos;s ad account, the nightly Meta check picks up its ID on its own. No pixel yet:{' '}
                  {link.noPixel.map((c, i) => (
                    <span key={c.id}>
                      {i > 0 && ', '}
                      <Link to={`/reports/client/${c.id}?channel=meta`} className="text-amber-300 hover:underline">{c.name}</Link>
                    </span>
                  ))}
                </p>
              )}
            </div>
          </Panel>
        </div>
      )}
    </Layout>
  )
}
