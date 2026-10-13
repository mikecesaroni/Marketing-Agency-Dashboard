// Canvas text helpers shared by every look the Studio can paint: the font
// stack, measuring, wrapping, shrinking to fit, and rounded boxes.
//
// Split out of adCanvas.js so the looks in adLooks.js and the original
// composition in adCanvas.js draw with the same type, without one importing
// the other in a circle.

// Every artboard is 1080 wide, so type is sized in absolute pixels and is the
// same physical size in all three.
export const FONT = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
export const PAD = 60

// ctx.letterSpacing is ignored rather than fatal where it is unsupported, so
// this is safe to set unconditionally. It only ever has to be reset to '0px'.
export function setFont(ctx, weight, px, tracking = 0) {
  ctx.font = `${weight} ${px}px ${FONT}`
  ctx.letterSpacing = `${tracking}px`
}

// Display type wants a real apostrophe. A straight quote in a 60px headline
// reads as a typo, which is not the impression a $30 offer should make.
export function typographic(text) {
  return String(text || '').replace(/(\w)'/g, '$1’')
}

export function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, h / 2, w / 2)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

export function wrapText(ctx, text, maxWidth) {
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

// Shrinks text until it fits the lines allowed. A long hook that silently
// overflows the frame is worse than a slightly smaller one.
export function fitText(ctx, text, maxWidth, maxLines, startPx, minPx, weight, tracking = 0, budget) {
  const { maxHeight = Infinity, lineRatio = 1.2 } = budget || {}
  let px = startPx
  let lines = []
  while (px >= minPx) {
    setFont(ctx, weight, px, tracking)
    lines = wrapText(ctx, text, maxWidth)
    if (lines.length <= maxLines && lines.length * px * lineRatio <= maxHeight) break
    px -= 3
  }
  // Still too tall at the smallest size: drop lines rather than run the
  // headline down through the offer block.
  const fits = Math.max(1, Math.floor(maxHeight / (px * lineRatio)))
  if (lines.length > fits) lines = lines.slice(0, fits)
  return { px, lines }
}

/** The widest of a set of lines at the font already set on the context. */
export function widest(ctx, lines) {
  let w = 0
  for (const line of lines || []) w = Math.max(w, ctx.measureText(line).width)
  return w
}

/**
 * Draws lines of text at a baseline, one under the other, honouring the
 * current font. `align` is 'left' | 'right' | 'center'; x is the anchor.
 */
export function drawLines(ctx, lines, x, firstBaseline, px, lineRatio, align = 'left') {
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  let y = firstBaseline
  for (const line of lines) {
    ctx.fillText(line, x, y)
    y += px * lineRatio
  }
  return y - px * lineRatio
}
