// The cover photo for an instant form, made ready to send.
//
// Meta takes the cover as a file on the create call, so the Studio turns
// whatever was picked (an upload in the bucket, or a photo in the client's
// Drive folder, which drive-assets hands back as a blob: URL) into one JPEG
// data URL, no wider than 1200 pixels (Meta shows the cover at about 1200 by
// 628), and sends that. A phone photo straight from Drive is several
// megabytes; this keeps the request to a few hundred kilobytes. Browser only:
// it draws on a canvas.

import { driveFileId, isDrivePath, driveObjectUrl } from './driveAssets'
import { publicUrl } from './savedAds'

const MAX_WIDTH = 1200

/** Loads an image from a URL the page may draw (same origin, blob:, or a CORS-enabled bucket). */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read that photo.'))
    img.src = src
  })
}

/** The picked path as something an <img> can show: the bucket's public URL, or the Drive bytes as a blob: URL. */
export async function coverSrcFor(clientId, path) {
  if (!path) return ''
  if (isDrivePath(path)) return driveObjectUrl(clientId, driveFileId(path))
  return publicUrl(path)
}

/** The photo's pixel size, for the shape note. */
export async function imageSize(src) {
  const img = await loadImage(src)
  return { width: img.naturalWidth, height: img.naturalHeight }
}

/** The photo as a JPEG data URL no wider than 1200 pixels. */
export async function coverDataUrl(src, { maxWidth = MAX_WIDTH, quality = 0.86 } = {}) {
  const img = await loadImage(src)
  const scale = Math.min(1, maxWidth / (img.naturalWidth || maxWidth))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}
