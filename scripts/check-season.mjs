// Self-check for the chat's Refill button: the time of year per trade and
// market, and pulling scripts back out of a reply.
// Run: node scripts/check-season.mjs

import { SCRIPT_ANGLES, scriptAngle, outsideScripts, buildRefillPrompt, climateOf, isRefillPrompt, refillLabel, seasonContext, seasonOf, splitScripts, tradeOf, upcomingMoments } from '../src/lib/season.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

check('trades from the real intake answers',
  ['HVAC', 'Hvac ', 'HVAC/Plumbing ', 'Plumbing', 'Pressure Washing', 'Water treatment', 'Construction', 'Appliances', ''].map(tradeOf),
  ['hvac', 'hvac', 'hvac_plumbing', 'plumbing', 'washing', 'water', 'remodel', 'appliance', 'general'])

check('climates from the real service areas',
  ['SWFL ( Lee, Collier, Charlotte, Manatee ) ', 'Austin, Texas', 'Southern Mississippi ', 'Dallas', 'Raleigh, NC', 'Rhode Island', 'Utah, Salt Lake & Wasatch county ', 'Central PA', 'Long Island', ''].map(climateOf),
  ['hot', 'hot', 'hot', 'hot', 'mixed', 'cold', 'cold', 'cold', 'cold', 'mixed'])

check('late September is fall up north and still summer in Florida',
  [seasonOf('2026-09-29', 'cold'), seasonOf('2026-09-29', 'hot'), seasonOf('2026-12-10', 'cold'), seasonOf('2026-04-02', 'mixed')],
  ['fall', 'summer', 'winter', 'spring'])

{
  const up = upcomingMoments('2026-09-29', 'cold').map((x) => `${x.name} ${x.days}`)
  check('what is coming up from late September, up north',
    up, ['First hard freeze (roughly) 21', 'Halloween 32', 'Clocks fall back 33', 'Veterans Day 43'])
  const fl = upcomingMoments('2026-11-20', 'hot').map((x) => x.name)
  check('Thanksgiving and the end of hurricane season, in Florida', fl, ['Thanksgiving', 'Hurricane season ends', 'Christmas', 'New Year'])
  check('the calendar wraps into next year', upcomingMoments('2026-12-28', 'cold').map((x) => x.date), ['2026-12-25', '2027-01-01', '2027-02-01'])
}

{
  const ri = seasonContext({ industry: 'HVAC', market: 'Rhode Island', today: '2026-09-29' })
  check('Rhode Island HVAC in late September', [ri.dateLabel, ri.seasonLabel, /first cold night/.test(ri.focus)], ['Tuesday, September 29, 2026', 'early fall', true])
  const fl = seasonContext({ industry: 'HVAC ', market: 'SWFL', today: '2026-09-29' })
  check('Florida HVAC in late September talks humidity and hurricanes', [fl.seasonLabel, /hurricane/.test(fl.focus)], ['early summer', true])
  const pa = seasonContext({ industry: 'HVAC/Plumbing ', market: 'Central PA', today: '2026-09-29' })
  check('HVAC and plumbing gets both halves', /tune-up.*plumbing side.*water heater/.test(pa.focus), true)
}

{
  const p = buildRefillPrompt({ client: { name: 'Horizon HVAC' }, intake: { industry_trade: 'HVAC', service_area: 'Rhode Island' }, today: '2026-09-29', count: 5 })
  check('the prompt opens with a short label the chat can show', [isRefillPrompt(p), refillLabel(p)], [true, '5 new owner video scripts for Horizon HVAC, early fall.'])
  check('the prompt carries the season, the market and the layout',
    [/Rhode Island/.test(p), /Halloween/.test(p), /HOOK \(0-3s\)/.test(p), /\[|\]|—/.test(p)], [true, true, true, false])
  check('the client row fills in for a missing intake', /Belk/.test(buildRefillPrompt({ client: { name: 'Belk', industry: 'HVAC', market: 'Austin' }, today: '2026-09-29' })), true)
  check('an ordinary message is not a refill', isRefillPrompt('Write me 5 hooks'), false)
  const offer = buildRefillPrompt({ client: { name: 'Horizon HVAC' }, intake: { industry_trade: 'HVAC', service_area: 'Rhode Island' }, today: '2026-09-29', angle: 'offer' })
  check('an angle button asks for 3 on that angle, still as a refill', [isRefillPrompt(offer), refillLabel(offer), /leads with their current offer/.test(offer), /Mix the angles/.test(offer)], [true, '3 new owner video scripts for Horizon HVAC: offer.', true, false])
  check('the season button keeps the mixed brief', /Mix the angles/.test(p), true)
  check('every angle has a label, a count and (bar the season) an ask', SCRIPT_ANGLES.every((a) => a.label && a.count > 0 && (a.key === 'season' || a.ask.length > 40)), true)
  check('an unknown angle falls back to the season', scriptAngle('nope').key, 'season')
  check('every angle keeps the script layout', SCRIPT_ANGLES.every((a) => /HOOK \(0-3s\)/.test(buildRefillPrompt({ client: { name: 'X' }, today: '2026-09-29', angle: a.key }))), true)
}

{
  const reply = `SCRIPT 1: First cold night
Angle: the first cold night is days away
Length: about 30 seconds
HOOK (0-3s): The first cold night is coming.
CTA: Tap Book Now.
----------
**SCRIPT 2: Burning smell**
Angle: the smell on first start
HOOK (0-3s): Smell that when the heat comes on?
CTA: Tap Book Now.
---
SCRIPT 3: No hook here`
  const s = splitScripts(reply)
  check('scripts split on the dash lines, with markdown stars dropped', s.map((x) => [x.n, x.title]), [[1, 'First cold night'], [2, 'Burning smell']])
  check('each script keeps its own lines only', [s[0].text.split('\n').length, s[1].text.startsWith('SCRIPT 2: Burning smell')], [5, true])
  check('a reply with no scripts gives none', splitScripts('Sure, what season?'), [])
  check('a note outside the scripts is kept for showing above the cards',
    outsideScripts(`Two of these lean on the tune-up offer.\n\n${reply}\n----\nWant Spanish versions?`), 'Two of these lean on the tune-up offer.\n\nWant Spanish versions?')
}

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
