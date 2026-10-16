import { supabase } from './supabaseClient'
import { readFunctionError } from './functionError'
import { trimTransparent } from './imageTrim'
import { UNIT_PHOTO_KEYS, UNIT_PHOTO_PREFIX, unitPhotoPath } from '../../supabase/functions/_shared/unitPhotos.js'

/**
 * Real photos of the equipment, the network half. The library holds one
 * photoreal cutout per unit (and an old, rusty twin of each) at
 * stock/units/<key>.png, made by the stock-images Edge Function with an
 * image model and shared by every client. The Studio loads them into the
 * paint assets as `unitPhotos` ({ key: bitmap }); drawCutout in
 * adTemplates.js paints the photo in place of the drawing when it exists.
 * The pure half (the keys, the labels, the prompts) is shared with the
 * function in supabase/functions/_shared/unitPhotos.js.
 */

export { UNIT_PHOTO_KEYS, unitPhotoLabel, unitPhotoPath, unitPhotoStatus } from '../../supabase/functions/_shared/unitPhotos.js'

const BUCKET = 'client-files'

/** The photos that exist: { key: { key, path, url, stamp } }. The url carries the file's stamp so a redo shows. */
export async function listUnitPhotos() {
  const { data, error } = await supabase.storage.from(BUCKET).list(UNIT_PHOTO_PREFIX.replace(/\/$/, ''), { limit: 100 })
  if (error) throw error
  const out = {}
  for (const f of data || []) {
    const m = /^([a-z_]+)\.png$/.exec(f.name || '')
    if (!m || !UNIT_PHOTO_KEYS.includes(m[1])) continue
    const path = unitPhotoPath(m[1])
    const stamp = f.updated_at || f.created_at || ''
    const base = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
    out[m[1]] = { key: m[1], path, stamp, url: stamp ? `${base}?v=${encodeURIComponent(stamp)}` : base }
  }
  return out
}

/**
 * Bitmaps for every photo there is, keyed by unit, each trimmed of the
 * transparent air the image model leaves round the unit so it fills its
 * box. A photo that will not load is left out; the drawing stands in.
 */
export async function loadUnitPhotoBitmaps(photos, loadImage) {
  const out = {}
  await Promise.all(
    Object.values(photos || {}).map(async (p) => {
      try {
        const img = await loadImage(p.url)
        if (img) out[p.key] = trimTransparent(img)
      } catch {
        // left out on purpose
      }
    })
  )
  return out
}

/** Asks the function to make (or remake) one photo. Returns { key, path, bytes }. */
export async function makeUnitPhoto(key, { quality = 'high' } = {}) {
  const { data, error } = await supabase.functions.invoke('stock-images', { body: { action: 'make', key, quality } })
  if (error) {
    const { status, detail } = await readFunctionError(error)
    if (status === 404 || /not found|404/i.test(detail)) throw new Error('The stock-images function is not deployed yet.')
    throw new Error(detail || 'The photo did not come back. Try again in a moment.')
  }
  if (data?.error) throw new Error(data.error)
  return data
}
