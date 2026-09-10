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
// The cover layout's focal point: the spot on the PHOTO (fractions of its
// width and height) that every frame keeps as close to its centre as the crop
// allows. One point serves all three sizes: aim it at the faces and the square,
// the portrait and the Stories crop all keep them.
export const DEFAULT_FOCUS = { x: 0.5, y: 0.5 }

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

/**
 * Where a cover-fit photo is drawn so that `focus` sits as near the frame's
 * centre as possible without leaving a gap. The image is scaled to fill the
 * frame; only the overflow axis can move, and it is clamped so the photo
 * always covers the frame.
 */
export function coverRect(w, h, img, focus) {
  const iw = img && img.width > 0 ? img.width : w
  const ih = img && img.height > 0 ? img.height : h
  const scale = Math.max(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  const fx = clamp(focus?.x ?? DEFAULT_FOCUS.x, 0, 1)
  const fy = clamp(focus?.y ?? DEFAULT_FOCUS.y, 0, 1)
  const x = clamp(w / 2 - fx * dw, w - dw, 0)
  const y = clamp(h / 2 - fy * dh, h - dh, 0)
  return { x: Math.round(x), y: Math.round(y), w: Math.round(dw), h: Math.round(dh) }
}

/**
 * Turns a drag on a cover-layout preview into a new focal point. dx and dy
 * are shares of the preview's width and height. Dragging the photo down
 * reveals more of its top, so the focus moves UP the photo by the same number
 * of photo pixels the pointer moved. The result is clamped to the range that
 * actually changes the crop on this frame, so a drag past the edge does not
 * bank movement that has to be undone before the photo moves back.
 */
export function dragFocus(focus, dx, dy, w, h, img) {
  const iw = img && img.width > 0 ? img.width : w
  const ih = img && img.height > 0 ? img.height : h
  const scale = Math.max(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  const fx = clamp(focus?.x ?? DEFAULT_FOCUS.x, 0, 1)
  const fy = clamp(focus?.y ?? DEFAULT_FOCUS.y, 0, 1)
  // Half the frame, as a share of the scaled photo: the focus cannot sit
  // closer to a photo edge than that without the crop showing a gap.
  const hx = Math.min(0.5, w / 2 / dw)
  const hy = Math.min(0.5, h / 2 / dh)
  const nx = dw > w + 0.5 ? clamp(fx - (dx * w) / dw, hx, 1 - hx) : fx
  const ny = dh > h + 0.5 ? clamp(fy - (dy * h) / dh, hy, 1 - hy) : fy
  return { x: nx, y: ny }
}
