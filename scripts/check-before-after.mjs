// Self-check for the before-and-after finder's pure half. Run: node scripts/check-before-after.mjs

import { FINDER_SYSTEM, finderPrompt, pairsByName, parsePairs } from '../src/lib/beforeAfter.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

const pool = [
  { path: 'c1/furnace-before.jpg', name: 'furnace-before.jpg' },
  { path: 'c1/furnace-after.jpg', name: 'furnace-after.jpg' },
  { path: 'drive:1', name: 'Smith job BEFORE.heic' },
  { path: 'drive:2', name: 'Smith job after.jpg' },
  { path: 'drive:3', name: 'owner.jpg' },
  { path: 'drive:4', name: 'van before storm.jpg' },
  { path: 'drive:5', name: 'before and after.jpg' },
]
const named = pairsByName(pool)
check('names pair a before with its after', named.map((p) => [p.before.path, p.after.path]), [['c1/furnace-before.jpg', 'c1/furnace-after.jpg'], ['drive:1', 'drive:2']])
check('a pair says what it is', named.map((p) => p.what), ['Furnace', 'Smith Job'])
check('a lone before, and a name with both words, pair with nothing', named.length, 2)
check('no names, no pairs', pairsByName([{ name: 'a.jpg' }, { name: 'b.jpg' }]), [])

const shown = pool.slice(2, 6)
check('the prompt numbers the photos as sent', /1 Smith job BEFORE\.heic, 2 Smith job after\.jpg, 3 owner\.jpg, 4 van before storm\.jpg/.test(finderPrompt(shown, 'plumbing')), true)
check('the prompt names the trade and asks for JSON only', /plumbing company/.test(finderPrompt(shown, 'plumbing')) && /JSON only/.test(finderPrompt(shown)), true)
check('the system line is about care', /wrong pair/.test(FINDER_SYSTEM), true)

check('pairs come back mapped onto the photos', parsePairs('Here you go: {"pairs":[{"before":1,"after":2,"what":"Water heater swap"}]}', shown).map((p) => [p.before.path, p.after.path, p.what, p.how]), [['drive:1', 'drive:2', 'Water heater swap', 'looked']])
check('out of range, self-pairs and repeats are dropped', parsePairs('{"pairs":[{"before":9,"after":1},{"before":2,"after":2},{"before":1,"after":2},{"before":1,"after":2}]}', shown).length, 1)
check('no JSON means no pairs', parsePairs('I could not find any.', shown), [])
check('broken JSON means no pairs', parsePairs('{"pairs":[{"before":1,', shown), [])
check('a missing what gets a plain one', parsePairs('{"pairs":[{"before":3,"after":4}]}', shown)[0].what, 'Before and after')

console.log(failures ? `\n${failures} check(s) failed` : '\nAll before-and-after checks pass')
process.exit(failures ? 1 : 0)
