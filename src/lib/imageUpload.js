// iPhone photos arrive as HEIC. No browser but Safari can decode HEIC, so a
// HEIC in the client's files can neither be drawn onto the ad canvas nor sent
// to Meta, and the Studio used to leave it out of the picker without a word:
// six photos uploaded on a Monday, none of them anywhere to be seen.
//
// Every upload path converts HEIC to JPEG in the browser first (heic2any,
// libheif compiled to WebAssembly, loaded only when a HEIC actually shows up).
// The converter is also used at pick time for the HEIC files that were
// uploaded before this existed.

const HEIC_RE = /\.(heic|heif)$/i
const HEIC_TYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'])

/** True for a File, a file name or a storage path that is HEIC/HEIF. */
export function isHeic(fileOrName) {
  if (!fileOrName) return false
  if (typeof fileOrName === 'string') return HEIC_RE.test(fileOrName)
  if (fileOrName.type && HEIC_TYPES.has(String(fileOrName.type).toLowerCase())) return true
  return HEIC_RE.test(fileOrName.name || '')
}

/** "IMG_8721.heic" -> "IMG_8721.jpg"; a name with no extension gets one. */
export function jpegName(name) {
  const base = String(name || 'photo').replace(/\.[^.]+$/, '')
  return `${base || 'photo'}.jpg`
}

/** The storage path for the JPEG twin of a HEIC path: same folder and stamp, .jpg. */
export function jpegPath(storagePath) {
  return String(storagePath || '').replace(/\.(heic|heif)$/i, '.jpg')
}

// Loaded on first use so the 2.7MB decoder never rides in the main bundle.
let converter = null
async function heic2any() {
  if (!converter) {
    const mod = await import('heic2any')
    converter = mod.default || mod
  }
  return converter
}

/**
 * Converts a HEIC Blob to a JPEG Blob. Quality 0.92: visibly lossless on a
 * work photo and well under Meta's 30MB, which the HEIC never approached.
 */
export async function heicToJpegBlob(blob, quality = 0.92) {
  const convert = await heic2any()
  const out = await convert({ blob, toType: 'image/jpeg', quality })
  // A multi-image HEIC (a burst, a live photo) comes back as an array; the
  // first frame is the photo.
  return Array.isArray(out) ? out[0] : out
}

/**
 * The file to actually upload: the same File for anything a browser can
 * draw, a JPEG File for a HEIC. The name changes with it so the picker and
 * Meta both see a .jpg.
 */
export async function toUploadable(file) {
  if (!isHeic(file)) return file
  const jpeg = await heicToJpegBlob(file)
  return new File([jpeg], jpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified || Date.now() })
}
