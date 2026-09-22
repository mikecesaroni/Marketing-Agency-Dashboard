// Self-check for what the Drive pickers show. Run:
//
//   node scripts/check-drive-file-kind.mjs
//
// The rule: A PHOTO PICKER OFFERS ONLY PHOTOS, AND A BADGE NAMES THE FORMAT
// IT IS ACTUALLY LOOKING AT. Both were wrong together: an mp4 was pickable as
// a logo, and every unrenderable file was labelled HEIC.

import { fileKindLabel, fileKindTitle, imagesOnly, isImageFile, isVideoFile } from '../src/lib/driveFileKind.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

const f = (mime, name = 'x') => ({ id: name, name, mime_type: mime })

// What Active Air's folder actually held on the day this broke.
const folder = [
  f('image/heic', 'IMG_8717.heic'),
  f('image/heic', 'IMG_8718.heic'),
  f('video/mp4', 'VIDEO-2026-09-17-16-58-07.mp4'),
  f('image/jpeg', 'logo.jpg'),
  f('application/pdf', 'invoice.pdf'),
]
check('the picker offers photos only', imagesOnly(folder).map((x) => x.name), ['IMG_8717.heic', 'IMG_8718.heic', 'logo.jpg'])
check('the video is not offered as a still', imagesOnly(folder).some(isVideoFile), false)
check('a HEIC is still a photo: Drive renders it', isImageFile(f('image/heic')), true)
check('nothing in, nothing out', imagesOnly(null), [])

// The badge names the format.
check('heic', fileKindLabel(f('image/heic')), 'HEIC')
check('heif is called HEIC too, since that is what the team says', fileKindLabel(f('image/heif')), 'HEIC')
check('an mp4 is not called HEIC', fileKindLabel(f('video/mp4')), 'MP4')
check('quicktime', fileKindLabel(f('video/quicktime')), 'QUICKT')
check('pdf', fileKindLabel(f('application/pdf')), 'PDF')
check('tiff', fileKindLabel(f('image/tiff')), 'TIFF')
check('an x- prefix is dropped', fileKindLabel(f('image/x-canon-cr2')), 'CANON-')
check('a jpeg needs no badge', fileKindLabel(f('image/jpeg')), '')
check('so does a png, webp, gif, bmp, avif', ['image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'].map((m) => fileKindLabel(f(m))), ['', '', '', '', ''])
check('an unknown mime is not a crash', fileKindLabel(f('')), '')
check('mimeType spelling works too, for a raw Drive row', fileKindLabel({ mimeType: 'image/heic' }), 'HEIC')

// The tooltip says why.
check('a video tooltip points at the video ad', fileKindTitle(f('video/mp4')).includes('video ad'), true)
check('a heic tooltip explains the render', fileKindTitle(f('image/heic')).includes('Google Drive renders it'), true)
check('no badge, no tooltip', fileKindTitle(f('image/png')), '')

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
