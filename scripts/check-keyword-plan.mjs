// Self-check for the Google Ads keyword builder: seeds and places from what
// the CRM knows, what each search means, whether the click pays, how the
// plan groups, and what it exports.
// Run: node scripts/check-keyword-plan.mjs

import { defaultLocations, defaultSeeds, seedsFromSheet } from '../src/lib/keywordSeeds.js'
import { affordability, annotate, brandWords, buildPlan, classifyIntent, editorCsv, estimate, localIdeas, overlayStatus, seasonality, serviceLine } from '../src/lib/keywordPlan.js'
import { chunk, mergeIdeas, parseLocations, toIdea } from '../supabase/functions/google-keyword-ideas/index.ts'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

// --- seeds and places --------------------------------------------------------
const SHEET = `WHO THEY ARE
- Reliable Heating & Air, HVAC contractor based in Knightdale, NC.

SERVICES
- AC installation and replacement, AC repair, emergency AC repair, AC maintenance.
- Ductless mini-split services.
- Furnace repair, furnace replacement, heater maintenance, emergency heating repair.
- Heat pump installation and repair.
- Who they serve: residential, commercial, light commercial, new construction.
- Instant HVAC Estimator and online scheduling on the site.

SERVICE AREA
- Raleigh, Wake County and the Greater Raleigh Region / The Triangle.
- Knightdale, Garner, Apex, Wake Forest, Cary, Holly Springs, Clayton, Durham.
- Office: 530 Hinton Pond Rd. Ste 148, Knightdale, NC 27545.
`
{
  const s = seedsFromSheet(SHEET)
  check('services on the site become short seeds, sentences about who they serve do not',
    [s.includes('ac installation'), s.includes('emergency ac repair'), s.includes('heat pump installation'), s.some((x) => /who they serve|estimator/.test(x))],
    [true, true, true, false])
  const d = defaultSeeds({ client: { website_profile: SHEET }, intake: { industry_trade: 'HVAC', cta_offering: '$99 tune-up special' } })
  check('the trade set comes first, the site adds to it, the offer adds tune up special', [d.trade, d.seeds[0], d.seeds.includes('ductless mini-split'), d.seeds.includes('tune up special')], ['hvac', 'ac repair', true, true])
  const L = defaultLocations({ client: { website_profile: SHEET, market: 'Raleigh, NC' }, intake: { target_cities: '40 mile radius Raleigh', service_area: 'Raleigh, NC' } })
  check('places typed by the owner first, then the towns their site lists', [L.typed, L.fromSite.slice(0, 4)], [['40 mile radius Raleigh', 'Raleigh, NC', 'Raleigh, NC'], ['Raleigh', 'Wake County', 'Knightdale', 'Garner']])
}
check('free-typed places into names Google can look up',
  parseLocations('Dallas. Planoe radius 20-30 mile radius', 'Raleigh, NC', 'SWFL ( Lee, Collier, Charlotte, Manatee ) ', '30 mile radius of chicago, will send zip codes'),
  ['Dallas', 'Planoe', 'Raleigh', 'NC', 'SWFL', 'Lee', 'Collier', 'Charlotte', 'Manatee', 'chicago'].filter((x) => x !== 'NC'))
check('never more than ten places, no repeats', parseLocations(Array.from({ length: 30 }, (_, i) => `${String.fromCharCode(65 + i)}ville`).join(', '), 'Aville').length, 10)
check('seeds go to Google twenty at a time', chunk(Array.from({ length: 45 }, (_, i) => i), 20).map((c) => c.length), [20, 20, 5])

// --- Google's answer into our shape --------------------------------------------
{
  const raw = { text: 'AC Repair Raleigh', keywordIdeaMetrics: { avgMonthlySearches: '1300', competition: 'HIGH', competitionIndex: '87', lowTopOfPageBidMicros: '9500000', highTopOfPageBidMicros: '38000000', averageCpcMicros: '21000000', monthlySearchVolumes: [{ year: '2026', month: 'AUGUST', monthlySearches: '2400' }, { year: '2026', month: 'JULY', monthlySearches: '2900' }] }, keywordAnnotations: { concepts: [{ name: 'Repair', conceptGroup: { name: 'Service' } }] } }
  const i = toIdea(raw)
  check('volume, bids in dollars, months in order, concepts', [i.text, i.volume, i.lowBid, i.highBid, i.avgCpc, i.monthly.map((m) => m.m), i.concepts], ['ac repair raleigh', 1300, 9.5, 38, 21, [7, 8], ['Repair']])
  const merged = mergeIdeas([[i], [{ ...i, volume: 900, fromUrl: true }], [{ ...i, text: 'ac repair', volume: 5400 }]])
  check('the same idea from two calls is one row, biggest volume, url flag kept', merged.map((m) => [m.text, m.volume, m.fromUrl]), [['ac repair', 5400, false], ['ac repair raleigh', 1300, true]])
}

// --- what a search means -----------------------------------------------------------
check('intent, in order of how sure we are',
  ['emergency ac repair', 'ac not cooling', 'furnace repair', 'new ac unit cost', 'ac installation', 'ac tune up', 'hvac company near me', 'plumber'].map((t) => classifyIntent(t).intent),
  ['emergency', 'emergency', 'repair', 'cost', 'install', 'maintenance', 'company', 'company'])
check('searches that are never a customer are excluded with a reason',
  ['hvac jobs raleigh', 'how to fix ac', 'ac parts', 'free ac repair', 'ac repair vs replace', 'hvac school'].map((t) => classifyIntent(t).intent),
  Array(6).fill('exclude'))
check('service lines for the trade', ['ac not cooling', 'furnace replacement', 'heat pump repair', 'mini split installation', 'duct cleaning', 'hvac company'].map((t) => serviceLine(t, 'hvac')), ['Air conditioning', 'Heating & furnace', 'Heat pumps', 'Mini splits', 'Air quality & ducts', 'HVAC'])
check('plumbing lines', ['tankless water heater installation', 'drain cleaning', 'slab leak repair', 'toilet repair', 'plumber near me'].map((t) => serviceLine(t, 'plumbing')), ['Water heaters', 'Drains & sewer', 'Leaks & pipes', 'Fixtures', 'Plumbing'])
check('brand words from a client name skip the trade words', [brandWords('Reliable Heating and Cooling'), brandWords('Belk Heating and Cooling'), brandWords('Plumbquick')], [['reliable'], ['belk'], ['plumbquick']])

// --- does the click pay -------------------------------------------------------------
{
  const cheap = affordability({ avgCpc: 3, lowBid: 2, highBid: 5, volume: 100 }, 'maintenance', 0)
  const install = affordability({ avgCpc: 40, lowBid: 20, highBid: 60, volume: 100 }, 'install', 0)
  const tuneupHigh = affordability({ avgCpc: 40, lowBid: 20, highBid: 60, volume: 100 }, 'maintenance', 0)
  check('a $3 click for a $150 tune-up is fine, a $40 click for a $7,500 install is fine, a $40 click for a tune-up is not',
    [cheap.verdict, install.verdict, tuneupHigh.verdict, cheap.cpl, install.maxCpl], ['ok', 'ok', 'high', 20, 1600])
  check('the intake job value wins over the intent default', affordability({ avgCpc: 40 }, 'maintenance', 12000).verdict, 'ok')
}

// --- season ----------------------------------------------------------------------------
{
  const months = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3].map((m, i) => ({ y: m >= 4 ? 2025 : 2026, m, v: [300, 500, 900, 1000, 950, 400, 200, 150, 150, 200, 200, 350][i] }))
  const s = seasonality(months)
  check('peaks in summer, a big swing, and a trend against a year earlier', [s.peak, s.swing > 100, s.trend], ['Jun, Jul, Aug', true, -56])
}

// --- account overlay --------------------------------------------------------------------
{
  const keywords = [{ keyword_text: 'AC Repair', match_type: 'PHRASE' }]
  const terms = [{ search_term: 'ac repair near me', conversions: 2, cost: 40 }, { search_term: 'ac repair jobs', conversions: 0, cost: 55 }]
  check('running, converting, wasted, new',
    ['ac repair', 'ac repair near me', 'ac repair jobs', 'furnace repair'].map((t) => overlayStatus(t, { keywords, terms }).status),
    ['running', 'converting', 'wasted', 'new'])
}

// --- the plan ---------------------------------------------------------------------------
const idea = (text, volume, cpc, extra = {}) => ({ text, volume, competition: 'HIGH', competitionIndex: 80, lowBid: cpc * 0.6, highBid: cpc * 1.6, avgCpc: cpc, monthly: [], concepts: [], fromUrl: false, ...extra })
const IDEAS = [
  idea('ac repair', 5400, 22), idea('ac repair near me', 2900, 24), idea('emergency ac repair', 720, 30), idea('ac not cooling', 880, 12),
  idea('ac installation', 1300, 35), idea('new ac unit cost', 1600, 18), idea('ac replacement', 590, 33),
  idea('furnace repair', 2400, 20), idea('furnace not working', 480, 10), idea('furnace repair near me', 700, 21), idea('heat pump installation', 390, 28),
  idea('ac tune up', 720, 6), idea('hvac maintenance', 210, 5), idea('duct cleaning', 1900, 9),
  idea('hvac company near me', 1000, 16), idea('reliable heating and air', 90, 2),
  idea('hvac jobs', 800, 1), idea('how to fix ac', 3600, 1), idea('ac parts', 2000, 3), idea('ac repair raleigh', 5, 20),
]
{
  const a = annotate(IDEAS, { trade: 'hvac', clientName: 'Reliable Heating and Cooling', places: [{ name: 'Raleigh' }], terms: [{ search_term: 'duct cleaning', conversions: 0, cost: 90 }] })
  const top = a.slice(0, 10).map((x) => x.text)
  check('best first: installs lead on ticket size, the big repair searches are right behind, junk and brand are nowhere near the top',
    [a[0].text, top.includes('ac repair'), top.includes('ac repair near me'), a.slice(0, 10).some((x) => x.intent === 'exclude' || x.intent === 'brand' || x.intent === 'maintenance')], ['ac installation', true, true, false])
  check('brand is spotted from the client name, towns are flagged', [a.find((x) => x.text === 'reliable heating and air').intent, a.find((x) => x.text === 'ac repair raleigh').hasTown], ['brand', true])
  check('exact match for the big clear buyers, phrase for the rest', [a.find((x) => x.text === 'ac repair').match, a.find((x) => x.text === 'ac tune up').match], ['exact', 'phrase'])
  const plan = buildPlan(a, { minVolume: 10 })
  check('campaigns by intent, in the order the money is', plan.campaigns.map((c) => c.name), ['Emergency & Repair', 'Installation & Replacement', 'Core Services', 'Maintenance & Tune-ups', 'Brand'])
  const er = plan.campaigns[0]
  check('ad groups by service line inside a campaign', er.groups.map((g) => g.name), ['Air conditioning', 'Heating & furnace'])
  check('junk and wasted searches become negatives with reasons', plan.negatives.map((n) => n.text), ['how to fix ac', 'ac parts', 'duct cleaning', 'hvac jobs'])
  check('too-small searches are skipped, not planned', plan.skipped.map((x) => x.text), ['ac repair raleigh'])
  check('an estimate that reads as a whole number of dollars and a tenth of a lead', [typeof plan.est.spend, plan.est.leads > 0, plan.est.cpl > 0], ['number', true, true])
  const csv = editorCsv(plan)
  check('Google Ads Editor rows: header, a keyword line with match type and bid, negatives per campaign',
    [csv.split('\n')[0], csv.includes('Emergency & Repair,Air conditioning,ac repair,Exact,22.00'), csv.includes('Brand,,hvac jobs,Negative Phrase,'), csv.includes(',,how to,Negative Phrase,')],
    ['Campaign,Ad Group,Keyword,Criterion Type,Max CPC', true, true, true])
}
check('an estimate of nothing is zeros', estimate([]), { keywords: 0, known: 0, searches: 0, clicks: 0, spend: 0, leads: 0, cpl: 0 })

// --- without Google -----------------------------------------------------------------------
{
  const li = localIdeas(['ac repair', 'ac installation', 'plumber'], { towns: [{ name: 'Raleigh' }, { name: 'Cary' }, { name: 'Apex' }, { name: 'Durham' }] })
  const texts = li.map((x) => x.text)
  check('seeds fan out to near me, the top towns, emergency, price and best variants',
    [texts.includes('ac repair near me'), texts.includes('ac repair raleigh'), texts.includes('emergency ac repair'), texts.includes('ac installation cost'), texts.includes('best plumber'), texts.includes('ac repair durham')],
    [true, true, true, true, true, false])
  check('no volume, a tier instead, and no repeats', [li[0].volume, li[0].tier, new Set(texts).size === texts.length], [null, 3, true])
  const a = annotate(li, { trade: 'hvac', clientName: 'Reliable' })
  const plan = buildPlan(a)
  check('the plan still builds and groups without Google numbers, estimate says how many it could price',
    [plan.campaigns.length > 0, plan.est.known, plan.est.spend, a.every((x) => x.match === 'phrase')], [true, 0, 0, true])
}

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
