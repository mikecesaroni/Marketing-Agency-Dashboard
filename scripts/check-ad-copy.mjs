// Self-check for how ad-copy suggestions get applied. Run:
//
//   node scripts/check-ad-copy.mjs
//
// The rule: THE MODEL RETURNS THREE OPTIONS PER FIELD AND ALL THREE GET USED.
//
// ad-copy answers with a flat list of {field, value} — three per field it was
// asked about. Taking only the first threw six of nine away and then charged
// for a whole new Opus request to show a second one, which with adaptive
// thinking is not a fast round trip. So "another angle" walks the list it
// already has, and only calls again once it runs out.
//
// The wrapping is PER FIELD on purpose. The model does not promise the same
// count for every field, so asking for index 2 when a field only produced one
// option has to return that option rather than nothing — a blank primary text
// is a blocker on publish.

import { anglesAvailable, nthPerField } from '../src/lib/adCopyOptions.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

// Shaped as the live function answered for Reliable Heating and Cooling:
// three options for each of the three feed fields, interleaved by field the
// way the model grouped them.
const REPLY = [
  { field: 'primaryText', value: 'P1' },
  { field: 'primaryText', value: 'P2' },
  { field: 'primaryText', value: 'P3' },
  { field: 'headline', value: 'H1' },
  { field: 'headline', value: 'H2' },
  { field: 'headline', value: 'H3' },
  { field: 'description', value: 'D1' },
  { field: 'description', value: 'D2' },
  { field: 'description', value: 'D3' },
]

// --- walking the angles ----------------------------------------------------

check('index 0 is the first of each field', nthPerField(REPLY, 0), {
  primaryText: 'P1',
  headline: 'H1',
  description: 'D1',
})
check('index 1 is the second of each', nthPerField(REPLY, 1), {
  primaryText: 'P2',
  headline: 'H2',
  description: 'D2',
})
check('index 2 is the third of each', nthPerField(REPLY, 2), {
  primaryText: 'P3',
  headline: 'H3',
  description: 'D3',
})
check('the default index is the first', nthPerField(REPLY), nthPerField(REPLY, 0))
check('three angles are available', anglesAvailable(REPLY), 3)

{
  // Past the end wraps rather than going blank. The button stops asking for
  // index 3 once total is reached, but a wrap is the safe behaviour if it did.
  check('index 3 wraps back to the first', nthPerField(REPLY, 3), nthPerField(REPLY, 0))
  check('a big index still returns copy', nthPerField(REPLY, 97), nthPerField(REPLY, 1))
}

// --- uneven counts, which is the case that breaks a naive implementation ---

{
  // Three primary texts but only one headline. Wrapping ACROSS the set rather
  // than per field would hand back an empty headline at index 1, and an ad
  // with no headline is a silently worse ad.
  const uneven = [
    { field: 'primaryText', value: 'P1' },
    { field: 'primaryText', value: 'P2' },
    { field: 'primaryText', value: 'P3' },
    { field: 'headline', value: 'H1' },
  ]
  check('the short field repeats instead of emptying', nthPerField(uneven, 1), {
    primaryText: 'P2',
    headline: 'H1',
  })
  check('and again at the third angle', nthPerField(uneven, 2), {
    primaryText: 'P3',
    headline: 'H1',
  })
  check('the count is the longest field, so no angle is skipped', anglesAvailable(uneven), 3)
}

{
  // One option for everything: there is nothing to cycle, and the button must
  // not offer an angle that does not exist.
  const single = [
    { field: 'primaryText', value: 'P1' },
    { field: 'headline', value: 'H1' },
  ]
  check('a single option set has one angle', anglesAvailable(single), 1)
  check('and index 0 returns it', nthPerField(single, 0), { primaryText: 'P1', headline: 'H1' })
}

// --- a field the picker cannot use ----------------------------------------

{
  // ad-copy filters to the feed fields for a video, but if a painted slot ever
  // came back it must not become a copy field. The picker only reads the three
  // it knows, so this just proves nothing is silently merged.
  const withPainted = [
    { field: 'primaryText', value: 'P1' },
    { field: 'hook', value: 'HOOK' },
  ]
  const got = nthPerField(withPainted, 0)
  check('an unexpected field is carried, not renamed', got, { primaryText: 'P1', hook: 'HOOK' })
}

// --- empties ---------------------------------------------------------------

check('no options is no copy', nthPerField([], 0), {})
check('and no angles', anglesAvailable([]), 0)
check('null does not throw', [nthPerField(null, 0), anglesAvailable(null)], [{}, 0])

console.log(failures === 0 ? '\nAll ad-copy checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
