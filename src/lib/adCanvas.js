// Ad compositor.
//
// The layout is fixed and only the words change. That is deliberate: the
// playbook tests one variable at a time, which only works if the design holds
// still while the copy moves. A freeform canvas would let every variant drift
// and you would be comparing hook AND design.
//
// Canvas 2D rather than rasterising HTML: it gives exact 1080-wide output and
// lets the Reels safe areas be enforced in real pixels.
//
// The layout mirrors the Claude Design Studio ads: a header pinned to the top
// (location badge, the hook, then the subhead as a deck under it) and a footer
// stacked up from the bottom (offer block, proof, CTA), with the photo
// breathing in between and the logo in the bottom-right corner.

export const SIZES = [
  { key: 'square', label: 'Feed / Square', w: 1080, h: 1080 },
  { key: 'feed', label: 'Feed / Portrait', w: 1080, h: 1350 },
  // Reels and Stories put UI over both ends of the frame: the profile row up
  // top, the caption and message bar along the bottom. Anything placed there
  // is simply not seen.
  // Meta unified the 9:16 safe zone across Facebook/Instagram Stories and
  // Reels in March 2026: 14% off the top, 6% off each side, and a bottom band
  // that depends on the placement. Stories has the lighter interface and only
  // loses 20%; Reels stacks a caption, audio row and action buttons and eats
  // 35%. That is a ~290px difference, which is a whole headline.
  {
    key: 'story',
    label: 'Story & Reels',
    w: 1080,
    h: 1920,
    ui: { top: 0.14, side: 0.06, stories: 0.2, reels: 0.35 },
  },
]

// Meta's own advice: if you only make one vertical creative, make it for Reels,
// because anything that clears the Reels margins fits Stories with room over.
export const SAFE_MODES = [
  { key: 'reels', label: 'Reels safe', hint: 'strictest, works everywhere' },
  { key: 'stories', label: 'Stories safe', hint: 'more room, Stories only' },
  { key: 'off', label: 'Edge to edge', hint: 'no safe area' },
]

import { readableTextOn } from './logoColours'

export const DEFAULT_ACCENT = '#C81E1E' // offer block
export const DEFAULT_BADGE = '#1E3A8A' // location badge

// Every artboard is 1080 wide, so type is sized in absolute pixels and is the
// same physical size in all three.
const FONT = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const PAD = 60

// Inter is loaded from the stylesheet, but a font declared in CSS is only
// fetched once something on the page uses it. Canvas text does not count as a
// use, so without this the first paint measures with a fallback face and wraps
// on different words than the export does.
const WEIGHTS = ['500 27px', '700 23px', '700 32px', '800 21px', '800 22px', '800 44px', '800 60px']
export async function ensureFonts() {
  if (!document.fonts) return
  try {
    await Promise.all(WEIGHTS.map((w) => document.fonts.load(`${w} "Inter"`)))
    await document.fonts.ready
  } catch {
    // A font that will not load is not worth failing the render over; the
    // fallback stack still draws something reasonable.
  }
}

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

// ctx.letterSpacing is ignored rather than fatal where it is unsupported, so
// this is safe to set unconditionally. It only ever has to be reset to '0px'.
function setFont(ctx, weight, px, tracking = 0) {
  ctx.font = `${weight} ${px}px ${FONT}`
  ctx.letterSpacing = `${tracking}px`
}

// Display type wants a real apostrophe. A straight quote in a 60px headline
// reads as a typo, which is not the impression a $30 offer should make.
function typographic(text) {
  return String(text || '').replace(/(\w)'/g, '$1\u2019')
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

// Shrinks text until it fits the lines allowed. A long hook that silently
// overflows the frame is worse than a slightly smaller one.
function fitText(ctx, text, maxWidth, maxLines, startPx, minPx, weight, tracking = 0, budget) {
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
 * Visual hierarchy, largest to smallest: hook, then the offer, then the CTA
 * pill. The hook is the only thing that gets a scroll stopped, so it is sized
 * first and everything else is fitted around it.
 *
 * The footer is measured before anything is drawn, so the hook knows exactly
 * how much room it has and shrinks instead of running into the offer block.
 * That matters most on Reels, where the usable band is under half the frame.
 *
 * opts.safeMode: 'reels' (default) | 'stories' | 'off'
 * opts.guides: draw the unsafe bands over the preview. Never export with this on.
 */
export function renderAd(canvas, size, content, assets, opts = {}) {
  const { w, h } = size
  const safeMode = opts.safeMode || 'reels'
  const ui = size.ui
  const safeOn = Boolean(ui) && safeMode !== 'off'
  const safeTop = safeOn ? Math.round(h * ui.top) : 0
  const safeBottom = safeOn ? Math.round(h * (safeMode === 'stories' ? ui.stories : ui.reels)) : 0
  const safeSide = safeOn ? Math.round(w * ui.side) : 0

  const {
    badge,
    hook,
    offerAmount,
    offerDetail,
    subhead,
    proof,
    cta,
    accent = DEFAULT_ACCENT,
    badgeColor = DEFAULT_BADGE,
    hookPlate = false,
  } = content
  const { background, logo } = assets || {}

  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.letterSpacing = '0px'

  const padX = Math.max(PAD, safeSide)
  const maxWidth = w - padX * 2
  // Inside a safe inset the band is already generous, so only a little breathing
  // room is added. Without one, the design margin applies.
  const contentTop = safeTop + (safeTop ? 22 : PAD)
  const contentBottom = h - safeBottom - (safeBottom ? 22 : PAD)

  // ---- MEASURE ----
  const badgeLabel = badge?.trim() ? badge.trim().toUpperCase() : ''
  const badgeH = badgeLabel ? 52 : 0
  const headerTop = contentTop
  const hookTop = headerTop + (badgeH ? badgeH + 26 : 0)

  let logoBox = null
  if (logo) {
    // The square the logo is fitted inside, on a 1080-wide artboard, so about a
    // seventh of the width. It was 112 and read as an afterthought at feed size,
    // where the whole frame is a couple of inches on a phone.
    //
    // Whatever this is set to, the footer stays out of its way on its own: the
    // gutter below is subtracted from the width the offer block and CTA are
    // measured against, so a bigger logo reflows the text rather than colliding
    // with it. A wide logo still lands wide and short, since the fit is by the
    // longer edge.
    const box = 160
    const scale = Math.min(box / logo.width, box / logo.height)
    logoBox = { w: logo.width * scale, h: logo.height * scale }
  }
  const logoGutter = logoBox ? logoBox.w + 28 : 0

  // The subhead is a deck under the hook, not part of the footer stack.
  //
  // Its job is to finish the headline's thought, and in the footer it was
  // separated from the hook by the whole photo and the offer block, so by the
  // time it was read it looked like a caption on the price. A feed ad gets one
  // top-down pass, and a line supporting the hook has to be next to the hook to
  // be part of it. It also left the bottom of the frame carrying five things:
  // offer, subhead, proof, button, logo.
  //
  // Measured here, before the hook is sized, because the hook takes whatever
  // room is left over and has to know what the deck is going to use.
  const deck = subhead?.trim()
    ? fitText(ctx, typographic(subhead), maxWidth, 3, 30, 23, '500', 0, { lineRatio: 1.34 })
    : null
  const deckH = deck ? deck.lines.length * deck.px * 1.34 : 0
  const deckGap = deck ? 22 : 0

  const footer = measureFooter(ctx, { offerAmount, offerDetail, proof, cta }, maxWidth, logoGutter)
  const footerTop = contentBottom - footer.height

  // ---- BACKGROUND ----
  ctx.fillStyle = '#0F172A'
  ctx.fillRect(0, 0, w, h)
  if (background) drawCover(ctx, background, w, h)

  // Scrim. Without it, white text over a bright work photo is unreadable,
  // which is the single most common failure in this kind of ad. Three passes:
  // an overall knock-down so the photo reads as a backdrop, then extra weight
  // behind the header and behind the footer. The lower ramp is anchored to the
  // footer rather than to a fixed fraction, so it still sits behind the text
  // when Reels pushes everything up the frame.
  ctx.fillStyle = 'rgba(2,6,23,0.20)'
  ctx.fillRect(0, 0, w, h)

  // Reaches past the deck as well, or a subhead under a three-line hook falls
  // off the bottom of the gradient onto the bare photo.
  const topEnd = Math.max(h * 0.2, hookTop + 260 + deckH + deckGap)
  const topScrim = ctx.createLinearGradient(0, 0, 0, topEnd)
  topScrim.addColorStop(0, 'rgba(2,6,23,0.58)')
  topScrim.addColorStop(0.55, 'rgba(2,6,23,0.28)')
  topScrim.addColorStop(1, 'rgba(2,6,23,0)')
  ctx.fillStyle = topScrim
  ctx.fillRect(0, 0, w, topEnd)

  // Ramped over more stops than feels necessary: with only two, a tall frame
  // shows a visible horizontal seam where the gradient begins.
  const botStart = Math.max(0, footerTop - 220)
  const botScrim = ctx.createLinearGradient(0, botStart, 0, h)
  botScrim.addColorStop(0, 'rgba(2,6,23,0)')
  botScrim.addColorStop(0.3, 'rgba(2,6,23,0.34)')
  botScrim.addColorStop(0.55, 'rgba(2,6,23,0.66)')
  botScrim.addColorStop(0.78, 'rgba(2,6,23,0.86)')
  botScrim.addColorStop(1, 'rgba(2,6,23,0.93)')
  ctx.fillStyle = botScrim
  ctx.fillRect(0, botStart, w, h - botStart)

  // ---- HEADER ----
  if (badgeLabel) {
    setFont(ctx, '800', 22, 1.4)
    const boxW = Math.min(ctx.measureText(badgeLabel).width + 38, maxWidth)

    ctx.fillStyle = badgeColor
    roundRect(ctx, padX, headerTop, boxW, badgeH, 8)
    ctx.fill()

    // A pale brand colour needs dark text, not white. Deciding per block keeps
    // the colour honest instead of darkening it until white happens to fit.
    ctx.fillStyle = readableTextOn(badgeColor)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(badgeLabel, padX + 19, headerTop + badgeH / 2 + 1)
  }

  // The hook: the largest element on the frame, and the only one allowed to
  // claim whatever space is left between the badge and the offer block. The
  // deck takes its share of that room first, so a long subhead shrinks the hook
  // instead of pushing it into the footer.
  let hookLines = null
  let hookPx = 0
  let hookFirstBaseline = 0
  let hookLastBaseline = 0
  let deckTop = hookTop

  if (hook?.trim()) {
    const room = footerTop - 30 - hookTop - deckH - deckGap
    const fit = fitText(ctx, typographic(hook), maxWidth, 3, 60, 38, '800', -0.5, {
      maxHeight: room,
      lineRatio: 1.13,
    })
    hookLines = fit.lines
    hookPx = fit.px
    hookFirstBaseline = hookTop + hookPx
    hookLastBaseline = hookFirstBaseline + (hookLines.length - 1) * hookPx * 1.13
    // Descenders reach about 0.24em below the baseline, so the deck clears
    // them rather than tucking under a comma.
    deckTop = hookLastBaseline + hookPx * 0.24 + deckGap
  }

  // Worked out before anything is painted, so the plate below can cover the
  // hook and the deck as a single block.
  const deckBaselines = []
  if (deck) {
    let y = deckTop + deck.px
    for (let i = 0; i < deck.lines.length; i++) {
      deckBaselines.push(y)
      y += deck.px * 1.34
    }
  }

  // A busy photo behind the hook beats any amount of gradient: faces and
  // high-contrast detail cut straight through white type. The plate is a flat
  // panel sized to the text rather than a full-width band, so it reads as
  // design instead of a bug. It wraps the deck too — a subhead sitting just
  // outside it would be the one unreadable line on the frame.
  if (hookPlate && (hookLines?.length || deck)) {
    let widest = 0
    if (hookLines?.length) {
      setFont(ctx, '800', hookPx, -0.5)
      for (const line of hookLines) widest = Math.max(widest, ctx.measureText(line).width)
    }
    if (deck) {
      setFont(ctx, '500', deck.px, 0)
      for (const line of deck.lines) widest = Math.max(widest, ctx.measureText(line).width)
    }

    const padPlateX = 26
    const padPlateY = 20
    // Cap height sits about 0.74em above the baseline for this face, and
    // descenders about 0.22em below.
    const topPx = hookLines?.length ? hookPx : deck.px
    const topBaseline = hookLines?.length ? hookFirstBaseline : deckBaselines[0]
    const bottomPx = deckBaselines.length ? deck.px : hookPx
    const bottomBaseline = deckBaselines.length
      ? deckBaselines[deckBaselines.length - 1]
      : hookLastBaseline

    ctx.fillStyle = 'rgba(2,6,23,0.55)'
    roundRect(
      ctx,
      padX - padPlateX,
      topBaseline - topPx * 0.78 - padPlateY,
      Math.min(widest + padPlateX * 2, w - (padX - padPlateX) * 2),
      bottomBaseline + bottomPx * 0.24 + padPlateY - (topBaseline - topPx * 0.78 - padPlateY),
      14
    )
    ctx.fill()
  }

  if (hookLines?.length) {
    setFont(ctx, '800', hookPx, -0.5)
    ctx.fillStyle = '#FFFFFF'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'

    let y = hookFirstBaseline
    for (const line of hookLines) {
      ctx.fillText(line, padX, y)
      y += hookPx * 1.13
    }
  }

  // Lighter and smaller than the hook on purpose: it is support, and matching
  // the hook's weight would give the frame two things shouting at once.
  if (deck) {
    setFont(ctx, '500', deck.px, 0)
    ctx.fillStyle = '#E2E8F0'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    deck.lines.forEach((line, i) => ctx.fillText(line, padX, deckBaselines[i]))
  }

  // ---- FOOTER ----
  if (logoBox) {
    ctx.drawImage(logo, w - padX - logoBox.w, contentBottom - logoBox.h, logoBox.w, logoBox.h)
  }
  drawFooter(ctx, footer, { padX, contentBottom, maxWidth, accent })

  if (opts.guides) drawGuides(ctx, w, h, safeTop, safeBottom, safeSide, safeOn)

  ctx.letterSpacing = '0px'
  return canvas
}

// Works out the footer's total height without drawing, so the hook above it
// can be sized against real numbers rather than a guess.
function measureFooter(ctx, { offerAmount, offerDetail, proof, cta }, maxWidth, logoGutter) {
  const parts = { height: 0 }

  if (cta?.trim()) {
    setFont(ctx, '700', 32, 0)
    const textW = ctx.measureText(cta).width
    parts.cta = {
      text: cta,
      h: 98,
      w: Math.min(Math.max(textW + 140, 640), maxWidth - logoGutter),
    }
    parts.height += 98 + 32
  }

  if (proof?.trim()) {
    parts.proof = { text: proof.trim(), px: 23 }
    parts.height += 23 + 22
  }

  const amount = offerAmount?.trim()
  const detail = offerDetail?.trim().toUpperCase()
  if (amount || detail) {
    const padBoxX = 22
    const padBoxY = 18
    let boxW = 0
    let amountPx = 0
    if (amount) {
      setFont(ctx, '800', 44, 0)
      amountPx = 44
      boxW = Math.max(boxW, ctx.measureText(amount).width)
    }
    let detailLines = []
    let detailPx = 0
    if (detail) {
      const fit = fitText(ctx, detail, maxWidth - padBoxX * 2, 2, 21, 16, '800', 1.1, { lineRatio: 1.3 })
      detailLines = fit.lines
      detailPx = fit.px
      for (const l of detailLines) boxW = Math.max(boxW, ctx.measureText(l).width)
    }
    const gap = amount && detail ? 10 : 0
    const boxH = padBoxY * 2 + amountPx + gap + detailLines.length * detailPx * 1.3
    parts.offer = {
      amount,
      amountPx,
      detailLines,
      detailPx,
      gap,
      padBoxX,
      padBoxY,
      w: Math.min(boxW + padBoxX * 2, maxWidth),
      h: boxH,
    }
    parts.height += boxH
  }

  return parts
}

// Draws what measureFooter worked out, stacking upward from the bottom.
function drawFooter(ctx, parts, { padX, contentBottom, accent }) {
  let cursor = contentBottom
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // CTA pill: white, dark text, wider than the words need so it reads as a
  // button. Width-capped above so it never runs under the logo.
  if (parts.cta) {
    const { text, w: btnW, h: btnH } = parts.cta
    const btnY = cursor - btnH

    ctx.fillStyle = '#FFFFFF'
    roundRect(ctx, padX, btnY, btnW, btnH, btnH / 2)
    ctx.fill()

    setFont(ctx, '700', 32, 0)
    ctx.fillStyle = '#0F172A'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, padX + btnW / 2, btnY + btnH / 2 + 1)

    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    cursor = btnY - 32
  }

  if (parts.proof) {
    setFont(ctx, '700', parts.proof.px, 0)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText(parts.proof.text, padX, cursor)
    cursor -= parts.proof.px + 22
  }

  if (parts.offer) {
    const o = parts.offer
    const boxY = cursor - o.h

    ctx.fillStyle = accent
    roundRect(ctx, padX, boxY, o.w, o.h, 4)
    ctx.fill()

    ctx.fillStyle = readableTextOn(accent)
    let ty = boxY + o.padBoxY
    if (o.amount) {
      setFont(ctx, '800', o.amountPx, 0)
      ty += o.amountPx
      ctx.fillText(o.amount, padX + o.padBoxX, ty)
      ty += o.gap
    }
    setFont(ctx, '800', o.detailPx, 1.1)
    for (const line of o.detailLines) {
      ty += o.detailPx
      ctx.fillText(line, padX + o.padBoxX, ty)
      ty += o.detailPx * 0.3
    }
  }
}

// Preview-only overlay of the regions Meta's interface covers, the same idea as
// the Safe Zone Guardrail in Ads Manager. Everything that exports a PNG
// re-renders without this first.
function drawGuides(ctx, w, h, safeTop, safeBottom, safeSide, safeOn) {
  if (!safeOn) return
  ctx.save()
  ctx.fillStyle = 'rgba(220,38,38,0.28)'
  ctx.fillRect(0, 0, w, safeTop)
  ctx.fillRect(0, h - safeBottom, w, safeBottom)
  ctx.fillRect(0, safeTop, safeSide, h - safeTop - safeBottom)
  ctx.fillRect(w - safeSide, safeTop, safeSide, h - safeTop - safeBottom)

  ctx.strokeStyle = 'rgba(254,202,202,0.9)'
  ctx.lineWidth = 3
  ctx.setLineDash([16, 12])
  ctx.beginPath()
  ctx.moveTo(0, safeTop)
  ctx.lineTo(w, safeTop)
  ctx.moveTo(0, h - safeBottom)
  ctx.lineTo(w, h - safeBottom)
  ctx.stroke()

  ctx.setLineDash([])
  ctx.fillStyle = '#FFFFFF'
  ctx.font = '700 26px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(`covered by Meta UI — ${safeTop}px`, 20, safeTop - 18)
  ctx.fillText(`covered by Meta UI — ${safeBottom}px`, 20, h - safeBottom + 40)
  ctx.restore()
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
