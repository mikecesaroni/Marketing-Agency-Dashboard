import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import ChannelDailyChart from '../components/reports/ChannelDailyChart'
import { ChannelDot, DTd, DTh, DTr, Delta, Eyebrow, MixBar, Panel, Pill, SectionTitle, Segmented, Sparkline } from '../components/reports/kit'
import { cn } from '../components/ui/cn'
import { CHANNELS, channelMix, compactMoney, rangeLabel } from '../lib/channels'
import { DEFAULT_DAYS, METRIC_GUIDE, RANGES, VERDICT_LEGEND, adVerdict, adsFor, between, dailySeries, guideFor, latestReport, lsaFor, money, pctChange, previewFrame, returnStory, sumDays, windowFor } from '../lib/clientDashboard'
import { supabase } from '../lib/supabaseClient'

/**
 * A client's own dashboard, from the private token in their link. The same
 * dark surface and pieces as the agency's Reports page, cut down to what an
 * owner needs: the numbers for 7, 30 or 90 days against the period before,
 * by day and by channel, the best ads, and under every number the reason
 * it matters. No login and no agency chrome. Nothing here can change
 * anything; the one action is a link to the weekly report's answer form.
 */

const AGENCY = 'The Working Class Marketing'

const STACK_METRICS = [
  { value: 'leads', label: 'Leads', format: (v) => String(Math.round(v * 10) / 10), axis: (v) => String(v) },
  { value: 'spend', label: 'Spend', format: (v) => money(v), axis: (v) => compactMoney(v) },
]

const fmtLeads = (n) => (Number.isInteger(Number(n)) ? String(n) : Number(n).toFixed(1))
const fmtInt = (n) => Number(n || 0).toLocaleString('en-US')
const cplText = (v) => (v > 0 ? money(v) : 'n/a')
const plural = (n, one, many) => (Number(n) === 1 ? one : many)

function GuideBits({ guide }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[
        ['What it is', guide.what],
        ['Why it matters', guide.why],
        ['What good looks like', guide.good],
        ['What we do with it', guide.we],
      ].map(([title, text]) => (
        <div key={title}>
          <Eyebrow>{title}</Eyebrow>
          <p className="mt-1 text-sm leading-relaxed text-slate-300">{text}</p>
        </div>
      ))}
    </div>
  )
}

/** A number with its change, and a click that opens why it matters. */
function MetricTile({ tile, open, onToggle }) {
  const guide = guideFor(tile.key)
  return (
    <Panel
      as="button"
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="metric-guide"
      data-metric={tile.key}
      className={cn('w-full p-4 text-left transition hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400', open && 'border-sky-400/40')}
    >
      <Eyebrow>{guide.label}</Eyebrow>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{tile.value}</p>
      <Delta value={tile.delta} lowerIsBetter={tile.lowerIsBetter} neutral={tile.neutral} />
      <p className={cn('mt-2 text-[11px] font-medium', open ? 'text-sky-300' : 'text-slate-500')}>{open ? 'Hide' : 'Why it matters'}</p>
    </Panel>
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

function MiniStat({ label, value }) {
  return (
    <div>
      <p className="text-sm font-semibold tabular-nums text-white">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  )
}

/**
 * One ad: the creative (or the video's opening frame with a play button),
 * whether it is working, and its numbers. Tapping the picture opens it full
 * size or plays the video.
 */
function AdCard({ ad, creative, ready, verdict, onOpen }) {
  const image = creative?.image || creative?.thumb || null
  const canOpen = Boolean(image || creative?.video)
  const kind = creative?.kind === 'video' ? 'Video' : creative?.kind === 'image' ? 'Image' : ad.channel === 'google' ? 'Search ad' : ''
  return (
    <Panel className="overflow-hidden" data-ad-card={ad.name} data-verdict={verdict.key}>
      <button
        type="button"
        onClick={onOpen}
        disabled={!canOpen}
        aria-label={`${creative?.kind === 'video' ? 'Play' : 'View'} ${ad.name}`}
        className="relative block aspect-[4/5] w-full bg-[#0b1220] text-left disabled:cursor-default"
      >
        {/* The whole creative, whatever its shape: a square or a story ad
            sits inside the frame rather than being cropped to it. */}
        {image ? (
          <img src={image} alt="" loading="lazy" className="h-full w-full object-contain" />
        ) : (
          <div className={cn('flex h-full items-center justify-center px-4 text-center text-xs text-slate-500', !ready && 'animate-pulse')}>
            {!ready ? '' : ad.channel === 'google' ? 'A Google Search ad: words, no picture' : 'Preview not available'}
          </div>
        )}
        {creative?.kind === 'video' && (
          <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 pl-1 text-2xl text-white ring-2 ring-white/70">▶</span>
          </span>
        )}
        <span className="absolute left-2 top-2">
          <Pill tone={verdict.tone} title={verdict.note}>
            {verdict.label}
          </Pill>
        </span>
      </button>
      <div className="p-3">
        <p className="truncate text-sm font-semibold text-white" title={ad.name}>
          {ad.name}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
          <ChannelDot channel={ad.channel} />
          {CHANNELS[ad.channel]?.long}
          {kind ? ` · ${kind}` : ''}
        </p>
        <div className="mt-3 grid grid-cols-4 gap-1">
          <MiniStat label="Leads" value={fmtLeads(ad.leads)} />
          <MiniStat label="Spend" value={money(ad.spend)} />
          <MiniStat label="Per lead" value={cplText(ad.cpl)} />
          <MiniStat label="Click rate" value={ad.impressions > 0 ? `${ad.ctr}%` : 'n/a'} />
        </div>
        <p className="mt-2 text-[11px] leading-snug text-slate-500">{verdict.note}</p>
      </div>
    </Panel>
  )
}

export default function ClientDashboardPage() {
  const { token } = useParams()
  const [params, setParams] = useSearchParams()
  const days = RANGES.some((r) => r.value === Number(params.get('days'))) ? Number(params.get('days')) : DEFAULT_DAYS
  const setDays = (d) => setParams({ days: String(d) }, { replace: true })

  const [data, setData] = useState(undefined)
  const [error, setError] = useState('')
  const [openMetric, setOpenMetric] = useState(null)
  const [openTerm, setOpenTerm] = useState(null)
  const [stackKey, setStackKey] = useState('leads')
  const [creatives, setCreatives] = useState(new Map())
  const [creativesReady, setCreativesReady] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  // Meta's rendered preview, asked for when a video's own file is not
  // readable: { adId, frame | null, loading }.
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    supabase
      .rpc('client_dashboard_load', { p_token: token })
      .then(({ data: row, error: err }) => {
        if (err) {
          setError(err.message)
          setData(null)
          return
        }
        setData(row || null)
      })
  }, [token])

  // What the ads look like. Meta's picture and video links are signed and
  // expire, so they are fetched when the page opens, after the numbers.
  useEffect(() => {
    if (!data) return
    let alive = true
    setCreativesReady(false)
    supabase.functions
      .invoke('client-dashboard', { body: { token } })
      .then(({ data: res }) => {
        if (!alive) return
        setCreatives(new Map(((res && res.creatives) || []).map((c) => [String(c.ad_id), c])))
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setCreativesReady(true)
      })
    return () => {
      alive = false
    }
  }, [data, token])

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e) => {
      if (e.key === 'Escape') setLightbox(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  useEffect(() => {
    const c = lightbox?.creative
    if (!lightbox || c?.kind !== 'video' || c?.video) {
      setPreview(null)
      return
    }
    const adId = String(lightbox.ad.key)
    let alive = true
    setPreview({ adId, frame: null, loading: true })
    supabase.functions
      .invoke('client-dashboard', { body: { token, action: 'preview', ad_id: adId } })
      .then(({ data: res }) => {
        if (alive) setPreview({ adId, frame: previewFrame(res?.iframe), loading: false })
      })
      .catch(() => {
        if (alive) setPreview({ adId, frame: null, loading: false })
      })
    return () => {
      alive = false
    }
  }, [lightbox, token])

  // The page is dark to the edges, including the overscroll on a phone, and
  // the tab is named for the client, not the CRM.
  useEffect(() => {
    const was = document.body.style.background
    const title = document.title
    document.body.style.background = '#070b14'
    document.title = data?.client?.name ? `KPI Dashboard for ${data.client.name}` : 'KPI Dashboard'
    return () => {
      document.body.style.background = was
      document.title = title
    }
  }, [data])

  const win = useMemo(() => windowFor(days), [days])
  const rows = useMemo(() => data?.days || [], [data])
  const now = useMemo(() => sumDays(between(rows, win.from, win.to)), [rows, win])
  const before = useMemo(() => sumDays(between(rows, win.prevFrom, win.prevTo)), [rows, win])
  const lsa = useMemo(() => lsaFor(data?.lsa, win.from, win.to), [data, win])
  const lsaBefore = useMemo(() => lsaFor(data?.lsa, win.prevFrom, win.prevTo), [data, win])
  const series = useMemo(() => dailySeries(rows, win.from, win.to, stackKey), [rows, win, stackKey])
  const spendSeries = useMemo(() => dailySeries(rows, win.from, win.to, 'spend'), [rows, win])
  const ads = useMemo(() => adsFor(data?.ads, days), [data, days])
  const story = useMemo(() => returnStory(data?.weeks), [data])
  const latest = latestReport(data?.weeks)

  if (data === undefined) return <div className="min-h-screen bg-[#070b14] p-6 text-sm text-slate-400">Loading your dashboard…</div>
  if (data === null)
    return (
      <div className="min-h-screen bg-[#070b14] p-6">
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-[#0f1626] p-6 text-sm text-slate-300">
          This link is not valid or has been replaced. Reply to your weekly email and we will send a fresh one.
          {error && <p className="mt-2 text-xs text-slate-500">{error}</p>}
        </div>
      </div>
    )

  // LSA is weekly and has no impressions, so it joins spend, leads and cost
  // per lead but not the showings and clicks.
  const all = { spend: now.spend + lsa.spend, leads: now.leads + lsa.leads }
  all.cpl = all.leads > 0 ? all.spend / all.leads : 0
  const allBefore = { spend: before.spend + lsaBefore.spend, leads: before.leads + lsaBefore.leads }
  allBefore.cpl = allBefore.leads > 0 ? allBefore.spend / allBefore.leads : 0
  const hasData = rows.length > 0 || (data.lsa || []).length > 0

  const tiles = [
    { key: 'spend', value: money(all.spend), delta: pctChange(all.spend, allBefore.spend), neutral: true },
    { key: 'leads', value: fmtLeads(Math.round(all.leads * 10) / 10), delta: pctChange(all.leads, allBefore.leads) },
    { key: 'cpl', value: cplText(all.cpl), delta: all.cpl > 0 ? pctChange(all.cpl, allBefore.cpl) : null, lowerIsBetter: true },
    { key: 'impressions', value: fmtInt(now.impressions), delta: pctChange(now.impressions, before.impressions) },
    { key: 'clicks', value: fmtInt(now.clicks), delta: pctChange(now.clicks, before.clicks) },
    { key: 'ctr', value: `${now.ctr}%`, delta: pctChange(now.ctr, before.ctr) },
  ]
  const openGuide = openMetric ? guideFor(openMetric) : null

  const channelCards = [
    data.channels?.meta || now.meta.spend > 0
      ? { key: 'meta', spend: now.meta.spend, leads: now.meta.leads, cpl: now.meta.cpl, delta: pctChange(now.meta.spend, before.meta.spend), spark: spendSeries.map((d) => d.meta), note: 'Facebook and Instagram' }
      : null,
    data.channels?.google || now.google.spend > 0
      ? { key: 'google', spend: now.google.spend, leads: now.google.leads, cpl: now.google.cpl, delta: pctChange(now.google.spend, before.google.spend), spark: spendSeries.map((d) => d.google), note: 'Google Search' }
      : null,
    (data.lsa || []).length > 0 ? { key: 'lsa', spend: lsa.spend, leads: lsa.leads, cpl: lsa.cpl, delta: pctChange(lsa.spend, lsaBefore.spend), spark: null, note: 'Logged by the week' } : null,
  ].filter(Boolean)

  const leadMix = channelMix({ meta: now.meta.leads, google: now.google.leads, lsa: lsa.leads })
  const spendMix = channelMix({ meta: now.meta.spend, google: now.google.spend, lsa: lsa.spend })
  const stackMetric = STACK_METRICS.find((m) => m.value === stackKey)
  const exampleJobs = Math.max(1, Math.round(all.leads / 5))
  const avgJob = Number(data.avg_job_value || 0) > 0 ? Number(data.avg_job_value) : null
  const returnGuide = guideFor('return')

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-200" data-client-dashboard>
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            {/* The agency's mark. Dark on off-white by design, so it sits on
                its own plate rather than being recoloured for the dark page. */}
            <div className="mb-4 inline-block rounded-xl bg-[#f8f7f5] px-3 py-2 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.8)]">
              <img src="/brand/wc-logo.jpg" alt="The Working Class" className="h-16 w-auto" data-brand-logo />
            </div>
            <Eyebrow>Your ads dashboard</Eyebrow>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white md:text-4xl">{data.client?.name}</h1>
            <p className="mt-1 text-sm text-slate-400">
              Straight from your ad accounts, refreshed every morning. Showing {rangeLabel(win.from, win.to)}, compared with the {days} days before.
            </p>
          </div>
          <Segmented options={RANGES} value={days} onChange={setDays} />
        </header>

        {!hasData && (
          <Panel className="mt-6 p-5 text-sm text-slate-300">No ad data yet. Numbers appear here the morning after the first ad runs.</Panel>
        )}

        <div className="mt-6 space-y-6">
          {/* THE HEADLINE: leads, then what they cost. */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel className="p-5 lg:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Eyebrow>Leads · last {days} days</Eyebrow>
                  <p className="mt-2 text-5xl font-semibold tracking-tight text-white md:text-6xl">
                    {fmtLeads(Math.round(all.leads * 10) / 10)}
                    <span className="ml-2 text-2xl font-medium text-slate-400 md:text-3xl">{plural(Math.round(all.leads), 'lead', 'leads')}</span>
                  </p>
                  <Delta value={pctChange(all.leads, allBefore.leads)} />
                </div>
                <div className="grid grid-cols-2 gap-6 text-right">
                  <div>
                    <Eyebrow>Ad spend</Eyebrow>
                    <p className="mt-2 text-3xl font-semibold text-white">{money(all.spend)}</p>
                    <Delta value={pctChange(all.spend, allBefore.spend)} align="right" neutral />
                  </div>
                  <div>
                    <Eyebrow>Cost per lead</Eyebrow>
                    <p className="mt-2 text-3xl font-semibold text-white">{cplText(all.cpl)}</p>
                    <Delta value={all.cpl > 0 ? pctChange(all.cpl, allBefore.cpl) : null} lowerIsBetter align="right" />
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
              <Eyebrow className="mb-2 mt-6">In one line</Eyebrow>
              <p className="text-sm leading-relaxed text-slate-300">
                {all.leads > 0
                  ? `${fmtLeads(Math.round(all.leads * 10) / 10)} ${plural(Math.round(all.leads), 'lead', 'leads')} from ${money(all.spend)} in ads, ${cplText(all.cpl)} each.`
                  : `${money(all.spend)} in ads and no leads yet in this range.`}{' '}
                {story.answered > 0
                  ? `Over the ${story.answered} ${plural(story.answered, 'week', 'weeks')} you have told us about, that spend came back ${money(story.back)} for every $1.`
                  : 'Tell us how the leads do each week and this line shows your return on the ads.'}
              </p>
            </Panel>
          </div>

          {/* EVERY NUMBER, with the reason it matters one click away. */}
          <section>
            <SectionTitle title="The numbers" sub="Click any number to see what it means and why it matters" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {tiles.map((t) => (
                <MetricTile key={t.key} tile={t} open={openMetric === t.key} onToggle={() => setOpenMetric(openMetric === t.key ? null : t.key)} />
              ))}
            </div>
            {openGuide && (
              <Panel id="metric-guide" className="mt-3 p-5" data-metric-guide={openGuide.key}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold text-white">{openGuide.label}</h3>
                  <button type="button" onClick={() => setOpenMetric(null)} className="text-xs text-slate-400 hover:text-white">
                    Close
                  </button>
                </div>
                <div className="mt-4">
                  <GuideBits guide={openGuide} />
                </div>
              </Panel>
            )}
          </section>

          {/* BY DAY, BY CHANNEL. */}
          <Panel className="p-5">
            <SectionTitle
              title={`${stackMetric.label} by day`}
              sub="Meta and Google stacked, so each day shows which channel carried it"
              right={<Segmented size="sm" options={STACK_METRICS} value={stackKey} onChange={setStackKey} />}
            />
            <ChannelDailyChart series={series} format={stackMetric.format} axis={stackMetric.axis} />
          </Panel>

          {/* ONE CARD PER CHANNEL. */}
          {channelCards.length > 0 && (
            <div className="grid gap-4 md:grid-cols-3">
              {channelCards.map((c) => (
                <Panel key={c.key} channel={c.key} className="p-5" data-channel-card={c.key}>
                  <span className="flex items-center gap-2 text-sm font-semibold text-white">
                    <ChannelDot channel={c.key} size="md" />
                    {CHANNELS[c.key].long}
                  </span>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <Stat label="Spend" value={money(c.spend)} />
                    <Stat label="Leads" value={fmtLeads(Math.round(c.leads * 10) / 10)} />
                    <Stat label="Cost per lead" value={cplText(c.cpl)} />
                  </div>
                  <div className="mt-3">{c.spark ? <Sparkline values={c.spark} channel={c.key} height={40} /> : <div className="h-10" />}</div>
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">{c.note}</span>
                    <Delta value={c.delta} compact neutral />
                  </div>
                </Panel>
              ))}
            </div>
          )}

          {/* THE ADS THEMSELVES: the creative, whether it is working, the numbers. */}
          <section data-ads>
            <SectionTitle title="Your ads" sub={`Every ad that ran in the last ${days} days, most leads first. Tap one to see it full size or play it.`} />
            {ads.length === 0 ? (
              <Panel className="p-6 text-sm text-slate-400">No ads ran in this range.</Panel>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {ads.map((a) => (
                    <AdCard
                      key={`${a.channel}:${a.key}`}
                      ad={a}
                      creative={creatives.get(String(a.key))}
                      ready={creativesReady}
                      verdict={adVerdict(a, all.cpl)}
                      onOpen={() => setLightbox({ ad: a, creative: creatives.get(String(a.key)) })}
                    />
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-500">{VERDICT_LEGEND}</p>
              </>
            )}
          </section>

          {/* THE NUMBER THAT MATTERS MOST. */}
          <Panel className="p-5" data-return-panel>
            <SectionTitle title="The number that matters most" sub="Dollars back for every dollar spent" />
            {story.answered > 0 ? (
              <div className="grid gap-5 md:grid-cols-3">
                <div>
                  <p className="text-5xl font-semibold tracking-tight text-white">
                    {money(story.back)}
                    <span className="ml-2 text-xl font-medium text-slate-400">back per $1</span>
                  </p>
                  <p className="mt-2 text-sm text-slate-300">
                    From the {story.answered} {plural(story.answered, 'week', 'weeks')} you told us about: {story.jobs} {plural(story.jobs, 'job', 'jobs')} worth {money(story.revenue)} from {money(story.spend)} in ads.
                  </p>
                </div>
                <div className="md:col-span-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <DTh>Week</DTh>
                        <DTh numeric>Spend</DTh>
                        <DTh numeric>Leads</DTh>
                        <DTh numeric>Jobs</DTh>
                        <DTh numeric>Worth</DTh>
                        <DTh numeric>Back per $1</DTh>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.weeks || []).slice(0, 8).map((w) => (
                        <DTr key={w.week_start}>
                          <DTd className="whitespace-nowrap">{rangeLabel(w.week_start, w.week_end)}</DTd>
                          <DTd numeric>{money(w.spend)}</DTd>
                          <DTd numeric>{fmtLeads(w.leads)}</DTd>
                          <DTd numeric muted={!w.answered_at}>{w.answered_at ? (w.jobs_booked ?? 0) : 'not told yet'}</DTd>
                          <DTd numeric muted={!w.answered_at}>{w.answered_at && Number(w.revenue) > 0 ? money(w.revenue) : w.answered_at ? 'n/a' : ''}</DTd>
                          <DTd numeric className="font-semibold text-white">
                            {Number(w.revenue) > 0 && Number(w.spend) > 0 ? money(Math.round((Number(w.revenue) / Number(w.spend)) * 100) / 100) : ''}
                          </DTd>
                        </DTr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2 text-sm leading-relaxed text-slate-300">
                  <p>Cheap leads are not the goal. Booked jobs are.</p>
                  <p>Cost per lead tells us the ads are working. It cannot tell us the leads were worth having. Only you know that, because you know which ones booked and what they paid.</p>
                  {all.leads > 0 && (
                    <p className="rounded-lg border-l-2 border-sky-400 bg-sky-400/10 px-3 py-2 text-slate-200">
                      {avgJob
                        ? `For this range: if ${exampleJobs} of the ${fmtLeads(Math.round(all.leads * 10) / 10)} leads ${plural(exampleJobs, 'becomes', 'become')} a job at your usual ${money(avgJob)}, that is ${money(exampleJobs * avgJob)} of work from ${money(all.spend)} in ads.`
                        : `For this range: if ${exampleJobs} of the ${fmtLeads(Math.round(all.leads * 10) / 10)} leads ${plural(exampleJobs, 'becomes', 'become')} a job, what is that worth to you? Compare it with the ${money(all.spend)} the ads cost.`}
                    </p>
                  )}
                </div>
                <div>
                  <GuideBits guide={returnGuide} />
                </div>
              </div>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {latest ? (
                <a href={`/report/${latest.token}`} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-200" data-answer-link>
                  Tell us how last week&apos;s leads did
                </a>
              ) : (
                <span className="text-sm text-slate-400">Your first weekly report arrives on Monday with a form for this.</span>
              )}
              <span className="text-xs text-slate-500">Takes 20 seconds. Rough numbers are fine.</span>
            </div>
          </Panel>

          {/* WHAT EACH NUMBER MEANS. */}
          <section data-glossary>
            <SectionTitle title="What each number means" sub="Click a term to open it" />
            <Panel>
              {METRIC_GUIDE.map((g) => {
                const open = openTerm === g.key
                return (
                  <div key={g.key} className="border-b border-white/[0.06] last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setOpenTerm(open ? null : g.key)}
                      aria-expanded={open}
                      className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition hover:bg-white/[0.03]"
                    >
                      <span className="text-sm font-semibold text-white">{g.label}</span>
                      <span className="text-xs text-slate-500">{open ? 'Hide' : 'Why it matters'}</span>
                    </button>
                    {open && (
                      <div className="px-5 pb-5">
                        <GuideBits guide={g} />
                      </div>
                    )}
                  </div>
                )
              })}
            </Panel>
          </section>

          <footer className="px-1 pb-6 text-xs leading-relaxed text-slate-500">
            These numbers come straight from your ad accounts and refresh every morning. Questions? Reply to your Monday email and a real person answers.
            <div className="mt-1 text-slate-600">{AGENCY}</div>
          </footer>
        </div>
      </div>

      {/* FULL SIZE: the picture, or the video playing. */}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setLightbox(null)} role="dialog" aria-modal="true" aria-label={lightbox.ad.name} data-lightbox>
          <div className="max-h-full w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm text-slate-200">
              <span className="truncate font-semibold">{lightbox.ad.name}</span>
              <button type="button" onClick={() => setLightbox(null)} className="rounded-lg border border-white/20 px-3 py-1 text-xs hover:bg-white/10">
                Close
              </button>
            </div>
            {lightbox.creative?.video ? (
              <video src={lightbox.creative.video} poster={lightbox.creative.image || undefined} controls autoPlay playsInline className="max-h-[80vh] w-full rounded-xl bg-black" />
            ) : preview?.frame ? (
              <div className="flex max-h-[85vh] justify-center overflow-y-auto rounded-xl">
                {/* Meta's player at its own size; a short screen scrolls it
                    rather than cutting it off. */}
                <iframe
                  title={`${lightbox.ad.name} preview`}
                  src={preview.frame.src}
                  width={preview.frame.width}
                  height={preview.frame.height}
                  allow="autoplay; encrypted-media; fullscreen"
                  className="max-w-full rounded-xl border-0 bg-white"
                  data-preview-frame
                />
              </div>
            ) : (
              <img src={lightbox.creative?.image || lightbox.creative?.thumb} alt={lightbox.ad.name} className="max-h-[80vh] w-full rounded-xl object-contain" />
            )}
            {lightbox.creative?.kind === 'video' && !lightbox.creative?.video && preview?.loading && (
              <p className="mt-2 text-xs text-slate-400">Loading the player…</p>
            )}
            {lightbox.creative?.kind === 'video' && !lightbox.creative?.video && preview && !preview.loading && !preview.frame && (
              <p className="mt-2 text-xs text-slate-400">The video could not be fetched just now. This is its opening frame.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
