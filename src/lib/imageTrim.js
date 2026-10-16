/**
 * Trims the transparent margin off an image: the image model leaves a
 * cutout floating in a 1024 by 1536 frame with air all round it, so fitted
 * into a template's box as it comes, a wide unit (a mini split, a condenser)
 * paints small. The pixels with any alpha decide the crop, with a little
 * breathing room kept; what comes back is a canvas, which drawImage takes
 * like an image. An image that is opaque edge to edge comes back as it is.
 */
export function trimTransparent(img, { pad = 0.02, threshold = 8 } = {}) {
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  if (!w || !h) return img
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  let data
  try {
    data = ctx.getImageData(0, 0, w, h).data
  } catch {
    // A cross-origin image with no CORS headers taints the canvas; leave it whole.
    return img
  }
  let top = h
  let left = w
  let right = -1
  let bottom = -1
  for (let y = 0; y < h; y++) {
    const row = y * w * 4
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4 + 3] > threshold) {
        if (y < top) top = y
        if (y > bottom) bottom = y
        if (x < left) left = x
        if (x > right) right = x
      }
    }
  }
  if (right < 0) return img
  const px = Math.round(Math.max(w, h) * pad)
  const x0 = Math.max(0, left - px)
  const y0 = Math.max(0, top - px)
  const x1 = Math.min(w, right + 1 + px)
  const y1 = Math.min(h, bottom + 1 + px)
  if (x0 === 0 && y0 === 0 && x1 === w && y1 === h) return img
  const out = document.createElement('canvas')
  out.width = x1 - x0
  out.height = y1 - y0
  out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
  return out
}
