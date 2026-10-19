/**
 * The logo without its box.
 *
 * Most logos arrive as a JPEG or a PNG on a rectangle: white most often, but
 * cream, light grey, black or a brand colour too (a social profile picture
 * saved as the logo). Painted on a snow scene or a brand-colour poster that
 * rectangle is a sticker, so it is knocked out:
 *
 * 1. The background colour is the colour most of the border shares (the
 *    commonest one, not the average, so a mark that touches the edge does
 *    not drag it off). When at least 55% of the border is that one colour,
 *    the box is a background, whatever its colour.
 * 2. A flood from the edges removes every pixel close to that colour, with
 *    a soft edge so the anti-aliasing does not leave a halo.
 * 3. The holes inside letters (the middle of an o, an e, an a, a B) are not
 *    reached by the flood and would stay as white dots, and turn into solid
 *    blobs when the mark is reversed to white on a dark ad. Enclosed pieces
 *    of the background colour that are small and roundish are holes, and go
 *    too. Long thin pieces (a white I or E inside a coloured badge) are
 *    lettering and stay.
 *
 * A border with no shared colour (a photo, a mark cropped tight to its
 * edges) is left whole, and so is a result with almost nothing left.
 *
 * Two more versions come with it: the mark in white and the mark in slate,
 * for the surfaces where its own colours would sink (a navy logo on a night
 * theme reads as white, the way a reversed logo does on a van). logoFor()
 * picks which of the three a surface gets.
 */

const SLATE = '#0F172A'
const MAX = 900
// Distances in RGB: well inside the background colour goes; the band
// between fades, so the rim of the mark keeps its shape without a halo.
const NEAR = 48
const FAR = 96

function luminance(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/**
 * The colour most of the border shares, and how much of the border it is.
 * Returns null for a border that is mostly transparent already.
 */
export function borderColour(px, w, h) {
  const counts = new Map()
  const samples = []
  let clear = 0
  const take = (x, y) => {
    const i = (y * w + x) * 4
    if (px[i + 3] < 24) {
      clear++
      return
    }
    samples.push(i)
    const key = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  for (let x = 0; x < w; x++) {
    take(x, 0)
    take(x, h - 1)
  }
  for (let y = 1; y < h - 1; y++) {
    take(0, y)
    take(w - 1, y)
  }
  const total = samples.length + clear
  if (!samples.length || clear > total * 0.3) return { alreadyCut: true }
  let best = 0
  let bestN = -1
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k
      bestN = n
    }
  }
  const cr = (((best >> 8) & 15) << 4) + 8
  const cg = (((best >> 4) & 15) << 4) + 8
  const cb = ((best & 15) << 4) + 8
  let n = 0
  let sr = 0
  let sg = 0
  let sb = 0
  for (const i of samples) {
    if (Math.abs(px[i] - cr) > 40 || Math.abs(px[i + 1] - cg) > 40 || Math.abs(px[i + 2] - cb) > 40) continue
    n++
    sr += px[i]
    sg += px[i + 1]
    sb += px[i + 2]
  }
  const r = sr / n
  const g = sg / n
  const b = sb / n
  let shared = 0
  for (const i of samples) {
    if (Math.sqrt((px[i] - r) ** 2 + (px[i + 1] - g) ** 2 + (px[i + 2] - b) ** 2) <= NEAR) shared++
  }
  return { r, g, b, share: shared / samples.length, alreadyCut: false }
}

/**
 * Knocks the background out of an RGBA buffer in place. Returns how many
 * pixels went fully clear. Pure, so it can be checked without a browser.
 */
export function knockOut(px, w, h, bg) {
  const dist = (p) => {
    const i = p * 4
    return Math.sqrt((px[i] - bg.r) ** 2 + (px[i + 1] - bg.g) ** 2 + (px[i + 2] - bg.b) ** 2)
  }
  const seen = new Uint8Array(w * h)
  let removed = 0
  const flood = (seeds) => {
    const stack = []
    const push = (p) => {
      if (seen[p]) return
      if (dist(p) > FAR) return
      seen[p] = 1
      stack.push(p)
    }
    for (const p of seeds) push(p)
    while (stack.length) {
      const p = stack.pop()
      const x = p % w
      const y = (p - x) / w
      const d = dist(p)
      const alpha = d <= NEAR ? 0 : Math.round((255 * (d - NEAR)) / (FAR - NEAR))
      if (alpha < px[p * 4 + 3]) px[p * 4 + 3] = alpha
      if (alpha === 0) removed++
      if (x > 0) push(p - 1)
      if (x < w - 1) push(p + 1)
      if (y > 0) push(p - w)
      if (y < h - 1) push(p + w)
    }
  }

  // 1. From the edges.
  const edge = []
  for (let x = 0; x < w; x++) edge.push(x, (h - 1) * w + x)
  for (let y = 1; y < h - 1; y++) edge.push(y * w, y * w + w - 1)
  flood(edge)

  // 2. The holes inside letters: enclosed pieces of the background colour.
  const label = new Int32Array(w * h).fill(-1)
  const area = w * h
  for (let start = 0; start < area; start++) {
    if (seen[start] || label[start] !== -1 || px[start * 4 + 3] < 128 || dist(start) > NEAR) continue
    const piece = []
    const stack = [start]
    label[start] = start
    let minX = w
    let minY = h
    let maxX = 0
    let maxY = 0
    let rim = 0
    while (stack.length) {
      const p = stack.pop()
      piece.push(p)
      const x = p % w
      const y = (p - x) / w
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      let outside = 0
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q < 0) continue
        if (label[q] === start) continue
        if (!seen[q] && px[q * 4 + 3] >= 128 && dist(q) <= NEAR) {
          label[q] = start
          stack.push(q)
        } else outside++
      }
      if (outside) rim++
    }
    const n = piece.length
    const bw = maxX - minX + 1
    const bh = maxY - minY + 1
    const aspect = Math.max(bw, bh) / Math.min(bw, bh)
    const fill = n / (bw * bh)
    const compact = rim ? (4 * Math.PI * n) / (rim * rim) : 0
    // Small, roundish and solid: a hole. Long, thin or sprawling: lettering.
    // Up to 8% of the logo: a one-letter mark has a big hole in its O.
    if (n >= 3 && n <= area * 0.08 && aspect <= 3 && fill >= 0.4 && compact >= 0.3) flood(piece)
  }
  return removed
}

/**
 * Prepares a loaded logo image. Returns null without one. The result is
 * cheap to keep on the assets object: { image, white, dark, luminance,
 * removed } where `image` is the mark with its background knocked out (or
 * the original when nothing was removed), `luminance` is the brightness of
 * the mark itself (0 dark, 1 light), and `removed` the share of the box
 * that went.
 */
export function prepareLogo(img) {
  if (!img || !img.width || !img.height) return null
  const scale = Math.min(1, MAX / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, w, h)
  let data
  try {
    data = ctx.getImageData(0, 0, w, h)
  } catch {
    // A tainted canvas (a logo from a host without CORS): nothing can be read, so nothing changes.
    return { image: img, white: null, dark: null, luminance: 0.5, removed: 0 }
  }
  const px = data.data
  const original = new Uint8ClampedArray(px)

  const bg = borderColour(px, w, h)
  const alreadyCut = Boolean(bg?.alreadyCut)
  let removed = 0
  if (!alreadyCut && bg && bg.share >= 0.55) {
    removed = knockOut(px, w, h, bg)
    // Almost nothing left: it was a picture, not a mark on a box. Keep it whole.
    let solid = 0
    for (let i = 3; i < px.length; i += 4) if (px[i] >= 128) solid++
    if (solid < w * h * 0.01) {
      px.set(original)
      removed = 0
    }
  }

  // The brightness of what is left, so a surface can tell a dark mark from a light one.
  let lum = 0
  let count = 0
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue
    lum += luminance(px[i], px[i + 1], px[i + 2])
    count++
  }
  const avg = count ? lum / count : 0.5

  const cut = removed > 0 ? canvas : img
  if (removed > 0) ctx.putImageData(data, 0, 0)

  // The reversed versions: the same alpha, one flat colour.
  const flat = (colour) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const cx = c.getContext('2d')
    cx.drawImage(cut, 0, 0, w, h)
    cx.globalCompositeOperation = 'source-in'
    cx.fillStyle = colour
    cx.fillRect(0, 0, w, h)
    return c
  }
  // A mark that still carries its box (nothing removed, no transparency)
  // cannot be reversed: a flat rectangle is what would come back.
  const reversible = removed > 0 || alreadyCut
  return {
    image: cut,
    white: reversible ? flat('#FFFFFF') : null,
    dark: reversible ? flat(SLATE) : null,
    luminance: avg,
    removed: removed / (w * h),
  }
}

/**
 * The logo for a surface. Dark marks go white on a dark surface and very
 * light marks go slate on a light one; everything else is the mark as it is.
 * Falls back to the plain image when the logo was never prepared.
 */
export function logoFor(assets, darkSurface) {
  const p = assets?.logoCut
  if (!p) return assets?.logo || null
  if (darkSurface && p.luminance < 0.5 && p.white) return p.white
  if (!darkSurface && p.luminance > 0.82 && p.dark) return p.dark
  return p.image
}
