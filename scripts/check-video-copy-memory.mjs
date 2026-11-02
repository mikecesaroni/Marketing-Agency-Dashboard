// Self-check for what the publish page keeps for a video between visits.
// Run: node scripts/check-video-copy-memory.mjs
//
// The rule: THE WORDS THE AI WROTE, AND THE ONES SOMEBODY TYPED, COME BACK
// ON THE NEXT VISIT; NOTHING IS WRITTEN TWICE AND NOTHING TYPED IS OVERWRITTEN.

import { copyChanged, copyFromRow, copyToSave, versionsFromRow, versionsToSave } from '../src/lib/videoCopyMemory.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

const copy = { primary_text: ' Third repair this year? ', headline: 'Free quote', description: '', ad_name: 'WC_Fall | 11-02 | repair', meta_video_id: '123', thumb_url: 'https://x' }
check('what is saved: the four text fields, trimmed, never the Meta ids', copyToSave(copy), { primary_text: 'Third repair this year?', headline: 'Free quote', description: '', ad_name: 'WC_Fall | 11-02 | repair' })
check('all blank saves nothing', copyToSave({ meta_video_id: '123', primary_text: '  ' }), null)
check('changed: a word moved', copyChanged({ ...copy, headline: 'Free estimate' }, copyToSave(copy)), true)
check('not changed: only an id was stamped', copyChanged({ ...copy, meta_video_id: '999' }, copyToSave(copy)), false)
check('not changed: nothing saved and nothing typed', copyChanged({ meta_video_id: '1' }, null), false)

const row = { copy: { primary_text: 'Saved line', headline: 'Saved head', description: '', ad_name: 'WC_x' }, versions: { note: 'three angles', variations: [{ angle: 'The offer', primaryText: 'A', headline: 'B', description: 'C' }, { angle: 'Trust', primaryText: 'D', headline: 'E', description: 'F' }] } }
check('the saved copy comes back as a patch, blanks left out', copyFromRow(row, null), { primary_text: 'Saved line', headline: 'Saved head', ad_name: 'WC_x' })
check('...but never over words already on the page', copyFromRow(row, { primary_text: 'Typing now' }), null)
check('...and a row with none gives nothing', [copyFromRow({}, null), copyFromRow({ copy: { primary_text: '' } }, null)], [null, null])
check('the versions come back in the shape the cards read', versionsFromRow(row), { note: 'three angles', variations: [{ angle: 'The offer', primaryText: 'A', headline: 'B', description: 'C' }, { angle: 'Trust', primaryText: 'D', headline: 'E', description: 'F' }] })
check('no versions, or an empty list, is null', [versionsFromRow({}), versionsFromRow({ versions: { variations: [] } }), versionsFromRow({ versions: 'junk' })], [null, null, null])
check('what is saved of the versions is the note and the three, nothing else', versionsToSave({ note: 'n', variations: [{ angle: 'a', primaryText: 'p', headline: 'h', description: 'd', extra: 1 }], raw: {} }), { note: 'n', variations: [{ angle: 'a', primaryText: 'p', headline: 'h', description: 'd' }] })

if (failures) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll video copy memory checks passed')
