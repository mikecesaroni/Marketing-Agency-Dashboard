// Self-check for applying an owner's change note to a saved ad. Run:
//
//   node scripts/check-ad-revise.mjs
//
// The rule: THE REVISED AD REPLACES THE OLD ONE, AND ONLY THE FIELDS THE
// MODEL WAS ALLOWED TO TOUCH CAN MOVE. The model's reply is data from the
// network; the field allowlist is what stands between it and the recipe.

import { REVISABLE, actionableChanges, applyChanges, describeApplied, stampFromPath, versioned } from '../src/lib/adRevise.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

const current = { badge: 'Delaware', hook: 'Nobody In This House Runs Out Of Hot Water', subhead: 'Serving all of Delaware.', accent: '#C81E1E', layout: 'card' }

// "Pennsylvania instead": two fields move, everything else is untouched.
const r = applyChanges(current, [
  { field: 'badge', value: 'Pennsylvania' },
  { field: 'subhead', value: 'Serving all of Pennsylvania.' },
])
check('the badge changes', r.content.badge, 'Pennsylvania')
check('the subhead changes', r.content.subhead, 'Serving all of Pennsylvania.')
check('the hook is untouched', r.content.hook, current.hook)
check('colour and layout ride along untouched', [r.content.accent, r.content.layout], ['#C81E1E', 'card'])
check('two changes are reported, with before and after', r.applied, [
  { field: 'badge', from: 'Delaware', to: 'Pennsylvania' },
  { field: 'subhead', from: 'Serving all of Delaware.', to: 'Serving all of Pennsylvania.' },
])
check('described in the words the form uses', describeApplied(r.applied)[0], 'Location badge: “Delaware” → “Pennsylvania”')

// The allowlist is the boundary.
const bad = applyChanges(current, [
  { field: 'accent', value: '#000000' },
  { field: 'backgroundPath', value: 'ads/x/evil.png' },
  { field: '__proto__', value: 'x' },
  { field: 'cta', value: 'CLICK HERE' },
])
check('colours, paths and unknown fields are refused', bad.applied, [])
check('and the content is unchanged', bad.content.accent, '#C81E1E')
check('no cta: the image carries no button', REVISABLE.includes('cta'), false)

// A "change" to the same value is not a change.
check('a no-op is not reported', applyChanges(current, [{ field: 'badge', value: ' Delaware ' }]).applied, [])
check('nothing at all is fine', applyChanges(current, undefined).applied, [])
check('an empty value is allowed, and says so', describeApplied(applyChanges(current, [{ field: 'subhead', value: '' }]).applied)[0], 'Subhead: “Serving all of Delaware.” → “(empty)”')

// Paths and versions.
check('the stamp comes out of the path', stampFromPath('ads/abc-123/1757260000000-square.png'), '1757260000000')
check('a non-ad path has no stamp', stampFromPath('abc-123/logo.png'), null)
check('a version is appended', versioned('https://x/a.png', 1757260000), 'https://x/a.png?v=1757260000')
check('an ISO date becomes a number', versioned('https://x/a.png', '2026-09-07T12:00:00.000Z'), `https://x/a.png?v=${Date.parse('2026-09-07T12:00:00.000Z')}`)
check('no version, no change', versioned('https://x/a.png', null), 'https://x/a.png')
check('an existing query string is extended', versioned('https://x/a.png?w=1', 5), 'https://x/a.png?w=1&v=5')

// Which notes on a link can be acted on.
const sets = [
  { stamp: '1000', recipe: { hook: 'x' } },
  { stamp: '2000', recipe: null },
]
const link = {
  items: [
    { storage_path: 'ads/c/1000-square.png', decision: 'changes', comment: 'Pennsylvania instead' },
    { storage_path: 'ads/c/2000-square.png', decision: 'changes', comment: 'bigger logo' },
    { storage_path: 'ads/c/3000-square.png', decision: 'changes', comment: '' },
    { storage_path: 'ads/c/4000-square.png', decision: 'approved', comment: '' },
  ],
}
const acts = actionableChanges(link, sets)
check('only commented change requests are listed', acts.map((a) => a.stamp), ['1000', '2000'])
check('one with a recipe can be applied', acts[0].canApply, true)
check('an image-only ad cannot', acts[1].canApply, false)

console.log(failures ? `\n${failures} check(s) failed` : '\nAll ad-revise checks pass')
process.exit(failures ? 1 : 0)
