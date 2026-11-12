// Self-check for dropped statics. Run: node scripts/check-static-drops.mjs
//
// The editor drops one ad as two files, the 1080 × 1350 in one box and the
// 1080 × 1920 in the other; the board has to put each in the box its pixels
// say, land both under one stamp, tell a new drop from one already
// published, and send "click to publish" to the right page with the right
// sets ticked.

import {
  SLOTS,
  assignSlots,
  isStaticFile,
  parseStaticPath,
  publishStaticHref,
  sizeKeyFor,
  slotFit,
  slotsMissing,
  staticAdName,
  staticAdPlan,
  staticDrops,
  staticExt,
  staticPath,
  staticSets,
  staticStem,
  validateStatic,
  waitingStatics,
} from '../src/lib/staticDrops.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

// --- files ---------------------------------------------------------------------
check('png, jpg, jpeg and webp are statics; a clip or a pdf is not', ['a.png', 'b.JPG', 'c.jpeg', 'd.webp', 'e.mp4', 'f.pdf'].map(isStaticFile), [true, true, true, true, false, false])
check('a clip in the image box is refused with the fix', validateStatic({ name: 'tuneup.mp4', size: 10 }), 'tuneup.mp4 is not an image Meta will take. Use .png or .jpg.')
check('over 30 MB is refused', validateStatic({ name: 'big.png', size: 31 * 1024 * 1024 }).includes('30 MB'), true)
check('an empty file is refused', validateStatic({ name: 'x.png', size: 0 }), 'x.png is empty.')
check('a fine file passes', validateStatic({ name: 'x.png', size: 2000 }), '')
check('the stored extension', ['a.PNG', 'b.jpeg', 'c.jpg', 'd.webp'].map(staticExt), ['png', 'jpg', 'jpg', 'webp'])

// --- the size from the pixels ----------------------------------------------------
check('1080x1080 is square, 1080x1350 feed, 1080x1920 story', [sizeKeyFor(1080, 1080), sizeKeyFor(1080, 1350), sizeKeyFor(1080, 1920)], ['square', 'feed', 'story'])
check('near enough counts: 1000x1250 is feed, 1242x2208 is story', [sizeKeyFor(1000, 1250), sizeKeyFor(1242, 2208)], ['feed', 'story'])
check('a landscape export is square, the nearest shape; no pixels is feed', [sizeKeyFor(1200, 628), sizeKeyFor(0, 0)], ['square', 'feed'])

// --- the name from the file name ------------------------------------------------
check('size words come off the stem', ['Tuneup-square.png', 'tuneup_story_final.png', 'Tuneup 9x16.jpg', 'fall-sale (1).png'].map(staticStem), ['Tuneup', 'tuneup', 'Tuneup', 'fall sale 1'])

// --- the two boxes ----------------------------------------------------------------
check('two boxes, the two sizes the editor makes, each saying where it serves', SLOTS.map((s) => [s.key, s.label, s.ratio]), [['feed', '1080 × 1350', '4:5'], ['story', '1080 × 1920', '9:16']])
check('the right file in the right box is exact', [slotFit(1080, 1350, 'feed'), slotFit(1080, 1920, 'story')].map((f) => [f.key, f.exact, f.moved, f.warn, f.note]), [['feed', true, false, false, ''], ['story', true, false, false, '']])
check('near enough is fine, and says so', slotFit(1000, 1250, 'feed'), { key: 'feed', exact: false, moved: false, warn: false, note: '1000 × 1250, close enough to 4:5' })
check('a 9:16 dropped in the 4:5 box goes to the 9:16 box, and the other way round', [slotFit(1080, 1920, 'feed'), slotFit(1080, 1350, 'story')].map((f) => [f.key, f.exact, f.moved, f.note]), [
  ['story', true, true, '1080 × 1920 is a 9:16, so it went in the 1080 × 1920 box'],
  ['feed', true, true, '1080 × 1350 is a 4:5, so it went in the 1080 × 1350 box'],
])
check('a square or a landscape stays where it was dropped, with a warning that Meta will crop it', [slotFit(1080, 1080, 'feed'), slotFit(1200, 628, 'story')].map((f) => [f.key, f.warn, f.note]), [
  ['feed', true, '1080 × 1080 is not 4:5; Meta will crop it for the feeds'],
  ['story', true, '1200 × 628 is not 9:16; Meta will crop it for Stories and Reels'],
])
check('no pixels: stays in the box, flagged', slotFit(0, 0, 'story'), { key: 'story', exact: false, moved: false, warn: false, note: 'could not read the pixels' })

const both = assignSlots([{ name: 'tuneup_final.png', width: 1080, height: 1920 }, { name: 'tuneup-feed.jpg', width: 1080, height: 1350 }], '')
check('both dropped at once anywhere sort themselves, nothing "moved"', [Object.keys(both.placed).sort(), both.placed.feed.file.name, both.placed.story.file.name, both.placed.story.fit.moved, both.refused], [['feed', 'story'], 'tuneup-feed.jpg', 'tuneup_final.png', false, []])
const onBox = assignSlots([{ name: 'a.png', width: 1080, height: 1920 }], 'feed')
check('one dropped on the wrong box is moved, and the note says so', [Object.keys(onBox.placed), onBox.placed.story.fit.moved], [['story'], true])
const twice = assignSlots([{ name: 'a.png', width: 1080, height: 1350 }, { name: 'b.png', width: 1080, height: 1350 }], 'feed')
check('a second 4:5 in one drop is refused with the reason, not made into another ad', [Object.keys(twice.placed), twice.refused.map((r) => r.file.name), twice.refused[0].why.includes('one ad at a time')], [['feed'], ['b.png'], true])

check('the ad is named from what was typed, else the 4:5\'s file name without the size words, else the 9:16\'s, else "static"', [staticAdName(' Fall sale ', { feed: { name: 'x.png' } }), staticAdName('', { feed: { name: 'Tuneup-4x5.png' }, story: { name: 'tuneup-9x16.png' } }), staticAdName('', { story: { name: 'coupon_story.jpg' } }), staticAdName('', {})], ['Fall sale', 'Tuneup', 'coupon', 'static'])
check('one ad from the boxes: the files under one stamp, in size order, each in its own format', staticAdPlan({ story: { name: 'b.PNG' }, feed: { name: 'a.jpeg' } }), [{ key: 'feed', ext: 'jpg' }, { key: 'story', ext: 'png' }])
check('what is missing: both, one, none', [slotsMissing({}), slotsMissing({ feed: { name: 'a.png' } }), slotsMissing({ story: { name: 'b.png' } }), slotsMissing({ feed: { name: 'a.png' }, story: { name: 'b.png' } })], [
  'Drop the images first.',
  'No 1080 × 1920 (9:16): Meta will crop the 4:5 for Stories and Reels. Add it to be sure.',
  'No 1080 × 1350 (4:5): Meta will crop the 9:16 for the feeds. Add it to be sure.',
  '',
])
check('the path is a saved ad\'s path', staticPath('c1', '1700000000000', 'feed', 'jpg'), 'ads/c1/1700000000000-feed.jpg')
check('...and reads back', [parseStaticPath('ads/c1/1700000000000-feed.jpg'), parseStaticPath('videos/c1/clip.mp4')], [{ stamp: '1700000000000', key: 'feed' }, null])

// --- the board -----------------------------------------------------------------------
const NOW = new Date('2026-11-12T15:00:00Z')
const file = (stamp, key, over = {}) => ({ client_id: 'c1', storage_path: `ads/c1/${stamp}-${key}.png`, file_name: `${over.name || 'tuneup'}-${key}.png`, date_uploaded: '2026-11-12T10:00:00', uploaded_by: 'Kyle', drop_note: '', drop_dismissed_at: null, ...over })
const files = [file('100', 'story'), file('100', 'square', { date_uploaded: '2026-11-12T09:59:00' }), file('100', 'feed', { drop_note: 'run it Friday' }), file('200', 'feed', { name: 'coupon', date_uploaded: '2026-11-11T10:00:00' })]
const sets = staticSets(files)
check('one set per stamp, files in size order, the first landing as the drop time, signed and noted from any file', sets.map((s) => [s.stamp, s.name, s.files.map((f) => f.key), s.at, s.by, s.note, s.dismissed]), [
  ['100', 'tuneup', ['square', 'feed', 'story'], '2026-11-12T09:59:00', 'Kyle', 'run it Friday', false],
  ['200', 'coupon', ['feed'], '2026-11-11T10:00:00', 'Kyle', '', false],
])
check('waiting: newest first, nothing published, nothing dismissed', waitingStatics({ files, ads: [], now: NOW }).map((s) => s.stamp), ['100', '200'])
check('a published stamp is not waiting', waitingStatics({ files, ads: [{ stamp: '100' }], now: NOW }).map((s) => s.stamp), ['200'])
check('a set waved off is not waiting', waitingStatics({ files: files.map((f) => (f.storage_path.includes('/200-') ? { ...f, drop_dismissed_at: '2026-11-12T11:00:00Z' } : f)), ads: [], now: NOW }).map((s) => s.stamp), ['100'])
check('older than the window is forgotten', waitingStatics({ files: files.map((f) => ({ ...f, date_uploaded: '2026-09-01T10:00:00' })), ads: [], now: NOW }), [])
// The tuneup set's first file landed at 09:59; a reset at 09:58:30 keeps it and hides yesterday's coupon.
check('"start fresh" hides what was dropped before it', waitingStatics({ files, ads: [], now: NOW, resetAt: '2026-11-12T09:58:30Z' }).map((s) => s.stamp), ['100'])

const clients = [
  { id: 'c1', name: 'Acme', meta_ad_account_id: 'act_1', archived: false },
  { id: 'c2', name: 'Belk', meta_ad_account_id: null, archived: false },
  { id: 'c3', name: 'Cool', meta_ad_account_id: 'act_3', archived: false },
  { id: 'c4', name: 'Ex', meta_ad_account_id: 'act_4', archived: true },
]
const everyFile = [...files, { ...file('300', 'feed', { name: 'belk' }), client_id: 'c2', date_uploaded: '2026-11-12T12:00:00' }, { ...file('400', 'feed'), client_id: 'c4' }]
const board = staticDrops(clients, [{ client_id: 'c1', stamp: '200' }], everyFile, NOW)
check('rows only for clients with a static waiting, newest drop first, archived left out, no Meta account said', board.map((r) => [r.name, r.hasMeta, r.waiting.map((w) => w.stamp)]), [
  ['Belk', false, ['300']],
  ['Acme', true, ['100']],
])
check('click to publish lands on the publish page with the sets ticked', publishStaticHref('c1', ['100', '200']), '/publish/c1?static=100,200')
check('...and with nothing asked for, just the page', publishStaticHref('c1', []), '/publish/c1')

if (failures) {
  console.log(`\n${failures} FAILED`)
  process.exit(1)
}
console.log('\nAll static drop checks passed.')
