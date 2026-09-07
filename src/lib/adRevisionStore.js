import { supabase } from './supabaseClient'
import { SIZES, canvasToBlob, ensureFonts, loadImage, renderAd } from './adCanvas'
import { resolveImageSrc } from './driveAssets'
import { applyCopyChange } from './adCopy'
import { applyChanges } from './adRevise'
import { recipeToContent } from './savedAds'

/**
 * Applies an owner's note to a saved ad and REPLACES it: same stamp, same
 * three storage paths, same recipe row.
 *
 * Safe for a live ad. meta-publish uploads the PNG bytes to Meta and the ad
 * runs on an image_hash, so nothing that is already running reads our bucket
 * again. The one thing that does read it is the approval link, which is the
 * point: the owner opens the same link and sees the fix.
 *
 * The rendering is the Studio's own renderAd on off-screen canvases, so the
 * revised ad is pixel for pixel what the Studio would have saved.
 */
export async function reviseSavedAd({ client, set, instruction, token }) {
  const recipe = set?.recipe
  if (!recipe) throw new Error('This ad was saved before the Studio kept its text, so it has to be rebuilt by hand.')
  const note = String(instruction || '').trim()
  if (!note) throw new Error('There is no note to apply.')

  const current = recipeToContent(recipe)
  const { note: modelNote, changes } = await applyCopyChange({ client, current, instruction: note })
  const { content, applied } = applyChanges(current, changes)
  if (applied.length === 0) {
    return { applied: [], note: modelNote || 'Nothing in the copy needed to change for that note.' }
  }

  // Paint. Fonts first or the first frame wraps on a fallback face.
  await ensureFonts()
  const bitmap = async (path) => (path ? loadImage(await resolveImageSrc(client.id, path)) : null)
  const [background, logo] = await Promise.all([bitmap(current.backgroundPath), bitmap(current.logoPath)])
  const assets = { background, logo }

  for (const { size, file } of set.ordered || []) {
    const spec = SIZES.find((s) => s.key === size.key)
    if (!spec) continue
    const canvas = document.createElement('canvas')
    renderAd(canvas, spec, content, assets, { safeMode: current.safeMode })
    const blob = await canvasToBlob(canvas)
    const { error: upErr } = await supabase.storage
      .from('client-files')
      .upload(file.storage_path, blob, { contentType: 'image/png', upsert: true })
    if (upErr) throw upErr
    // date_uploaded is the version the approval page and the gallery append
    // to the URL, so the CDN hands out the new picture rather than the cached one.
    const { error: rowErr } = await supabase
      .from('client_files')
      .update({ file_size: blob.size, date_uploaded: new Date().toISOString() })
      .eq('id', file.id)
    if (rowErr) throw rowErr
  }

  const { error: recErr } = await supabase
    .from('saved_ads')
    .update({
      badge: content.badge,
      hook: content.hook,
      offer_amount: content.offerAmount,
      offer_detail: content.offerDetail,
      subhead: content.subhead,
      proof: content.proof,
      primary_text: content.primaryText || null,
      headline: content.headline || null,
      description: content.description || null,
      revised_at: new Date().toISOString(),
      revision_note: note,
      revisions: (recipe.revisions || 0) + 1,
    })
    .eq('id', recipe.id)
  if (recErr) throw recErr

  // The owner's "needs changes" is answered, so it comes off the link: the ad
  // goes back to waiting and they approve the revised one on the same page.
  if (token) {
    const paths = (set.ordered || []).map((x) => x.file.storage_path)
    await supabase.from('ad_approval_decisions').delete().eq('token', token).in('storage_path', paths)
  }

  return { applied, note: modelNote }
}
