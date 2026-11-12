import { supabase } from './supabaseClient'
import { planStaticDrop, staticPath, validateStatic } from './staticDrops'
import { dropNote } from './videoLaunch'

/**
 * Storage and database access for dropped statics (src/lib/staticDrops.js
 * has the rules). Split the same way adVideoStore.js is from adVideos.js:
 * everything that touches the network lives here.
 */

/** The image's pixels, read in the browser, so the size can be worked out. */
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
 * Puts one drop of finished images in the bucket as saved-ad sets.
 *
 * Each file goes where a Studio artboard goes (ads/<client>/<stamp>-<size>),
 * gets its client_files row (signed, noted, marked drop_kind 'static'), and
 * each set gets its saved_ads row carrying the ad's name and who dropped
 * it, so the publish page can keep the words on it. Bytes first, row second,
 * as uploadVideo does; a row that fails takes its bytes back out.
 *
 * Returns [{ stamp, name, files: [{ path, name, key }] }].
 */
export async function uploadStatics({ clientId, files, uploadedBy = '', note = '' }) {
  const list = [...(files || [])]
  for (const f of list) {
    const problem = validateStatic(f)
    if (problem) throw new Error(problem)
  }
  const measured = await Promise.all(list.map(async (f) => ({ name: f.name, ...(await measureImage(f)) })))
  const sets = planStaticDrop(measured, Date.now())
  const who = String(uploadedBy || '').trim() || null
  const clean = dropNote(note) || null
  const done = []
  for (const set of sets) {
    const uploaded = []
    for (const item of set.items) {
      const file = list[item.index]
      const path = staticPath(clientId, set.stamp, item.key, item.ext)
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
      uploaded.push({ path, name: file.name, key: item.key })
    }
    // The recipe row: the name the lists show and who dropped it. Best
    // effort: a set without one still publishes, it just reads "image only"
    // in the gallery and the words are written again on the next visit.
    await supabase.from('saved_ads').insert({ client_id: clientId, stamp: set.stamp, hook: set.name || null, dropped_by: who }).then(() => {}, () => {})
    done.push({ stamp: set.stamp, name: set.name, files: uploaded })
  }
  return done
}

/** "Published manually": takes dropped statics off the board without publishing them here. */
export async function dismissStatics({ clientId, storagePaths }) {
  const paths = (storagePaths || []).filter(Boolean)
  if (paths.length === 0) return
  const { error } = await supabase.from('client_files').update({ drop_dismissed_at: new Date().toISOString() }).eq('client_id', clientId).in('storage_path', paths)
  if (error) throw error
}
