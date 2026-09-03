// Self-check for video ads. Run:
//
//   node scripts/check-ad-videos.mjs
//
// The rule that matters: A META VIDEO BELONGS TO ONE AD ACCOUNT.
//
// Uploading a clip puts one file in the bucket, but publishing it for two
// clients means two Meta videos, because Meta transcodes a private copy into
// the ad account and that copy does not travel. So the join from "file in the
// bucket" to "publishable video" is per ad account, and a registration for
// somebody else's account must read as "not sent yet" here rather than as
// ready — publishing against another account's video id fails at the very last
// step, creating the ad, after a campaign and ad set already exist.
//
// The second rule: only a video Meta has finished transcoding can go in an ad.
// A creative referencing one that is still processing is rejected.

import {
  MAX_VIDEO_BYTES,
  isPublishable,
  isVideoFile,
  mergeVideos,
  megabytes,
  statusLabel,
  validateVideo,
  videoPath,
} from '../src/lib/adVideos.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

// --- which files are videos ------------------------------------------------

check('mp4 is a video', isVideoFile('clip.mp4'), true)
check('a phone .MOV is too, upper case', isVideoFile('IMG_0421.MOV'), true)
check('so is .m4v and .webm', [isVideoFile('a.m4v'), isVideoFile('b.webm')], [true, true])
check('a png is not', isVideoFile('ad-square.png'), false)
check('a name that merely contains mp4 is not', isVideoFile('mp4-notes.txt'), false)
check('nothing is not', [isVideoFile(''), isVideoFile(null)], [false, false])

// --- what may be uploaded --------------------------------------------------

check('a normal clip passes', validateVideo({ name: 'a.mp4', size: 5 * 1024 * 1024 }), '')
check(
  'a png is refused by name',
  validateVideo({ name: 'a.png', size: 1000 }).includes('not a video'),
  true
)
check(
  'an oversized file is refused, with both numbers',
  validateVideo({ name: 'big.mp4', size: MAX_VIDEO_BYTES + 1 }).includes(`${megabytes(MAX_VIDEO_BYTES)}MB limit`),
  true
)
check('a zero-byte file is refused', validateVideo({ name: 'a.mp4', size: 0 }).includes('empty'), true)
check('no file is refused', validateVideo(null), 'Pick a video file first.')
check('exactly at the limit is allowed', validateVideo({ name: 'a.mp4', size: MAX_VIDEO_BYTES }), '')

// --- storage paths ---------------------------------------------------------

{
  // Phone exports arrive with spaces and parentheses, and the path ends up in
  // a URL that Meta has to fetch.
  const path = videoPath('c1', 'IMG_0421 (1).MOV', 1788400000000)
  check('the path is prefixed by client and stamped', path.startsWith('c1/1788400000000-'), true)
  check('and carries no characters that need escaping', /^[\w./-]+$/.test(path), true)
}

// --- the per-account join --------------------------------------------------

const FILES = [
  { id: 'f1', file_name: 'walkthrough.mp4', storage_path: 'c1/1-walkthrough.mp4', file_size: 5e6, date_uploaded: '2026-09-01' },
  { id: 'f2', file_name: 'before-after.mov', storage_path: 'c1/2-before-after.mov', file_size: 9e6, date_uploaded: '2026-09-03' },
  { id: 'f3', file_name: 'ad-square.png', storage_path: 'c1/3-ad-square.png', file_size: 3e5, date_uploaded: '2026-09-02' },
]

{
  const rows = mergeVideos(FILES, [], 'act_1')
  check('non-videos are dropped from the list', rows.map((r) => r.file_name), [
    'before-after.mov',
    'walkthrough.mp4',
  ])
  check('newest first, because that is the one just uploaded', rows[0].file_name, 'before-after.mov')
  check('an unregistered file reads as new, not processing', rows[0].status, 'new')
  check('and is not publishable', rows.some(isPublishable), false)
}

{
  const registered = [
    {
      storage_path: 'c1/1-walkthrough.mp4',
      meta_account_id: 'act_1',
      meta_video_id: 'v100',
      status: 'ready',
      thumb_url: 'https://x/thumb.jpg',
    },
  ]
  const rows = mergeVideos(FILES, registered, 'act_1')
  const walk = rows.find((r) => r.file_name === 'walkthrough.mp4')
  check('a ready registration attaches its video id', [walk.status, walk.meta_video_id], ['ready', 'v100'])
  check('and is publishable', isPublishable(walk), true)
  check('the other file is untouched', rows.find((r) => r.file_name === 'before-after.mov').status, 'new')
}

{
  // THE ONE THAT MATTERS. Same file, registered against a different ad
  // account. Counting it would publish another account's video id.
  const registered = [
    {
      storage_path: 'c1/1-walkthrough.mp4',
      meta_account_id: 'act_SOMEONE_ELSE',
      meta_video_id: 'v100',
      status: 'ready',
      thumb_url: 'https://x/thumb.jpg',
    },
  ]
  const rows = mergeVideos(FILES, registered, 'act_1')
  const walk = rows.find((r) => r.file_name === 'walkthrough.mp4')
  check("another account's registration does not count", walk.status, 'new')
  check('and carries no video id', walk.meta_video_id, '')
  check('so nothing is publishable', rows.some(isPublishable), false)
}

{
  const rows = mergeVideos(
    FILES,
    [{ storage_path: 'c1/1-walkthrough.mp4', meta_account_id: 'act_1', meta_video_id: 'v1', status: 'processing' }],
    'act_1'
  )
  const walk = rows.find((r) => r.file_name === 'walkthrough.mp4')
  check('a processing video is not publishable', isPublishable(walk), false)
  check('and says so', statusLabel(walk), 'Meta is processing it')
}

{
  // Ready but with no video id is a broken row, not a green light.
  check('ready with no id is not publishable', isPublishable({ status: 'ready', meta_video_id: '' }), false)
  check('nothing at all is not publishable', isPublishable(null), false)
}

{
  const failed = { status: 'error', error: 'Video file is corrupt', meta_video_id: 'v9' }
  check('an error is not publishable even with an id', isPublishable(failed), false)
  check("and shows Meta's own reason", statusLabel(failed), 'Video file is corrupt')
  check(
    'an error with no reason still says something',
    statusLabel({ status: 'error', error: '' }),
    'Meta could not process this video'
  )
}

{
  // NO THUMBNAIL IS NOT PUBLISHABLE, and this was wrong the first time.
  //
  // The guess was that Meta would pick a frame if none was given. It does not:
  // validating the identical creative twice against a live ad account, one
  // with image_url and one without, gives {success:true} and a 400 —
  // subcode 1443226, "Your ad needs a video thumbnail. Please specify one of
  // image_hash or image_url in the video_data field of object_story_spec."
  // Allowing the tick would have produced a publish that always failed.
  const noThumb = { status: 'ready', meta_video_id: 'v1', thumb_url: '' }
  check('ready with no thumbnail is NOT publishable', isPublishable(noThumb), false)
  check('and the label says to re-check it', statusLabel(noThumb), 'No cover frame yet — re-check it')

  const withThumb = { status: 'ready', meta_video_id: 'v1', thumb_url: 'https://x/t.jpg' }
  check('the same video with a cover frame is publishable', isPublishable(withThumb), true)
}

// --- empties ---------------------------------------------------------------

check('no files is an empty list', mergeVideos([], [], 'act_1'), [])
check('null inputs do not throw', mergeVideos(null, null, null), [])

console.log(failures === 0 ? '\nAll ad-video checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
