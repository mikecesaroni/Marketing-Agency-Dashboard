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

import { DRIVE_PREFIX, driveFileId, drivePath, isDrivePath } from '../src/lib/driveLabels.js'
import {
  MAX_VIDEO_BYTES,
  accountKey,
  driveVideoFiles,
  isPublishable,
  isVideoFile,
  mergeVideos,
  megabytes,
  statusLabel,
  validateVideo,
  videoPath,
} from '../src/lib/adVideos.js'

// THE TWO SPELLINGS OF ONE AD ACCOUNT, and the reason this file now uses both.
//
// The CRM stores the id bare, because that is what a person copies out of Ads
// Manager. Every Graph path needs act_ in front, so meta-publish prefixes it —
// and stored the prefixed form against the video. Comparing them as strings
// never matched, so a video that really was registered and really was
// transcoded read as "Not sent to Meta yet" for ever.
//
// The first version of these checks used 'act_1' on BOTH sides of the join, so
// it passed against a broken build. Every fixture below now spells it the way
// the two systems really do.
const BARE_ACCOUNT = '3053788018160847'
const PREFIXED_ACCOUNT = 'act_3053788018160847'

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

// --- one account, two spellings -------------------------------------------

check('the prefix is stripped', accountKey(PREFIXED_ACCOUNT), BARE_ACCOUNT)
check('a bare id is left alone', accountKey(BARE_ACCOUNT), BARE_ACCOUNT)
check('both spellings key the same', accountKey(PREFIXED_ACCOUNT) === accountKey(BARE_ACCOUNT), true)
check('a capitalised prefix is stripped too', accountKey('ACT_123'), '123')
check('whitespace does not make a new account', accountKey('  act_123 '), '123')
check('nothing is the empty key', [accountKey(''), accountKey(null)], ['', ''])
check('a different account is still different', accountKey('act_999') === accountKey('act_123'), false)

// --- the per-account join --------------------------------------------------

const FILES = [
  { id: 'f1', file_name: 'walkthrough.mp4', storage_path: 'c1/1-walkthrough.mp4', file_size: 5e6, date_uploaded: '2026-09-01' },
  { id: 'f2', file_name: 'before-after.mov', storage_path: 'c1/2-before-after.mov', file_size: 9e6, date_uploaded: '2026-09-03' },
  { id: 'f3', file_name: 'ad-square.png', storage_path: 'c1/3-ad-square.png', file_size: 3e5, date_uploaded: '2026-09-02' },
]

{
  const rows = mergeVideos(FILES, [], BARE_ACCOUNT)
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
      meta_account_id: PREFIXED_ACCOUNT,
      meta_video_id: 'v100',
      status: 'ready',
      thumb_url: 'https://x/thumb.jpg',
    },
  ]
  const rows = mergeVideos(FILES, registered, BARE_ACCOUNT)
  const walk = rows.find((r) => r.file_name === 'walkthrough.mp4')
  check('a ready registration attaches its video id', [walk.status, walk.meta_video_id], ['ready', 'v100'])
  check('and is publishable', isPublishable(walk), true)
  check('the other file is untouched', rows.find((r) => r.file_name === 'before-after.mov').status, 'new')
}

{
  // THE REGRESSION. The client's bare id against the row's prefixed one: the
  // exact shape that shipped broken. If this fails, "Send to Meta" appears to
  // do nothing again.
  const registered = [
    {
      storage_path: 'c1/1-walkthrough.mp4',
      meta_account_id: PREFIXED_ACCOUNT,
      meta_video_id: 'v100',
      status: 'ready',
      thumb_url: 'https://x/thumb.jpg',
    },
  ]
  const walk = mergeVideos(FILES, registered, BARE_ACCOUNT).find(
    (r) => r.file_name === 'walkthrough.mp4'
  )
  check('a prefixed row matches a bare client id', walk.status, 'ready')
  check('and is publishable', isPublishable(walk), true)

  // The other direction, in case the two ever swap which form they store.
  const swapped = mergeVideos(
    FILES,
    [{ ...registered[0], meta_account_id: BARE_ACCOUNT }],
    PREFIXED_ACCOUNT
  ).find((r) => r.file_name === 'walkthrough.mp4')
  check('and a bare row matches a prefixed client id', swapped.status, 'ready')
}

{
  // THE ONE THAT MATTERS. Same file, registered against a different ad
  // account. Counting it would publish another account's video id.
  const registered = [
    {
      storage_path: 'c1/1-walkthrough.mp4',
      meta_account_id: 'act_999999999999999',
      meta_video_id: 'v100',
      status: 'ready',
      thumb_url: 'https://x/thumb.jpg',
    },
  ]
  const rows = mergeVideos(FILES, registered, BARE_ACCOUNT)
  const walk = rows.find((r) => r.file_name === 'walkthrough.mp4')
  check("another account's registration does not count", walk.status, 'new')
  check('and carries no video id', walk.meta_video_id, '')
  check('so nothing is publishable', rows.some(isPublishable), false)
}

{
  const rows = mergeVideos(
    FILES,
    [{ storage_path: 'c1/1-walkthrough.mp4', meta_account_id: PREFIXED_ACCOUNT, meta_video_id: 'v1', status: 'processing' }],
    BARE_ACCOUNT
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

// --- what the video is about, the copy assistant's only per-video input ----
//
// Everything else the copy assistant knows comes off the onboarding form, so
// without this every clip for one client is written from identical facts and
// three videos read the same. This one line is the only thing that is about
// THIS video.
//
// It rides on the ad_videos row, so it is subject to the same per-account join
// as everything else here -- which is the case worth pinning down, because a
// note leaking across the join would describe one client's footage while
// writing another client's ad.

{
  const registered = [
    {
      storage_path: 'c1/1-walkthrough.mp4',
      meta_account_id: PREFIXED_ACCOUNT,
      meta_video_id: 'v100',
      status: 'ready',
      thumb_url: 'https://x/thumb.jpg',
      about: 'Dale pulling a bad capacitor in the driveway.',
    },
  ]
  const rows = mergeVideos(FILES, registered, BARE_ACCOUNT)
  const walk = rows.find((r) => r.file_name === 'walkthrough.mp4')
  check('the note comes through the join', walk.about, 'Dale pulling a bad capacitor in the driveway.')

  // A file with no registration has no note to carry.
  const other = rows.find((r) => r.file_name === 'before-after.mov')
  check('an unregistered file has no note', other.about, '')
}

{
  // THE LEAK. Same file, note recorded against a DIFFERENT ad account. If this
  // came through, one client's footage would be described to the copy
  // assistant while it writes another client's ad.
  const registered = [
    {
      storage_path: 'c1/1-walkthrough.mp4',
      meta_account_id: 'act_999999999999999',
      meta_video_id: 'v100',
      status: 'ready',
      thumb_url: 'https://x/thumb.jpg',
      about: "Somebody else's footage entirely.",
    },
  ]
  const walk = mergeVideos(FILES, registered, BARE_ACCOUNT).find(
    (r) => r.file_name === 'walkthrough.mp4'
  )
  check("another account's note does not come through", walk.about, '')
}

{
  // The note is NOT a publishing requirement. Plenty of clips are obvious
  // enough not to need one, and the copy still comes off the onboarding form
  // exactly as it did before this field existed.
  const base = {
    storage_path: 'c1/1-walkthrough.mp4',
    meta_account_id: PREFIXED_ACCOUNT,
    meta_video_id: 'v100',
    status: 'ready',
    thumb_url: 'https://x/thumb.jpg',
  }
  const noNote = mergeVideos(FILES, [base], BARE_ACCOUNT).find(
    (r) => r.file_name === 'walkthrough.mp4'
  )
  check('a video with no note is still publishable', isPublishable(noNote), true)
  check('and reports an empty note, not undefined', noNote.about, '')

  // Null out of Postgres is the normal empty, since the column is nullable and
  // clearing the box writes null rather than ''.
  const nulled = mergeVideos(FILES, [{ ...base, about: null }], BARE_ACCOUNT).find(
    (r) => r.file_name === 'walkthrough.mp4'
  )
  check('a null note reads as empty', nulled.about, '')
  check('and does not block publishing either', isPublishable(nulled), true)
}

// --- videos that live in Google Drive --------------------------------------
//
// A clip in the client's Drive folder is publishable WITHOUT being copied
// anywhere. That is not a convenience, it is the only thing that works: this
// project is on Supabase's free plan, where Storage refuses any object over
// 50MB, and the two clips in the folder that prompted this are 69MB and 344MB.
// Verified rather than assumed -- streaming the 69MB one into the bucket
// returned 413 EntityTooLarge.
//
// So Meta downloads it from Drive instead, and a Drive video is carried through
// the app as `drive:<file id>`. The whole point of that convention is that
// everything after registration -- the join, publishability, the status label,
// the publish flow -- treats it as an ordinary path.

check('a drive path is built and read back', driveFileId(drivePath('abc123')), 'abc123')
check('the prefix is the shared one', drivePath('x').startsWith(DRIVE_PREFIX), true)
check('a bucket path is not a drive path', isDrivePath('c1/1-clip.mp4'), false)
check('a drive path is', isDrivePath('drive:abc123'), true)
check('nothing is not a drive path', [isDrivePath(''), isDrivePath(null)], [false, false])
check('a bucket path yields no file id', driveFileId('c1/1-clip.mp4'), '')

{
  // Drive's listing, as drive-assets really returns it: images, videos and a
  // PDF together. Only the videos belong in the video picker -- a still goes
  // to the image picker and a PDF logo to neither.
  const listing = [
    { id: 'v1', name: 'IMG_7599.MOV', mime_type: 'video/quicktime', size: 69815259, modified_time: '2026-08-31T19:29:51Z' },
    { id: 'v2', name: 'IMG_7733.MOV', mime_type: 'video/quicktime', size: 343981450, modified_time: '2026-08-31T19:28:03Z' },
    { id: 'p1', name: 'IMG_7782.HEIC', mime_type: 'image/heif', size: 2853751, modified_time: '2026-09-01T03:30:07Z' },
    { id: 'd1', name: 'Logo Titos Appliances.pdf', mime_type: 'application/pdf', size: 11769, modified_time: '2026-09-04T16:15:39Z' },
  ]
  const rows = driveVideoFiles(listing)
  check('only the videos are taken', rows.map((r) => r.file_name), ['IMG_7599.MOV', 'IMG_7733.MOV'])
  check('each is keyed by its drive path', rows.map((r) => r.storage_path), ['drive:v1', 'drive:v2'])
  check('and marked as coming from drive', rows.every((r) => r.source === 'drive'), true)
  check('the size comes through for display', rows[1].file_size, 343981450)
  check('an empty listing is empty', driveVideoFiles([]), [])
  check('null does not throw', driveVideoFiles(null), [])
}

{
  // THE POINT OF THE drive: CONVENTION. A Drive clip joins its Meta
  // registration through exactly the same path as an uploaded one, so
  // mergeVideos needed no idea Drive exists.
  const listing = [
    { id: 'v1', name: 'IMG_7599.MOV', mime_type: 'video/quicktime', size: 69815259, modified_time: '2026-08-31' },
  ]
  const files = [...FILES, ...driveVideoFiles(listing)]
  const registered = [
    {
      storage_path: 'drive:v1',
      meta_account_id: PREFIXED_ACCOUNT,
      meta_video_id: 'v100',
      status: 'ready',
      thumb_url: 'https://x/thumb.jpg',
    },
  ]
  const rows = mergeVideos(files, registered, BARE_ACCOUNT)
  const drive = rows.find((r) => r.storage_path === 'drive:v1')
  check('a drive clip appears in the video list', Boolean(drive), true)
  check('it joins its registration', [drive.status, drive.meta_video_id], ['ready', 'v100'])
  check('and is publishable like any other', isPublishable(drive), true)
  check('and says so', statusLabel(drive), 'Ready to publish')
  check('the uploaded videos are still there too', rows.length, 3)

  // The per-account rule holds for Drive too: a registration in somebody
  // else's ad account must not count, or publishing would use their video id.
  const elsewhere = mergeVideos(
    files,
    [{ ...registered[0], meta_account_id: 'act_999999999999999' }],
    BARE_ACCOUNT
  ).find((r) => r.storage_path === 'drive:v1')
  check("another account's drive registration does not count", elsewhere.status, 'new')
}

{
  // 344MB is far over the UPLOAD limit and that must not matter, because
  // nothing uploads it. If validateVideo were ever applied to a Drive clip
  // this would be the symptom: the biggest and best footage refused.
  const listing = [
    { id: 'v2', name: 'IMG_7733.MOV', mime_type: 'video/quicktime', size: 343981450, modified_time: '2026-08-31' },
  ]
  const [big] = driveVideoFiles(listing)
  check('the drive clip is way over the upload limit', big.file_size > MAX_VIDEO_BYTES, true)
  check('and is still listed', big.storage_path, 'drive:v2')
  check(
    'and is publishable once registered',
    isPublishable(
      mergeVideos(
        [big],
        [{ storage_path: 'drive:v2', meta_account_id: PREFIXED_ACCOUNT, meta_video_id: 'm1', status: 'ready', thumb_url: 'https://x/t.jpg' }],
        BARE_ACCOUNT
      )[0]
    ),
    true
  )
}

{
  // The upload limit is Supabase's, and saying 250MB when the bucket refuses
  // anything over 50MB meant the picker accepted files that then failed.
  check('the upload limit is the bucket\'s real one', megabytes(MAX_VIDEO_BYTES), 50)
  check(
    'a 69MB upload is refused, since the bucket would refuse it',
    validateVideo({ name: 'clip.mov', size: 69815259 }).includes('50MB limit'),
    true
  )
}

// --- empties ---------------------------------------------------------------

check('no files is an empty list', mergeVideos([], [], BARE_ACCOUNT), [])
check('null inputs do not throw', mergeVideos(null, null, null), [])

console.log(failures === 0 ? '\nAll ad-video checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
