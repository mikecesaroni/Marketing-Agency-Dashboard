// Self-check for the season labels on saved ads. Run: node scripts/check-ad-season.mjs
import { AD_SEASONS, filterBySeason, guessAdSeason, seasonCounts, seasonMeta, seasonNow } from '../src/lib/adSeason.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

const g = (content, savedAt = '2026-10-08T12:00:00Z', market = 'Raleigh, NC') => guessAdSeason({ content, savedAt: new Date(savedAt).getTime(), market })
check('AC copy is summer, from the words', g({ hook: 'AC died? Same-day cooling repair' }), { season: 'summer', from: 'copy' })
check('furnace copy is winter', g({ hook: 'No heat tonight?', subhead: 'Furnace repair in 2 hours' }), { season: 'winter', from: 'copy' })
check('holiday beats everything', g({ hook: 'Black Friday furnace special' }), { season: 'holiday', from: 'copy' })
check('AC and furnace together is year-round', g({ hook: 'AC and furnace tune-ups, $89' }), { season: 'all', from: 'copy' })
check('no signal: year-round, not the save date', g({ hook: '$89 tune-up, book today' }, '2026-10-08T12:00:00Z', 'Raleigh, NC'), { season: 'all', from: 'none' })
check('the season right now follows the market', [seasonNow('Raleigh, NC', new Date('2026-10-08T12:00:00Z')), seasonNow('Austin, TX', new Date('2026-10-08T12:00:00Z'))], ['fall', 'summer'])
check('a water heater ad is not a winter ad', g({ hook: 'Your water heater is 12 years old', subhead: 'Tankless water heater install' }), { season: 'all', from: 'none' })
check('"heat has been off" is winter', g({ hook: 'Your heat has been off since Tuesday' }).season, 'winter')
check('"cool" alone is not a season', g({ hook: 'Stay cool, call us' }), { season: 'all', from: 'none' })
check('every season has a label', AD_SEASONS.every((s) => s.label && s.key), true)
check('unknown key has no meta', seasonMeta('monsoon'), null)

const sets = [
  { stamp: '1', recipe: { season: 'summer' } },
  { stamp: '2', recipe: { season: 'winter' } },
  { stamp: '3', recipe: { season: 'summer' } },
  { stamp: '4', recipe: null },
]
check('filter by season', filterBySeason(sets, 'summer').map((s) => s.stamp), ['1', '3'])
check('no filter is everything', filterBySeason(sets, '').length, 4)
check('counts', seasonCounts(sets), { any: 4, none: 1, all: 0, spring: 0, summer: 2, fall: 0, winter: 1, holiday: 0 })

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
