import { supabase } from './supabaseClient'

/**
 * The client's videos, the network half: the token-gated list, Meta's copy
 * of the clips we do not hold, and the bucket links. The shaping is in
 * clientVideos.js. The bucket helpers are the same two lines as in
 * adVideoStore.js, repeated here so a client page does not pull the CRM's
 * Drive code into the first file a phone downloads.
 */

const BUCKET = 'client-files'

export const publicUrl = (path) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

/** A link that downloads the clip under its own name: the bucket is on another origin, so the `download` attribute alone would be ignored. */
export const downloadUrl = (path, name = '') => supabase.storage.from(BUCKET).getPublicUrl(path, { download: name || true }).data.publicUrl

/** { client: { name }, videos: [...] }, or null when the link is not valid. Throws on a failed call. */
export async function loadClientVideos(token) {
  const { data, error } = await supabase.rpc('client_videos_load', { p_token: token })
  if (error) throw error
  return data || null
}

/**
 * Meta's own copy of the clips behind these ads, as a Map by ad id of the
 * client-dashboard function's creatives ({ video, image, thumb, video_id }).
 * Only this client's ads come back; the function checks. Empty on any
 * trouble: a video with no link is still listed, just not playable.
 */
export async function metaVideoLinks(token, adIds) {
  const out = new Map()
  const ids = [...new Set((adIds || []).map(String).filter(Boolean))]
  for (let i = 0; i < ids.length; i += 60) {
    try {
      const { data } = await supabase.functions.invoke('client-dashboard', { body: { token, action: 'videos', ad_ids: ids.slice(i, i + 60) } })
      for (const c of (data && data.creatives) || []) if (c && c.ad_id) out.set(String(c.ad_id), c)
    } catch {
      // left empty on purpose
    }
  }
  return out
}
