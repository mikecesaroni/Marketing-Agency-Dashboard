// Ad compositor.
//
// Same layout every time, three text slots that change: hook, offer, CTA. That
// is deliberate. The playbook tests one variable at a time, which only works if
// the layout holds still while the words change — a freeform canvas would let
// every variant drift and you would be comparing hook AND design.
//
// Canvas 2D rather than rasterising HTML: it gives exact 1080-wide output and
// lets the safe areas be enforced in real pixels. Meta's interface covers the
// top and bottom of a 9:16, so text placed there is simply not seen.

export const SIZES = [
  { key: 'feed', label: '4:5 Feed', w: 1080, h: 1350, safeTop: 70, safeBottom: 70 },
  // Reels and Stories put UI over both ends of the frame.
  { key: 'story', label: '9:16 Story', w: 1080, h: 1920, safeTop: 250, safeBottom: 250 },
  { key: 'square', label: '1:1 Square', w: 1080, h: 1080, safeTop: 70, safeBottom: 70 },
]

export const DEFAULT_ACCENT = '#EA580C'

// Cross-origin is required or the canvas is tainted and toBlob() throws, which
// would make the whole thing un-exportable. Supabase public buckets send the
// CORS headers this needs.
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load image: ${src}`))
    img.src = src
  })
}

function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, h / 2, w / 2)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  const lines = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

// Shrinks the headline until it fits the lines allowed. A long hook that
// silently overflows the frame is worse than a slightly smaller one.
function fitText(ctx, text, maxWidth, maxLines, startPx, minPx, weight = '800') {
  let px = startPx
  let lines = []
  while (px >= minPx) {
    ctx.font = `${weight} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
    lines = wrapText(ctx, text, maxWidth)
    if (lines.length <= maxLines) break
    px -= 4
  }
  return { px, lines }
}

// Draws a cover-fit image, cropping the overflow rather than distorting it.
function drawCover(ctx, img, w, h) {
  const scale = Math.max(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

/**
 * Paints one ad onto a canvas.
 *
 * Content is laid out from the bottom of the safe area upward, so a long hook
 * grows into empty space instead of pushing the CTA off the frame.
 */
export function renderAd(canvas, size, content, assets) {
  const { w, h, safeTop, safeBottom } = size
  const { hook, offer, cta, accent = DEFAULT_ACCENT } = content
  const { background, logo } = assets || {}

  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  // 1. Background
  ctx.fillStyle = '#1E293B'
  ctx.fillRect(0, 0, w, h)
  if (background) drawCover(ctx, background, w, h)

  // 2. Scrim. Without it, white text over a bright work photo is unreadable,
  //    which is the single most common failure in this kind of ad.
  // Ramped over more stops than feels necessary: with only three, the 9:16
  // showed a visible horizontal seam where the gradient began, because the tall
  // frame stretches each step over ~500px.
  const scrim = ctx.createLinearGradient(0, 0, 0, h)
  scrim.addColorStop(0, 'rgba(2,6,23,0.10)')
  scrim.addColorStop(0.35, 'rgba(2,6,23,0.16)')
  scrim.addColorStop(0.55, 'rgba(2,6,23,0.42)')
  scrim.addColorStop(0.72, 'rgba(2,6,23,0.74)')
  scrim.addColorStop(0.88, 'rgba(2,6,23,0.90)')
  scrim.addColorStop(1, 'rgba(2,6,23,0.95)')
  ctx.fillStyle = scrim
  ctx.fillRect(0, 0, w, h)

  const pad = 72
  const maxWidth = w - pad * 2
  let cursor = h - safeBottom - pad // bottom of the content stack, moving up

  // 3. CTA button
  if (cta?.trim()) {
    ctx.font = '700 40px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    const textW = ctx.measureText(cta).width
    const btnW = Math.min(textW + 88, maxWidth)
    const btnH = 96
    const btnY = cursor - btnH

    ctx.fillStyle = accent
    roundRect(ctx, pad, btnY, btnW, btnH, 16)
    ctx.fill()

    ctx.fillStyle = '#FFFFFF'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillText(cta, pad + btnW / 2, btnY + btnH / 2 + 2)

    cursor = btnY - 36
  }

  // 4. Offer line, directly above the button
  if (offer?.trim()) {
    const { px, lines } = fitText(ctx, offer, maxWidth, 2, 46, 30, '700')
    const lineH = px * 1.25
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'

    for (let i = lines.length - 1; i >= 0; i--) {
      ctx.fillStyle = '#FDE68A'
      ctx.fillText(lines[i], pad, cursor)
      cursor -= lineH
    }
    cursor -= 18
  }

  // 5. Hook, the largest element, growing upward
  if (hook?.trim()) {
    const { px, lines } = fitText(ctx, hook, maxWidth, 4, 92, 44, '800')
    const lineH = px * 1.12
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'

    for (let i = lines.length - 1; i >= 0; i--) {
      ctx.fillStyle = '#FFFFFF'
      ctx.fillText(lines[i], pad, cursor)
      cursor -= lineH
    }
  }

  // 6. Logo, top-left inside the safe area
  if (logo) {
    const boxW = 220
    const scale = Math.min(boxW / logo.width, 110 / logo.height)
    ctx.drawImage(logo, pad, safeTop + 20, logo.width * scale, logo.height * scale)
  }

  return canvas
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      // Almost always a tainted canvas from an image served without CORS.
      else reject(new Error('Could not export the canvas. Check the image allows cross-origin use.'))
    }, 'image/png')
  })
}
