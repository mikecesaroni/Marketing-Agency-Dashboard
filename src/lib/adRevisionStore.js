import { supabase } from './supabaseClient'
import { SIZES, canvasToBlob, ensureFonts, loadImage, renderAd } from './adCanvas'
import { resolveImageSrc } from './driveAssets'
import { applyCopyChange } from './adCopy'
import { applyChanges } from './adRevise'
import { overwriteSavedAd, recipeToContent } from './savedAds'
import { stockPath } from './stockLibrary'
import { prepareLogo } from './logoCutout'
import { listUnitPhotos, loadUnitPhotoBitmaps } from './unitPhotos'
import { aiArtForAd, aiArtUrl, listAiArt } from './aiArt'
import { templateArtBitmaps } from './templateArt'

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
  const [background, logo, after, cutoutImage, unitPhotos] = await Promise.all([
    bitmap(current.backgroundPath),
    bitmap(current.logoPath),
    bitmap(current.backgroundPath2),
    bitmap(stockPath(current.cutout)),
    // The real equipment photos, so a revised template paints the same unit the Studio did.
    listUnitPhotos()
      .then((list) => loadUnitPhotoBitmaps(list, loadImage))
      .catch(() => ({})),
  ])
  // The client's ChatGPT picture of the template, when one was painted with
  // the revised words; otherwise the drawn version, which carries them.
  const art = aiArtForAd(await listAiArt(client.id).catch(() => ({})), content)
  const [aiSquare, aiTall] = art ? await Promise.all([art.square, art.tall].map((p) => (p ? loadImage(aiArtUrl(p)).catch(() => null) : null))) : [null, null]
  // The ChatGPT template art, so a revised template paints the same background the Studio did.
  const { pictures: templateArt } = await templateArtBitmaps(loadImage)
  const assets = { background, logo, after, cutoutImage, logoCut: logo ? prepareLogo(logo) : null, unitPhotos, aiArt: { square: aiSquare, tall: aiTall }, templateArt }
  const painted = art ? { ...content, aiArt: art } : content

  const blobs = {}
  for (const { size } of set.ordered || []) {
    const spec = SIZES.find((s) => s.key === size.key)
    if (!spec) continue
    const canvas = document.createElement('canvas')
    renderAd(canvas, spec, painted, assets, { safeMode: current.safeMode })
    blobs[size.key] = await canvasToBlob(canvas)
  }
  await overwriteSavedAd({
    clientId: client.id,
    set,
    blobs,
    content,
    backgroundPath: current.backgroundPath,
    backgroundPath2: current.backgroundPath2,
    logoPath: current.logoPath,
    safeMode: current.safeMode,
    note,
  })

  // The owner's "needs changes" is answered, so it comes off the link: the ad
  // goes back to waiting and they approve the revised one on the same page.
  if (token) {
    const paths = (set.ordered || []).map((x) => x.file.storage_path)
    await supabase.from('ad_approval_decisions').delete().eq('token', token).in('storage_path', paths)
  }

  return { applied, note: modelNote }
}
