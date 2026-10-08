import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import UnmappedAccountsPanel from '../components/UnmappedAccountsPanel'
import MonthlyReportsPanel from '../components/MonthlyReportsPanel'
import WeeklyReportsPanel from '../components/WeeklyReportsPanel'
import { fetchAdRowsForRange, formatDate, getMonday, isLive, money } from '../lib/queries'
import { buildDailySeries, daysAgo, pctChange, totals as sumSeries } from '../lib/dailySeries'
import ChannelDailyChart from '../components/reports/ChannelDailyChart'
import { ChannelDot, DTable, DTd, DTh, DTr, DarkButton, Delta, Eyebrow, MixBar, Panel, SectionTitle, Segmented, Sparkline } from '../components/reports/kit'
import { CHANNELS, channelMix, compactMoney, mergeDaily, rangeLabel } from '../lib/channels'
import { dailyRows as googleDailyRows, inRange, kpis as googleKpis } from '../lib/googleSearchReport'
import { runMetaSync, summariseSync } from '../lib/metaSync'
import { supabase } from '../lib/supabaseClient'

/**
 * Every channel, every client, over time. The "how are we doing" page.
 *
 * Top to bottom: all channels blended, each channel on its own card, the
 * daily split between Meta and Google, and every client with their channel
 * split. Meta and Google Ads each have a full page of their own; their cards
 * are the door.
 *
 * Meta comes from ad_daily (per ad, so Live ads can be filtered on status),
 * Google from google_campaign_daily (every campaign type), LSA from the
 * weekly numbers logged by hand. Our own businesses are kept out of every
 * total and shown on their own at the bottom.
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

// Leads first and by default (asked for 2026-09-29), to match the headline.
const STACK_METRICS = [
  { value: 'leads', label: 'Leads', format: (v) => String(Math.round(v * 10) / 10), axis: (v) => String(v) },
  { value: 'spend', label: 'Spend', format: (v) => money(v), axis: (v) => compactMoney(v) },
]

const cplText = (v) => (v > 0 ? `$${v.toFixed(2)}` : '—')


export default function ReportsPage() {
  const navigate = useNavigate()
  const [adRows, setAdRows] = useState([])
  const [googleRows, setGoogleRows] = useState([])
  const [lsaRows, setLsaRows] = useState([])
  const [scope, setScope] = useState('live')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [days, setDays] = useState(30)
  const [stackKey, setStackKey] = useState('leads')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState('')

  const windowStart = daysAgo(days - 1)
  const prevStart = daysAgo(days * 2 - 1)
  const prevEnd = daysAgo(days)

  // Twice the range, so every number has the window before it to compare
  // with. Google and LSA fail soft: a missing table must not blank Meta.
  const load = async () => {
    const since = daysAgo(days * 2 - 1)
    const [meta, google, lsa] = await Promise.all([
      fetchAdRowsForRange(since),
      supabase
        .from('google_campaign_daily')
        .select('client_id, date, cost, conversions, clicks, impressions, conversion_value, clients(name, is_internal, archived)')
        .gte('date', since)
        .then(({ data }) => data || [], () => []),
      supabase
        .from('weekly_kpis')
        .select('client_id, week_of, ad_spend, leads, clients(name, is_internal, archived)')
        .eq('channel', 'LSA')
        .gte('week_of', formatDate(getMonday(new Date(`${since}T00:00:00`))))
        .then(({ data }) => data || [], () => []),
    ])
    setAdRows(meta)
    setGoogleRows(google)
    setLsaRows(lsa)
  }

  useEffect(() => {
    setLoading(true)
    load()
      .then(() => setError(''))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult('')
    setError('')
    try {
      setSyncResult(summariseSync(await runMetaSync()))
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  // ---- Meta ---------------------------------------------------------------
  const scopedRows = useMemo(
    () => (scope === 'live' ? adRows.filter((r) => isLive(r.effective_status)) : adRows),
    [adRows, scope]
  )
  const clientMeta = useMemo(() => scopedRows.filter((r) => !r.clients?.is_internal), [scopedRows])
  const metaNowRows = useMemo(() => clientMeta.filter((r) => r.date >= windowStart), [clientMeta, windowStart])
  const metaPrevRows = useMemo(() => clientMeta.filter((r) => r.date >= prevStart && r.date <= prevEnd), [clientMeta, prevStart, prevEnd])
  const metaDaily = useMemo(() => buildDailySeries(metaNowRows, windowStart, daysAgo(0)), [metaNowRows, windowStart])
  const metaPrevDaily = useMemo(() => buildDailySeries(metaPrevRows, prevStart, prevEnd), [metaPrevRows, prevStart, prevEnd])
  const meta = useMemo(() => sumSeries(metaDaily), [metaDaily])
  const metaBefore = useMemo(() => sumSeries(metaPrevDaily), [metaPrevDaily])

  // ---- Google -------------------------------------------------------------
  const clientGoogle = useMemo(() => googleRows.filter((r) => !r.clients?.is_internal && !r.clients?.archived), [googleRows])
  const googleNowRows = useMemo(() => inRange(clientGoogle, windowStart), [clientGoogle, windowStart])
  const googlePrevRows = useMemo(() => inRange(clientGoogle, prevStart, prevEnd), [clientGoogle, prevStart, prevEnd])
  const googleDaily = useMemo(() => buildDailySeries(googleDailyRows(googleNowRows), windowStart, daysAgo(0)), [googleNowRows, windowStart])
  const google = useMemo(() => googleKpis(googleNowRows), [googleNowRows])
  const googleBefore = useMemo(() => googleKpis(googlePrevRows), [googlePrevRows])

  // ---- LSA, weekly, by hand -----------------------------------------------
  const windowMonday = formatDate(getMonday(new Date(`${windowStart}T00:00:00`)))
  const clientLsa = useMemo(() => lsaRows.filter((r) => !r.clients?.is_internal && !r.clients?.archived), [lsaRows])
  const lsaSum = (rows) => ({
    spend: rows.reduce((s, r) => s + Number(r.ad_spend || 0), 0),
    leads: rows.reduce((s, r) => s + Number(r.leads || 0), 0),
  })
  const lsa = useMemo(() => lsaSum(clientLsa.filter((r) => r.week_of >= windowMonday)), [clientLsa, windowMonday])
  const lsaBefore = useMemo(() => lsaSum(clientLsa.filter((r) => r.week_of < windowMonday)), [clientLsa, windowMonday])

  // ---- All channels -------------------------------------------------------
  const all = {
    spend: meta.spend + google.spend + lsa.spend,
    leads: meta.leads + google.leads + lsa.leads,
  }
  all.cpl = all.leads > 0 ? all.spend / all.leads : 0
  const allBefore = {
    spend: metaBefore.spend + googleBefore.spend + lsaBefore.spend,
    leads: metaBefore.leads + googleBefore.leads + lsaBefore.leads,
  }
  allBefore.cpl = allBefore.leads > 0 ? allBefore.spend / allBefore.leads : 0
  const spendMix = channelMix({ meta: meta.spend, google: google.spend, lsa: lsa.spend })
  const leadMix = channelMix({ meta: meta.leads, google: google.leads, lsa: lsa.leads })
  const cplBy = [
    { key: 'meta', cpl: meta.leads > 0 ? meta.spend / meta.leads : 0 },
    { key: 'google', cpl: google.cpl },
    { key: 'lsa', cpl: lsa.leads > 0 ? lsa.spend / lsa.leads : 0 },
  ].filter((c) => c.cpl > 0)
  const cplMax = Math.max(...cplBy.map((c) => c.cpl), 1)
  const stacked = useMemo(() => mergeDaily(metaDaily, googleDaily, stackKey), [metaDaily, googleDaily, stackKey])
  const stackMetric = STACK_METRICS.find((m) => m.value === stackKey)

  // ---- Every client, every channel ----------------------------------------
  // A client's row opens their ad page on the channel that carried the most
  // spend in this range, with the same range; the switch there flips it.
  const adsLink = (r) => `/reports/client/${r.id}?channel=${r.google > r.meta ? 'google' : 'meta'}&days=${days}`
  const clientTable = useMemo(() => {
    const by = new Map()
    const row = (id, name) => {
      if (!by.has(id)) by.set(id, { id, name, meta: 0, google: 0, lsa: 0, leads: 0 })
      return by.get(id)
    }
    for (const r of metaNowRows) {
      const x = row(r.client_id, r.clients?.name || 'Unknown')
      x.meta += Number(r.spend) || 0
      x.leads += Number(r.leads) || 0
    }
    for (const r of googleNowRows) {
      const x = row(r.client_id, r.clients?.name || 'Unknown')
      x.google += Number(r.cost) || 0
      x.leads += Number(r.conversions) || 0
    }
    for (const r of clientLsa.filter((k) => k.week_of >= windowMonday)) {
      const x = row(r.client_id, r.clients?.name || 'Unknown')
      x.lsa += Number(r.ad_spend) || 0
      x.leads += Number(r.leads) || 0
    }
    return [...by.values()]
      .map((r) => {
        const spend = r.meta + r.google + r.lsa
        return { ...r, spend, leads: Math.round(r.leads * 10) / 10, cpl: r.leads > 0 ? spend / r.leads : 0 }
      })
      .filter((r) => r.spend > 0 || r.leads > 0)
      .sort((a, b) => b.spend - a.spend || a.name.localeCompare(b.name))
  }, [metaNowRows, googleNowRows, clientLsa, windowMonday])
  const topSpend = Math.max(...clientTable.map((r) => r.spend), 1)

  // Our own businesses: Meta only, as before, never in a total.
  const internalRows = useMemo(() => {
    const by = new Map()
    for (const r of scopedRows.filter((x) => x.clients?.is_internal && x.date >= windowStart)) {
      const x = by.get(r.client_id) || { id: r.client_id, name: r.clients?.name || 'Unknown', spend: 0, leads: 0 }
      x.spend += Number(r.spend) || 0
      x.leads += r.leads || 0
      by.set(r.client_id, x)
    }
    return [...by.values()].map((r) => ({ ...r, cpl: r.leads > 0 ? r.spend / r.leads : 0 })).sort((a, b) => b.spend - a.spend)
  }, [scopedRows, windowStart])

  const actions = (
    <div className="flex min-w-0 max-w-full items-center gap-2 overflow-x-auto pb-1">
      <DarkButton onClick={handleSync} disabled={syncing}>{syncing ? 'Syncing…' : '↻ Sync Meta'}</DarkButton>
      <Segmented options={SCOPES} value={scope} onChange={setScope} />
      <Segmented options={RANGES} value={days} onChange={setDays} />
    </div>
  )

  const channelCards = [
    {
      key: 'meta',
      spend: meta.spend,
      leads: meta.leads,
      cpl: meta.cpl,
      delta: pctChange(meta.spend, metaBefore.spend),
      spark: metaDaily.map((d) => d.spend),
      to: '/reports/meta',
      cta: 'Open full report →',
      note: scope === 'live' ? 'Live ads only · every client, ad, placement' : 'All ads · every client, ad, placement',
    },
    {
      key: 'google',
      spend: google.spend,
      leads: google.leads,
      cpl: google.cpl,
      delta: pctChange(google.spend, googleBefore.spend),
      spark: googleDaily.map((d) => d.spend),
      to: '/reports/google-search',
      cta: 'Open full report →',
      note: 'Every client, campaign, keyword',
    },
    {
      key: 'lsa',
      spend: lsa.spend,
      leads: lsa.leads,
      cpl: lsa.leads > 0 ? lsa.spend / lsa.leads : 0,
      delta: pctChange(lsa.spend, lsaBefore.spend),
      spark: null,
      note: 'Logged weekly on each client page',
    },
  ]

  return (
    <Layout
      tone="dark"
      title="Performance"
      subtitle={`Last ${days} days · every channel · ${money(all.spend)} spend · ${Math.round(all.leads)} leads`}
      actions={actions}
    >
      {error && <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">Error: {error}</div>}
      {syncResult && <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{syncResult}</div>}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-white/[0.04]" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {/* ALL CHANNELS: leads first (asked for 2026-09-29), then spend and cost per lead, then how it splits. */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel className="p-5 lg:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Eyebrow>All channels · leads · last {days} days</Eyebrow>
                  <p className="mt-2 text-5xl font-semibold tracking-tight text-white md:text-6xl">
                    {Math.round(all.leads).toLocaleString('en-US')}
                    <span className="ml-2 text-2xl font-medium text-slate-400 md:text-3xl">{Math.round(all.leads) === 1 ? 'lead' : 'leads'}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{rangeLabel(windowStart, daysAgo(0))}</p>
                  <Delta value={pctChange(all.leads, allBefore.leads)} />
                </div>
                <div className="grid grid-cols-2 gap-6 text-right">
                  <div>
                    <Eyebrow>Ad spend</Eyebrow>
                    <p className="mt-2 text-3xl font-semibold text-white">{money(all.spend)}</p>
                    <Delta value={pctChange(all.spend, allBefore.spend)} align="right" />
                  </div>
                  <div>
                    <Eyebrow>Blended cost / lead</Eyebrow>
                    <p className="mt-2 text-3xl font-semibold text-white">{cplText(all.cpl)}</p>
                    <Delta value={pctChange(all.cpl, allBefore.cpl)} lowerIsBetter align="right" />
                  </div>
                </div>
              </div>
              <div className="mt-6">
                <Eyebrow className="mb-2">Leads by channel</Eyebrow>
                <MixBar mix={leadMix} format={(v) => String(Math.round(v))} />
              </div>
            </Panel>

            <Panel className="p-5">
              <Eyebrow>Spend by channel</Eyebrow>
              <div className="mt-3">
                <MixBar mix={spendMix} format={money} />
              </div>
              <Eyebrow className="mb-2 mt-6">Cost per lead · lower is better</Eyebrow>
              {cplBy.length === 0 ? (
                <p className="text-sm text-slate-500">No leads in this range yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {cplBy.map((c) => (
                    <li key={c.key}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-slate-300"><ChannelDot channel={c.key} />{CHANNELS[c.key].long}</span>
                        <span className="tabular-nums text-white">{cplText(c.cpl)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/5">
                        <span className="block h-full rounded-full" style={{ width: `${(c.cpl / cplMax) * 100}%`, background: CHANNELS[c.key].color }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {/* ONE CARD PER CHANNEL, each in its own colour. */}
          <div className="grid gap-4 md:grid-cols-3">
            {channelCards.map((c) => {
              const body = (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-white">
                      <ChannelDot channel={c.key} size="md" />
                      {CHANNELS[c.key].long}
                    </span>
                    {c.cta && <span className="text-xs font-medium" style={{ color: CHANNELS[c.key].color }}>{c.cta}</span>}
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <Stat label="Spend" value={money(c.spend)} />
                    <Stat label="Leads" value={Math.round(c.leads)} />
                    <Stat label="Cost/lead" value={cplText(c.cpl)} />
                  </div>
                  <div className="mt-3">
                    {c.spark ? <Sparkline values={c.spark} channel={c.key} height={40} /> : <div className="h-10" />}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">{c.note}</span>
                    <Delta value={c.delta} compact />
                  </div>
                </>
              )
              if (c.to?.startsWith('/')) {
                return (
                  <Link key={c.key} to={c.to} className="block rounded-2xl transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2" style={{ '--tw-ring-color': CHANNELS[c.key].color }} aria-label={`${CHANNELS[c.key].long}: open full report`}>
                    <Panel channel={c.key} className="h-full p-5 transition hover:border-white/15">{body}</Panel>
                  </Link>
                )
              }
              if (c.to) {
                return (
                  <a key={c.key} href={c.to} className="block rounded-2xl transition hover:-translate-y-0.5">
                    <Panel channel={c.key} className="h-full p-5 transition hover:border-white/15">{body}</Panel>
                  </a>
                )
              }
              return <Panel key={c.key} channel={c.key} className="p-5">{body}</Panel>
            })}
          </div>

          {/* THE DAILY SPLIT. */}
          <Panel className="p-5">
            <SectionTitle
              title={`${stackMetric.label} by day, by channel`}
              sub="Meta and Google stacked · clients only · LSA is weekly, so it is on the cards above"
              right={<Segmented size="sm" options={STACK_METRICS} value={stackKey} onChange={setStackKey} />}
            />
            <ChannelDailyChart series={stacked} format={stackMetric.format} axis={stackMetric.axis} />
          </Panel>

          {/* EVERY CLIENT, EVERY CHANNEL. */}
          <section>
            <SectionTitle title="Every client" sub="Spend split by channel · biggest first · click a client for their ads" />
            {clientTable.length === 0 ? (
              <Panel className="p-8 text-center text-sm text-slate-500">No spend or leads from any channel in this range.</Panel>
            ) : (
              <DTable>
                <thead>
                  <tr>
                    <DTh>Client</DTh>
                    <DTh className="w-[28%]">Channel split</DTh>
                    <DTh numeric><span className="inline-flex items-center gap-1.5"><ChannelDot channel="meta" />Meta</span></DTh>
                    <DTh numeric><span className="inline-flex items-center gap-1.5"><ChannelDot channel="google" />Google</span></DTh>
                    <DTh numeric><span className="inline-flex items-center gap-1.5"><ChannelDot channel="lsa" />LSA</span></DTh>
                    <DTh numeric>Total</DTh>
                    <DTh numeric>Leads</DTh>
                    <DTh numeric>Cost/lead</DTh>
                  </tr>
                </thead>
                <tbody>
                  {clientTable.map((r) => (
                    <DTr key={r.id} className="cursor-pointer" onClick={(e) => { if (!e.target.closest('a')) navigate(adsLink(r)) }}>
                      <DTd className="whitespace-nowrap">
                        <Link to={adsLink(r)} className="font-medium text-white hover:text-sky-300">{r.name}</Link>
                      </DTd>
                      <DTd>
                        {/* Bar length is the client's total against the
                            biggest client; the segments are its channels. */}
                        <div className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-white/5" style={{ width: `${Math.max(6, (r.spend / topSpend) * 100)}%` }} title={`Meta ${money(r.meta)} · Google ${money(r.google)} · LSA ${money(r.lsa)}`}>
                          {['meta', 'google', 'lsa'].map((k) => r[k] > 0 && (
                            <span key={k} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(r[k] / r.spend) * 100}%`, background: CHANNELS[k].color }} />
                          ))}
                        </div>
                      </DTd>
                      <DTd numeric muted={!r.meta}>{r.meta ? money(r.meta) : '—'}</DTd>
                      <DTd numeric muted={!r.google}>{r.google ? money(r.google) : '—'}</DTd>
                      <DTd numeric muted={!r.lsa}>{r.lsa ? money(r.lsa) : '—'}</DTd>
                      <DTd numeric className="font-semibold text-white">{money(r.spend)}</DTd>
                      <DTd numeric>{Math.round(r.leads * 10) / 10}</DTd>
                      <DTd numeric>{cplText(r.cpl)}</DTd>
                    </DTr>
                  ))}
                </tbody>
              </DTable>
            )}
          </section>

          {internalRows.length > 0 && (
            <section>
              <SectionTitle title="My businesses" sub="Not clients · Meta · left out of every total above" />
              <DTable>
                <thead>
                  <tr>
                    <DTh>Business</DTh>
                    <DTh numeric>Meta spend</DTh>
                    <DTh numeric>Leads</DTh>
                    <DTh numeric>Cost/lead</DTh>
                  </tr>
                </thead>
                <tbody>
                  {internalRows.map((r) => (
                    <DTr key={r.id}>
                      <DTd className="whitespace-nowrap"><Link to={`/client/${r.id}#ad-performance`} className="font-medium text-white hover:text-sky-300">{r.name}</Link></DTd>
                      <DTd numeric>{money(r.spend)}</DTd>
                      <DTd numeric>{r.leads}</DTd>
                      <DTd numeric>{cplText(r.cpl)}</DTd>
                    </DTr>
                  ))}
                </tbody>
              </DTable>
            </section>
          )}

          {/* HOUSEKEEPING: things to act on, not numbers. */}
          <section>
            <SectionTitle title="Housekeeping" sub="Unclaimed ad accounts, the weekly client reports and the monthly report log" />
            <UnmappedAccountsPanel />
            <WeeklyReportsPanel />
            <MonthlyReportsPanel />
          </section>
        </div>
      )}
    </Layout>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-lg font-semibold text-white">{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  )
}

