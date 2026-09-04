// Self-check for the Drive asset list. Run: node scripts/check-drive-assets.mjs
//
// The rule: A FILE SOMEBODY PUT IN THE FOLDER HAS TO BE VISIBLE, OR SAY WHY.
//
// The list used to query `mimeType contains 'image/'`, so a logo exported as a
// PDF was silently absent. That is the worst shape of missing: Tito added
// "Logo Titos Appliances.pdf" and the CRM showed the folder, showed 35 other
// files from it, and showed no error — so the only available conclusion was
// that Drive or the refresh was broken.
//
// PDFs are listed now because Drive renders them, verified against that exact
// file: its thumbnailLink returns real PNG bytes (magic 89504e47) at both
// 400px and 2048px, which is the same path the 30 HEIC photos in that folder
// already take.

import { convertedLabel } from '../src/lib/driveLabels.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

// --- the converted badge ---------------------------------------------------
//
// Only shown on a file the browser could not have decoded itself. It said the
// literal word HEIC, which was true while images were the only thing listed
// and became wrong the moment a PDF could appear: a correct picture of a logo,
// labelled HEIC.

check('a PDF is labelled PDF, not HEIC', convertedLabel('application/pdf'), 'PDF')
check('an iPhone photo is still HEIC', convertedLabel('image/heif'), 'HEIC')
check('and image/heic is the same word to a person', convertedLabel('image/heic'), 'HEIC')
check('a tiff says TIFF', convertedLabel('image/tiff'), 'TIFF')
check('svg+xml does not print the suffix', convertedLabel('image/svg+xml'), 'SVG')
check('an unknown type still says something', convertedLabel('application/x-weird'), 'X-WEIR')
check('nothing at all does not throw', [convertedLabel(''), convertedLabel(null)], [
  'CONVERTED',
  'CONVERTED',
])

console.log(failures === 0 ? '\nAll drive-asset checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
