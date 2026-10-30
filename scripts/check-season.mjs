// Self-check for the chat's Refill button: the time of year per trade and
// market, and pulling scripts back out of a reply.
// Run: node scripts/check-season.mjs

import { SCRIPT_ANGLES, scriptAngle, outsideScripts, buildRefillPrompt, climateOf, isRefillPrompt, refillLabel, seasonContext, seasonOf, splitScripts, spokenScript, spokenScripts, tradeOf, upcomingMoments } from '../src/lib/season.js'

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
  check('Florida HVAC in late September is late summer, and talks humidity and hurricanes', [fl.seasonLabel, /hurricane/.test(fl.focus)], ['late summer', true])
  // "The season was wrong: it gave me summer when it is mid fall." A hot
  // market's year is its own: a five-month summer, a two-month fall.
  const wpb = seasonContext({ industry: 'HVAC', market: 'West Palm Beach, FL', today: '2026-10-30' })
  check('West Palm Beach on October 30 is early fall, not summer', [wpb.climate, wpb.season, wpb.seasonLabel], ['hot', 'fall', 'early fall'])
  check('and the AC is getting a break, with heating a few cold nights', [/AC finally getting a break/.test(wpb.focus), /handful of cold nights/.test(wpb.climateLine)], [true, true])
  check('a cold market heats October into April', /October into April/.test(seasonContext({ industry: 'HVAC', market: 'Long Island', today: '2026-10-30' }).climateLine), true)
  check('Texas in late November is late fall; Long Island is late fall too, with the freeze on the list', [seasonContext({ industry: 'HVAC', market: 'Dallas', today: '2026-11-25' }).seasonLabel, seasonContext({ industry: 'HVAC', market: 'Long Island', today: '2026-11-25' }).seasonLabel], ['mid fall', 'late fall'])
  check('the hot-market winter is December to February', [seasonOf('2026-12-05', 'hot'), seasonOf('2026-03-10', 'hot'), seasonOf('2026-05-02', 'hot')], ['winter', 'spring', 'summer'])
  const pa = seasonContext({ industry: 'HVAC/Plumbing ', market: 'Central PA', today: '2026-09-29' })
  check('HVAC and plumbing gets both halves', /tune-up.*plumbing side.*water heater/.test(pa.focus), true)
}

{
  const p = buildRefillPrompt({ client: { name: 'Horizon HVAC' }, intake: { industry_trade: 'HVAC', service_area: 'Rhode Island' }, today: '2026-09-29' })
  check('the prompt opens with a short label the chat can show, and the season button asks for 3', [isRefillPrompt(p), refillLabel(p)], [true, '3 new owner video scripts for Horizon HVAC, early fall.'])
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

  // Copy hands over the words to say and nothing else.
  const full = `SCRIPT 1: Heat check
Angle: the first cold night is days away
Length: about 30 seconds
HOOK (0-3s): Has your heat run since March?
PROBLEM: The first cold night is when it fails. Always at 9pm.
PROOF: Licensed and insured, 14 years in Burnet.
OFFER: $89 heat check this week.
CTA: Call the number on screen.
On screen text: Heat check, $89
Film it: in the truck, window light`
  check('copy is just the spoken lines, no labels, no angle, no notes', spokenScript(full), 'Has your heat run since March?\nThe first cold night is when it fails. Always at 9pm.\nLicensed and insured, 14 years in Burnet.\n$89 heat check this week.\nCall the number on screen.')
  check('a script that lost the layout still drops the notes', spokenScript('SCRIPT 2: Loose\nAngle: whatever\nJust say this.\nFilm it: outside'), 'Just say this.')
  check('copy all puts a one-line title over each', spokenScripts(s).split('\n\n----------\n\n').map((x) => x.split('\n')[0]), ['1. First cold night', '2. Burning smell'])

  // The paste. "I love the format, just fix the spaces, add the hook and CTA
  // labels, and the how-to-record tips at the end": single line breaks were
  // being swallowed by the app it was pasted into, so the sections ran
  // together. Labelled, a blank line between sections, the tips once.
  check('labelled copy: each line with its label and a blank line after it',
    spokenScript(full, { labels: true }),
    'Hook: Has your heat run since March?\n\nProblem: The first cold night is when it fails. Always at 9pm.\n\nProof: Licensed and insured, 14 years in Burnet.\n\nOffer: $89 heat check this week.\n\nCTA: Call the number on screen.')
  check('the tips go at the end, under their own heading',
    spokenScript(full, { labels: true, tips: ['Face the light.', 'Look at the lens.'] }).endsWith('CTA: Call the number on screen.\n\n----------\n\nHOW TO RECORD\n• Face the light.\n• Look at the lens.'), true)
  const all = spokenScripts(s, { tips: ['Face the light.'] })
  check('copy all: the numbered title, a blank line, then the labelled sections',
    all.startsWith('1. First cold night\n\nHook: The first cold night is coming.\n\nCTA: Tap Book Now.\n\n----------\n\n2. Burning smell\n\nHook: Smell that when the heat comes on?'), true)
  check('copy all: the tips once, at the very end', [all.endsWith('\n\n----------\n\nHOW TO RECORD\n• Face the light.'), (all.match(/HOW TO RECORD/g) || []).length], [true, 1])
  check('a script that lost its layout is still labelled where it can be and plain where it cannot', spokenScript('SCRIPT 2: Loose\nAngle: whatever\nJust say this.\nFilm it: outside', { labels: true }), 'Just say this.')
  check('the prompt forbids licence, registration and insurance numbers', /Never put a licence number, registration number, insurance policy number/.test(buildRefillPrompt({ client: { name: 'X' }, today: '2026-10-12', angle: 'story' })), true)
  const storyPrompt = buildRefillPrompt({ client: { name: 'Belk Heating' }, today: '2026-10-12', angle: 'story' })
  check('the prompt makes the lines first person, the owner talking, and directions say you', storyPrompt.includes('in the first person, the owner talking') && storyPrompt.includes('"Belk Heating has"') && storyPrompt.includes('speaks to the owner as "you" and "your"'), true)
  // The hook is the most important part of all of this: every script ask
  // carries the hook playbook, the date and the market's own year, and the
  // owner's name goes in the second line.
  const wpbPrompt = buildRefillPrompt({ client: { name: 'Don Air Co' }, intake: { business_name: 'Don Air Co', owner_name: 'Donat', industry_trade: 'HVAC', service_area: 'West Palm Beach, FL' }, today: '2026-10-30', angle: 'season' })
  check('the prompt says the date, the season for that market and how long heating runs there', [wpbPrompt.includes('Today is Friday, October 30, 2026'), wpbPrompt.includes('that is early fall'), wpbPrompt.includes('handful of cold nights between December and February'), wpbPrompt.includes('never call a late-October script "summer"')], [true, true, true, true])
  check('the prompt carries the hook playbook', [wpbPrompt.includes('=== THE HOOK: THE FIRST THREE SECONDS ==='), wpbPrompt.includes('LOCAL CALL-OUT'), wpbPrompt.includes('What kills a hook')], [true, true, true])
  check('the layout has the INTRO line with the owner\'s name, inside the first five seconds', [wpbPrompt.includes('INTRO: the owner\'s name and the company in one breath ("I\'m Donat from Don Air Co")'), wpbPrompt.includes('The owner on camera is Donat.')], [true, true])
  check('a script with an INTRO line copies it, labelled', spokenScript('SCRIPT 1: T\nHOOK (0-3s): First line.\nINTRO: I am Donat from Don Air Co.\nCTA: Tap Get Quote.', { labels: true }), 'Hook: First line.\n\nIntro: I am Donat from Don Air Co.\n\nCTA: Tap Get Quote.')
}

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
