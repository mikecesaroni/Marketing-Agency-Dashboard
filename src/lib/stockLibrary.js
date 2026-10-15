import { supabase } from './supabaseClient'

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

/** Removes one image from the library. */
export async function deleteStock(path) {
  if (!path.startsWith(PREFIX)) throw new Error('Not a stock image.')
  const { error } = await supabase.storage.from('client-files').remove([path])
  if (error) throw error
}
