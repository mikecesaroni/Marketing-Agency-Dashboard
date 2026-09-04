import { supabase } from './supabaseClient'
import { driveVideoFiles, mergeVideos, validateVideo, videoPath } from './adVideos'
import { isDrivePath } from './driveLabels'
import { listDriveImages } from './driveAssets'

/**
 * Storage and database access for ad videos.
 *
 * Split from adVideos.js only so the rules in there stay importable by
 * scripts/check-ad-videos.mjs, which has no Supabase client and no business
 * having one. Everything that touches the network lives here.
 */

export function publicUrl(path) {
  return supabase.storage.from('client-files').getPublicUrl(path).data.publicUrl
}

export async function fetchClientVideos(clientId, account) {
  const [files, registered, drive] = await Promise.all([
    supabase
      .from('client_files')
      .select('id, file_name, storage_path, file_size, date_uploaded')
      .eq('client_id', clientId),
    supabase.from('ad_videos').select('*').eq('client_id', clientId),
    // Videos sitting in the client's Drive folder, which are publishable
    // without being copied anywhere. A client with no folder linked, or a
    // Drive that is unreachable, must not stop the uploaded videos listing --
    // it is an additional source, not a dependency.
    listDriveImages(clientId).catch(() => []),
  ])
  if (files.error) throw files.error

  // Drive rows are converted to the same shape BEFORE the join, so the join
  // itself, isPublishable, statusLabel and everything downstream stay unaware
  // that Drive exists.
  const all = [...(files.data || []), ...driveVideoFiles(drive)]

  // A missing ad_videos table is not a reason to hide the files: they are
  // still there and still uploadable.
  return mergeVideos(all, registered.data || [], account).map((v) => ({
    ...v,
    // A Drive clip has no bucket object, so there is no public URL to preview
    // from. The row carries Meta's poster frame once it is registered, and the
    // picker links out to Drive for playback.
    url: isDrivePath(v.storage_path) ? '' : publicUrl(v.storage_path),
  }))
}

/**
 * Puts a video in the bucket and records it as a client file.
 *
 * The storage upload comes first and the row second, because a row pointing at
 * bytes that are not there renders as a broken video, whereas a file with no
 * row is invisible clutter — and the row insert is the step far less likely to
 * fail.
 */
export async function uploadVideo({ clientId, file }) {
  const problem = validateVideo(file)
  if (problem) throw new Error(problem)

  const path = videoPath(clientId, file.name)
  const { error: upErr } = await supabase.storage
    .from('client-files')
    .upload(path, file, { contentType: file.type || 'video/mp4' })
  if (upErr) throw upErr

  const { error } = await supabase.from('client_files').insert({
    client_id: clientId,
    file_name: file.name,
    file_type: file.type || 'video/mp4',
    file_size: file.size,
    storage_path: path,
    description: 'Ad video',
  })
  if (error) {
    // Roll the bytes back rather than leave an orphan nobody can see or remove.
    await supabase.storage.from('client-files').remove([path])
    throw error
  }

  return { storage_path: path, file_name: file.name }
}

/**
 * Saves what the video is about, so it is typed once and not on every re-roll.
 *
 * Written straight onto the ad_videos row rather than held in the publish
 * screen's state: it describes the clip, not one publish, and the whole reason
 * for it is that the copy assistant otherwise knows nothing about this
 * particular video. Somebody who has to retype it each time they ask for
 * another angle will stop typing it.
 *
 * Matches on client id as well as path so it cannot write to another client's
 * registration of a file with a colliding name.
 */
export async function saveVideoAbout({ clientId, storagePath, about }) {
  const { error } = await supabase
    .from('ad_videos')
    .update({ about: String(about || '').trim() || null })
    .eq('client_id', clientId)
    .eq('storage_path', storagePath)
  if (error) throw error
}

export async function deleteVideo(video) {
  // A Drive clip is not ours to delete. The service account holds read-only
  // scope, so this could only ever fail, and the file belongs to the client
  // anyway -- they remove it in Drive.
  if (isDrivePath(video.storage_path)) {
    throw new Error(
      `${video.file_name} lives in ${'the client\u2019s'} Google Drive. Delete it there and it stops showing here.`
    )
  }
  const { error: rmErr } = await supabase.storage.from('client-files').remove([video.storage_path])
  if (rmErr) throw rmErr
  const { error } = await supabase.from('client_files').delete().eq('id', video.id)
  if (error) throw error
  // The Meta copy is left alone deliberately: an ad already running off it
  // would break, and Meta charges nothing to keep it.
  await supabase.from('ad_videos').delete().eq('storage_path', video.storage_path)
}
