// What to ask Google's planner for, worked out from what the CRM already
// knows about a client: the trade, the services their website lists, the
// towns they work in, and their offers. Nobody types seeds unless they want
// to add something.
//
// Pure: scripts/check-keyword-plan.mjs imports it.

import { tradeOf } from './season.js'

// Core seeds per trade: the searches a homeowner types when they need the
// work done. Short, service-plus-need, no town (Google adds the geography
// from the places we target). Around 12 to 20 each so one planner call
// covers the trade.
export const TRADE_SEEDS = {
  hvac: [
    'ac repair', 'air conditioning repair', 'ac not cooling', 'emergency ac repair', 'ac installation', 'ac replacement', 'new ac unit cost',
    'hvac repair', 'hvac installation', 'hvac company', 'heating repair', 'furnace repair', 'furnace replacement', 'furnace installation',
    'heat pump installation', 'heat pump repair', 'mini split installation', 'ductless ac', 'ac tune up', 'furnace tune up', 'hvac maintenance', 'duct cleaning',
  ],
  hvac_plumbing: [
    'ac repair', 'hvac repair', 'furnace repair', 'ac installation', 'heat pump installation', 'hvac maintenance',
    'plumber', 'emergency plumber', 'water heater repair', 'water heater installation', 'drain cleaning', 'leak repair', 'sewer line repair',
  ],
  plumbing: [
    'plumber', 'emergency plumber', 'plumbing repair', 'water heater repair', 'water heater replacement', 'water heater installation', 'tankless water heater installation',
    'drain cleaning', 'clogged drain', 'sewer line repair', 'sewer camera inspection', 'hydro jetting', 'leak detection', 'slab leak repair',
    'burst pipe repair', 'toilet repair', 'faucet repair', 'repiping', 'gas line installation', 'water softener installation',
  ],
  water: ['water softener installation', 'water filtration system', 'whole house water filter', 'water treatment company', 'reverse osmosis system', 'water testing', 'hard water treatment', 'well water treatment', 'iron filter'],
  roofing: ['roof repair', 'roof replacement', 'roofing company', 'roofer', 'roof leak repair', 'emergency roof repair', 'metal roofing', 'shingle roof replacement', 'roof inspection', 'storm damage roof repair', 'hail damage roof', 'gutter installation', 'gutter repair', 'new roof cost'],
  electrical: ['electrician', 'emergency electrician', 'electrical repair', 'panel upgrade', 'electrical panel replacement', 'ev charger installation', 'generator installation', 'whole house generator', 'outlet installation', 'ceiling fan installation', 'lighting installation', 'electrical inspection'],
  washing: ['pressure washing', 'power washing', 'house washing', 'soft washing', 'driveway cleaning', 'deck cleaning', 'roof cleaning', 'gutter cleaning', 'commercial pressure washing', 'fence cleaning'],
  lawn: ['lawn care', 'lawn mowing service', 'landscaping company', 'landscaper', 'lawn treatment', 'weed control', 'aeration and overseeding', 'mulch installation', 'sod installation', 'irrigation repair', 'sprinkler repair', 'tree trimming', 'leaf removal'],
  pool: ['pool service', 'pool cleaning service', 'pool repair', 'pool pump repair', 'pool heater repair', 'pool opening', 'pool closing', 'green pool cleanup', 'pool maintenance', 'pool leak detection'],
  pest: ['pest control', 'exterminator', 'termite treatment', 'termite inspection', 'ant control', 'rodent control', 'mosquito control', 'bed bug treatment', 'wasp removal', 'wildlife removal'],
  appliance: ['appliance repair', 'refrigerator repair', 'washer repair', 'dryer repair', 'dishwasher repair', 'oven repair', 'stove repair', 'ice maker repair', 'freezer repair', 'appliance installation'],
  remodel: ['general contractor', 'home remodeling', 'kitchen remodel', 'bathroom remodel', 'basement finishing', 'home addition', 'deck builder', 'siding replacement', 'window replacement', 'home renovation contractor', 'construction company'],
  general: ['contractor near me', 'home repair', 'handyman', 'home services'],
}

// How a website's SERVICES lines become seeds: strip the sentence, keep the
// service, drop anything too long to be a search.
const DROP = /\b(including|such as|and more|etc\.?|we|our|your|for|of|the|with|available|offered|services?|service)\b/gi

/** Short service phrases out of the fact sheet's SERVICES section. */
export function seedsFromSheet(sheet) {
  const text = String(sheet || '')
  const start = text.indexOf('SERVICES')
  if (start < 0) return []
  const end = text.indexOf('\n\n', start + 8)
  const block = end > start ? text.slice(start, end) : text.slice(start)
  const out = []
  for (const line of block.split('\n').slice(1)) {
    const clean = line.replace(/^[-*•]\s*/, '').replace(/["“”]/g, '').replace(/\(.*?\)/g, '').trim()
    if (!clean) continue
    for (const part of clean.split(/[,:;.]| and /)) {
      const s = part.replace(DROP, ' ').replace(/[^a-z0-9 -]/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
      const words = s.split(' ').filter(Boolean)
      if (words.length < 2 || words.length > 4) continue
      if (/^(residential|commercial|light|new|who|they|serve|instant|online|in|english|spanish)/.test(s)) continue
      if (!out.includes(s)) out.push(s)
    }
  }
  return out.slice(0, 40)
}

/** Every seed for a client: the trade's core set first, then what their site lists. */
export function defaultSeeds({ client, intake, extra = [] } = {}) {
  const trade = tradeOf(intake?.industry_trade || client?.industry || '')
  const base = TRADE_SEEDS[trade] || TRADE_SEEDS.general
  const fromSite = seedsFromSheet(client?.website_profile)
  const offer = String(intake?.cta_offering || '').toLowerCase()
  const offers = /tune.?up/.test(offer) ? ['tune up special'] : /free estimate|free quote/.test(offer) ? ['free estimate'] : []
  const all = [...base, ...fromSite, ...offers, ...extra.map((s) => String(s).toLowerCase().trim())]
  return { trade, seeds: [...new Set(all.filter(Boolean))].slice(0, 60) }
}

/** The places to target: intake first (the owner told us), then the website's service area. */
export function defaultLocations({ client, intake } = {}) {
  const typed = [intake?.target_cities, intake?.service_area, client?.market].filter(Boolean)
  const sheet = String(client?.website_profile || '')
  const i = sheet.indexOf('SERVICE AREA')
  const areaBlock = i >= 0 ? sheet.slice(i, sheet.indexOf('\n\n', i + 12) > 0 ? sheet.indexOf('\n\n', i + 12) : undefined) : ''
  const fromSite = areaBlock
    .split('\n')
    .slice(1)
    .flatMap((l) => l.replace(/^[-*•]\s*/, '').replace(/["“”]/g, '').split(/[,;:]/))
    .map((s) => s.replace(/\(.*?\)/g, '').replace(/\b(named|and|proudly serving|all of|the|greater|region|office)\b.*$/i, '').trim())
    .filter((s) => s && s.length <= 30 && /^[A-Za-z .'-]+$/.test(s) && !/^(serving|serves|we|our)/i.test(s))
  return { typed, fromSite: [...new Set(fromSite)].slice(0, 20) }
}
