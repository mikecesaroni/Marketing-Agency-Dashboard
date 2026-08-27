import { supabase } from './supabaseClient'
import { SIZES } from './adCanvas'

// Saved artboards live under ads/<client id>/<stamp>-<size>.png in the same
// public bucket the client's other files use. The stamp is what ties the three
// sizes of one ad together.
const ADS_PREFIX = (clientId) => `ads/${clientId}/`

export function publicUrl(path) {
  return supabase.storage.from('client-files').getPublicUrl(path).data.publicUrl
}

function parseStamp(storagePath) {
  const file = storagePath.split('/').pop() || ''
  const [stamp] = file.split('-')
  return /^\d+$/.test(stamp) ? stamp : null
}

/**
 * Groups the flat file list back into the sets they were saved as.
 *
 * Sizes are ordered to match the Studio rather than however the query came
 * back, so a set always reads square, portrait, story.
 */
/**
 * Stores the inputs that produced an ad, so it can be reopened later.
 *
 * A flattened PNG cannot be edited; without this row a "saved ad" is a picture
 * and nothing more.
 */
export async function saveAdRecipe({ clientId, stamp, content, backgroundPath, logoPath, safeMode }) {
  const { error } = await supabase.from('saved_ads').insert({
    client_id: clientId,
    stamp: String(stamp),
    badge: content.badge,
    hook: content.hook,
    offer_amount: content.offerAmount,
    offer_detail: content.offerDetail,
    subhead: content.subhead,
    proof: content.proof,
    cta: content.cta,
    accent: content.accent,
    badge_color: content.badgeColor,
    hook_plate: Boolean(content.hookPlate),
    safe_mode: safeMode,
    // Copy that never touches the artboard: it goes in the feed above and
    // below the image. Stored because publishing has to send it, and until
    // this existed it lived only in a read-only banner and was lost on save.
    primary_text: content.primaryText || null,
    headline: content.headline || null,
    description: content.description || null,
    background_path: backgroundPath || null,
    logo_path: logoPath || null,
  })
  if (error) throw error
}

// Maps a stored row back onto the shape the Studio's state uses.
export function recipeToContent(row) {
  return {
    badge: row.badge || '',
    hook: row.hook || '',
    offerAmount: row.offer_amount || '',
    offerDetail: row.offer_detail || '',
    subhead: row.subhead || '',
    proof: row.proof || '',
    cta: row.cta || '',
    accent: row.accent,
    badgeColor: row.badge_color,
    hookPlate: Boolean(row.hook_plate),
    primaryText: row.primary_text || '',
    headline: row.headline || '',
    description: row.description || '',
    backgroundPath: row.background_path || '',
    logoPath: row.logo_path || '',
    safeMode: row.safe_mode || 'reels',
  }
}

export async function fetchSavedAds(clientId) {
  const { data, error } = await supabase
    .from('client_files')
    .select('id, file_name, storage_path, date_uploaded')
    .eq('client_id', clientId)
    .like('storage_path', `${ADS_PREFIX(clientId)}%`)
  if (error) throw error

  // Recipes are optional: an ad saved before this existed, or one whose row
  // failed to write, still lists as an image you can download.
  let recipes = {}
  const { data: rows } = await supabase.from('saved_ads').select('*').eq('client_id', clientId)
  recipes = Object.fromEntries((rows || []).map((r) => [String(r.stamp), r]))

  const sets = new Map()
  for (const row of data || []) {
    const stamp = parseStamp(row.storage_path)
    if (!stamp) continue
    const key = row.storage_path.replace(/.*-(\w+)\.png$/, '$1')
    const set = sets.get(stamp) || { stamp, savedAt: new Date(Number(stamp)), files: {} }
    set.files[key] = { ...row, url: publicUrl(row.storage_path) }
    sets.set(stamp, set)
  }

  return [...sets.values()]
    .sort((a, b) => Number(b.stamp) - Number(a.stamp))
    .map((set) => ({
      ...set,
      // Fixed order, and only the sizes that actually saved.
      recipe: recipes[set.stamp] || null,
      ordered: SIZES.map((s) => ({ size: s, file: set.files[s.key] })).filter((x) => x.file),
    }))
}

export async function deleteSavedAd(set, clientId) {
  const paths = Object.values(set.files).map((f) => f.storage_path)
  const ids = Object.values(set.files).map((f) => f.id)

  const { error: storageErr } = await supabase.storage.from('client-files').remove(paths)
  if (storageErr) throw storageErr

  const { error } = await supabase.from('client_files').delete().in('id', ids)
  if (error) throw error

  // Best effort: the images are already gone, so a stranded recipe is clutter
  // rather than a failure worth surfacing.
  await supabase.from('saved_ads').delete().eq('client_id', clientId).eq('stamp', set.stamp)
}
