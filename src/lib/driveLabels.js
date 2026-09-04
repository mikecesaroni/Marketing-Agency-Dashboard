/**
 * Naming and path conventions for Drive files, kept apart from driveAssets.js
 * on purpose.
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
  // What the container is CALLED, not what the MIME type says. Nobody has a
  // file named .quicktime; the thing on their phone is a .MOV.
  if (mime === 'video/quicktime') return 'MOV'
  if (mime === 'video/x-matroska') return 'MKV'
  return sub.replace(/\+.*$/, '').toUpperCase().slice(0, 6)
}

/**
 * A Drive file that is a video rather than a still.
 *
 * Worth its own function because the two go to completely different places: a
 * still can be composited onto an artboard, and a video cannot be composited
 * at all -- it is published as its own creative, and Meta downloads it.
 */
export function isDriveVideo(mimeType) {
  return String(mimeType || '').startsWith('video/')
}

/**
 * HOW A DRIVE FILE IS REFERRED TO EVERYWHERE ELSE IN THE APP.
 *
 * `drive:<file id>` rather than a bucket path. The point is that everything
 * downstream -- the ad_videos row, the video join, isPublishable, the publish
 * flow -- treats a Drive file as an ordinary path and needs no idea Drive
 * exists. Only the step that hands a URL to Meta cares.
 *
 * These lived in driveAssets.js, which imports the Supabase client and so
 * cannot be imported by a check script. They are here now and re-exported
 * from there, so there is still exactly one definition of the convention:
 * two would drift, and a drifted prefix means a video that silently never
 * matches its own registration.
 */
export const DRIVE_PREFIX = 'drive:'

export const isDrivePath = (path) => typeof path === 'string' && path.startsWith(DRIVE_PREFIX)

export const driveFileId = (path) => (isDrivePath(path) ? path.slice(DRIVE_PREFIX.length) : '')

export const drivePath = (fileId) => `${DRIVE_PREFIX}${fileId}`
