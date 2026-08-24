// Pulls an ad's accent colours out of the client's logo.
//
// Two things make this harder than "find the most common pixel". Logos are
// mostly background — white, transparent, or a black outline — so the common
// pixel is almost never the brand colour. And both places these colours get
// used (the offer block and the location badge) carry white text, so a colour
// that is technically correct but too light is worse than no colour at all.

const SAMPLE = 120 // downscale before counting; a 2000px logo is all detail we do not need

export function hexOf(r, g, b) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

export function rgbToHsl(r, g, b) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h: h * 360, s, l }
}

export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360
  if (s === 0) {
    const v = l * 255
    return [v, v, v]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hk = h / 360
  const channel = (t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [channel(hk + 1 / 3) * 255, channel(hk) * 255, channel(hk - 1 / 3) * 255]
}

function channelLuminance(v) {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

// WCAG relative luminance, used only to answer "can white text sit on this".
export function contrastWithWhite([r, g, b]) {
  const l = 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
  return 1.05 / (l + 0.05)
}

/**
 * Picks black or white text for a block of this colour.
 *
 * The alternative was darkening bright brand colours until white text fitted,
 * but that turns a yellow logo into olive: technically legible and no longer
 * the brand. Flipping the text keeps the colour honest, which is what a
 * designer would do with the same problem.
 */
export function readableTextOn(hex) {
  const rgb = hexToRgb(hex)
  return contrastWithWhite(rgb) >= contrastWithDark(rgb) ? '#FFFFFF' : '#0F172A'
}

export function contrastWithDark([r, g, b]) {
  const l = 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
  const dark =
    0.2126 * channelLuminance(15) + 0.7152 * channelLuminance(23) + 0.0722 * channelLuminance(42)
  return (Math.max(l, dark) + 0.05) / (Math.min(l, dark) + 0.05)
}

// Whichever text colour wins, this is the contrast the block will actually have.
export function bestContrast(hex) {
  const rgb = hexToRgb(hex)
  return Math.max(contrastWithWhite(rgb), contrastWithDark(rgb))
}

export function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ]
}

// Shortest distance around the colour wheel.
export function hueGap(a, b) {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/**
 * Counts brand-looking colours in raw RGBA pixels.
 *
 * Exported separately from the canvas work so the decisions here can be tested
 * against constructed pixel data rather than a screenshot.
 */
export function quantise(data, { max = 6 } = {}) {
  const buckets = new Map()

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue // transparent logo background

    const { h, s, l } = rgbToHsl(data[i], data[i + 1], data[i + 2])
    // White paper, black outlines and grey shadows are not the brand.
    if (l > 0.9 || l < 0.06 || s < 0.2) continue

    const hueBin = Math.round(h / 15) % 24
    const key = `${hueBin}|${Math.round(s * 5)}|${Math.round(l * 8)}`
    const b = buckets.get(key) || { n: 0, r: 0, g: 0, bl: 0, hueBin }
    b.n++
    b.r += data[i]
    b.g += data[i + 1]
    b.bl += data[i + 2]
    buckets.set(key, b)
  }

  // Group by hue, then within each hue pick the PUREST shade rather than the
  // most common one. Antialiased text blends toward the background, so a navy
  // wordmark on white produces far more pale grey-blue pixels than true navy;
  // going by count alone hands back the blend instead of the brand colour.
  const families = new Map()
  for (const b of buckets.values()) {
    const f = families.get(b.hueBin) || { total: 0, subs: [] }
    f.total += b.n
    f.subs.push(b)
    families.set(b.hueBin, f)
  }

  const found = []
  for (const f of families.values()) {
    // Ignore shades that are barely present; they are usually stray pixels or
    // JPEG noise rather than a deliberate part of the mark.
    const solid = f.subs.filter((b) => b.n >= f.total * 0.08)
    const pick = (solid.length ? solid : f.subs)
      .map((b) => {
        const rgb = [b.r / b.n, b.g / b.n, b.bl / b.n]
        return { rgb, ...rgbToHsl(...rgb), n: b.n }
      })
      .sort((x, y) => y.s - x.s)[0]

    found.push({ hex: hexOf(...pick.rgb), hue: pick.h, count: f.total })
  }

  found.sort((a, b) => b.count - a.count)

  // Merge near-identical hues so a gradient does not fill every slot with the
  // same colour at slightly different lightness.
  const merged = []
  for (const c of found) {
    if (merged.some((m) => hueGap(m.hue, c.hue) < 18)) continue
    merged.push(c)
    if (merged.length >= max) break
  }
  return merged
}

/**
 * Picks the offer and badge colours from a quantised palette.
 *
 * They want to be visibly different or the ad reads as one colour block, so the
 * badge takes the strongest colour that is a real distance around the wheel
 * from the accent. A single-colour logo falls back to a shifted, darker version
 * of its own colour rather than an unrelated default.
 */
export function choosePair(palette, fallback) {
  if (palette.length === 0) return fallback

  const accent = palette[0].hex
  const other = palette.slice(1).find((c) => hueGap(c.hue, palette[0].hue) > 45)

  if (other) return { accent, badge: other.hex, swatches: palette.map((p) => p.hex) }

  const [r, g, b] = hexToRgb(palette[0].hex)
  const { h, s, l } = rgbToHsl(r, g, b)
  const shifted = hexOf(...hslToRgb(h + 150, Math.max(s, 0.4), Math.min(l, 0.35)))
  return { accent, badge: shifted, swatches: palette.map((p) => p.hex) }
}

/**
 * Reads the logo's pixels. Requires the image to have been loaded with
 * crossOrigin set, or getImageData throws on a tainted canvas.
 */
export function extractPalette(img, fallback) {
  if (!img) return fallback
  try {
    const canvas = document.createElement('canvas')
    const scale = Math.min(SAMPLE / img.width, SAMPLE / img.height, 1)
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return choosePair(quantise(data), fallback)
  } catch {
    // A logo served without CORS taints the canvas. Keeping the current colours
    // is a much better outcome than breaking the panel.
    return fallback
  }
}
