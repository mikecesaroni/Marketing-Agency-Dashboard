// The card layout's placement math, kept pure so scripts/check-ad-layout.mjs
// can import it in Node. adCanvas.js re-exports everything here.

export const LAYOUTS = [
  { key: 'cover', label: 'Photo fills the frame', hint: 'the default' },
  { key: 'card', label: 'Photo on a colour', hint: 'drag it where you want it' },
]
export const DEFAULT_BG = '#0F172A'
// Fractions: x across the frame, y down the FREE BAND (the room between the
// headline and the offer block), width as a share of frame width.
export const DEFAULT_PHOTO = { x: 0.5, y: 0.5, scale: 0.72 }

function clamp(v, lo, hi) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo
}

/**
 * Where a placed photo lands in a frame, in pixels.
 *
 * The photo is positioned inside a band, not the whole frame. On a square
 * feed ad the room between the subhead and the offer block is about half the
 * frame; on a Stories frame, once Meta's own UI is kept clear, it is well
 * under half and sits high. A position stored as a share of the frame put
 * the photo over the offer block on Stories every time. Stored as a share of
 * the band, the same saved position sits between the text and the offer on
 * all three frames, and the export matches the preview because both resolve
 * through this function. The photo never grows past 95% of the band.
 */
export function photoRect(w, h, img, photo, band) {
  const top = clamp(band?.top ?? 0, 0, h)
  const bottom = clamp(band?.bottom ?? h, top, h)
  const bandH = Math.max(1, bottom - top)
  const scale = clamp(photo?.scale ?? DEFAULT_PHOTO.scale, 0.2, 1.5)
  const ratio = img && img.width > 0 ? img.height / img.width : 1
  let pw = w * scale
  let ph = pw * ratio
  if (ph > bandH * 0.95) {
    ph = bandH * 0.95
    pw = ph / ratio
  }
  const cx = clamp(photo?.x ?? DEFAULT_PHOTO.x, 0, 1) * w
  const cy = top + clamp(photo?.y ?? DEFAULT_PHOTO.y, 0, 1) * bandH
  return { x: Math.round(cx - pw / 2), y: Math.round(cy - ph / 2), w: Math.round(pw), h: Math.round(ph) }
}

/**
 * Turns a drag on the preview into a change of the stored fractions. dx and
 * dy arrive as shares of the preview's width and height; y has to be
 * rescaled to the band, or the photo would trail the pointer on a tall frame.
 */
export function dragPhoto(photo, dx, dy, frameH, band) {
  const bandH = Math.max(1, (band?.bottom ?? frameH) - (band?.top ?? 0))
  const ny = Number.isFinite(frameH) && frameH > 0 ? dy * (frameH / bandH) : dy
  return {
    ...photo,
    x: clamp((photo?.x ?? DEFAULT_PHOTO.x) + dx, 0, 1),
    y: clamp((photo?.y ?? DEFAULT_PHOTO.y) + ny, 0, 1),
  }
}
