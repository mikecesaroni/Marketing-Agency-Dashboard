// What a Drive file actually is, for the pickers.
//
// The listing deliberately returns images, videos and PDFs, because one call
// feeds the photo picker, the video picker and the files list. The photo
// picker was showing all of it, so a video could be chosen as a background or
// a logo; Active Air's logo ended up set to VIDEO-2026-09-17-16-58-07.mp4,
// which then failed to load as a bitmap and left a red error on the tab.
//
// The badge under each tile had the same fault in the other direction: it was
// drawn for anything the browser cannot display and the word was hardcoded to
// HEIC, so videos and PDFs were labelled HEIC too.
//
// Pure: scripts/check-drive-file-kind.mjs imports it.

// What a browser can paint without Drive converting it first. Kept in step
// with BROWSER_RENDERABLE in supabase/functions/drive-assets/index.ts.
const NATIVE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'])

const mimeOf = (file) => String(file?.mime_type || file?.mimeType || '').toLowerCase()

/** A still image, whether or not the browser can decode it. HEIC counts: Drive renders it. */
export function isImageFile(file) {
  return mimeOf(file).startsWith('image/')
}

export function isVideoFile(file) {
  return mimeOf(file).startsWith('video/')
}

/** Only the images, for a picker that paints one onto an artboard. */
export function imagesOnly(files) {
  return (Array.isArray(files) ? files : []).filter(isImageFile)
}

/**
 * The short badge for a file the browser cannot display on its own, or '' when
 * it needs no badge. HEIC and HEIF are named outright because they are the
 * common case and the word means something to the team; everything else gets
 * its own subtype rather than being called HEIC.
 */
export function fileKindLabel(file) {
  const mime = mimeOf(file)
  if (!mime) return ''
  if (NATIVE.has(mime)) return ''
  if (mime === 'application/pdf') return 'PDF'
  if (/^image\/hei[cf]/.test(mime)) return 'HEIC'
  const sub = mime.split('/')[1] || ''
  const bare = sub.replace(/^x-/, '').replace(/[+;].*$/, '')
  if (!bare) return mime.split('/')[0].toUpperCase()
  return bare.slice(0, 6).toUpperCase()
}

/** Why a tile carries that badge, for its tooltip. */
export function fileKindTitle(file) {
  const label = fileKindLabel(file)
  if (!label) return ''
  if (isVideoFile(file)) return `${label} video. Videos belong in the video ad, not a still.`
  return `${label}. Your browser cannot display this format, so Google Drive renders it.`
}
