// Self-check for sending saved ads to an owner. Run:
//
//   node scripts/check-ad-approval.mjs
//
// The rule: ONE IMAGE PER AD, AND ONLY EVER AN AD THE OWNER WAS SENT.
//
// One image per ad because that is the difference between "do you like these"
// and "which of these do you like": three crops each turns four ads into
// twelve pictures and the reply stops being an approval.
//
// The second half is the security one. A decision is written against a
// storage path, so a path the link does not contain must be refused -- the
// database function enforces that, and these checks pin the shape the UI
// sends it so a selection can never carry a path from another client.

import {
  approvalStatusLine,
  approvalSummary,
  approvalUrl,
  onePerSet,
  sizesAvailable,
} from '../src/lib/adApproval.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

// Shaped as fetchSavedAds really returns: sets of one to three sizes, in the
// Studio's order, and a set whose recipe never wrote is still a picture.
const set = (stamp, keys) => ({
  stamp,
  ordered: keys.map((k) => ({
    size: { key: k, label: k },
    file: { storage_path: `ads/c1/${stamp}-${k}.png`, url: `https://x/${stamp}-${k}.png` },
  })),
})

const THREE = [set('100', ['square', 'feed', 'story']), set('200', ['square', 'feed', 'story'])]

// --- one image per ad ------------------------------------------------------

{
  const picked = onePerSet(THREE, 'square')
  check('two ads give two images, not six', picked.length, 2)
  check('and each is the size asked for', picked.map((p) => p.sizeKey), ['square', 'square'])
  check('at the right paths', picked.map((p) => p.storage_path), [
    'ads/c1/100-square.png',
    'ads/c1/200-square.png',
  ])
  check('nothing is marked substituted', picked.some((p) => p.substituted), false)
}

{
  const picked = onePerSet(THREE, 'story')
  check('a different size is honoured', picked.map((p) => p.sizeKey), ['story', 'story'])
}

{
  // AN AD THAT NEVER SAVED AT THE CHOSEN SIZE. Dropping it silently would send
  // three ads when four were ticked, which nobody would notice until the owner
  // asked about the missing one.
  const mixed = [set('100', ['square']), set('200', ['story'])]
  const picked = onePerSet(mixed, 'square')
  check('an ad missing that size still goes', picked.length, 2)
  check('using what it does have', picked.map((p) => p.sizeKey), ['square', 'story'])
  check('and says which one was substituted', picked.map((p) => p.substituted), [false, true])
}

{
  const empty = [{ stamp: '300', ordered: [] }]
  check('an ad with no images at all is skipped', onePerSet(empty, 'square'), [])
  check('no ads is no images', onePerSet([], 'square'), [])
  check('null does not throw', onePerSet(null, 'square'), [])
}

// --- which sizes may be offered -------------------------------------------

{
  check('all three when every ad has them', sizesAvailable(THREE).sort(), [
    'feed',
    'square',
    'story',
  ])
  // Offering a size nothing saved at would send substitutes for every ad.
  check('only what exists', sizesAvailable([set('100', ['square'])]), ['square'])
  check('nothing selected is nothing offered', sizesAvailable([]), [])
}

// --- where the approval stands --------------------------------------------

{
  const items = [{ decision: 'approved' }, { decision: 'approved' }]
  check('all approved is all approved', approvalSummary(items).allApproved, true)
  check('and reads plainly', approvalStatusLine(items, true), 'All 2 approved')
}

{
  // ONE REQUEST FOR CHANGES IS NOT A GREEN LIGHT, and neither is one ad nobody
  // has looked at. This is the flag a person glances at before publishing.
  check(
    'a change request blocks all-approved',
    approvalSummary([{ decision: 'approved' }, { decision: 'changes' }]).allApproved,
    false
  )
  check(
    'an unanswered ad blocks it too',
    approvalSummary([{ decision: 'approved' }, {}]).allApproved,
    false
  )
  check('and nothing at all is not approval', approvalSummary([]).allApproved, false)
}

{
  const mixed = [{ decision: 'approved' }, { decision: 'changes' }, {}]
  check('the counts are all reported', approvalStatusLine(mixed, true), '1 approved · 1 needs changes · 1 waiting')
  // Never opened is a different problem from not answered: it means the link
  // did not reach them.
  check('not opened says so', approvalStatusLine([{}, {}], false), 'Not opened yet · 2 ads')
  check('but not once they have answered', approvalStatusLine([{ decision: 'approved' }, {}], false), '1 approved · 1 waiting')
}

// --- the link --------------------------------------------------------------

{
  check('the url is built off the app origin', approvalUrl('https://crm.example.com', 'abc'), 'https://crm.example.com/approve/abc')
  check('a trailing slash does not double up', approvalUrl('https://crm.example.com/', 'abc'), 'https://crm.example.com/approve/abc')
}

console.log(failures === 0 ? '\nAll ad-approval checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
