// Self-check for "Make 3 ads": the prompt asks for the right number and the
// JSON, each set gets its own look, the starting photo is the newest real
// upload, and edits survive a switch between sets.
// Run: node scripts/check-ad-batch.mjs

import { BATCH_LOOKS, assignLooks, batchReady, lookName, makeAdsPrompt, pickBackground, setTitle, snapshotSet } from '../src/lib/adBatch.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

// The prompt.
const p = makeAdsPrompt({ count: 3, clientName: 'Prime Heating & Cooling', today: new Date('2026-10-14') })
check('asks for three ads for the client, this month', /Write 3 static ads for Prime Heating & Cooling to run now, in October/.test(p), true)
check('three angles when three ads', /the current offer, the time of year, and proof or trust/.test(p), true)
check('every FORMAT 2 slot', /fill every slot of FORMAT 2/.test(p), true)
check('ends with the JSON block of exactly three', /JSON block of exactly 3 creative_sets/.test(p), true)
check('no placeholders on the image', /No brackets, no placeholders, no phone numbers or web addresses/.test(p), true)
check('a count of two drops the third angle', /the current offer and the time of year, one ad each/.test(makeAdsPrompt({ count: 2, today: new Date('2026-01-05') })), true)
check('the count is clamped', /Write 6 static ads/.test(makeAdsPrompt({ count: 40 })) && /Write 1 static ads/.test(makeAdsPrompt({ count: -2 })), true)
check('a missing name still reads', /for this client to run now/.test(makeAdsPrompt({})), true)

// The looks.
check('three looks, no classic', BATCH_LOOKS, ['stack', 'plate', 'split'])
check('each set gets the next look', assignLooks([{ hook: 'a' }, { hook: 'b' }, { hook: 'c' }, { hook: 'd' }]).map((s) => s.layout), ['stack', 'plate', 'split', 'stack'])
check('a set that names a look keeps it', assignLooks([{ hook: 'a', layout: 'cover' }])[0].layout, 'cover')
check('a look has a name', [lookName('stack'), lookName('plate'), lookName('split'), lookName('zzz')], ['Headline stack', 'Bottom plate', 'Split panel', 'zzz'])

// The starting photo.
const files = [
  { file_name: 'logo.png', storage_path: 'c1/logo.png', date_uploaded: '2026-10-01' },
  { file_name: 'ad-1-square.png', storage_path: 'ads/c1/1-square.png', date_uploaded: '2026-10-09' },
  { file_name: 'concept.png', storage_path: 'concepts/c1/b1-1.png', date_uploaded: '2026-10-10' },
  { file_name: 'van.jpg', storage_path: 'c1/100-van.jpg', date_uploaded: '2026-09-02' },
  { file_name: 'owner.HEIC', storage_path: 'c1/200-owner.HEIC', date_uploaded: '2026-09-20' },
  { file_name: 'notes.pdf', storage_path: 'c1/300-notes.pdf', date_uploaded: '2026-10-11' },
]
check('the newest real photo, not an ad, a concept, the logo or a PDF', pickBackground({ files }), 'c1/200-owner.HEIC')
check('Drive when nothing is uploaded', pickBackground({ files: [files[0]], drive: [{ id: 'd1', name: 'logo.png', mime_type: 'image/png' }, { id: 'd2', name: 'crew.jpg', mime_type: 'image/jpeg' }] }), 'drive:d2')
check('nothing when there is nothing', pickBackground({ files: [], drive: [] }), '')
check('tolerates missing lists', pickBackground({}), '')

// The chips and the round trip.
check('the chip names the angle', setTitle({ hookAngle: 'Current offer', hook: 'FREE second opinion on any quote' }, 0), '1 · Current offer')
check('or the first words of the hook', setTitle({ hook: 'FREE second opinion on any quote' }, 1), '2 · FREE second opinion on')
check('or a number', setTitle({}, 2), '3 · Ad 3')
const set = { hook: 'FREE second opinion', offerAmount: 'Free', layout: 'stack', backgroundPath: 'c1/owner.jpg', hookAngle: 'Current offer', designBrief: 'owner at the door' }
const edited = snapshotSet(set, { hook: 'FREE second opinion on any quote', offerAmount: 'Free', offerDetail: 'before you sign', layout: 'plate', backgroundPath: 'c1/van.jpg', accent: '#C8102E', badgeColor: '#13294B' })
check('edits are kept on the set', [edited.hook, edited.offerDetail, edited.layout, edited.backgroundPath, edited.accent], ['FREE second opinion on any quote', 'before you sign', 'plate', 'c1/van.jpg', '#C8102E'])
check('what the Studio does not carry stays', [edited.hookAngle, edited.designBrief], ['Current offer', 'owner at the door'])
check('a missing field leaves the set alone', snapshotSet(set, { hook: 'x' }).backgroundPath, 'c1/owner.jpg')
check('ready when every set has a hook or an offer', batchReady([{ hook: 'a' }, { offerAmount: '$89' }, { offerDetail: 'tune-up' }]), true)
check('not ready with an empty set', batchReady([{ hook: 'a' }, { hook: '  ' }]), false)
check('not ready when empty', batchReady([]), false)

if (failures) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
