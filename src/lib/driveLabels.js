/**
 * Naming for Drive files, kept apart from driveAssets.js on purpose.
 *
 * That module imports the Supabase client, which makes it unimportable by
 * scripts/check-drive-assets.mjs -- the same split as adVideos/adVideoStore and
 * adCopyOptions/adCopy. Anything here must stay free of IO.
 */
/**
 * The badge over a Drive tile the browser could not have rendered itself.
 *
 * Drive converts these on the way through, and the tag is there so a file that
 * displays fine in the CRM but not in a Mac preview does not look odd. It was
 * the literal string "HEIC", which was true while images were the only thing
 * listed and became a lie the moment PDFs were: a logo exported as vector
 * would have shown a correct picture labelled HEIC.
 */
export function convertedLabel(mimeType) {
  const mime = String(mimeType || '')
  if (mime === 'application/pdf') return 'PDF'
  const sub = mime.split('/')[1] || ''
  if (!sub) return 'CONVERTED'
  // image/heif and image/heic are the same thing to a person.
  if (/^hei[cf]$/i.test(sub)) return 'HEIC'
  return sub.replace(/\+.*$/, '').toUpperCase().slice(0, 6)
}
