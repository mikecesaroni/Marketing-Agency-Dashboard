// The card layout's placement math, kept pure so scripts/check-ad-layout.mjs
// can import it in Node. adCanvas.js re-exports everything here.

export const LAYOUTS = [
  { key: 'cover', label: 'Photo fills the frame', hint: 'the default' },
  { key: 'card', label: 'Photo on a colour', hint: 'drag it where you want it' },
]
export const DEFAULT_BG = '#0F172A'
// Fractions of the frame: centre at (x, y), width as a share of frame width.
export const DEFAULT_PHOTO = { x: 0.5, y: 0.55, scale: 0.72 }

function clamp(v, lo, hi) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo
}

/**
 * Where a placed photo lands in a frame, in pixels. Pure, so the position a
 * person drags to on a 216px preview is the same position on the 1080px
 * export: everything is stored as fractions of the frame and resolved here.
 * The photo never grows past 95% of the frame height.
 */
export function photoRect(w, h, img, photo) {
  const scale = clamp(photo?.scale ?? DEFAULT_PHOTO.scale, 0.2, 1.5)
  const ratio = img && img.width > 0 ? img.height / img.width : 1
  let pw = w * scale
  let ph = pw * ratio
  if (ph > h * 0.95) {
    ph = h * 0.95
    pw = ph / ratio
  }
  const cx = clamp(photo?.x ?? DEFAULT_PHOTO.x, 0, 1) * w
  const cy = clamp(photo?.y ?? DEFAULT_PHOTO.y, 0, 1) * h
  return { x: Math.round(cx - pw / 2), y: Math.round(cy - ph / 2), w: Math.round(pw), h: Math.round(ph) }
}
