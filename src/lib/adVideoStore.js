import { supabase } from './supabaseClient'
import { mergeVideos, validateVideo } from './adVideos'

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
  const [files, registered] = await Promise.all([
    supabase
      .from('client_files')
      .select('id, file_name, storage_path, file_size, date_uploaded')
      .eq('client_id', clientId),
    supabase.from('ad_videos').select('*').eq('client_id', clientId),
  ])
  if (files.error) throw files.error
  // A missing ad_videos table is not a reason to hide the files: they are
  // still there and still uploadable.
  return mergeVideos(files.data, registered.data || [], account).map((v) => ({
    ...v,
    url: publicUrl(v.storage_path),
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

export async function deleteVideo(video) {
  const { error: rmErr } = await supabase.storage.from('client-files').remove([video.storage_path])
  if (rmErr) throw rmErr
  const { error } = await supabase.from('client_files').delete().eq('id', video.id)
  if (error) throw error
  // The Meta copy is left alone deliberately: an ad already running off it
  // would break, and Meta charges nothing to keep it.
  await supabase.from('ad_videos').delete().eq('storage_path', video.storage_path)
}
