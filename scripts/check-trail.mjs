// Self-check for the back-button trail.
// Run: node scripts/check-trail.mjs
//
// The button is history back; these pin down when it shows and what it is
// called, across the moves people actually make: click through, press back,
// press forward, reload, and a page tidying its own URL.

import { cleanTitle, previousOf, stepTrail, trailLabel } from '../src/lib/trail.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

const e = (key, path, title = '') => ({ key, path, title })
const walk = (steps) => steps.reduce((t, [entry, type]) => stepTrail(t, entry, type), [])
const titles = (t) => t.map((x) => x.title || x.path)

// Reports -> Google Search -> a client.
let t = walk([
  [e('a', '/reports', 'Performance')],
  [e('b', '/reports/google-search', 'Google Search')],
  [e('c', '/client/1', '')],
])
check('clicking through adds a step each time', titles(t), ['Performance', 'Google Search', '/client/1'])
check('the client page offers the page it came from', previousOf(t, 'c')?.title, 'Google Search')
t = stepTrail(t, e('c', '/client/1', 'Belk Heating and Cooling'))
check('the client name fills in once it loads, without adding a step', titles(t), ['Performance', 'Google Search', 'Belk Heating and Cooling'])

// Back to Google Search: the trail ends there, and it offers Performance.
t = stepTrail(t, e('b', '/reports/google-search'), 'POP')
check('going back cuts the trail to where you are', titles(t), ['Performance', 'Google Search'])
check('...and keeps the title it had', t[1].title, 'Google Search')
check('...and offers the page before that', previousOf(t, 'b')?.title, 'Performance')

// Then somewhere new: a fresh step after the cut, not after the old tail.
t = stepTrail(t, e('d', '/client/2', 'Pillar HVAC'))
check('a new click after going back starts from here', titles(t), ['Performance', 'Google Search', 'Pillar HVAC'])

// A page rewriting its own URL (the client page strips ?open=publish).
t = stepTrail(t, e('d2', '/client/2', ''), 'REPLACE')
check('a replace swaps the last step rather than adding one', titles(t), ['Performance', 'Google Search', 'Pillar HVAC'])
check('...so back still offers the real previous page', previousOf(t, 'd2')?.title, 'Google Search')

// Forward after back: a key not on the trail is a step.
t = stepTrail(t, e('f', '/tasks', 'Tasks'), 'POP')
check('forward to a page the trail had dropped counts as a step', previousOf(t, 'f')?.title, 'Pillar HVAC')

// First page of the session: nothing to go back to.
check('the first page has no back button', previousOf([e('x', '/')], 'x'), null)
check('an unknown key has no back button', previousOf(t, 'nope'), null)
check('the same page twice in a row is not "back"', previousOf([e('1', '/tasks'), e('2', '/tasks')], '2'), null)

check('placeholder titles are dropped', ['Client', 'Loading…', ' ', 'Pillar HVAC'].map(cleanTitle), ['', '', '', 'Pillar HVAC'])
check('labels fall back to the path, then to Back',
  [trailLabel(e('1', '/reports?x=1'), { '/reports': 'Reports' }), trailLabel(e('2', '/client/9')), trailLabel(e('3', '/weird')), trailLabel(null)],
  ['Reports', 'Client', 'Back', 'Back'])

// A long session does not grow without end.
let long = []
for (let i = 0; i < 100; i++) long = stepTrail(long, e(`k${i}`, `/p${i}`))
check('the trail keeps the last 60 steps', [long.length, long[0].key], [60, 'k40'])

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
