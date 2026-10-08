// Season labels on saved ads, so a summer AC ad is findable next June and a
// no-heat ad next January without reading every hook. Pure, pinned by
// scripts/check-ad-season.mjs.
//
// The label is a guess at save time (from the copy first, the save date
// second) that anyone can change with one click in the gallery.

import { climateOf, seasonOf } from './season.js'

export const AD_SEASONS = [
  { key: 'all', label: 'Year-round', short: 'Year-round', tone: 'slate' },
  { key: 'spring', label: 'Spring', short: 'Spring', tone: 'green' },
  { key: 'summer', label: 'Summer', short: 'Summer', tone: 'amber' },
  { key: 'fall', label: 'Fall', short: 'Fall', tone: 'orange' },
  { key: 'winter', label: 'Winter', short: 'Winter', tone: 'blue' },
  { key: 'holiday', label: 'Holiday', short: 'Holiday', tone: 'red' },
]

export const seasonMeta = (key) => AD_SEASONS.find((s) => s.key === key) || null

// Words that place an ad in a season. Deliberately about the SERVICE being
// sold, not the weather word alone: "cool" and "hot" show up in every trade.
const SIGNALS = {
  holiday: /\b(holiday|holidays|christmas|xmas|thanksgiving|black friday|cyber monday|new year|gift|santa)\b/i,
  summer: /\b(a\/?c|air ?condition\w*|cooling|heat ?wave|summer|hottest|pool|mosquito|sprinkler|irrigation)\b/i,
  // Not "heater" or "heating" on their own: a water heater ad is not a
  // winter ad, and most plumbing and water-treatment copy mentions one.
  winter: /\b(furnace|no heat|heat (is |has been )?(out|off|not working)|heating (bill|bills|season|repair|system|tune-?up)|boiler|freeze|freezing|frozen|winter|burst pipes?|snow|ice dam|space heater|cold snap|first freeze)\b/i,
  fall: /\b(fall|autumn|leaf|leaves|gutter|heating season|before winter|first cold)\b/i,
  spring: /\b(spring|allerg\w*|pollen|pre-?season|tax refund|before summer|first hot)\b/i,
}
const ORDER = ['holiday', 'winter', 'summer', 'fall', 'spring']

/** The copy of a saved ad as one string. */
export function adText(content = {}) {
  return ['badge', 'hook', 'offerAmount', 'offerDetail', 'subhead', 'proof', 'primaryText', 'headline', 'description', 'cta']
    .map((k) => content?.[k] || '')
    .join(' \n ')
}

/**
 * A season for an ad: from its words when they say so, else year-round.
 * Returns { season, from } where from is 'copy' or 'none'. The save date is
 * deliberately not used: a "you deal with the owner" ad saved in July is not
 * a summer ad, and a wrong label is worse than a plain one.
 */
export function guessAdSeason({ content = {}, savedAt = Date.now(), market = '' } = {}) {
  const text = adText(content)
  const hits = ORDER.filter((k) => SIGNALS[k].test(text))
  if (hits.length === 1) return { season: hits[0], from: 'copy' }
  if (hits.length > 1) {
    // Two seasons named: an ad that mentions both AC and furnace is a
    // year-round "we do it all" ad, not a seasonal one. Holiday still wins.
    if (hits.includes('holiday')) return { season: 'holiday', from: 'copy' }
    return { season: 'all', from: 'copy' }
  }
  return { season: 'all', from: 'none' }
}

/** The season it is right now where the client is, for anything that wants a seasonal default. */
export function seasonNow(market = '', today = new Date()) {
  return seasonOf(new Date(today).toISOString().slice(0, 10), climateOf(market))
}

/** Sets with this season; '' or 'any' means everything. Image-only sets (no recipe) only show under everything. */
export function filterBySeason(sets = [], key = '') {
  if (!key || key === 'any') return sets
  return sets.filter((s) => (s.recipe?.season || '') === key)
}

/** How many sets per season, for the filter chips. Unlabelled sets count under 'none'. */
export function seasonCounts(sets = []) {
  const counts = { any: sets.length, none: 0 }
  for (const s of AD_SEASONS) counts[s.key] = 0
  for (const s of sets) {
    const k = s.recipe?.season || ''
    if (k && k in counts) counts[k]++
    else counts.none++
  }
  return counts
}
