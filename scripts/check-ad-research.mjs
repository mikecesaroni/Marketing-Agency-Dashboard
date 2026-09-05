// Self-check for competitor research links. Run: node scripts/check-ad-research.mjs
//
// The rule: THE SEARCH IS THE ONE A PERSON WOULD TYPE, ONE PER PLACE.
//
// Markets are hand-typed and arrive as "West Chester/Upper Bronx" and
// "Fairfield and New Haven County, based in Millford". Searching the Ad Library
// for that whole string finds nothing; searching "Plumbing Dallas" finds the
// competition. So the helper has to turn one messy market into several clean
// searches, and never invent a place or a trade that was not there.
//
// The fixtures below are the real market strings on the live clients table.

import {
  adLibraryUrl,
  competitorUrl,
  placesIn,
  researchSearches,
  tradesIn,
} from '../src/lib/adResearch.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

// --- places, from the real market strings -----------------------------------

check('a city and state stay together', placesIn('Raleigh, NC'), ['Raleigh NC'])
check('and the state is upper-cased', placesIn('Contracosta, ca'), ['Contracosta CA'])
check('a slash is two places', placesIn('West Chester/Upper Bronx'), ['West Chester', 'Upper Bronx'])
check(
  '"and", "County" and "based in" all come apart',
  placesIn('Fairfield and New Haven County, based in Millford'),
  ['Fairfield', 'New Haven', 'Millford']
)
check('a region is one place', placesIn('Southern Mississippi '), ['Southern Mississippi'])
check('a bare city is one place', placesIn('Dallas'), ['Dallas'])
check('nothing is nothing', [placesIn(''), placesIn(null), placesIn(undefined)], [[], [], []])
check('a repeated place is one place', placesIn('Austin / Austin, TX'), ['Austin', 'Austin TX'])

// --- trades ------------------------------------------------------------------

check('one trade', tradesIn('HVAC'), ['HVAC'])
check('a slash is two trades, trailing space dropped', tradesIn('HVAC/Plumbing '), ['HVAC', 'Plumbing'])
// Correcting a typo silently would hide it from the person who can fix it.
check('a misspelt trade is searched as typed', tradesIn('Walter Filtration'), ['Walter Filtration'])
check('no trade is no trade', tradesIn(null), [])

// --- the searches for one client -------------------------------------------

{
  const found = researchSearches({ industry: 'Plumbing', market: 'Dallas' })
  check('local first, then national', found.map((s) => s.scope), ['local', 'national'])
  check('local terms are trade plus place', found[0].terms, 'Plumbing Dallas')
  check('national terms are the trade alone', found[1].terms, 'Plumbing')
}

{
  // Two trades x two places = four local searches, then two national.
  const found = researchSearches({ industry: 'HVAC/Plumbing', market: 'West Chester/Upper Bronx' })
  check('every trade meets every place', found.filter((s) => s.scope === 'local').length, 4)
  check('one national per trade', found.filter((s) => s.scope === 'national').length, 2)
  check('nothing is duplicated', new Set(found.map((s) => s.terms)).size, found.length)
}

{
  // Tito Appliances has neither industry nor market on the client row, but the
  // onboarding form knows the trade and the area. The fallbacks are what stop
  // the panel being blank for him.
  const found = researchSearches({
    industry: null,
    market: null,
    fallbackTrade: 'Appliance repair',
    fallbackArea: 'Maryland',
  })
  check('falls back to the intake when the client row is empty', found.map((s) => s.terms), [
    'Appliance repair Maryland',
    'Appliance repair',
  ])
  check('and with nothing anywhere, offers nothing rather than junk', researchSearches({}), [])
}

// --- the link ---------------------------------------------------------------

{
  const url = new URL(adLibraryUrl('Plumbing Dallas'))
  check('goes to the Ad Library', url.origin + url.pathname, 'https://www.facebook.com/ads/library/')
  check('active ads only, because a dead ad is not a winner', url.searchParams.get('active_status'), 'active')
  check('all ad types, so a commercial ad is not filtered out', url.searchParams.get('ad_type'), 'all')
  check('US by default', url.searchParams.get('country'), 'US')
  check('the search terms travel intact', url.searchParams.get('q'), 'Plumbing Dallas')
  check('keyword search, not exact phrase', url.searchParams.get('search_type'), 'keyword_unordered')
}

check(
  'a competitor by name is the same kind of link',
  new URL(competitorUrl('Baker Brothers Plumbing')).searchParams.get('q'),
  'Baker Brothers Plumbing'
)

console.log(failures === 0 ? '\nAll ad-research checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
