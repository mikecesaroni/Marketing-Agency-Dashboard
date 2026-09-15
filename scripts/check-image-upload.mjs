// Self-check for the HEIC handling. Run: node scripts/check-image-upload.mjs
//
// The rule: A HEIC IS RECOGNISED BY NAME OR BY TYPE, AND ITS JPEG TWIN KEEPS
// THE NAME AND THE STORAGE STAMP WITH ONLY THE EXTENSION CHANGED.

import { isHeic, jpegName, jpegPath } from '../src/lib/imageUpload.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

check('heic by extension', isHeic('IMG_8721.heic'), true)
check('HEIF, upper case', isHeic('photo.HEIF'), true)
check('a storage path', isHeic('24a48dc2/1789494832327-simwu5.heic'), true)
check('jpg is not', isHeic('truck.jpg'), false)
check('a File-like by type, whatever the name', isHeic({ name: 'blob', type: 'image/heic' }), true)
check('a File-like by name when the browser gives no type', isHeic({ name: 'IMG_1.heic', type: '' }), true)
check('a jpeg File-like', isHeic({ name: 'a.jpg', type: 'image/jpeg' }), false)
check('nothing', [isHeic(null), isHeic(''), isHeic(undefined)], [false, false, false])

check('name swaps the extension', jpegName('brian ruck selfie.heic'), 'brian ruck selfie.jpg')
check('name with no extension gets one', jpegName('photo'), 'photo.jpg')
check('empty name', jpegName(''), 'photo.jpg')
check('path keeps folder and stamp', jpegPath('24a48dc2-0157/1789494832327-simwu5.heic'), '24a48dc2-0157/1789494832327-simwu5.jpg')
check('a non-heic path is untouched', jpegPath('x/y.png'), 'x/y.png')

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
