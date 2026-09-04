/**
 * Videos for Meta ads: getting them into storage, and knowing which ones Meta
 * has finished transcoding and will therefore accept in an ad.
 *
 * Videos live in the same public `client-files` bucket as everything else a
 * client uploads, under the same `<client id>/<stamp>-<name>` path — so a clip
 * dropped here also shows up in that client's Files section, and one uploaded
 * there is publishable here. There is no second library to keep in step.
 *
 * The part that is NOT like an image: a Meta video is not the file, it is a
 * transcoded copy that belongs to ONE ad account. That copy has to exist and
 * be finished before an ad can reference it, which is why publishing reads
 * `ad_videos` rather than the bucket, and why the same clip used for two
 * clients is two Meta videos.
 */

// The .js is required, not stylistic: scripts/check-ad-videos.mjs imports this
// module in plain Node, which does not resolve an extensionless relative
// specifier the way Vite does. Without it the checks cannot load this file.
import { drivePath } from './driveLabels.js'

// What Meta accepts and a browser can preview. Meta also takes .avi and .gif,
// which no phone produces and no browser plays inline.
const VIDEO_EXT = /\.(mp4|mov|m4v|webm)$/i

/**
 * The ceiling on an UPLOADED video, and it is Supabase's, not a preference.
 *
 * This project is on the free plan, where Storage refuses any object over
 * 50MB. Verified rather than assumed: streaming a 69MB clip into the bucket
 * came back 413 EntityTooLarge. This said 250MB before, which was a number
 * nobody had tested -- every upload between 50MB and 250MB would have been
 * accepted by the picker and then failed at the bucket, and a 30-second 1080p
 * phone clip lands in exactly that range.
 *
 * A video already in the client's Drive folder is NOT subject to this. Nothing
 * copies it: Meta is given a link and downloads it from Drive itself, so the
 * bucket is never involved and the only limit is Meta's own 4GB.
 */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024

export function isVideoFile(name) {
  return VIDEO_EXT.test(String(name || ''))
}

export function megabytes(bytes) {
  return Math.round(Number(bytes || 0) / (1024 * 1024))
}

/** Empty string when the file is fine, otherwise the reason it is not. */
export function validateVideo(file) {
  if (!file) return 'Pick a video file first.'
  if (!isVideoFile(file.name)) {
    return `${file.name} is not a video Meta will take. Use .mp4 or .mov.`
  }
  if (Number(file.size) > MAX_VIDEO_BYTES) {
    return `${file.name} is ${megabytes(file.size)}MB, over the ${megabytes(
      MAX_VIDEO_BYTES
    )}MB limit. Export it smaller — 1080p is plenty for a feed ad.`
  }
  if (Number(file.size) === 0) return `${file.name} is empty.`
  return ''
}

// Storage keys have to survive being put in a URL. Phone exports arrive named
// things like "IMG_0421 (1).MOV".
function safeName(name) {
  return String(name || 'video')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-80)
}

export function videoPath(clientId, fileName, stamp = Date.now()) {
  return `${clientId}/${stamp}-${safeName(fileName)}`
}

/**
 * One ad account id, however it is spelled.
 *
 * The CRM stores it bare (3053788018160847) because that is what a person
 * copies out of Ads Manager; every Graph path needs act_ in front, so the
 * publish function prefixes it and stored the prefixed form against the
 * video. Comparing the two as plain strings never matched, so a video that
 * really was registered and really was transcoded read as "Not sent to Meta
 * yet" for ever — pressing the button did the work and then showed nothing.
 *
 * Normalising here rather than at the two call sites means the next thing to
 * join on an account id cannot reintroduce it.
 */
export function accountKey(id) {
  return String(id || '').trim().replace(/^act_/i, '')
}

/**
 * Drive's file list, in the shape mergeVideos already understands.
 *
 * Done this way on purpose: a Drive video becomes an ordinary row before the
 * join happens, so mergeVideos, isPublishable, statusLabel and the whole
 * publish path need no idea Drive exists. The registration in ad_videos is
 * keyed on the drive: path exactly as it would be on a bucket path.
 *
 * `source` is the one field that differs, and only so the UI can say where a
 * clip came from and not offer to delete a file it has read-only access to.
 */
export function driveVideoFiles(driveFiles) {
  return (driveFiles || [])
    .filter((f) => String(f.mime_type || '').startsWith('video/'))
    .map((f) => ({
      id: drivePath(f.id),
      file_name: f.name,
      storage_path: drivePath(f.id),
      file_size: f.size || 0,
      date_uploaded: f.modified_time || '',
      source: 'drive',
    }))
}

/**
 * Joins the client's video files to whatever Meta knows about them.
 *
 * Deliberately does NOT build the public URL: that needs the storage client,
 * and it is the one thing here that would make this module unimportable by
 * scripts/check-ad-videos.mjs. fetchClientVideos adds it.
 *
 * Pure, so the join is testable: the interesting cases are a file with no
 * registration yet (the normal state right after upload) and a registration
 * for a DIFFERENT ad account, which must not count — that row is a video in
 * somebody else's account and publishing it here would fail.
 */
export function mergeVideos(files, registered, account) {
  const wanted = accountKey(account)
  const byPath = new Map()
  for (const row of registered || []) {
    if (accountKey(row.meta_account_id) !== wanted) continue
    byPath.set(row.storage_path, row)
  }

  return (files || [])
    .filter((f) => isVideoFile(f.file_name) || isVideoFile(f.storage_path))
    .map((f) => {
      const meta = byPath.get(f.storage_path) || null
      return {
        id: f.id,
        file_name: f.file_name,
        storage_path: f.storage_path,
        file_size: f.file_size,
        uploaded_at: f.date_uploaded,
        meta_video_id: meta?.meta_video_id || '',
        thumb_url: meta?.thumb_url || '',
        // 'new' is the absence of a registration, which is different from
        // 'processing': one needs sending to Meta, the other needs waiting for.
        status: meta ? meta.status : 'new',
        error: meta?.error || '',
        // What the clip actually shows, typed by whoever uploaded it. The one
        // thing the copy assistant knows about THIS video rather than about
        // the client in general, so without it three clips for one client all
        // get written from the same onboarding answers and read the same.
        about: meta?.about || '',
        // 'drive' or undefined. Drive is read-only to this app, so a Drive
        // clip must not be offered a Delete button that cannot work.
        source: f.source || 'upload',
      }
    })
    .sort((a, b) => String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || '')))
}

/**
 * Ready in Meta, so an ad can reference it.
 *
 * The thumbnail is part of "ready", not a nicety. Verified against the live
 * API: a video creative with no image_url or image_hash in video_data is
 * refused outright — subcode 1443226, "Your ad needs a video thumbnail". The
 * same payload with a thumbnail validates. So a video with no cover frame is
 * not publishable, however finished its transcode is.
 */
export function isPublishable(video) {
  return (
    video?.status === 'ready' && Boolean(video?.meta_video_id) && Boolean(video?.thumb_url)
  )
}

/**
 * What to tell the user about one video, in the words they need.
 *
 * Kept next to the states themselves so the panel cannot invent a fourth one.
 */
export function statusLabel(video) {
  if (!video) return ''
  if (video.status === 'new') return 'Not sent to Meta yet'
  if (video.status === 'processing') return 'Meta is processing it'
  if (video.status === 'error') return video.error || 'Meta could not process this video'
  // Transcoded but Meta has not published a cover frame yet. Rare, and it
  // clears on a re-check — but it cannot publish, because Meta rejects a video
  // creative that carries no thumbnail.
  if (!video.thumb_url) return 'No cover frame yet — re-check it'
  return 'Ready to publish'
}
