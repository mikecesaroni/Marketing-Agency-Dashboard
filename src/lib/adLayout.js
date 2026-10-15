// The placement math behind every look, kept pure so scripts/check-ad-layout.mjs
// can import it in Node. adCanvas.js re-exports everything here.

// The looks. The first is the default. Each one is a different composition
// of the same words, so a set of ads for one client stops looking like one
// template with the headline swapped.
import { PHOTO_TEMPLATES, TEMPLATE_KEYS, TEMPLATE_LAYOUTS, TWO_PHOTO_TEMPLATES } from './adTemplateMeta.js'

// The photo looks: the client's photo with the words composed over or beside
// it (adLooks.js and the classic in adCanvas.js).
export const PHOTO_LOOKS = [
  { key: 'cover', label: 'Classic', hint: 'photo fills the frame, headline up top, offer block down the bottom', group: 'photo' },
  { key: 'stack', label: 'Headline stack', hint: 'one giant accent word over the photo, with a white offer card', group: 'photo' },
  { key: 'plate', label: 'Bottom plate', hint: 'photo on top, the words on a brand-colour plate below', group: 'photo' },
  { key: 'split', label: 'Split panel', hint: 'brand-colour panel with the words beside the photo', group: 'photo' },
  { key: 'before', label: 'Before and after', hint: 'two photos side by side (one above the other on the Story), Before and After labelled, the words on a plate below', group: 'photo' },
  { key: 'ai', label: 'AI concept', hint: 'a finished ad made by AI from your brief, used as is', group: 'photo' },
]
// Every look the Studio can paint: the photo looks, then the templates
// (adTemplates.js: painted seasonal posters with SALE, prices, stickers and
// a piece of equipment).
export const LAYOUTS = [...PHOTO_LOOKS, ...TEMPLATE_LAYOUTS.map((t) => ({ ...t, group: 'template' }))]
export { TEMPLATE_LAYOUTS, TEMPLATE_KEYS }
// Looks that paint the words themselves (an AI concept carries its own).
export const TEXT_LAYOUTS = ['cover', 'stack', 'plate', 'split', 'before', 'card', ...TEMPLATE_KEYS]
// Looks where dragging the artboard moves the photo's focal point.
export const FOCUS_LAYOUTS = ['cover', 'stack', 'plate', 'split', 'before', ...PHOTO_TEMPLATES]
// Looks that take a second photo: the "After photo" picker appears and the
// first picker reads "Before photo".
export const TWO_PHOTO_LAYOUTS = ['before', ...TWO_PHOTO_TEMPLATES]

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

/**
 * Where a photo sits when it is fitted INSIDE a frame rather than cropped to
 * it: the largest size that shows the whole image, centred. The AI concept
 * look uses this, with a blurred copy of the same image filling the rest, so
 * a 4:5 concept becomes a square or a Story without losing its headline.
 */
export function containRect(w, h, img) {
  const iw = img && img.width > 0 ? img.width : w
  const ih = img && img.height > 0 ? img.height : h
  const scale = Math.min(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  return { x: Math.round((w - dw) / 2), y: Math.round((h - dh) / 2), w: Math.round(dw), h: Math.round(dh) }
}

/**
 * The bottom plate look: the photo takes the top of the frame and a
 * brand-colour plate takes the bottom. The plate holds the words, so it gets
 * a fixed share of the room between the safe margins: enough for a three
 * line headline, the offer pill and the proof, on every frame.
 *
 * Returns the two rectangles. The plate starts above the photo's bottom edge
 * by `overlap`, so its rounded top corners read as a card laid over the
 * picture rather than a hard horizontal cut.
 */
export function plateRects(w, h, { safeTop = 0, safeBottom = 0, share = 0.46, overlap = 36 } = {}) {
  const usable = h - safeTop - safeBottom
  const plateH = Math.round(usable * share) + safeBottom
  const plateTop = h - plateH
  return {
    photo: { x: 0, y: 0, w, h: plateTop + overlap },
    plate: { x: 0, y: plateTop, w, h: plateH },
  }
}

/**
 * The split look: a colour panel and the photo side by side on the wide
 * frames, stacked on the tall one. The panel always holds the words.
 */
export function splitRects(w, h, { safeTop = 0, safeBottom = 0, panelShare = 0.47 } = {}) {
  const tall = h / w >= 1.6
  if (tall) {
    const usable = h - safeTop - safeBottom
    const panelH = Math.round(usable * 0.5) + safeTop
    return {
      stacked: true,
      panel: { x: 0, y: 0, w, h: panelH },
      photo: { x: 0, y: panelH, w, h: h - panelH },
    }
  }
  const panelW = Math.round(w * panelShare)
  return {
    stacked: false,
    panel: { x: 0, y: 0, w: panelW, h },
    photo: { x: panelW, y: 0, w: w - panelW, h },
  }
}

/**
 * The accent word for the headline stack: the one word painted giant in the
 * brand colour. A word wrapped in asterisks wins ("*Free* second opinion");
 * otherwise the first word, when it is short enough to be a shout: FREE,
 * $89, SAVE, NEW. A long first word is left in the sentence.
 */
export function accentWord(hook) {
  const text = String(hook || '').trim()
  if (!text) return { accent: '', rest: '' }
  const marked = text.match(/\*([^*]{1,14})\*/)
  if (marked) {
    return { accent: marked[1].trim(), rest: text.replace(marked[0], '').replace(/\s{2,}/g, ' ').trim() }
  }
  const [first, ...others] = text.split(/\s+/)
  const bare = first.replace(/[^\w$%]/g, '')
  if (bare.length >= 2 && bare.length <= 8 && others.length > 0) {
    return { accent: first.replace(/[,:!.]+$/, ''), rest: others.join(' ') }
  }
  return { accent: '', rest: text }
}

/**
 * Before and after: the plate's photo area split in two, side by side on a
 * square or a feed frame and one above the other on a Story (where a side
 * by side pair would be two slivers), with a seam between them. The plate
 * takes a little less than on the plate look so both photos keep their size.
 */
export function beforeRects(w, h, { safeTop = 0, safeBottom = 0, share = 0.4, gap = 8 } = {}) {
  const { photo, plate } = plateRects(w, h, { safeTop, safeBottom, share })
  const stacked = h / w >= 1.6
  if (stacked) {
    const half = Math.round((photo.h - gap) / 2)
    return { stacked, photo, plate, before: { x: 0, y: 0, w, h: half }, after: { x: 0, y: half + gap, w, h: photo.h - half - gap } }
  }
  const half = Math.round((w - gap) / 2)
  return { stacked, photo, plate, before: { x: 0, y: 0, w: half, h: photo.h }, after: { x: half + gap, y: 0, w: w - half - gap, h: photo.h } }
}
