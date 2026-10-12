import { supabase } from './supabaseClient'
import { createApprovalLink } from './adApprovalStore'
import { isActive } from './aiVideo'

/**
 * AI videos, the network half: the ai-video function and the two tables it
 * keeps (client_ai_voice per client, ai_videos per job). The rules live in
 * aiVideo.js, which has no Supabase client and no business having one.
 */

export function publicUrl(path) {
  return supabase.storage.from('client-files').getPublicUrl(path).data.publicUrl
}

/**
 * One call to the function, with the real reason surfaced when it says no.
 * `notConfigured` on the thrown error means a vendor key is not set yet.
 */
async function call(body) {
  const { data, error } = await supabase.functions.invoke('ai-video', { body })
  if (error) {
    let parsed = null
    try {
      parsed = await error.context?.json()
    } catch {
      /* not JSON; the generic message is all there is */
    }
    const status = error.context?.status
    const detail = parsed?.error || error.message || ''
    if (status === 404 || /not found|404/i.test(detail)) {
      throw new Error('The ai-video function is not deployed yet. Deploy supabase/functions/ai-video and try again.')
    }
    const err = new Error(detail || 'The AI video request failed.')
    err.notConfigured = Boolean(parsed?.not_configured)
    throw err
  }
  if (data?.error) {
    const err = new Error(data.error)
    err.notConfigured = Boolean(data.not_configured)
    throw err
  }
  return data || {}
}

/** The client's setup row, or null before the first save. */
export async function fetchAiSetup(clientId) {
  const { data, error } = await supabase.from('client_ai_voice').select('*').eq('client_id', clientId).maybeSingle()
  if (error) throw error
  return data || null
}

/** Asks the function, which also moves a "preparing" setup along. */
export const refreshAiSetup = (clientId) => call({ action: 'setup_status', client_id: clientId }).then((d) => d.setup || null)

export const startAiSetup = ({ clientId, basePath, baseName, refPaths, consentName, consentNote }) =>
  call({
    action: 'setup',
    client_id: clientId,
    base_video_path: basePath,
    base_video_name: baseName,
    ref_paths: refPaths,
    consent_name: consentName,
    consent_note: consentNote,
  }).then((d) => d.setup)

export async function fetchAiVideos(clientId) {
  const { data, error } = await supabase
    .from('ai_videos')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(40)
  if (error) throw error
  return data || []
}

export const createAiVideo = ({ clientId, title, script }) =>
  call({ action: 'create', client_id: clientId, title, script }).then((d) => d.job)

/** Moves one job a step and returns it. Harmless on a finished job. */
export const runAiVideo = (id) => call({ action: 'run', id }).then((d) => d.job)

export const retryAiVideo = (id) => call({ action: 'retry', id }).then((d) => d.job)

/** Advances every active job for a client and returns the fresh list. */
export async function pollAiVideos(clientId, jobs) {
  for (const j of (jobs || []).filter(isActive)) {
    try {
      await runAiVideo(j.id)
    } catch {
      /* the next poll, or the cron, gets it */
    }
  }
  return fetchAiVideos(clientId)
}

/**
 * Removes the job and its working files. The finished MP4 stays: it is a
 * client file now, deleted from Files like any other.
 */
export async function deleteAiVideo(job) {
  const prefix = `ai-video/${job.client_id}/${job.id}`
  const { data: objects } = await supabase.storage.from('client-files').list(prefix, { limit: 50 })
  const paths = (objects || []).map((o) => `${prefix}/${o.name}`)
  if (paths.length > 0) await supabase.storage.from('client-files').remove(paths)
  const { error } = await supabase.from('ai_videos').delete().eq('id', job.id)
  if (error) throw error
}

/** An approval link for the finished video, remembered on the job. */
export async function sendAiVideoForApproval({ clientId, job, note }) {
  if (!job?.video_path) throw new Error('That video is not finished yet.')
  const link = await createApprovalLink({ clientId, paths: [job.video_path], note })
  await supabase.from('ai_videos').update({ approval_token: link.token }).eq('id', job.id)
  return link
}

/**
 * Reference photos for the B-roll, copied into the bucket so the video
 * vendor can fetch them by a public URL. Takes Blobs (from Drive via
 * driveObjectUrl, or files from the picker). Returns their paths.
 */
export async function saveRefPhotos({ clientId, blobs }) {
  const paths = []
  for (const [i, blob] of (blobs || []).entries()) {
    const ext = /png$/i.test(blob.type) ? 'png' : /webp$/i.test(blob.type) ? 'webp' : 'jpg'
    const path = `ai-video/${clientId}/ref-${Date.now()}-${i + 1}.${ext}`
    const { error } = await supabase.storage.from('client-files').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true })
    if (error) throw error
    paths.push(path)
  }
  return paths
}
