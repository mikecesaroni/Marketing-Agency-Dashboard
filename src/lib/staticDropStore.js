import { supabase } from './supabaseClient'
import { staticAdName, staticAdPlan, staticPath, validateStatic } from './staticDrops'
import { dropNote } from './videoLaunch'

/**
 * Storage and database access for dropped statics (src/lib/staticDrops.js
 * has the rules). Split the same way adVideoStore.js is from adVideos.js:
 * everything that touches the network lives here.
 */

/** The image's pixels, read in the browser, so the box it fits can be worked out. */
export async function measureImage(file) {
  try {
    const bmp = await createImageBitmap(file)
    const out = { width: bmp.width, height: bmp.height }
    bmp.close?.()
    return out
  } catch {
    return await new Promise((resolve) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve({ width: img.naturalWidth, height: img.naturalHeight })
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve({ width: 0, height: 0 })
      }
      img.src = url
    })
  }
}

/**
 * Puts one ad from the two boxes in the bucket as one saved-ad set.
 *
 * files is { feed?: File, story?: File } (a square too, if one ever comes).
 * Each goes where a Studio artboard goes (ads/<client>/<stamp>-<size>), gets
 * its client_files row (signed, noted, marked drop_kind 'static'), and the
 * set gets its saved_ads row carrying the ad's name and who dropped it, so
 * the publish page can keep the words on it. Bytes first, row second, as
 * uploadVideo does; a row that fails takes its bytes back out.
 *
 * Returns { stamp, name, files: [{ path, name, key }] }.
 */
export async function uploadStaticAd({ clientId, name = '', files = {}, uploadedBy = '', note = '' }) {
  const plan = staticAdPlan(files)
  if (plan.length === 0) throw new Error('Drop the images first.')
  for (const { key } of plan) {
    const problem = validateStatic(files[key])
    if (problem) throw new Error(problem)
  }
  const stamp = String(Date.now())
  const adName = staticAdName(name, files)
  const who = String(uploadedBy || '').trim() || null
  const clean = dropNote(note) || null
  const uploaded = []
  for (const { key, ext } of plan) {
    const file = files[key]
    const path = staticPath(clientId, stamp, key, ext)
    const { error: upErr } = await supabase.storage.from('client-files').upload(path, file, { contentType: file.type || 'image/png' })
    if (upErr) throw upErr
    const { error } = await supabase.from('client_files').insert({
      client_id: clientId,
      file_name: file.name,
      file_type: file.type || 'image/png',
      file_size: file.size,
      storage_path: path,
      description: 'Dropped static',
      uploaded_by: who,
      drop_note: clean,
      drop_kind: 'static',
    })
    if (error) {
      await supabase.storage.from('client-files').remove([path])
      throw error
    }
    uploaded.push({ path, name: file.name, key })
  }
  // The recipe row: the name the lists show and who dropped it. Best
  // effort: a set without one still publishes, it just reads "image only"
  // in the gallery and the words are written again on the next visit.
  await supabase.from('saved_ads').insert({ client_id: clientId, stamp, hook: adName || null, dropped_by: who }).then(() => {}, () => {})
  return { stamp, name: adName, files: uploaded }
}

/** "Clear": takes dropped statics off the board without publishing them here. */
export async function dismissStatics({ clientId, storagePaths }) {
  const paths = (storagePaths || []).filter(Boolean)
  if (paths.length === 0) return
  const { error } = await supabase.from('client_files').update({ drop_dismissed_at: new Date().toISOString() }).eq('client_id', clientId).in('storage_path', paths)
  if (error) throw error
}
