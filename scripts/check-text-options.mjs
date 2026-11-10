// Self-check for Meta's multiple text options: the pure half
// (src/lib/textOptions.js), the copy memory that keeps them, and the wiring:
// the publish page sends the lists, meta-publish builds the creative Meta
// mixes from, the copy assistant writes three of each in the house style
// read off Don Air's hand-built ads, and the chat can read a live ad's words.
// Run: node scripts/check-text-options.mjs

import { readFileSync } from 'node:fs'
import {
  MAX_TEXT_OPTIONS,
  cleanList,
  hasTextOptions,
  moreCopyToSave,
  moreFromSaved,
  moreOf,
  optionLists,
  patchFromWritten,
  textOptionsForPublish,
  textOptionsLabel,
} from '../src/lib/textOptions.js'
import { copyFromRow, copyToSave } from '../src/lib/videoCopyMemory.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

check('Meta takes five of each', MAX_TEXT_OPTIONS, 5)
check('a list is trimmed, distinct, non-blank and capped', cleanList([' a ', 'a', '', 'b', 'c', 'd', 'e', 'f'], 5), ['a', 'b', 'c', 'd', 'e'])

const copy = { primary_text: 'Main', headline: 'H1', description: '', more_primary_texts: ['Second', ' Main ', '', 'Third'], more_headlines: ['H2'], more_descriptions: [] }
check('the extras never repeat the main field and drop blanks', moreOf(copy), { more_primary_texts: ['Second', 'Third'], more_headlines: ['H2'], more_descriptions: [] })
check('the lists Meta gets lead with the main field', optionLists(copy), { primary_texts: ['Main', 'Second', 'Third'], headlines: ['H1', 'H2'], descriptions: [] })
check('one of each is not text options', [hasTextOptions({ primary_text: 'A', headline: 'B' }), hasTextOptions(copy), textOptionsForPublish({ primary_text: 'A' })], [false, true, null])
check('the label counts what Meta gets', [textOptionsLabel(copy), textOptionsLabel({ primary_text: 'A' })], ['3 primary texts · 2 headlines · 0 descriptions', ''])
check(
  'what the assistant wrote: the first into the field, the rest into the extras, an empty part left alone',
  patchFromWritten({ primaryTexts: ['P1', 'P2', 'P3'], headlines: ['H1', 'H2', 'H3'], descriptions: [] }),
  { primary_text: 'P1', more_primary_texts: ['P2', 'P3'], headline: 'H1', more_headlines: ['H2', 'H3'] }
)
check('a static saves its extras as more_copy, null with none', [moreCopyToSave(copy), moreCopyToSave({ primary_text: 'A' })], [{ primary_texts: ['Second', 'Third'], headlines: ['H2'], descriptions: [] }, null])
check('...and reads them back as the record lists, every list present', moreFromSaved({ primary_texts: ['x', ''], headlines: null }), { more_primary_texts: ['x'], more_headlines: [], more_descriptions: [] })
check(
  'a video keeps its extras with the copy',
  copyToSave({ ...copy, ad_name: 'WC_x' }),
  { primary_text: 'Main', headline: 'H1', description: '', ad_name: 'WC_x', more_primary_texts: ['Second', 'Third'], more_headlines: ['H2'] }
)
check('...and they come back on the next visit', copyFromRow({ copy: { primary_text: 'Main', more_primary_texts: ['Second'], more_headlines: [] } }, null), { primary_text: 'Main', more_primary_texts: ['Second'] })

const publish = read('supabase/functions/meta-publish/index.ts')
check(
  'the publish function builds the creative Meta mixes from',
  [publish.includes("optimization_type: 'DEGREES_OF_FREEDOM'"), publish.includes('function textOptionsParams('), publish.includes('primary_texts: listOf(a.primary_texts)'), publish.includes('text_options: built.text_options')],
  [true, true, true, true]
)
check(
  '...as the plain creative plus the three lists (the shape read off Don Air’s), for a video and for an image as one size',
  [publish.includes('asset_feed_spec: feed,'), publish.includes('video_id: input.video.id,\n          image_url: input.video.thumbUrl || undefined,\n          call_to_action: callToAction,'), publish.includes('per_placement: Object.keys(hashes).length > 1 && !fellBack && !texts')],
  [true, true, true]
)
check('...and the single-ad call carries the lists like the batch', publish.includes('primary_texts: body.primary_texts,'), true)
const panel = read('src/components/PublishToMetaPanel.jsx')
check('the publish page sends the lists for a static and a video', (panel.match(/\.\.\.\(textOptionsForPublish\(c\) \|\| \{\}\)/g) || []).length, 2)
check('...keeps a static’s extras on its saved ad and reads them back', [panel.includes('...moreFromSaved(r.more_copy)'), read('src/lib/savedAds.js').includes('more_copy: moreCopyToSave(copy)')], [true, true])
check('the editor sits under the fields for a video and for a static', [read('src/components/VideoAdPicker.jsx').includes('<TextOptionsEditor'), panel.includes('<TextOptionsEditor')], [true, true])

const fn = read('supabase/functions/ad-copy/index.ts')
check(
  'the copy assistant writes three of each in the house style',
  [fn.includes("body.mode === 'text_options'"), fn.includes('THREE primary texts, THREE headlines and'), fn.includes('each starting with ✅'), fn.includes('No option may lean on another')],
  [true, true, true, true]
)
check('...and the plain style on request', fn.includes('body.emojis === false'), true)
check('the chat can read the words on a live ad', read('supabase/functions/meta-manage/index.ts').includes("action === 'ad_copy'"), true)

if (failures) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll text options checks passed')
