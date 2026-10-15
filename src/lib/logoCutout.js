/**
 * The logo without its box.
 *
 * Most logos arrive as a JPEG or a PNG on a white rectangle. Painted on a
 * snow scene or a brand-colour poster that rectangle is a sticker, so the
 * white around the mark is knocked out: a flood from the edges removes every
 * pixel close to the edge colour, with a soft edge so the anti-aliasing does
 * not leave a halo. Only a light, near-neutral edge is knocked out; a logo
 * that fills its box with colour is a box on purpose and stays whole.
 *
 * Two more versions come with it: the mark in white and the mark in slate,
 * for the surfaces where its own colours would sink (a navy logo on a night
 * theme reads as white, the way a reversed logo does on a van). logoFor()
 * picks which of the three a surface gets.
 */

const SLATE = '#0F172A'
const MAX = 900

function luminance(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
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

  // The edge colour: the average of the border pixels that are not already
  // transparent. A border that is mostly transparent is a PNG that was cut
  // out already.
  let n = 0
  let clear = 0
  let sr = 0
  let sg = 0
  let sb = 0
  const edge = (x, y) => {
    const i = (y * w + x) * 4
    if (px[i + 3] < 24) {
      clear++
      return
    }
    n++
    sr += px[i]
    sg += px[i + 1]
    sb += px[i + 2]
  }
  for (let x = 0; x < w; x++) {
    edge(x, 0)
    edge(x, h - 1)
  }
  for (let y = 1; y < h - 1; y++) {
    edge(0, y)
    edge(w - 1, y)
  }
  const alreadyCut = clear > (n + clear) * 0.3
  let removed = 0
  if (!alreadyCut && n > 0) {
    const er = sr / n
    const eg = sg / n
    const eb = sb / n
    const light = luminance(er, eg, eb) > 0.8
    const neutral = Math.max(er, eg, eb) - Math.min(er, eg, eb) < 40
    if (light && neutral) {
      // Flood from every border pixel through everything near the edge colour.
      // Two thresholds: well inside the colour goes; the band between fades,
      // so the anti-aliased rim of the mark keeps its shape without a halo.
      const near = 48
      const far = 96
      const dist = (i) => Math.sqrt((px[i] - er) ** 2 + (px[i + 1] - eg) ** 2 + (px[i + 2] - eb) ** 2)
      const seen = new Uint8Array(w * h)
      const stack = []
      const push = (x, y) => {
        const p = y * w + x
        if (seen[p]) return
        const d = dist(p * 4)
        if (d > far) return
        seen[p] = 1
        stack.push(p)
      }
      for (let x = 0; x < w; x++) {
        push(x, 0)
        push(x, h - 1)
      }
      for (let y = 1; y < h - 1; y++) {
        push(0, y)
        push(w - 1, y)
      }
      while (stack.length) {
        const p = stack.pop()
        const x = p % w
        const y = (p - x) / w
        const d = dist(p * 4)
        const alpha = d <= near ? 0 : Math.round((255 * (d - near)) / (far - near))
        px[p * 4 + 3] = Math.min(px[p * 4 + 3], alpha)
        if (alpha === 0) removed++
        if (x > 0) push(x - 1, y)
        if (x < w - 1) push(x + 1, y)
        if (y > 0) push(x, y - 1)
        if (y < h - 1) push(x, y + 1)
      }
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
