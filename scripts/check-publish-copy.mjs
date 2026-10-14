// Self-check for the feed copy written on the publish page: which statics
// need it, what is sent, how the answer is read, and that typing is never
// overwritten.
// Run: node scripts/check-publish-copy.mjs

import { feedCopyFromOptions, feedCopyInstruction, mergeWritten, needsFeedCopy, nextToWrite, staticCurrent } from '../src/lib/publishCopy.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

check('needs copy when there is no primary text', needsFeedCopy({ headline: 'x' }), true)
check('needs copy when the primary text is blank', needsFeedCopy({ primary_text: '   ' }), true)
check('does not need copy once there is primary text', needsFeedCopy({ primary_text: 'Got a quote?' }), false)
check('tolerates a missing record', needsFeedCopy(undefined), true)

const recipe = { badge: 'Manchester', hook: 'FREE second opinion on any quote', offer_amount: 'Free', offer_detail: 'second opinion', subhead: 'Before you commit.', proof: '4.9 on Google, 312 reviews' }
check('the painted words travel as the current slots', staticCurrent(recipe, { headline: 'typed' }), {
  badge: 'Manchester',
  hook: 'FREE second opinion on any quote',
  offerAmount: 'Free',
  offerDetail: 'second opinion',
  subhead: 'Before you commit.',
  proof: '4.9 on Google, 312 reviews',
  primaryText: '',
  headline: 'typed',
  description: '',
})
check('no recipe still makes a shape', Object.keys(staticCurrent(null, null)).length, 9)
check('the instruction names the three feed fields and keeps the image final', /IMAGE ad/.test(feedCopyInstruction()) && /primaryText, headline and description/.test(feedCopyInstruction()), true)

const options = [
  { field: 'hook', value: 'A sharper hook', why: 'ignored: the image is saved' },
  { field: 'primaryText', value: 'Got a big quote? Let us look first.', why: 'leads with the offer' },
  { field: 'primaryText', value: 'Second option', why: '' },
  { field: 'headline', value: 'Free second opinion, no pressure', why: '' },
  { field: 'description', value: '  Licensed, local, honest.  ', why: '' },
  { field: 'description', value: '', why: '' },
]
check('first option per feed field, painted slots ignored, trimmed', feedCopyFromOptions(options), {
  primary_text: 'Got a big quote? Let us look first.',
  headline: 'Free second opinion, no pressure',
  description: 'Licensed, local, honest.',
})
check('an empty answer is an empty patch', feedCopyFromOptions([]), {})
check('a blank first value does not block a later one', feedCopyFromOptions([{ field: 'headline', value: ' ' }, { field: 'headline', value: 'Real' }]).headline, 'Real')

check('typed lines stay, blanks are filled', mergeWritten({ primary_text: '', headline: 'Mine', description: '', ad_name: 'WC_x' }, { primary_text: 'Written', headline: 'Theirs', description: 'Desc' }), {
  primary_text: 'Written',
  headline: 'Mine',
  description: 'Desc',
  ad_name: 'WC_x',
})
check('merging into nothing works', mergeWritten(undefined, { headline: 'H' }), { headline: 'H' })

const copies = { a: { primary_text: 'has it' }, b: { primary_text: '' }, c: {} }
check('the next static to write for is the first ticked one without primary text', nextToWrite({ picked: ['a', 'b', 'c'], copies, done: new Set() }), 'b')
check('one already written for is skipped', nextToWrite({ picked: ['a', 'b', 'c'], copies, done: new Set(['b']) }), 'c')
check('nothing left', nextToWrite({ picked: ['a'], copies, done: new Set() }), '')
check('an unticked static is never written for', nextToWrite({ picked: [], copies, done: new Set() }), '')

if (failures) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
