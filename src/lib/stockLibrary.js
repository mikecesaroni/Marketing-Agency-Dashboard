import { supabase } from './supabaseClient'
import { photoScore, stockName } from './stockPick'

// The stock library: cutout photos of equipment (a condenser, a furnace, a
// boiler, a water heater, a van) that any client's template can stand in the
// corner. They live under stock/ in the same public bucket as the client
// files, shared across clients, with no client_files row: they belong to the
// agency, not to a client. A template refers to one as `stock:<path>`.
//
// A PNG with a transparent background is the one that looks right; a JPEG
// with a white box around the unit is painted as is.

const PREFIX = 'stock/'
const IMAGE_RE = /\.(png|jpe?g|webp)$/i

export function stockPath(cutout) {
  const key = String(cutout || '')
  return key.startsWith('stock:') ? key.slice(6) : ''
}

export function stockKey(path) {
  return path ? `stock:${path}` : ''
}

/** Every image in the library, newest first: { path, name, url }. */
export async function listStock() {
  const { data, error } = await supabase.storage
    .from('client-files')
    .list('stock', { limit: 200, sortBy: { column: 'created_at', order: 'desc' } })
  if (error) throw error
  return (data || [])
    .filter((f) => f.name && IMAGE_RE.test(f.name))
    .map((f) => {
      const path = `${PREFIX}${f.name}`
      return { path, name: f.name.replace(/^\d+-/, ''), url: supabase.storage.from('client-files').getPublicUrl(path).data.publicUrl }
    })
}

/** Adds one image to the library. Returns its path. */
export async function uploadStock(file) {
  if (!IMAGE_RE.test(file.name)) throw new Error('Stock images are PNG, JPEG or WebP. A PNG with a transparent background works best.')
  const path = `${PREFIX}${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
  const { error } = await supabase.storage.from('client-files').upload(path, file, { contentType: file.type || undefined })
  if (error) throw error
  return path
}

/**
 * The clients' own photos that could stand in a template: every image upload
 * across every client that is not a saved ad, a concept, a logo or an iPhone
 * HEIC, equipment first (by file name), newest first within a score. Each is
 * { path, name, client, url, score }. "Use" paints one straight from where it
 * is (the cutout key is stock:<its path>); "Add to the library" copies it
 * under stock/ for everyone.
 */
export async function listClientPhotos({ limit = 80 } = {}) {
  const [{ data: files, error }, { data: clients }] = await Promise.all([
    supabase.from('client_files').select('client_id, file_name, storage_path, file_type, date_uploaded').like('file_type', 'image/%').order('date_uploaded', { ascending: false }).limit(400),
    supabase.from('clients').select('id, name'),
  ])
  if (error) throw error
  const names = Object.fromEntries((clients || []).map((c) => [c.id, c.name]))
  return (files || [])
    .filter((f) => f.storage_path && !/^(ads|concepts|ai-video|stock)\//.test(f.storage_path))
    .map((f) => ({ path: f.storage_path, name: f.file_name || f.storage_path.split('/').pop(), client: names[f.client_id] || '', score: photoScore(f.file_name || f.storage_path), url: supabase.storage.from('client-files').getPublicUrl(f.storage_path).data.publicUrl }))
    .filter((p) => p.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/**
 * Copies a client's photo into the library: the browser fetches the bytes
 * from the public bucket and uploads them under stock/. Returns the new path.
 */
export async function addClientPhotoToStock(path, fileName) {
  const res = await fetch(supabase.storage.from('client-files').getPublicUrl(path).data.publicUrl)
  if (!res.ok) throw new Error(`Could not read that photo (${res.status}).`)
  const blob = await res.blob()
  const out = `${PREFIX}${Date.now()}-${stockName(fileName || path.split('/').pop())}`
  const { error } = await supabase.storage.from('client-files').upload(out, blob, { contentType: blob.type || undefined })
  if (error) throw error
  return out
}

/** Removes one image from the library. */
export async function deleteStock(path) {
  if (!path.startsWith(PREFIX)) throw new Error('Not a stock image.')
  const { error } = await supabase.storage.from('client-files').remove([path])
  if (error) throw error
}
