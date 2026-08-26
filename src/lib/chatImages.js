import { supabase } from './supabaseClient'

// Screenshots dropped into a client chat. They go to the same public bucket the
// client's other files use, and Claude is handed the URL rather than base64:
// the URL is what gets stored in chat_messages, so replaying a long conversation
// stays cheap instead of carrying megabytes of pixels in every row.

const BUCKET = 'client-files'
const PREFIX = (clientId) => `chat/${clientId}/`

// What the Messages API will actually accept as an image block.
export const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

// Anthropic scales anything longer than this down on their side anyway, so
// sending more pixels costs upload time and buys nothing. A screenshot at 1568
// still reads fine.
export const MAX_EDGE = 1568

// Past this the re-encode is worth it even for a screenshot.
const PNG_BUDGET = 1_200_000

// Hard ceiling on what we will even try to read.
const MAX_SOURCE = 25 * 1024 * 1024

export const MAX_ATTACHMENTS = 5

export function isImageFile(file) {
  return Boolean(file) && ACCEPTED.includes(file.type)
}

/**
 * Pulls image files out of a drop or paste.
 *
 * A pasted screenshot arrives as a clipboard item with an empty name, and a
 * drag from a browser can carry both a file and a text/uri-list. Only real
 * image files are returned; everything else is left for the text handler.
 */
export function imagesFromDataTransfer(dt) {
  if (!dt) return []
  const out = []
  for (const item of dt.files || []) {
    if (isImageFile(item)) out.push(item)
  }
  return out
}

function loadBitmap(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`${file.name || 'That image'} could not be read`))
    }
    img.src = url
  })
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))),
      type,
      quality
    )
  })
}

/**
 * Shrinks a screenshot to something worth uploading.
 *
 * Animated GIFs are passed through untouched — drawing one to a canvas would
 * flatten it to the first frame, which is worse than leaving it large.
 */
export async function prepareImage(file) {
  if (!isImageFile(file)) {
    throw new Error(`${file.name || 'That file'} is not a PNG, JPEG, WebP or GIF`)
  }
  if (file.size > MAX_SOURCE) {
    throw new Error(`${file.name || 'That image'} is too large to attach`)
  }
  if (file.type === 'image/gif') {
    return { blob: file, mediaType: 'image/gif', extension: 'gif' }
  }

  const img = await loadBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
  const width = Math.max(1, Math.round(img.width * scale))
  const height = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)

  // Screenshots are mostly flat colour and small text, which PNG keeps sharp
  // and JPEG smears. Only fall back to JPEG when the PNG is genuinely big.
  if (file.type === 'image/png' || file.type === 'image/webp') {
    const png = await toBlob(canvas, 'image/png')
    if (png.size <= PNG_BUDGET) return { blob: png, mediaType: 'image/png', extension: 'png' }
  }

  // A photo pasted onto white still needs an opaque backdrop before JPEG.
  const flat = document.createElement('canvas')
  flat.width = width
  flat.height = height
  const fctx = flat.getContext('2d')
  fctx.fillStyle = '#ffffff'
  fctx.fillRect(0, 0, width, height)
  fctx.drawImage(canvas, 0, 0)
  const jpeg = await toBlob(flat, 'image/jpeg', 0.85)
  return { blob: jpeg, mediaType: 'image/jpeg', extension: 'jpg' }
}

/**
 * Uploads a prepared screenshot and returns the public URL Claude will fetch.
 *
 * These deliberately do not get a client_files row. The Files tab is for
 * deliverables and client documents; a screenshot pasted mid-question is
 * neither, and listing every one of them there would bury the real files.
 */
export async function uploadChatImage(clientId, prepared, index = 0) {
  const path = `${PREFIX(clientId)}${Date.now()}-${index}.${prepared.extension}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, prepared.blob, { contentType: prepared.mediaType })
  if (error) throw error
  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  return { url, path, mediaType: prepared.mediaType }
}
