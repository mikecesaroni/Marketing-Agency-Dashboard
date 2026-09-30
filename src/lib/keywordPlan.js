// Google's raw keyword ideas into a plan somebody can put in an account:
// what each search means (intent), which service it is about, whether it
// is worth bidding on for this client, how to group it, what to block, and
// what it would cost.
//
// Google's planner gives volume, competition and bid ranges. It does not
// know the difference between "ac repair near me" and "ac repair jobs", or
// that a $40 click is fine for a $9,000 install and ruinous for a $150
// tune-up. That is what this file adds.
//
// Pure: scripts/check-keyword-plan.mjs imports it.

import { JUNK_PATTERNS } from './googleSearchRules.js'

// ---- what a search means ----------------------------------------------------

const INTENTS = [
  ['emergency', /\b(emergency|24 ?hour|24\/7|same day|after hours|urgent|asap|weekend|tonight|right now|no (heat|ac|hot water|power)|not (working|cooling|heating|turning on)|stopped working|broke|broken|leaking|leak|burst|flooding|clogged|backed up|won'?t (start|turn on|drain)|blowing (warm|hot|cold) air|tripping)\b/i],
  ['repair', /\b(repair|fix|fixing|service call|troubleshoot|diagnos|problem|issue|making noise|smell)\b/i],
  ['cost', /\b(cost|costs|price|prices|pricing|estimate|quote|how much|affordable|cheap|financing|rebate|special|coupon|deal|discount)\b/i],
  ['install', /\b(install|installation|installer|replace|replacement|new (ac|unit|system|furnace|roof|water heater|panel|heat pump)|upgrade|conversion|convert|build|builder|remodel|renovation|addition|finishing)\b/i],
  ['maintenance', /\b(tune.?up|maintenance|inspection|cleaning|clean|check.?up|checkup|flush|service plan|membership|seasonal|winteriz|spring start|opening|closing)\b/i],
  ['company', /\b(company|companies|contractor|contractors|near me|nearby|local|best|top|rated|reviews|licensed|insured|residential|commercial|24 hour)\b/i],
]

/** Searches that are never a customer: reuse the search-term junk list. */
export function excludeReason(text) {
  for (const { re, why } of JUNK_PATTERNS) if (re.test(text)) return why
  if (/\b(what is|what does|why (is|does)|how (does|do|long|often|to)|meaning|definition|vs\.?|versus|difference|symptoms|reddit|forum|calculator|diagram|code|codes|warranty claim|recall|lawsuit|rent|rental|lease)\b/i.test(text)) return 'someone reading, not buying'
  if (/\b(amazon|home depot|lowe'?s|walmart|ebay|craigslist|facebook marketplace)\b/i.test(text)) return 'someone shopping at a store'
  return ''
}

/**
 * The intent of a search, in order of how sure we are: a plain "plumber"
 * is a company search; "emergency plumber" is an emergency; "how to fix a
 * leaky faucet" is excluded before it gets here.
 */
export function classifyIntent(text) {
  const t = String(text || '').toLowerCase()
  const why = excludeReason(t)
  if (why) return { intent: 'exclude', why }
  for (const [intent, re] of INTENTS) if (re.test(t)) return { intent }
  return { intent: 'company' }
}

export const INTENT_META = {
  emergency: { label: 'Emergency', weight: 1.0, campaign: 'Emergency & Repair', tone: 'danger', note: 'Needs it today. Highest close rate, worth the top bid.' },
  repair: { label: 'Repair', weight: 0.9, campaign: 'Emergency & Repair', tone: 'warning', note: 'Something is wrong. Strong intent, steady volume.' },
  install: { label: 'Install / replace', weight: 1.0, campaign: 'Installation & Replacement', tone: 'success', note: 'The big ticket. Fewer searches, biggest jobs.' },
  cost: { label: 'Pricing', weight: 0.8, campaign: 'Installation & Replacement', tone: 'info', note: 'Comparing prices. Usually a replacement in the making.' },
  maintenance: { label: 'Maintenance', weight: 0.55, campaign: 'Maintenance & Tune-ups', tone: 'info', note: 'Planned work. Cheaper clicks, smaller jobs, feeds the membership.' },
  company: { label: 'Looking for a company', weight: 0.85, campaign: 'Core Services', tone: 'neutral', note: 'Ready to pick someone. Broad, high volume.' },
  brand: { label: 'Brand', weight: 0.3, campaign: 'Brand', tone: 'neutral', note: 'Already looking for them. Cheap to own, easy to lose to a competitor.' },
  exclude: { label: 'Do not bid', weight: 0, campaign: '', tone: 'neutral', note: 'Not a customer.' },
}

// ---- which service it is about ----------------------------------------------

const LINES = {
  hvac: [
    ['Heat pumps', /\b(heat pump)\b/i],
    ['Air conditioning', /\b(ac|a\/c|air condition\w*|cooling|condenser|central air)\b/i],
    ['Heating & furnace', /\b(heat(ing|er)?|furnace|boiler|no heat)\b/i],
    ['Mini splits', /\b(mini.?split|ductless)\b/i],
    ['Air quality & ducts', /\b(duct|air quality|humidif|purif|filtration|ventilation)\b/i],
    ['Thermostats', /\b(thermostat|nest|ecobee)\b/i],
    ['HVAC', /\b(hvac)\b/i],
  ],
  plumbing: [
    ['Water heaters', /\b(water heater|tankless|hot water)\b/i],
    ['Drains & sewer', /\b(drain|sewer|clog|hydro.?jet|camera inspection|root)\b/i],
    ['Leaks & pipes', /\b(leak|pipe|slab|repip|burst)\b/i],
    ['Fixtures', /\b(toilet|faucet|sink|shower|tub|garbage disposal|fixture)\b/i],
    ['Gas lines', /\b(gas line|gas leak)\b/i],
    ['Water treatment', /\b(softener|filtration|filter|reverse osmosis|water treatment)\b/i],
    ['Plumbing', /\b(plumb\w*)\b/i],
  ],
  water: [
    ['Softeners', /\b(softener|hard water)\b/i],
    ['Filtration', /\b(filter|filtration|reverse osmosis|purif)\b/i],
    ['Testing', /\b(test|testing)\b/i],
    ['Well water', /\b(well|iron|sulfur)\b/i],
  ],
  roofing: [
    ['Roof repair', /\b(repair|leak|patch|storm|hail|wind)\b/i],
    ['Roof replacement', /\b(replace\w*|new roof|install\w*|re-?roof)\b/i],
    ['Metal roofing', /\b(metal|standing seam)\b/i],
    ['Gutters', /\b(gutter)\b/i],
    ['Roofing', /\b(roof\w*)\b/i],
  ],
  electrical: [
    ['Panels', /\b(panel|breaker|200 amp|fuse box)\b/i],
    ['EV chargers', /\b(ev|charger|tesla)\b/i],
    ['Generators', /\b(generator|generac)\b/i],
    ['Lighting & outlets', /\b(light\w*|outlet|switch|ceiling fan|wiring|rewire)\b/i],
    ['Electrical', /\b(electric\w*)\b/i],
  ],
  washing: [
    ['House washing', /\b(house|siding|soft wash)\b/i],
    ['Driveways & concrete', /\b(driveway|concrete|sidewalk|patio)\b/i],
    ['Roof & gutters', /\b(roof|gutter)\b/i],
    ['Decks & fences', /\b(deck|fence)\b/i],
    ['Pressure washing', /\b(pressure|power) wash\w*/i],
  ],
  lawn: [
    ['Mowing', /\b(mow\w*|lawn care|lawn service)\b/i],
    ['Treatments', /\b(fertiliz\w*|weed|treatment|aerat\w*|seed\w*)\b/i],
    ['Landscaping', /\b(landscap\w*|mulch|sod|plant\w*|design)\b/i],
    ['Irrigation', /\b(irrigation|sprinkler)\b/i],
    ['Trees & cleanup', /\b(tree|leaf|leaves|cleanup|clean up)\b/i],
  ],
  pool: [
    ['Cleaning & service', /\b(clean\w*|service|maintenance|weekly|green)\b/i],
    ['Repairs', /\b(repair|pump|heater|filter|leak)\b/i],
    ['Opening & closing', /\b(open\w*|clos\w*|winteriz\w*)\b/i],
    ['Pool', /\b(pool)\b/i],
  ],
  pest: [
    ['Termites', /\b(termite)\b/i],
    ['Rodents & wildlife', /\b(rodent|mice|mouse|rat|wildlife|raccoon|squirrel)\b/i],
    ['Insects', /\b(ant|roach|cockroach|spider|bed bug|wasp|bee|mosquito|flea|tick)\w*\b/i],
    ['Pest control', /\b(pest|exterminat\w*)\b/i],
  ],
  appliance: [
    ['Refrigerators', /\b(refrigerator|fridge|freezer|ice maker)\b/i],
    ['Laundry', /\b(washer|dryer|washing machine)\b/i],
    ['Kitchen', /\b(dishwasher|oven|stove|range|microwave)\b/i],
    ['Appliance repair', /\b(appliance)\b/i],
  ],
  remodel: [
    ['Kitchens', /\b(kitchen)\b/i],
    ['Bathrooms', /\b(bath\w*)\b/i],
    ['Basements', /\b(basement)\b/i],
    ['Additions & decks', /\b(addition|deck|porch|garage)\b/i],
    ['Exterior', /\b(siding|window|door|roof)\b/i],
    ['General contracting', /\b(contractor|construction|remodel\w*|renovat\w*|builder)\b/i],
  ],
  general: [],
}

/** The service line a search belongs to for this trade, or 'Other'. */
export function serviceLine(text, trade) {
  const lines = LINES[trade] || []
  for (const [name, re] of lines) if (re.test(text)) return name
  // The trade's own general bucket comes last in each list; anything else is Other.
  return 'Other'
}

// ---- is it worth it for this client -------------------------------------------

// What a click has to convert at to make sense. Search leads in home
// services land a booked job around a third of the time, and a good landing
// page turns about one click in ten into a lead. Deliberately plain numbers
// the page shows, not hidden constants.
export const ECON = {
  // Search traffic to a call-first landing page: about one click in seven
  // becomes a lead.
  clickToLead: 0.15,
  leadToJob: 0.35,
  // A lead is worth spending up to a fifth of the job on. Generous on
  // purpose: a repair call often turns into the replacement.
  maxCplShareOfJob: 0.2,
  // The share of searches a strong ad wins as clicks, for the budget estimate.
  impressionShare: 0.35,
  ctr: 0.08,
}

/** Typical job value for an intent when the intake has none. */
export const JOB_VALUE_BY_INTENT = { emergency: 700, repair: 650, install: 8000, cost: 6000, maintenance: 250, company: 900, brand: 900, exclude: 0 }

/**
 * Cost per lead if paid at Google's top-of-page bid, against what a lead is
 * worth for this kind of job. 'ok' means the numbers work, 'tight' means it
 * only works on a big ticket, 'high' means it does not.
 */
export function affordability(idea, intent, jobValue) {
  const cpc = idea.avgCpc || (idea.lowBid + idea.highBid) / 2 || 0
  const cpl = cpc > 0 ? cpc / ECON.clickToLead : 0
  const job = jobValue || JOB_VALUE_BY_INTENT[intent] || 500
  const maxCpl = job * ECON.maxCplShareOfJob
  const ratio = maxCpl > 0 ? cpl / maxCpl : 0
  return { cpc: r2(cpc), cpl: r2(cpl), maxCpl: r2(maxCpl), verdict: cpl === 0 ? 'unknown' : ratio <= 1 ? 'ok' : ratio <= 1.6 ? 'tight' : 'high' }
}

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100

/**
 * 0 to 100: how much this search deserves a place in the plan. Volume on a
 * log scale (a 10x search is not 10x better), times intent, minus a penalty
 * when the click cannot pay for itself.
 */
export function scoreIdea(idea, intent, afford) {
  if (intent === 'exclude') return 0
  const volume = idea.volume == null ? TIER_VOLUME[idea.tier] || 200 : idea.volume
  const vol = Math.log10(Math.max(1, volume) + 9) / Math.log10(10009)
  const w = INTENT_META[intent]?.weight ?? 0.5
  const pay = afford.verdict === 'high' ? 0.45 : afford.verdict === 'tight' ? 0.8 : 1
  return Math.round(Math.min(1, vol * 0.7 + 0.3) * w * pay * 100)
}

// ---- ideas without Google ---------------------------------------------------------

// Until the Cloud project has Basic access, Google will not give volumes. The
// plan is still built, from the seeds and the towns, with a tier standing in
// for volume so the list can still be ranked: 3 is a head term, 1 is a long
// tail. The page shows a dash where the number would be.
export const TIER_VOLUME = { 3: 1500, 2: 400, 1: 120 }

const REPAIRISH = /\b(repair|fix|not (cooling|working)|leak|clog|drain|broken)\b/i
const INSTALLISH = /\b(install\w*|replace\w*|new |conversion)\b/i
const COMPANYISH = /\b(plumber|electrician|roofer|contractor|company|landscaper|exterminator|handyman)\b/i

/**
 * Searches people type around each seed: the seed, "near me", the biggest
 * towns, emergency and price variants where they make sense. Deduped,
 * a few hundred at most.
 */
export function localIdeas(seeds, { towns = [] } = {}) {
  const out = new Map()
  const add = (text, tier) => {
    const t = String(text).toLowerCase().replace(/\s+/g, ' ').trim()
    if (!t || (out.has(t) && out.get(t).tier >= tier)) return
    out.set(t, { text: t, volume: null, tier, competition: 'UNSPECIFIED', competitionIndex: 0, lowBid: 0, highBid: 0, avgCpc: 0, monthly: [], concepts: [], fromUrl: false, local: true })
  }
  const top = towns.slice(0, 3).map((t) => String(t.name || t).toLowerCase().replace(/[^a-z ]/g, '').trim()).filter(Boolean)
  for (const raw of seeds || []) {
    const seed = String(raw).toLowerCase().trim()
    if (!seed) continue
    add(seed, 3)
    add(`${seed} near me`, 3)
    for (const town of top) add(`${seed} ${town}`, 2)
    if (REPAIRISH.test(seed)) {
      add(`emergency ${seed}`, 2)
      add(`24 hour ${seed}`, 1)
      add(`same day ${seed}`, 1)
    }
    if (INSTALLISH.test(seed)) {
      add(`${seed} cost`, 2)
      add(`${seed} financing`, 1)
    }
    if (COMPANYISH.test(seed)) {
      add(`best ${seed}`, 2)
      add(`licensed ${seed}`, 1)
      for (const town of top) add(`${seed} in ${town}`, 1)
    }
  }
  return [...out.values()]
}

// ---- seasonality ------------------------------------------------------------------

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Peak months and the swing between the quiet and busy season, from the 12 months Google gives. */
export function seasonality(monthly) {
  const rows = (monthly || []).slice(-12)
  if (rows.length < 6) return { peak: '', swing: 0, trend: null, values: rows.map((r) => r.v) }
  const max = Math.max(...rows.map((r) => r.v))
  const min = Math.min(...rows.map((r) => r.v))
  const avg = rows.reduce((s, r) => s + r.v, 0) / rows.length
  const peaks = rows.filter((r) => r.v >= max * 0.85).map((r) => MONTH_NAMES[r.m - 1]).filter(Boolean)
  const swing = avg > 0 ? Math.round(((max - min) / avg) * 100) : 0
  // Latest three months against the same three a year earlier, when both exist.
  let trend = null
  if (rows.length >= 12) {
    const now = rows.slice(-3).reduce((s, r) => s + r.v, 0)
    const then = rows.slice(0, 3).reduce((s, r) => s + r.v, 0)
    if (then > 0) trend = Math.round(((now - then) / then) * 100)
  }
  return { peak: peaks.slice(0, 3).join(', '), swing, trend, values: rows.map((r) => r.v) }
}

// ---- the account overlay -----------------------------------------------------------

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * What the account already knows about each idea: 'running' when it is a
 * keyword already, 'converting' when it shows up as a search term that
 * produced a conversion without being a keyword (add it), 'wasted' when a
 * search term spent with no conversion (block it), else 'new'.
 */
export function overlayStatus(text, { keywords = [], terms = [] } = {}) {
  const t = norm(text)
  const kw = keywords.find((k) => norm(k.keyword_text) === t)
  if (kw) return { status: 'running', detail: `Already a keyword (${String(kw.match_type || '').toLowerCase() || 'match'})` }
  const term = terms.find((x) => norm(x.search_term) === t)
  if (term) {
    if (Number(term.conversions || 0) > 0) return { status: 'converting', detail: `Converted ${Number(term.conversions)}x as a search term, not a keyword yet` }
    if (Number(term.cost || 0) >= 20) return { status: 'wasted', detail: `$${Math.round(Number(term.cost))} on this search, no conversions` }
  }
  return { status: 'new', detail: '' }
}

// ---- the plan -------------------------------------------------------------------------

/** Brand searches: any idea carrying a distinctive word from the client's name. */
export function brandWords(name) {
  const stop = new Set(['heating', 'cooling', 'air', 'and', 'the', 'hvac', 'plumbing', 'plumbers', 'plumber', 'roofing', 'electric', 'electrical', 'services', 'service', 'company', 'inc', 'llc', 'co', 'home', 'construction', 'pressure', 'washing', 'water', 'mechanical', 'appliances', 'appliance', 'heat', 'brothers', 'brother', 'experts', 'expert', 'pro', 'pros', 'of', 'llc.'])
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9' ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stop.has(w))
}

/**
 * Every idea annotated: intent, service line, affordability, score, season,
 * account status, and the match type it should start on. Sorted best first.
 */
export function annotate(ideas, { trade = 'general', clientName = '', jobValue = 0, keywords = [], terms = [], places = [] } = {}) {
  const brand = brandWords(clientName)
  const townRe = places.length ? new RegExp(`\\b(${places.map((p) => String(p.name || p).toLowerCase().replace(/[^a-z ]/g, '')).filter(Boolean).join('|')})\\b`, 'i') : null
  return (ideas || [])
    .map((idea) => {
      const text = String(idea.text || '').toLowerCase()
      let { intent, why } = classifyIntent(text)
      if (intent !== 'exclude' && brand.some((w) => text.includes(w))) intent = 'brand'
      const afford = affordability(idea, intent, jobValue)
      const score = scoreIdea(idea, intent, afford)
      return {
        ...idea,
        intent,
        why: why || '',
        line: serviceLine(text, trade),
        campaign: INTENT_META[intent].campaign,
        hasTown: Boolean(townRe && townRe.test(text)),
        nearMe: /\bnear me\b/.test(text),
        afford,
        score,
        season: seasonality(idea.monthly),
        ...overlayStatus(text, { keywords, terms }),
        // Exact where the search is big and clearly a buyer; phrase everywhere
        // else, so a new account gathers data without paying for strays.
        match: (idea.volume ?? 0) >= 500 && ['emergency', 'repair', 'install', 'company'].includes(intent) ? 'exact' : 'phrase',
      }
    })
    .sort((a, b) => b.score - a.score || b.volume - a.volume || a.text.localeCompare(b.text))
}

/**
 * Campaigns by intent, ad groups by service line, 3 to 15 keywords each,
 * best first. Anything excluded becomes a negative. A group with fewer than
 * 3 keywords folds into the campaign's general group.
 */
export function buildPlan(annotated, { excluded = new Set(), minVolume = 10 } = {}) {
  const campaigns = new Map()
  const negatives = []
  const skipped = []
  for (const a of annotated) {
    if (a.intent === 'exclude') {
      negatives.push({ text: a.text, why: a.why, volume: a.volume })
      continue
    }
    if (a.status === 'wasted') {
      negatives.push({ text: a.text, why: a.detail, volume: a.volume })
      continue
    }
    if (excluded.has(a.text) || (a.volume != null && a.volume < minVolume)) {
      skipped.push(a)
      continue
    }
    const c = campaigns.get(a.campaign) || { name: a.campaign, groups: new Map(), spend: 0, leads: 0 }
    const g = c.groups.get(a.line) || { name: a.line, keywords: [] }
    if (g.keywords.length < 15) g.keywords.push(a)
    c.groups.set(a.line, g)
    campaigns.set(a.campaign, c)
  }
  const order = ['Emergency & Repair', 'Installation & Replacement', 'Core Services', 'Maintenance & Tune-ups', 'Brand']
  const out = []
  for (const name of order) {
    const c = campaigns.get(name)
    if (!c) continue
    const general = { name: `${name} · general`, keywords: [] }
    const groups = []
    for (const g of c.groups.values()) {
      if (g.keywords.length >= 3) groups.push(g)
      else general.keywords.push(...g.keywords)
    }
    if (general.keywords.length) groups.push(general)
    for (const g of groups) g.est = estimate(g.keywords)
    groups.sort((a, b) => b.est.spend - a.est.spend)
    out.push({ name, groups, est: estimate(groups.flatMap((g) => g.keywords)) })
  }
  return { campaigns: out, negatives: dedupeNegatives(negatives), skipped, est: estimate(out.flatMap((c) => c.groups.flatMap((g) => g.keywords))) }
}

function dedupeNegatives(list) {
  const by = new Map()
  for (const n of list) if (!by.has(n.text)) by.set(n.text, n)
  return [...by.values()].sort((a, b) => b.volume - a.volume)
}

/**
 * What a set of keywords would cost and bring in a month, if the ads showed
 * on about a third of those searches and won the usual share of clicks.
 * Rough on purpose, and labelled that way on the page.
 */
export function estimate(keywords) {
  let clicks = 0
  let spend = 0
  let known = 0
  for (const k of keywords || []) {
    if (k.volume == null) continue
    known++
    const c = k.volume * ECON.impressionShare * ECON.ctr
    clicks += c
    spend += c * (k.afford?.cpc || 0)
  }
  const leads = clicks * ECON.clickToLead
  return { keywords: (keywords || []).length, known, searches: (keywords || []).reduce((s, k) => s + (k.volume || 0), 0), clicks: Math.round(clicks), spend: Math.round(spend), leads: Math.round(leads * 10) / 10, cpl: leads > 0 ? r2(spend / leads) : 0 }
}

// ---- standard negatives every home-services account starts with --------------------

export const STANDARD_NEGATIVES = [
  'jobs', 'job', 'hiring', 'careers', 'salary', 'apprentice', 'training', 'school', 'course', 'certification', 'license',
  'diy', 'how to', 'youtube', 'tutorial', 'manual', 'parts', 'supply', 'wholesale', 'for sale', 'used', 'rental', 'rent',
  'free', 'cheapest', 'reddit', 'forum', 'calculator', 'reviews of', 'amazon', 'home depot', 'lowes',
]

// ---- export ----------------------------------------------------------------------------

const csvCell = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Google Ads Editor import: one row per keyword, plus the negatives, plus the standard list. */
export function editorCsv(plan, { campaignPrefix = '' } = {}) {
  const rows = [['Campaign', 'Ad Group', 'Keyword', 'Criterion Type', 'Max CPC']]
  for (const c of plan.campaigns) {
    for (const g of c.groups) {
      for (const k of g.keywords) {
        rows.push([`${campaignPrefix}${c.name}`, g.name, k.text, k.match === 'exact' ? 'Exact' : 'Phrase', k.afford?.cpc ? k.afford.cpc.toFixed(2) : ''])
      }
    }
  }
  for (const c of plan.campaigns) {
    for (const n of plan.negatives) rows.push([`${campaignPrefix}${c.name}`, '', n.text, 'Negative Phrase', ''])
    for (const n of STANDARD_NEGATIVES) rows.push([`${campaignPrefix}${c.name}`, '', n, 'Negative Phrase', ''])
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n')
}

/** A plain-text version for pasting into a doc or a chat. */
export function planText(plan, clientName) {
  const out = [`Google Ads keyword plan for ${clientName}`, '']
  for (const c of plan.campaigns) {
    out.push(`CAMPAIGN: ${c.name}  (about $${c.est.spend}/mo, ${c.est.leads} leads)`)
    for (const g of c.groups) {
      out.push(`  Ad group: ${g.name}`)
      for (const k of g.keywords) out.push(`    ${k.match === 'exact' ? '[' : '"'}${k.text}${k.match === 'exact' ? ']' : '"'}  ${k.volume}/mo  ~$${k.afford.cpc}`)
    }
    out.push('')
  }
  out.push('NEGATIVES')
  for (const n of plan.negatives) out.push(`  -${n.text}  (${n.why})`)
  out.push(`  plus the standard list: ${STANDARD_NEGATIVES.join(', ')}`)
  return out.join('\n')
}
