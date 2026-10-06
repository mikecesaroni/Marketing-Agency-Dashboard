// What a home-services customer is thinking about right now, by trade, by
// climate and by the calendar. Feeds the chat's Refill button, so a batch of
// video scripts written in late September talks about the first cold night in
// Rhode Island and about humidity and hurricane season in Fort Myers.
//
// Pure on purpose: scripts/check-season.mjs imports it.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** 'YYYY-MM-DD' or a Date, read as a calendar day (no timezone drift). */
function parts(day) {
  const s = typeof day === 'string' ? day.slice(0, 10) : isoOf(day || new Date())
  const [y, m, d] = s.split('-').map(Number)
  return { y, m, d }
}

function isoOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Which trade a free-typed industry is, for picking seasonal angles. */
export function tradeOf(industry = '') {
  const s = String(industry).toLowerCase()
  if (/hvac|heat|cool|air cond|furnace|mechanic/.test(s) && /plumb/.test(s)) return 'hvac_plumbing'
  if (/hvac|heat|cool|air cond|furnace|a\/c|\bac\b|mechanic/.test(s)) return 'hvac'
  if (/plumb|drain|sewer|water heater/.test(s)) return 'plumbing'
  if (/water (treat|test|filt|soft)|softener|well water/.test(s)) return 'water'
  if (/roof|gutter|siding/.test(s)) return 'roofing'
  if (/electric/.test(s)) return 'electrical'
  if (/pressure|power wash|soft wash/.test(s)) return 'washing'
  if (/lawn|landscap|tree|irrigation|sprinkler/.test(s)) return 'lawn'
  if (/pool|spa|hot tub/.test(s)) return 'pool'
  if (/pest|termite|exterminat/.test(s)) return 'pest'
  if (/applian/.test(s)) return 'appliance'
  if (/construct|remodel|contract|kitchen|bath|basement|deck/.test(s)) return 'remodel'
  return 'general'
}

// Markets where winter barely arrives: summer runs long, the cold is a few
// nights, and hurricane season matters.
const HOT = /\b(fl|florida|swfl|miami|tampa|orlando|naples|fort myers|lee county|collier|sarasota|jacksonville|tx|texas|houston|dallas|austin|san antonio|fort worth|az|arizona|phoenix|tucson|scottsdale|nv|nevada|las vegas|la|louisiana|new orleans|baton rouge|ms|mississippi|gulfport|biloxi|al|alabama|mobile|hawaii|palm springs|san diego)\b/i
// In between: real summers, a short winter.
const MIXED = /\b(nc|north carolina|raleigh|charlotte|durham|sc|south carolina|ga|georgia|atlanta|tn|tennessee|nashville|memphis|ok|oklahoma|ar|arkansas|va|virginia|california|ca|los angeles|sacramento|kentucky|ky)\b/i

/** 'hot', 'mixed' or 'cold', from the service area as typed. */
export function climateOf(market = '') {
  const s = String(market)
  if (HOT.test(s)) return 'hot'
  if (MIXED.test(s)) return 'mixed'
  return s.trim() ? 'cold' : 'mixed'
}

/** Meteorological season, shifted a month later in hot markets where summer lingers. */
export function seasonOf(day, climate = 'mixed') {
  const { m } = parts(day)
  const base = m === 12 || m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'fall'
  if (climate === 'hot' && (m === 9 || m === 10)) return 'summer'
  return base
}

/** Early, mid or late in the season, for the prompt's wording. */
function stageOf(m) {
  const pos = { 12: 0, 1: 1, 2: 2, 3: 0, 4: 1, 5: 2, 6: 0, 7: 1, 8: 2, 9: 0, 10: 1, 11: 2 }[m]
  return ['early', 'mid', 'late'][pos]
}

// What homeowners are thinking about, per trade and season. Short phrases the
// model can build hooks from, not finished copy.
const FOCUS = {
  hvac: {
    winter: 'no heat on the coldest nights, high heating bills, a furnace that keeps short cycling, carbon monoxide safety, replacing an old system before it dies in a freeze',
    spring: 'AC tune-up before the first hot week, replacing an old AC before the summer rush, allergy season and indoor air, tax refund money for a new system',
    summer: 'AC not keeping up in a heatwave, emergency repairs, high electric bills, swapping out a 10+ year old unit instead of patching it again',
    fall: 'furnace or heat pump tune-up before the first cold night, the burning dust smell on first start, carbon monoxide safety, off-season pricing on a new system',
  },
  hvac_hot: {
    summer: 'AC running nonstop, humidity and sticky air, electric bills at their peak, hurricane season and power surges, an old unit that will not survive another summer',
    fall: 'the AC finally getting a break, a check-up after a brutal summer, humidity, off-peak pricing on a replacement before next summer',
    winter: 'off-season AC replacement deals, heat strip or heat pump check for the few cold nights, tax refund season',
    spring: 'pre-summer AC tune-up, beating the summer rush on replacements, allergy season and indoor air',
  },
  plumbing: {
    winter: 'frozen and burst pipes, a water heater that quits in the cold, holiday-guest clogs, sewer backups',
    spring: 'sump pump checks before the rain, outdoor spigots, slab and yard leaks showing up, water heater flushes',
    summer: 'sprinkler and outdoor leaks, sewer line roots, high water bills from hidden leaks, vacation-home checks',
    fall: 'water heater before winter, winterizing outdoor lines, holiday guests and kitchen drains, frozen pipe prevention',
  },
  water: {
    winter: 'dry skin and hair from hard water, stained fixtures, a water test for the new year',
    spring: 'well water after the thaw, spring water testing, taste and smell changes',
    summer: 'family home all summer drinking tap water, pool and garden water, bottled water costs',
    fall: 'fall water testing, softener service before winter, new-home buyers testing their water',
  },
  roofing: {
    winter: 'ice dams, leaks showing up in snow and rain, emergency tarps, planning a spring replacement',
    spring: 'storm and hail damage checks, insurance claims, missing shingles after winter',
    summer: 'storm season, hail, heat-cracked shingles, replacement before fall',
    fall: 'get the roof done before winter, gutter cleaning and guards, leaf damage, storm damage inspections',
  },
  electrical: {
    winter: 'generators and power outages, overloaded circuits from space heaters, holiday lights tripping breakers',
    spring: 'panel upgrades, EV chargers, outdoor lighting and outlets',
    summer: 'AC tripping breakers, surge protection in storm season, pool and hot tub wiring',
    fall: 'generator before winter storms, holiday lighting, smoke and CO detector checks',
  },
  washing: {
    winter: 'booking early for spring, gutter and roof stains, commercial storefronts',
    spring: 'spring clean of siding and driveways, pollen, getting the deck ready',
    summer: 'decks and patios for cookouts, selling a house, fences and pool decks',
    fall: 'clean it before the holidays and guests, gutters before winter, leaf and mildew stains',
  },
  lawn: {
    winter: 'booking spring service early, snow removal, tree work while leaves are down',
    spring: 'spring cleanup, first cuts, weeds, mulch and new plantings',
    summer: 'brown patches, irrigation, weekly mowing so they get their weekends back',
    fall: 'leaf cleanup, aeration and overseeding, winterizing sprinklers, fall plantings',
  },
  pool: {
    winter: 'booking spring openings early, equipment upgrades in the off season',
    spring: 'pool opening, green water, pump and filter problems after winter',
    summer: 'weekly service, cloudy or green water, equipment breakdowns at the worst time',
    fall: 'pool closing, leaves in the pool, heater service for a longer swim season',
  },
  pest: {
    winter: 'mice and rodents moving inside, holiday guests',
    spring: 'ants, termite swarms, wasps starting nests',
    summer: 'mosquitoes, wasps, ants, backyard cookouts',
    fall: 'mice and spiders moving indoors, stink bugs, sealing the house before winter',
  },
  appliance: {
    winter: 'heater and dryer problems, holiday cooking breakdowns',
    spring: 'fridge and washer tune-ups, spring cleaning',
    summer: 'fridges and freezers working hard in the heat, AC appliances',
    fall: 'oven and range before holiday cooking, dryer vent fires, fridge before hosting',
  },
  remodel: {
    winter: 'planning spring projects, indoor remodels, basements and kitchens',
    spring: 'decks, additions, outdoor projects, getting on the schedule before summer',
    summer: 'outdoor living, decks and patios, projects before the kids go back',
    fall: 'finish it before the holidays, kitchens and bathrooms before guests arrive, booking winter work',
  },
  general: {
    winter: 'emergency repairs in the cold, holiday guests, planning the new year',
    spring: 'spring projects and tune-ups, getting on the schedule early',
    summer: 'the busy season, emergencies in the heat, projects before fall',
    fall: 'getting the house ready for winter, holiday guests, booking before the rush',
  },
}

/** The seasonal phrase for a trade, combining HVAC and plumbing when both. */
export function seasonalFocus(trade, season, climate) {
  if (trade === 'hvac_plumbing') return `${seasonalFocus('hvac', season, climate)}; on the plumbing side, ${FOCUS.plumbing[season]}`
  if (trade === 'hvac' && climate === 'hot') return FOCUS.hvac_hot[season]
  return (FOCUS[trade] || FOCUS.general)[season]
}

function nthWeekday(y, m, weekday, n) {
  const first = new Date(y, m - 1, 1).getDay()
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7
}

function lastWeekday(y, m, weekday) {
  const last = new Date(y, m, 0)
  return last.getDate() - ((last.getDay() - weekday + 7) % 7)
}

// Dates that give a script a reason to exist this week.
function momentsFor(y, climate) {
  const at = (m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const list = [
    { date: at(1, 1), name: 'New Year', note: 'fresh-start and fix-it-this-year angles' },
    { date: at(2, 1), name: 'Tax refund season', note: 'refund money for a replacement, runs to mid April' },
    { date: at(3, nthWeekday(y, 3, 0, 2)), name: 'Clocks spring forward', note: 'change the filter and test the detectors when you change the clocks' },
    { date: at(5, lastWeekday(y, 5, 1)), name: 'Memorial Day', note: 'start of summer, veterans and military thank-you offers' },
    { date: at(7, 4), name: 'Fourth of July', note: 'cookouts and a full house' },
    { date: at(8, 15), name: 'Back to school', note: 'routines restart, get the house sorted' },
    { date: at(9, nthWeekday(y, 9, 1, 1)), name: 'Labor Day', note: 'end of summer' },
    { date: at(10, 31), name: 'Halloween', note: 'a light seasonal hook, not a theme' },
    { date: at(11, nthWeekday(y, 11, 0, 1)), name: 'Clocks fall back', note: 'change the smoke and CO detector batteries, check the heat' },
    { date: at(11, 11), name: 'Veterans Day', note: 'a veterans discount if they offer one' },
    { date: at(11, nthWeekday(y, 11, 4, 4)), name: 'Thanksgiving', note: 'a house full of guests, the worst time for a breakdown' },
    { date: at(12, 25), name: 'Christmas', note: 'holiday guests and year-end' },
  ]
  if (climate === 'cold') list.push({ date: at(10, 20), name: 'First hard freeze (roughly)', note: 'late October into November across the north' })
  if (climate === 'hot') {
    list.push({ date: at(6, 1), name: 'Hurricane season starts', note: 'surge protection, storm prep' })
    list.push({ date: at(11, 30), name: 'Hurricane season ends', note: 'post-season checks' })
  }
  return list
}

/** Moments falling within `days` after today (and a week back, still fresh). */
export function upcomingMoments(day, climate = 'mixed', days = 45) {
  const { y, m, d } = parts(day)
  const today = new Date(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00`)
  const all = [...momentsFor(y, climate), ...momentsFor(y + 1, climate)]
  return all
    .map((x) => ({ ...x, days: Math.round((new Date(`${x.date}T12:00:00`) - today) / 86400000) }))
    .filter((x) => x.days >= -3 && x.days <= days)
    .sort((a, b) => a.days - b.days)
}

/** Everything the Refill prompt says about the time of year. */
export function seasonContext({ industry, market, today }) {
  const { y, m, d } = parts(today)
  const climate = climateOf(market)
  const trade = tradeOf(industry)
  const season = seasonOf(today, climate)
  const weekday = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' })
  return {
    dateLabel: `${weekday}, ${MONTHS[m - 1]} ${d}, ${y}`,
    trade,
    climate,
    season,
    seasonLabel: `${stageOf(m)} ${season}`,
    focus: seasonalFocus(trade, season, climate),
    moments: upcomingMoments(today, climate),
  }
}

const TRADE_WORDS = {
  hvac: 'heating and cooling',
  hvac_plumbing: 'heating, cooling and plumbing',
  plumbing: 'plumbing',
  water: 'water treatment',
  roofing: 'roofing',
  electrical: 'electrical',
  washing: 'pressure washing',
  lawn: 'lawn and landscaping',
  pool: 'pool',
  pest: 'pest control',
  appliance: 'appliance',
  remodel: 'construction and remodeling',
  general: 'home services',
}

export const REFILL_MARKER = 'REFILL:'

/**
 * The script buttons in the chat. The first is the seasonal refill; the
 * rest each take one angle, so a person can ask for exactly the kind of
 * script the week needs without typing the brief out. `ask` replaces the
 * "mix the angles" paragraph of the prompt; the layout stays the same so
 * the cards render.
 */
export const SCRIPT_ANGLES = [
  { key: 'season', label: '5 for the season', short: 'Refill', count: 5, tone: 'orange', ask: '' },
  {
    key: 'offer',
    label: 'Offer',
    count: 3,
    ask: 'Every script leads with their current offer, exactly as they run it (price, free item, financing, guarantee). Make the offer the reason to call this week; say what it is worth and why it is on now. If they have no offer on record, write them around the strongest guarantee or proof they do have and say so in the Angle line.',
  },
  {
    key: 'proof',
    label: 'Reviews & proof',
    count: 3,
    ask: 'Every script is built on proof: their star rating and review count, years in business, a real review line or a real job they did. Make the owner sound like a neighbour telling a true story, not an ad. No invented reviews or numbers: use what is in the brief or leave it out.',
  },
  {
    key: 'emergency',
    label: 'Emergency / repair',
    count: 3,
    ask: 'Every script speaks to someone whose system just broke today: no heat, no AC, a leak, a backup, no hot water. Short and calm: how fast they come, what happens on the visit, what it costs to come out, and the one thing to do before the tech arrives. The CTA is call now.',
  },
  {
    key: 'maintenance',
    label: 'Maintenance plan',
    count: 3,
    ask: 'Every script sells the tune-up or maintenance plan: what is included, the price if known, and the one problem it prevents at this time of year. Speak to the homeowner whose system is working fine today and who sees no reason to call.',
  },
  {
    key: 'objection',
    label: 'Top objection',
    count: 3,
    ask: 'Every script meets their top objection head on (price, trust, being upsold, a bad past experience, not knowing if they need a repair or a replacement). The owner names the worry in the first line, then answers it with how they actually work. One objection per script; use the one from the brief first.',
  },
  {
    key: 'story',
    label: 'Owner story',
    count: 3,
    ask: 'Every script is the owner on camera talking about why they do this: how the business started, what they refuse to do, a job that stuck with them, what the team is like. Plain, warm, first person. Still ends with a clear offer and CTA.',
  },
]

export const scriptAngle = (key) => SCRIPT_ANGLES.find((a) => a.key === key) || SCRIPT_ANGLES[0]

/**
 * The message the Refill button sends. The chat already carries the client's
 * brief (intake, website, ad results, memory), so this only adds the time of
 * year and the exact layout the scripts come back in.
 */
export function buildRefillPrompt({ client, intake, today, count, angle = 'season' }) {
  const a = scriptAngle(angle)
  const n = count || a.count
  const i = intake || {}
  const name = i.business_name || client?.name || 'this client'
  const industry = i.industry_trade || client?.industry || ''
  const market = i.service_area || client?.market || ''
  const ctx = seasonContext({ industry, market, today })
  const where = market.trim() ? ` in ${market.trim()}` : ''
  const moments = ctx.moments.length
    ? ctx.moments.map((x) => `${x.name} (${x.days <= 0 ? 'this week' : `in ${x.days} day${x.days === 1 ? '' : 's'}`}): ${x.note}`).join('; ')
    : 'nothing big on the calendar'
  const climateLine =
    ctx.climate === 'hot' ? ' Their market runs hot, so summer lasts longer there than the calendar says.' : ''

  const headline = a.key === 'season' ? `${n} new owner video scripts for ${name}, ${ctx.seasonLabel}.` : `${n} new owner video scripts for ${name}: ${a.label.toLowerCase()}.`
  const angleAsk = a.key === 'season'
    ? 'Mix the angles: the season right now, what is coming up, their proof, their offer, and their top objection. If an angle needs an offer they do not have, pick another angle rather than inventing one.'
    : a.ask

  return `${REFILL_MARKER} ${headline}

Today is ${ctx.dateLabel}. For a ${TRADE_WORDS[ctx.trade]} business${where}, that is ${ctx.seasonLabel}.${climateLine} What homeowners there are thinking about right now: ${ctx.focus}.
Coming up: ${moments}.

Use everything you know about them: the intake, their website, their offers, reviews and guarantees, what is running in the ad account and what has won or lost. Use their real offer, real proof and real town names. Do not reuse a hook from an ad already running or from a script you already wrote in this chat.

${angleAsk}

Write every script exactly like this, as plain text with no markdown, no asterisks and no brackets:

SCRIPT 1: short title
Angle: one line on why this one works now
Length: about 30 seconds
HOOK (0-3s): the first line out of the owner's mouth
PROBLEM: one or two lines
PROOF: one line
OFFER: one line
CTA: one line
On screen text: 3 to 6 words for the caption
Film it: where to stand and what to show, one line

Put a line of dashes between scripts. Nothing before script 1 and nothing after the last one.`
}

/** True for a message the Refill button sent, so the chat can show it short. */
export function isRefillPrompt(text) {
  return String(text || '').startsWith(REFILL_MARKER)
}

/** The first line of a Refill message, without the marker. */
export function refillLabel(text) {
  return String(text || '').split('\n')[0].replace(REFILL_MARKER, '').trim()
}

function parseScripts(text) {
  const lines = String(text || '').split('\n')
  const blocks = []
  const extra = []
  let cur = null
  for (const line of lines) {
    const head = line.match(/^\s*\**\s*SCRIPT\s+(\d+)\s*[:.-]\s*(.*?)\**\s*$/i)
    if (head) {
      if (cur) blocks.push(cur)
      cur = { n: Number(head[1]), title: head[2].trim(), lines: [line.replace(/\*/g, '').trim()] }
      continue
    }
    if (/^\s*[-_=]{3,}\s*$/.test(line)) {
      if (cur) blocks.push(cur)
      cur = null
      continue
    }
    if (cur) cur.lines.push(line)
    else extra.push(line)
  }
  if (cur) blocks.push(cur)
  const scripts = blocks
    .map((b) => ({ n: b.n, title: b.title, text: b.lines.join('\n').trim() }))
    .filter((b) => /^\s*HOOK\b/im.test(b.text))
  return { scripts, extra: extra.join('\n').trim() }
}

/**
 * Pull the scripts out of a reply so each gets its own card and copy button.
 * A script starts at a "SCRIPT n:" line and runs to the next one or a dash
 * divider.
 */
export function splitScripts(text) {
  return parseScripts(text).scripts
}

/** Whatever the reply said outside its scripts (a note, a question), or ''. */
export function outsideScripts(text) {
  return parseScripts(text).extra
}
