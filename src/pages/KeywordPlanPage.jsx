import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { SortTable } from '../components/reports/ClientReportParts'
import { DarkButton, Eyebrow, Panel, Pill, SectionTitle, Segmented, Sparkline } from '../components/reports/kit'
import { CHANNELS } from '../lib/channels'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/pagedQuery'
import { readFunctionError } from '../lib/functionError'
import { daysAgo } from '../lib/dailySeries'
import { copyText } from '../lib/intakeSummary'
import { defaultLocations, defaultSeeds } from '../lib/keywordSeeds'
import { ECON, INTENT_META, STANDARD_NEGATIVES, annotate, buildPlan, editorCsv, localIdeas, planText } from '../lib/keywordPlan'

/**
 * The Google Ads keyword builder for one client.
 *
 * Seeds and places come from what the CRM knows (trade, website, intake);
 * Google's planner gives volume, competition and bids inside those places;
 * keywordPlan.js turns that into campaigns by intent, ad groups by service,
 * negatives, and a cost estimate against the client's job value. Until the
 * Cloud project has Basic access, Google refuses the volumes and the plan is
 * built from the seeds alone, with a dash where the numbers would be.
 */
const G = CHANNELS.google.color
const usd = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const int = (n) => Math.round(Number(n || 0)).toLocaleString('en-US')
const vol = (v) => (v == null ? '—' : v === 0 ? '<10' : int(v))

const AFFORD = {
  ok: { label: 'Pays', tone: 'success' },
  tight: { label: 'Tight', tone: 'warning' },
  high: { label: 'Too pricey', tone: 'danger' },
  unknown: { label: '', tone: 'neutral' },
}
const STATUS = {
  running: { label: 'Running', tone: 'info' },
  converting: { label: 'Converting, add it', tone: 'success' },
  wasted: { label: 'Wasted, block it', tone: 'danger' },
}

export default function KeywordPlanPage() {
  const { clientId } = useParams()
  const [client, setClient] = useState(null)
  const [intake, setIntake] = useState(null)
  const [plan, setPlan] = useState(null) // the saved row: seeds, locations, ideas, choices
  const [account, setAccount] = useState({ keywords: [], terms: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [needsAccess, setNeedsAccess] = useState(false)
  const [setupOpen, setSetupOpen] = useState(true)
  const [seeds, setSeeds] = useState([])
  const [places, setPlaces] = useState([])
  const [useSite, setUseSite] = useState(true)
  const [jobValue, setJobValue] = useState('')
  const [draft, setDraft] = useState({ seed: '', place: '' })
  const [excluded, setExcluded] = useState(new Set())
  const [matchOverride, setMatchOverride] = useState({})
  const [minVolume, setMinVolume] = useState(10)
  const [showAll, setShowAll] = useState(false)
  const [copied, setCopied] = useState('')
  const saveTimer = useRef(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const since = daysAgo(89)
    Promise.all([
      supabase.from('clients').select('id,name,industry,market,website_url,website_profile,google_ads_customer_id').eq('id', clientId).maybeSingle(),
      supabase.from('onboarding_intake').select('industry_trade,service_area,target_cities,cta_offering,average_job_value,website').eq('client_id', clientId).maybeSingle(),
      supabase.from('google_keyword_plans').select('*').eq('client_id', clientId).order('generated_at', { ascending: false }).limit(1).maybeSingle(),
      fetchAllRows(() => supabase.from('google_keyword_daily').select('keyword_text,match_type,cost,conversions,clicks').eq('client_id', clientId).gte('date', since).order('id')).catch(() => []),
      fetchAllRows(() => supabase.from('google_search_term_daily').select('search_term,cost,conversions,clicks').eq('client_id', clientId).gte('date', since).order('id')).catch(() => []),
    ])
      .then(([c, i, p, kw, terms]) => {
        if (cancelled) return
        if (c.error) throw c.error
        const cl = c.data
        const it = i.data || null
        setClient(cl)
        setIntake(it)
        setAccount({ keywords: sumBy(kw, 'keyword_text'), terms: sumBy(terms, 'search_term') })
        const d = defaultSeeds({ client: cl, intake: it })
        const L = defaultLocations({ client: cl, intake: it })
        const saved = p.data || null
        setPlan(saved)
        setSeeds(saved?.seeds?.length ? saved.seeds : d.seeds)
        setPlaces(saved?.locations?.length ? saved.locations.map((x) => x.name) : [...new Set([...L.typed, ...L.fromSite].filter(Boolean))].slice(0, 10))
        setUseSite(saved ? Boolean(saved.url) : true)
        setJobValue(saved?.choices?.jobValue ?? it?.average_job_value ?? '')
        setExcluded(new Set(saved?.choices?.excluded || []))
        setMatchOverride(saved?.choices?.match || {})
        setNeedsAccess(Boolean(saved?.choices?.local))
        setSetupOpen(!saved)
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [clientId])

  const trade = useMemo(() => defaultSeeds({ client, intake }).trade, [client, intake])
  const website = intake?.website || client?.website_url || ''

  const generate = async () => {
    setBusy(true)
    setError('')
    try {
      const body = { client_id: clientId, seeds, locations: places, ...(useSite && website ? { url: website } : {}) }
      const { data, error: fnErr } = await supabase.functions.invoke('google-keyword-ideas', { body })
      let row
      if (fnErr) {
        // Read a copy first: readFunctionError consumes the body.
        const parsed = await fnErr?.context?.clone?.().json?.().catch(() => null)
        const { status, detail } = await readFunctionError(fnErr)
        if (status === 403 && parsed?.code === 'needs_basic_access') {
          // Google will not give numbers yet: build from the seeds and towns.
          const ideas = localIdeas(seeds, { towns: places })
          row = await savePlan({ client_id: clientId, seeds, locations: places.map((name) => ({ name, id: '', canonical: name, type: '' })), url: null, ideas, idea_count: ideas.length, choices: { local: true, jobValue } })
          setNeedsAccess(true)
        } else {
          throw new Error(detail || 'The keyword builder did not answer.')
        }
      } else if (data?.error) {
        throw new Error(data.error)
      } else {
        row = { id: data.id, client_id: clientId, seeds: data.seeds, locations: data.locations, url: data.url, ideas: data.ideas, idea_count: data.idea_count, choices: { jobValue }, generated_at: data.generated_at }
        if (data.url_error) setError(`Ideas came back, but the website could not be read: ${data.url_error}`)
        setNeedsAccess(false)
        if (row.id) await supabase.from('google_keyword_plans').update({ choices: row.choices }).eq('id', row.id)
      }
      setPlan(row)
      setExcluded(new Set())
      setMatchOverride({})
      setSetupOpen(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Choices (what is excluded, match overrides, the job value) save a moment
  // after the last click, onto the plan row, so a reload keeps them.
  const persistChoices = (next) => {
    if (!plan?.id) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      supabase.from('google_keyword_plans').update({ choices: { ...(plan.choices || {}), ...next }, updated_at: new Date().toISOString() }).eq('id', plan.id).then(() => {})
    }, 600)
  }

  const annotated = useMemo(
    () =>
      plan
        ? annotate(plan.ideas || [], { trade, clientName: client?.name || '', jobValue: Number(jobValue) || 0, keywords: account.keywords, terms: account.terms, places: plan.locations || [] }).map((a) => ({ ...a, match: matchOverride[a.text] || a.match }))
        : [],
    [plan, trade, client, jobValue, account, matchOverride]
  )
  const built = useMemo(() => (annotated.length ? buildPlan(annotated, { excluded, minVolume }) : null), [annotated, excluded, minVolume])
  const local = Boolean(plan?.choices?.local) || needsAccess

  const toggleExclude = (text) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(text)) next.delete(text)
      else next.add(text)
      persistChoices({ excluded: [...next] })
      return next
    })
  }
  const flipMatch = (a) => {
    const next = { ...matchOverride, [a.text]: a.match === 'exact' ? 'phrase' : 'exact' }
    setMatchOverride(next)
    persistChoices({ match: next })
  }
  const copy = async (key, text) => {
    if (await copyText(text)) {
      setCopied(key)
      setTimeout(() => setCopied(''), 1500)
    }
  }
  const download = () => {
    const blob = new Blob([editorCsv(built)], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(client?.name || 'client').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-google-ads-keywords.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const actions = (
    <div className="flex min-w-0 max-w-full items-center gap-2 overflow-x-auto pb-1">
      {built && (
        <>
          <DarkButton onClick={() => copy('csv', editorCsv(built))}>{copied === 'csv' ? '✓ Copied' : 'Copy for Ads Editor'}</DarkButton>
          <DarkButton onClick={download}>Download CSV</DarkButton>
          <DarkButton onClick={() => copy('text', planText(built, client?.name || ''))}>{copied === 'text' ? '✓ Copied' : 'Copy as text'}</DarkButton>
        </>
      )}
    </div>
  )

  return (
    <Layout tone="dark" title={`${client?.name || 'Client'} · keyword plan`} subtitle={plan ? `Google Ads · ${plan.idea_count} ideas · built ${new Date(plan.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${local ? ' · without Google volumes' : ''}` : 'Google Ads keyword builder'} actions={actions}>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <Link to={`/reports/client/${clientId}?channel=google`} className="text-slate-400 hover:text-white">← Their Google Ads</Link>
        <Link to={`/client/${clientId}`} className="text-slate-400 hover:text-white">Client page →</Link>
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}

      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-white/[0.04]" />
      ) : !client ? (
        <Panel className="p-8 text-center text-sm text-slate-400">No client with that link.</Panel>
      ) : (
        <div className="space-y-5">
          {local && plan && <AccessNotice onRetry={generate} busy={busy} />}

          {/* WHAT TO ASK FOR */}
          <Panel channel="google" className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Eyebrow>What we ask Google for</Eyebrow>
                <p className="mt-1 text-sm text-slate-300">
                  {seeds.length} seed {seeds.length === 1 ? 'search' : 'searches'} for a <span className="text-white">{trade.replace('_', ' and ')}</span> business, in {places.length} {places.length === 1 ? 'place' : 'places'}
                  {useSite && website ? ', plus what their website says' : ''}.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setSetupOpen((v) => !v)} className="text-xs text-slate-400 hover:text-white">{setupOpen ? 'Hide' : 'Edit'}</button>
                <button
                  type="button"
                  onClick={generate}
                  disabled={busy || !seeds.length || !places.length}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-50"
                  style={{ background: G }}
                >
                  {busy ? 'Asking Google…' : plan ? '↻ Build again' : '✦ Build the plan'}
                </button>
              </div>
            </div>

            {setupOpen && (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <ChipEditor
                  label="Seed searches"
                  hint="The trade's core searches plus the services on their site. Add anything they sell that is missing."
                  items={seeds}
                  onRemove={(s) => setSeeds(seeds.filter((x) => x !== s))}
                  draft={draft.seed}
                  onDraft={(v) => setDraft({ ...draft, seed: v })}
                  onAdd={() => {
                    const v = draft.seed.trim().toLowerCase()
                    if (v && !seeds.includes(v)) setSeeds([...seeds, v])
                    setDraft({ ...draft, seed: '' })
                  }}
                  placeholder="add a search, like heat pump rebate"
                />
                <div className="space-y-4">
                  <ChipEditor
                    label="Places (up to 10)"
                    hint="Towns and counties from the intake and their website. Google adds the geography, so seeds stay short."
                    items={places}
                    onRemove={(s) => setPlaces(places.filter((x) => x !== s))}
                    draft={draft.place}
                    onDraft={(v) => setDraft({ ...draft, place: v })}
                    onAdd={() => {
                      const v = draft.place.trim()
                      if (v && !places.includes(v) && places.length < 10) setPlaces([...places, v])
                      setDraft({ ...draft, place: '' })
                    }}
                    placeholder="add a town, like Cary, NC"
                  />
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={useSite && Boolean(website)} disabled={!website} onChange={(e) => setUseSite(e.target.checked)} className="h-4 w-4 rounded" />
                      Read {website ? website.replace(/^https?:\/\//, '') : 'their website'} for more ideas
                    </label>
                    <label className="inline-flex items-center gap-2">
                      Average job value
                      <input
                        value={jobValue}
                        onChange={(e) => {
                          setJobValue(e.target.value)
                          persistChoices({ jobValue: e.target.value })
                        }}
                        placeholder="from intake"
                        inputMode="numeric"
                        className="w-24 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-white"
                      />
                      <span className="text-slate-500">decides what a click may cost</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </Panel>

          {!plan && !busy && (
            <Panel className="p-8 text-center">
              <p className="text-lg font-semibold text-white">No plan yet for {client.name}</p>
              <p className="mt-1 text-sm text-slate-400">Check the seeds and places above, then build. It takes about ten seconds.</p>
            </Panel>
          )}

          {built && (
            <>
              {/* THE NUMBERS */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Tile label="Ideas" value={int(plan.idea_count)} sub={`${built.negatives.length} to block`} />
                <Tile label="In the plan" value={int(built.est.keywords)} sub={`${built.campaigns.length} campaigns · ${built.campaigns.reduce((s, c) => s + c.groups.length, 0)} ad groups`} />
                <Tile label="Monthly searches" value={local ? '—' : int(built.est.searches)} sub={local ? 'needs Google access' : 'in the places above'} />
                <Tile label="Est. monthly spend" value={local ? '—' : `$${int(built.est.spend)}`} sub={local ? 'needs Google access' : `if ads show on ${Math.round(ECON.impressionShare * 100)}% of searches`} />
                <Tile label="Est. leads / month" value={local ? '—' : built.est.leads} sub={local ? 'needs Google access' : `${Math.round(ECON.clickToLead * 100)}% of clicks`} />
                <Tile label="Est. cost per lead" value={local || !built.est.cpl ? '—' : usd(built.est.cpl)} sub={local ? 'needs Google access' : 'at Google\'s average CPC'} />
              </div>

              {/* THE PLAN */}
              <section className="space-y-4">
                <SectionTitle
                  channel="google"
                  title="The plan"
                  sub="Campaigns by what the searcher wants, ad groups by service · untick to drop a keyword · click the match type to flip it"
                  right={
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      Hide under
                      <Segmented size="sm" options={[{ value: 0, label: 'any' }, { value: 10, label: '10' }, { value: 50, label: '50' }, { value: 100, label: '100' }]} value={minVolume} onChange={setMinVolume} />
                      searches
                    </div>
                  }
                />
                {built.campaigns.map((c) => (
                  <Panel key={c.name} className="overflow-hidden">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/[0.06] px-5 py-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{c.name}</p>
                        <p className="text-xs text-slate-500">{INTENT_META[Object.keys(INTENT_META).find((k) => INTENT_META[k].campaign === c.name)]?.note}</p>
                      </div>
                      <p className="text-xs tabular-nums text-slate-400">
                        {c.est.keywords} keywords{local ? '' : ` · ~$${int(c.est.spend)}/mo · ~${c.est.leads} leads`}
                      </p>
                    </div>
                    {c.groups.map((g) => (
                      <div key={g.name} className="border-b border-white/[0.04] last:border-0">
                        <div className="flex items-center justify-between bg-white/[0.02] px-5 py-1.5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ad group · {g.name}</p>
                          <p className="text-[11px] tabular-nums text-slate-500">{g.keywords.length} keywords{local ? '' : ` · ${int(g.est.searches)} searches/mo`}</p>
                        </div>
                        <ul className="divide-y divide-white/[0.04]">
                          {g.keywords.map((k) => (
                            <KeywordRow key={k.text} k={k} local={local} onExclude={() => toggleExclude(k.text)} onMatch={() => flipMatch(k)} />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </Panel>
                ))}
                {built.skipped.length > 0 && (
                  <details className="text-xs text-slate-500">
                    <summary className="cursor-pointer hover:text-slate-300">{built.skipped.length} left out (unticked or under {minVolume} searches)</summary>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {built.skipped.map((k) => (
                        <button key={k.text} type="button" onClick={() => excluded.has(k.text) && toggleExclude(k.text)} className={`rounded-full border border-white/10 px-2 py-0.5 ${excluded.has(k.text) ? 'hover:border-emerald-400/40 hover:text-white' : 'opacity-60'}`} title={excluded.has(k.text) ? 'Put it back' : `${vol(k.volume)} searches`}>
                          {k.text} <span className="text-slate-600">{vol(k.volume)}</span>
                        </button>
                      ))}
                    </div>
                  </details>
                )}
              </section>

              {/* NEGATIVES */}
              <Panel className="p-5">
                <SectionTitle title="Negatives" sub="Searches to block from day one · in the export as negative phrase on every campaign" right={<DarkButton onClick={() => copy('neg', [...built.negatives.map((n) => n.text), ...STANDARD_NEGATIVES].join('\n'))}>{copied === 'neg' ? '✓ Copied' : 'Copy list'}</DarkButton>} />
                {built.negatives.length === 0 ? (
                  <p className="text-sm text-slate-500">Google found nothing junk around these seeds. The standard list still goes in.</p>
                ) : (
                  <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {built.negatives.slice(0, 30).map((n) => (
                      <li key={n.text} className="flex items-baseline gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs">
                        <span className="font-medium text-rose-200">-{n.text}</span>
                        <span className="ml-auto truncate text-slate-500" title={n.why}>{n.why}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-[11px] text-slate-500">Standard list on every home-services account: {STANDARD_NEGATIVES.join(', ')}.</p>
              </Panel>

              {/* EVERYTHING GOOGLE SAID */}
              <section>
                <SectionTitle title={`All ${annotated.length} ideas`} sub="Every idea, sortable · what it means, what it costs, and whether the account already runs it" right={<DarkButton onClick={() => setShowAll((v) => !v)}>{showAll ? 'Hide' : 'Show'}</DarkButton>} />
                {showAll && (
                  <SortTable
                    rows={annotated}
                    rowKey={(r) => r.text}
                    initial={{ key: 'score', dir: 'desc' }}
                    empty="No ideas."
                    columns={[
                      { key: 'text', label: 'Search', className: 'font-medium text-white', render: (r) => <span className={excluded.has(r.text) ? 'line-through text-slate-500' : ''}>{r.text}</span> },
                      { key: 'intent', label: 'Means', render: (r) => <Pill tone={INTENT_META[r.intent].tone} title={r.why || INTENT_META[r.intent].note}>{INTENT_META[r.intent].label}</Pill> },
                      { key: 'line', label: 'Service', muted: true },
                      { key: 'volume', label: 'Searches / mo', numeric: true, render: (r) => vol(r.volume) },
                      { key: 'competitionIndex', label: 'Competition', numeric: true, muted: true, render: (r) => (r.volume == null ? '—' : `${r.competitionIndex}`) },
                      { key: 'avgCpc', label: 'CPC', numeric: true, render: (r) => (r.afford.cpc ? usd(r.afford.cpc) : '—') },
                      { key: 'score', label: 'Score', numeric: true, render: (r) => r.score },
                      { key: 'status', label: 'In account', render: (r) => (STATUS[r.status] ? <Pill tone={STATUS[r.status].tone} title={r.detail}>{STATUS[r.status].label}</Pill> : <span className="text-slate-600">—</span>) },
                    ]}
                  />
                )}
              </section>
            </>
          )}
        </div>
      )}
    </Layout>
  )
}

/** Rows of the same keyword or term added up, for the account overlay. */
function sumBy(rows, key) {
  const by = new Map()
  for (const r of rows || []) {
    const k = String(r[key] || '').toLowerCase()
    if (!k) continue
    const x = by.get(k) || { [key]: r[key], match_type: r.match_type, cost: 0, conversions: 0, clicks: 0 }
    x.cost += Number(r.cost || 0)
    x.conversions += Number(r.conversions || 0)
    x.clicks += Number(r.clicks || 0)
    by.set(k, x)
  }
  return [...by.values()]
}

function Tile({ label, value, sub }) {
  return (
    <Panel className="p-3.5">
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-white tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-slate-500">{sub}</p>}
    </Panel>
  )
}

function ChipEditor({ label, hint, items, onRemove, draft, onDraft, onAdd, placeholder }) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((s) => (
          <span key={s} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs text-slate-200">
            {s}
            <button type="button" onClick={() => onRemove(s)} aria-label={`Remove ${s}`} className="text-slate-500 hover:text-rose-300">×</button>
          </span>
        ))}
        <form
          className="inline-flex"
          onSubmit={(e) => {
            e.preventDefault()
            onAdd()
          }}
        >
          <input value={draft} onChange={(e) => onDraft(e.target.value)} placeholder={placeholder} className="w-56 rounded-full border border-dashed border-white/15 bg-transparent px-2.5 py-0.5 text-xs text-white placeholder:text-slate-600 focus:border-white/30 focus:outline-none" />
        </form>
      </div>
    </div>
  )
}

function KeywordRow({ k, local, onExclude, onMatch }) {
  const a = AFFORD[k.afford.verdict]
  const st = STATUS[k.status]
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2 text-sm hover:bg-white/[0.02]">
      <input type="checkbox" checked onChange={onExclude} aria-label={`Drop ${k.text}`} className="h-4 w-4 rounded" />
      <button type="button" onClick={onMatch} title="Click to flip between exact and phrase match" className="w-14 text-left font-mono text-[11px] text-slate-400 hover:text-white">
        {k.match === 'exact' ? '[exact]' : '"phrase"'}
      </button>
      <span className="min-w-[12rem] flex-1 font-medium text-white">
        {k.text}
        {k.nearMe && <span className="ml-1.5 text-[10px] text-slate-500">near me</span>}
        {k.hasTown && <span className="ml-1.5 text-[10px] text-slate-500">town</span>}
        {k.fromUrl && <span className="ml-1.5 text-[10px] text-emerald-300/70" title="Google took this from their website">site</span>}
      </span>
      <Pill tone={INTENT_META[k.intent].tone} title={INTENT_META[k.intent].note}>{INTENT_META[k.intent].label}</Pill>
      {st && <Pill tone={st.tone} title={k.detail}>{st.label}</Pill>}
      <span className="w-20 text-right tabular-nums text-slate-200" title="Average monthly searches in the places targeted">{vol(k.volume)}</span>
      <span className="hidden w-24 sm:block" title={k.season.peak ? `Peaks ${k.season.peak}${k.season.trend != null ? ` · ${k.season.trend > 0 ? '+' : ''}${k.season.trend}% vs last year` : ''}` : ''}>
        {k.season.values.length >= 6 ? <Sparkline values={k.season.values} channel="google" height={20} /> : <span className="block h-px bg-white/5" />}
      </span>
      <span className="w-24 text-right tabular-nums text-slate-400" title={k.afford.cpc ? `Top of page bids $${k.lowBid.toFixed(2)} to $${k.highBid.toFixed(2)}` : ''}>
        {local || !k.afford.cpc ? '—' : usd(k.afford.cpc)}
      </span>
      <span className="w-20 text-right">{!local && a?.label ? <Pill tone={a.tone} title={`About $${k.afford.cpl.toFixed(0)} a lead at this CPC; worth up to $${k.afford.maxCpl.toFixed(0)} for this kind of job`}>{a.label}</Pill> : null}</span>
    </li>
  )
}

function AccessNotice({ onRetry, busy }) {
  return (
    <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-5 text-sm text-amber-100">
      <p className="font-semibold text-amber-200">Built without Google&apos;s numbers</p>
      <p className="mt-1 text-amber-100/80">
        Google&apos;s Keyword Planner needs our API project on <span className="font-medium text-white">Basic access</span>; it is on Explorer access, which can read accounts but not plan keywords. The plan below is
        built from the trade playbook, the places and their website. Search volumes, CPCs and the cost estimate fill in once access is approved.
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-amber-100/80">
        <li>Sign in to Google Ads as the manager account (270-103-8317).</li>
        <li>Admin (the gear), then API Center.</li>
        <li>Under Access level, click Apply for Basic access and fill in the short form: what the tool does (keyword research and reporting for our own clients), and a contact email.</li>
        <li>Google usually answers within a few business days. Then come back and press Build again.</li>
      </ol>
      <div className="mt-3">
        <DarkButton onClick={onRetry} disabled={busy}>{busy ? 'Asking Google…' : 'Try Google again'}</DarkButton>
      </div>
    </div>
  )
}

async function savePlan(row) {
  const { data, error } = await supabase.from('google_keyword_plans').insert(row).select('*').single()
  if (error) throw error
  return data
}
