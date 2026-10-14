// The looks beyond the classic composition: the same words, painted
// differently, so a client's set of ads reads as a campaign rather than one
// template with the headline swapped.
//
//   stack  one giant accent word over the photo, the rest of the hook under
//          it, and a white offer card: the "FREE second opinion" shape that
//          home-services ads keep landing on
//   plate  the photo on top, the words on a brand-colour plate below
//   split  a brand-colour panel beside (or above) the photo
//   ai     a finished AI concept, fitted whole with a blurred surround, no
//          words painted
//
// Every look respects the same safe margins as the classic one, measures
// before it draws, and shrinks type rather than let it run off the frame.
// Nothing here paints a call-to-action button: Meta draws the real one under
// the creative, and a painted one is a decoy (see adCanvas.js).

import { readableTextOn } from './logoColours'
import { PAD, drawLines, fitText, roundRect, setFont, typographic, widest } from './adText'
import { DEFAULT_BG, accentWord, containRect, coverRect, plateRects, splitRects } from './adLayout'

const SLATE = '#0F172A'
const r = (n) => Math.round(n)

/** The frame's margins once the 9:16 interface bands are kept clear. */
export function frameMargins(size, safeMode) {
  const { w, h, ui } = size
  const safeOn = Boolean(ui) && safeMode !== 'off'
  const safeTop = safeOn ? Math.round(h * ui.top) : 0
  const safeBottom = safeOn ? Math.round(h * (safeMode === 'stories' ? ui.stories : ui.reels)) : 0
  const safeSide = safeOn ? Math.round(w * ui.side) : 0
  const padX = Math.max(PAD, safeSide)
  return {
    w,
    h,
    safeOn,
    safeTop,
    safeBottom,
    safeSide,
    padX,
    maxWidth: w - padX * 2,
    contentTop: safeTop + (safeTop ? 22 : PAD),
    contentBottom: h - safeBottom - (safeBottom ? 22 : PAD),
  }
}

/** A cover-fit photo inside a sub-rectangle of the frame. */
function drawCoverIn(ctx, img, rect, focus) {
  const c = coverRect(rect.w, rect.h, img, focus)
  ctx.save()
  ctx.beginPath()
  ctx.rect(rect.x, rect.y, rect.w, rect.h)
  ctx.clip()
  ctx.drawImage(img, rect.x + c.x, rect.y + c.y, c.w, c.h)
  ctx.restore()
}

function scrim(ctx, x, y, w, h, stops, vertical = true) {
  const g = vertical ? ctx.createLinearGradient(0, y, 0, y + h) : ctx.createLinearGradient(x, 0, x + w, 0)
  for (const [at, color] of stops) g.addColorStop(at, color)
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)
}

/** The location badge pill, top-left of a rectangle. Returns its height. */
function drawBadge(ctx, label, x, y, maxW, color) {
  if (!label) return 0
  const text = label.trim().toUpperCase()
  setFont(ctx, '800', 22, 1.4)
  const boxW = Math.min(ctx.measureText(text).width + 38, maxW)
  const boxH = 52
  ctx.fillStyle = color
  roundRect(ctx, x, y, boxW, boxH, 8)
  ctx.fill()
  ctx.fillStyle = readableTextOn(color)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + 19, y + boxH / 2 + 1)
  ctx.textBaseline = 'alphabetic'
  return boxH
}

/** The logo fitted into a box whose top-left is given. Returns the drawn size. */
function logoFit(logo, box) {
  if (!logo) return null
  const scale = Math.min(box / logo.width, box / logo.height)
  return { w: logo.width * scale, h: logo.height * scale }
}

/** A small white pill behind a logo, so a dark logo survives a dark photo. */
function drawLogoPill(ctx, logo, x, y, box, { align = 'left', bottom = false } = {}) {
  const fit = logoFit(logo, box)
  if (!fit) return null
  const padP = 14
  const pw = fit.w + padP * 2
  const ph = fit.h + padP * 2
  const px = align === 'right' ? x - pw : x
  const py = bottom ? y - ph : y
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  roundRect(ctx, px, py, pw, ph, 14)
  ctx.fill()
  ctx.drawImage(logo, px + padP, py + padP, fit.w, fit.h)
  return { x: px, y: py, w: pw, h: ph }
}

// ---------------------------------------------------------------------------
// The offer card: white, rounded, the amount in the accent colour, the detail
// under it, a thin rule, then the proof. Measured first so the look can place
// it; drawn where the look says.
// ---------------------------------------------------------------------------

function measureOfferCard(ctx, { offerAmount, offerDetail, proof }, maxW, { ink = SLATE, accent } = {}) {
  const amount = offerAmount?.trim() || ''
  const detail = offerDetail?.trim() || ''
  const proofText = proof?.trim() || ''
  if (!amount && !detail && !proofText) return null
  const padC = 30
  const innerW = maxW - padC * 2
  const lines = []
  let widestW = 0
  let height = padC
  if (amount) {
    const fit = fitText(ctx, amount, innerW, 1, 64, 36, '900', -1, { lineRatio: 1.05 })
    lines.push({ kind: 'amount', px: fit.px, text: fit.lines[0] || amount, weight: '900', tracking: -1, color: accent, ratio: 1.05 })
    widestW = Math.max(widestW, widest(ctx, fit.lines))
    height += fit.px * 1.05
  }
  if (detail) {
    const fit = fitText(ctx, typographic(detail), innerW, 3, 30, 20, '800', 0, { lineRatio: 1.22 })
    lines.push({ kind: 'detail', px: fit.px, lines: fit.lines, weight: '800', tracking: 0, color: ink, ratio: 1.22 })
    widestW = Math.max(widestW, widest(ctx, fit.lines))
    height += (amount ? 10 : 0) + fit.lines.length * fit.px * 1.22
  }
  if (proofText) {
    const fit = fitText(ctx, typographic(proofText), innerW, 2, 22, 17, '600', 0, { lineRatio: 1.3 })
    lines.push({ kind: 'proof', px: fit.px, lines: fit.lines, weight: '600', tracking: 0, color: '#475569', ratio: 1.3, rule: amount || detail })
    widestW = Math.max(widestW, widest(ctx, fit.lines))
    height += (amount || detail ? 22 + 1 + 18 : 0) + fit.lines.length * fit.px * 1.3
  }
  height += padC
  return { w: Math.min(maxW, Math.max(widestW + padC * 2, 320)), h: r(height), padC, lines }
}

function drawOfferCard(ctx, card, x, y, { align = 'left' } = {}) {
  if (!card) return
  ctx.save()
  ctx.shadowColor = 'rgba(2,6,23,0.28)'
  ctx.shadowBlur = 36
  ctx.shadowOffsetY = 14
  ctx.fillStyle = 'rgba(255,255,255,0.96)'
  roundRect(ctx, x, y, card.w, card.h, 22)
  ctx.fill()
  ctx.restore()
  const tx = align === 'right' ? x + card.w - card.padC : align === 'center' ? x + card.w / 2 : x + card.padC
  let cursor = y + card.padC
  for (const line of card.lines) {
    if (line.rule) {
      cursor += 22
      ctx.fillStyle = 'rgba(15,23,42,0.14)'
      ctx.fillRect(x + card.padC, cursor, card.w - card.padC * 2, 2)
      cursor += 1 + 18
    } else if (line.kind !== 'amount' && cursor > y + card.padC) cursor += 10
    setFont(ctx, line.weight, line.px, line.tracking)
    ctx.fillStyle = line.color
    const lines = line.lines || [line.text]
    drawLines(ctx, lines, tx, cursor + line.px * 0.82, line.px, line.ratio, align)
    cursor += lines.length * line.px * line.ratio
  }
}

// ---------------------------------------------------------------------------
// stack
// ---------------------------------------------------------------------------

function renderStack(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, contentBottom, maxWidth } = m
  const { badge, hook, offerAmount, offerDetail, subhead, proof, accent, badgeColor, focus, hookPlate, subheadPlate } = content
  const { background, logo } = assets || {}

  // The photo first. The haze comes after the stack is measured, because it
  // has to reach under the last line of the subhead rather than stop at a
  // fixed height: a subhead that landed on the bare photo was the one line
  // on the frame nobody could read.
  ctx.fillStyle = SLATE
  ctx.fillRect(0, 0, w, h)
  if (background) drawCoverIn(ctx, background, { x: 0, y: 0, w, h }, focus)
  const ink = SLATE
  const colW = r(maxWidth * 0.62)
  const colX = w - padX - colW

  // Measure the stack: accent word, the rest of the hook, the subhead.
  const { accent: word, rest } = accentWord(hook)
  let y = contentTop
  const badgeH = badge ? 52 : 0
  if (badgeH) y += badgeH + 28
  const stackTop = y

  const room = contentBottom - y - 40
  let wordFit = null
  if (word) {
    wordFit = fitText(ctx, word.toUpperCase(), colW, 1, 190, 90, '900', -6, { lineRatio: 0.98 })
  }
  const restFit = rest
    ? fitText(ctx, typographic(rest), colW, 3, word ? 74 : 92, 40, '900', -2, {
        maxHeight: Math.max(120, room * 0.42),
        lineRatio: 1.02,
      })
    : null
  const deck = subhead?.trim()
    ? fitText(ctx, typographic(subhead), colW, 2, 30, 22, '600', 0, { lineRatio: 1.3 })
    : null
  const wordH = wordFit ? wordFit.px * 0.98 + 6 : 0
  const restH = restFit ? restFit.lines.length * restFit.px * 1.02 + 8 : 0
  const deckH = deck ? deck.lines.length * deck.px * 1.3 + 10 : 0
  const stackH = wordH + restH + deckH
  const stackBottom = stackTop + stackH

  // The haze: white, strong under every line of the stack, gone a little
  // below it; and a dark lift along the bottom for the logo.
  const hazeTo = Math.min(h, stackBottom + 70)
  scrim(ctx, 0, 0, w, hazeTo, [
    [0, 'rgba(255,255,255,0.86)'],
    [0.72, 'rgba(255,255,255,0.66)'],
    [1, 'rgba(255,255,255,0)'],
  ])
  scrim(ctx, 0, h * 0.7, w, h * 0.3, [
    [0, 'rgba(2,6,23,0)'],
    [1, 'rgba(2,6,23,0.55)'],
  ])
  drawBadge(ctx, badge, padX, contentTop, maxWidth, badgeColor)

  // Draw the stack, right-aligned to the column.
  const right = colX + colW

  // "Panel behind the hook": a white card behind the whole stack, sized to
  // its widest line, for a photo too busy for any haze. Same switch as on
  // the classic look, so it does what it says on this one too.
  if (hookPlate && (wordFit || restFit || deck)) {
    let widest = 0
    const measure = (fit, weight, spacing) => {
      if (!fit) return
      setFont(ctx, weight, fit.px, spacing)
      for (const line of fit.lines) widest = Math.max(widest, ctx.measureText(line).width)
    }
    measure(wordFit, '900', -6)
    measure(restFit, '900', -2)
    measure(deck, '600', 0)
    const pad = 28
    const plateX = Math.max(padX - pad, right - widest - pad)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    roundRect(ctx, plateX, stackTop - 22, right + pad - plateX, stackH + 30, 18)
    ctx.fill()
  }

  // Or just behind the subhead: the giant word and the headline read over
  // the haze, and only the small line needs the help.
  if (subheadPlate && !hookPlate && deck) {
    setFont(ctx, '600', deck.px, 0)
    let widest = 0
    for (const line of deck.lines) widest = Math.max(widest, ctx.measureText(line).width)
    const pad = 18
    const deckTop = stackTop + wordH + restH
    const plateX = Math.max(padX - pad, right - widest - pad)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    roundRect(ctx, plateX, deckTop - 6, right + pad - plateX, (deck.lines.length - 1) * deck.px * 1.3 + deck.px * 1.12 + 16, 12)
    ctx.fill()
  }

  if (wordFit) {
    setFont(ctx, '900', wordFit.px, -6)
    ctx.fillStyle = accent
    drawLines(ctx, wordFit.lines, right, y + wordFit.px * 0.86, wordFit.px, 0.98, 'right')
    y += wordFit.px * 0.98 + 6
  }
  if (restFit) {
    setFont(ctx, '900', restFit.px, -2)
    ctx.fillStyle = ink
    drawLines(ctx, restFit.lines, right, y + restFit.px * 0.86, restFit.px, 1.02, 'right')
    y += restFit.lines.length * restFit.px * 1.02 + 8
  }
  if (deck) {
    setFont(ctx, '600', deck.px, 0)
    ctx.fillStyle = '#1E293B'
    drawLines(ctx, deck.lines, right, y + deck.px * 0.9, deck.px, 1.3, 'right')
    y += deck.lines.length * deck.px * 1.3 + 10
  }

  // The offer card hangs under the stack on the same column, and the logo
  // sits bottom-left on a white pill.
  const card = measureOfferCard(ctx, { offerAmount, offerDetail, proof }, colW, { ink, accent })
  const cardY = Math.min(y + 26, contentBottom - (card?.h || 0))
  if (card) drawOfferCard(ctx, card, right - card.w, Math.max(cardY, y + 10), { align: 'left' })
  drawLogoPill(ctx, logo, padX, contentBottom, 150, { bottom: true })

  const bottomOfText = card ? Math.max(cardY, y + 10) + card.h : y
  return { band: { top: bottomOfText, bottom: contentBottom } }
}

// ---------------------------------------------------------------------------
// plate
// ---------------------------------------------------------------------------

function renderPlate(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, contentBottom, maxWidth, safeTop, safeBottom } = m
  const { badge, hook, offerAmount, offerDetail, subhead, proof, accent, badgeColor, focus } = content
  const { background, logo } = assets || {}
  const plateColor = badgeColor || DEFAULT_BG
  const ink = readableTextOn(plateColor)
  const soft = ink === '#FFFFFF' ? 'rgba(255,255,255,0.78)' : 'rgba(15,23,42,0.7)'

  const { photo, plate } = plateRects(w, h, { safeTop, safeBottom })
  ctx.fillStyle = SLATE
  ctx.fillRect(0, 0, w, h)
  if (background) drawCoverIn(ctx, background, photo, focus)
  else {
    ctx.fillStyle = '#1E293B'
    ctx.fillRect(photo.x, photo.y, photo.w, photo.h)
  }
  scrim(ctx, 0, 0, w, Math.round(photo.h * 0.4), [
    [0, 'rgba(2,6,23,0.45)'],
    [1, 'rgba(2,6,23,0)'],
  ])
  drawBadge(ctx, badge, padX, contentTop, maxWidth, badgeColor === plateColor ? accent : badgeColor)

  // The plate, with rounded top corners laid over the photo.
  ctx.save()
  ctx.shadowColor = 'rgba(2,6,23,0.35)'
  ctx.shadowBlur = 40
  ctx.shadowOffsetY = -8
  ctx.fillStyle = plateColor
  roundRect(ctx, plate.x, plate.y, plate.w, plate.h + 60, 36)
  ctx.fill()
  ctx.restore()
  // A thin accent rule at the seam gives the plate an edge without a border.
  ctx.fillStyle = accent
  ctx.fillRect(padX, plate.y + 34, 110, 8)

  // Words on the plate: hook, subhead, offer pill, proof; logo bottom-right.
  const logoBox = logoFit(logo, 150)
  const textW = maxWidth
  let y = plate.y + 34 + 8 + 30
  const bottom = contentBottom
  const proofFit = proof?.trim() ? fitText(ctx, typographic(proof), textW - (logoBox ? logoBox.w + 30 : 0), 2, 22, 17, '600', 0, { lineRatio: 1.3 }) : null
  const proofH = proofFit ? proofFit.lines.length * proofFit.px * 1.3 : 0
  const amount = offerAmount?.trim() || ''
  const detail = offerDetail?.trim().toUpperCase() || ''
  let pill = null
  if (amount || detail) {
    const padP = 26
    setFont(ctx, '900', 40, -0.5)
    const amountW = amount ? ctx.measureText(amount).width : 0
    const fit = detail ? fitText(ctx, detail, textW - padP * 2 - (amount ? amountW + 18 : 0), 2, 22, 16, '800', 1, { lineRatio: 1.25 }) : null
    const detailW = fit ? widest(ctx, fit.lines) : 0
    const pillH = Math.max(40, fit ? fit.lines.length * fit.px * 1.25 : 0) + padP * 1.2
    pill = { amount, amountW, fit, padP, w: Math.min(textW, amountW + (amount && fit ? 18 : 0) + detailW + padP * 2), h: r(pillH) }
  }
  const stackBottomH = (pill ? pill.h + 22 : 0) + proofH
  const deck = subhead?.trim() ? fitText(ctx, typographic(subhead), textW, 2, 30, 22, '500', 0, { lineRatio: 1.32 }) : null
  const deckH = deck ? deck.lines.length * deck.px * 1.32 + 16 : 0
  const hookRoom = bottom - y - stackBottomH - deckH - 24
  const hookFit = hook?.trim() ? fitText(ctx, typographic(hook), textW, 3, 86, 40, '800', -2, { maxHeight: hookRoom, lineRatio: 1.06 }) : null

  if (hookFit) {
    setFont(ctx, '800', hookFit.px, -2)
    ctx.fillStyle = ink
    drawLines(ctx, hookFit.lines, padX, y + hookFit.px * 0.86, hookFit.px, 1.06, 'left')
    y += hookFit.lines.length * hookFit.px * 1.06 + 18
  }
  if (deck) {
    setFont(ctx, '500', deck.px, 0)
    ctx.fillStyle = soft
    drawLines(ctx, deck.lines, padX, y + deck.px * 0.9, deck.px, 1.32, 'left')
    y += deck.lines.length * deck.px * 1.32 + 16
  }
  // The bottom stack: proof on the last line, the pill above it.
  let cursor = bottom
  if (proofFit) {
    setFont(ctx, '600', proofFit.px, 0)
    ctx.fillStyle = soft
    drawLines(ctx, proofFit.lines, padX, cursor - (proofFit.lines.length - 1) * proofFit.px * 1.3 - proofFit.px * 0.25, proofFit.px, 1.3, 'left')
    cursor -= proofH + 22
  }
  if (pill) {
    const py = cursor - pill.h
    ctx.fillStyle = accent
    roundRect(ctx, padX, py, pill.w, pill.h, 16)
    ctx.fill()
    ctx.fillStyle = readableTextOn(accent)
    let tx = padX + pill.padP
    const mid = py + pill.h / 2
    if (pill.amount) {
      setFont(ctx, '900', 40, -0.5)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(pill.amount, tx, mid + 2)
      tx += pill.amountW + 18
    }
    if (pill.fit) {
      setFont(ctx, '800', pill.fit.px, 1)
      ctx.textBaseline = 'middle'
      const total = pill.fit.lines.length * pill.fit.px * 1.25
      let ly = mid - total / 2 + (pill.fit.px * 1.25) / 2
      for (const line of pill.fit.lines) {
        ctx.fillText(line, tx, ly + 1)
        ly += pill.fit.px * 1.25
      }
    }
    ctx.textBaseline = 'alphabetic'
  }
  if (logoBox) ctx.drawImage(logo, w - padX - logoBox.w, bottom - logoBox.h, logoBox.w, logoBox.h)

  return { band: { top: photo.y, bottom: plate.y } }
}

// ---------------------------------------------------------------------------
// split
// ---------------------------------------------------------------------------

function renderSplit(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, contentBottom, safeTop, safeBottom } = m
  const { badge, hook, offerAmount, offerDetail, subhead, proof, accent, badgeColor, focus } = content
  const { background, logo } = assets || {}
  const panelColor = badgeColor || DEFAULT_BG
  const ink = readableTextOn(panelColor)
  const soft = ink === '#FFFFFF' ? 'rgba(255,255,255,0.78)' : 'rgba(15,23,42,0.7)'
  const { stacked, panel, photo } = splitRects(w, h, { safeTop, safeBottom })

  ctx.fillStyle = panelColor
  ctx.fillRect(0, 0, w, h)
  if (background) drawCoverIn(ctx, background, photo, focus)
  else {
    ctx.fillStyle = '#1E293B'
    ctx.fillRect(photo.x, photo.y, photo.w, photo.h)
  }
  // A soft edge where the panel meets the photo.
  if (stacked) scrim(ctx, 0, photo.y, w, 90, [[0, panelColor], [1, 'rgba(0,0,0,0)']])
  else scrim(ctx, photo.x, 0, 90, h, [[0, panelColor], [1, 'rgba(0,0,0,0)']], false)

  // Words in the panel.
  const px = padX
  const textW = (stacked ? w : panel.w) - px - (stacked ? px : 34)
  let y = contentTop
  const badgeH = drawBadge(ctx, badge, px, y, textW, badgeColor === panelColor ? accent : badgeColor)
  if (badgeH) y += badgeH + 26
  const bottom = stacked ? panel.h - 40 : contentBottom
  const logoBox = stacked ? logoFit(logo, 130) : logoFit(logo, 140)
  const proofFit = proof?.trim() ? fitText(ctx, typographic(proof), textW, 2, 21, 16, '600', 0, { lineRatio: 1.3 }) : null
  const proofH = proofFit ? proofFit.lines.length * proofFit.px * 1.3 : 0
  const amount = offerAmount?.trim() || ''
  const detail = offerDetail?.trim() || ''
  const amountFit = amount ? fitText(ctx, amount, textW, 1, 76, 40, '900', -2, { lineRatio: 1 }) : null
  const detailFit = detail ? fitText(ctx, typographic(detail).toUpperCase(), textW, 3, 22, 16, '800', 1, { lineRatio: 1.25 }) : null
  const offerH = (amountFit ? amountFit.px * 1 + 8 : 0) + (detailFit ? detailFit.lines.length * detailFit.px * 1.25 : 0)
  const bottomStack = (logoBox && stacked ? 0 : 0) + proofH + (proofFit ? 20 : 0) + offerH + (offerH ? 26 : 0)
  const deck = subhead?.trim() ? fitText(ctx, typographic(subhead), textW, 3, 28, 20, '500', 0, { lineRatio: 1.32 }) : null
  const deckH = deck ? deck.lines.length * deck.px * 1.32 + 18 : 0
  const hookRoom = bottom - y - bottomStack - deckH - 20
  const hookFit = hook?.trim() ? fitText(ctx, typographic(hook), textW, 5, stacked ? 84 : 80, 36, '800', -2, { maxHeight: hookRoom, lineRatio: 1.06 }) : null

  if (hookFit) {
    setFont(ctx, '800', hookFit.px, -2)
    ctx.fillStyle = ink
    drawLines(ctx, hookFit.lines, px, y + hookFit.px * 0.86, hookFit.px, 1.06, 'left')
    y += hookFit.lines.length * hookFit.px * 1.06 + 18
  }
  if (deck) {
    setFont(ctx, '500', deck.px, 0)
    ctx.fillStyle = soft
    drawLines(ctx, deck.lines, px, y + deck.px * 0.9, deck.px, 1.32, 'left')
  }

  // Bottom of the panel: offer, then proof; the logo in the photo's corner.
  let cursor = bottom
  if (proofFit) {
    setFont(ctx, '600', proofFit.px, 0)
    ctx.fillStyle = soft
    drawLines(ctx, proofFit.lines, px, cursor - (proofFit.lines.length - 1) * proofFit.px * 1.3 - proofFit.px * 0.25, proofFit.px, 1.3, 'left')
    cursor -= proofH + 20
  }
  if (detailFit) {
    setFont(ctx, '800', detailFit.px, 1)
    ctx.fillStyle = ink
    const top = cursor - detailFit.lines.length * detailFit.px * 1.25
    drawLines(ctx, detailFit.lines, px, top + detailFit.px * 0.9, detailFit.px, 1.25, 'left')
    cursor = top - 8
  }
  if (amountFit) {
    setFont(ctx, '900', amountFit.px, -2)
    ctx.fillStyle = accent
    drawLines(ctx, amountFit.lines, px, cursor - amountFit.px * 0.14, amountFit.px, 1, 'left')
    // A short accent bar above the amount ties the block together.
    ctx.fillStyle = accent
    ctx.fillRect(px, cursor - amountFit.px - 22, 90, 6)
  }
  // The logo: in the photo's bottom corner side by side; on the stacked
  // frame it joins the badge row inside the panel, so nothing floats over
  // the picture in the middle of a Story.
  if (logoBox) {
    if (stacked) drawLogoPill(ctx, logo, w - padX, contentTop, 120, { align: 'right' })
    else drawLogoPill(ctx, logo, w - padX, contentBottom, 140, { align: 'right', bottom: true })
  }
  return { band: { top: photo.y, bottom: photo.y + photo.h } }
}

// ---------------------------------------------------------------------------
// ai: a finished concept, whole, on a blurred copy of itself
// ---------------------------------------------------------------------------

function renderAiConcept(ctx, size, content, assets) {
  const { w, h } = size
  const { background } = assets || {}
  ctx.fillStyle = SLATE
  ctx.fillRect(0, 0, w, h)
  if (!background) {
    ctx.fillStyle = '#334155'
    setFont(ctx, '700', 34, 0)
    ctx.fillStyle = '#94A3B8'
    ctx.textAlign = 'center'
    ctx.fillText('Pick an AI concept below', w / 2, h / 2)
    ctx.textAlign = 'left'
    return { band: { top: 0, bottom: h } }
  }
  const fit = containRect(w, h, background)
  const whole = fit.w >= w - 2 && fit.h >= h - 2
  if (!whole) {
    // The surround: the same picture blown up to cover, blurred and dimmed,
    // so the frame reads as one image rather than a picture on a slab.
    const c = coverRect(w, h, background, content.focus)
    ctx.save()
    ctx.filter = 'blur(28px)'
    ctx.drawImage(background, c.x - 40, c.y - 40, c.w + 80, c.h + 80)
    ctx.restore()
    ctx.fillStyle = 'rgba(2,6,23,0.35)'
    ctx.fillRect(0, 0, w, h)
    ctx.save()
    ctx.shadowColor = 'rgba(2,6,23,0.5)'
    ctx.shadowBlur = 48
    ctx.shadowOffsetY = 18
    ctx.fillStyle = '#000'
    roundRect(ctx, fit.x, fit.y, fit.w, fit.h, 24)
    ctx.fill()
    ctx.restore()
    ctx.save()
    roundRect(ctx, fit.x, fit.y, fit.w, fit.h, 24)
    ctx.clip()
  }
  ctx.drawImage(background, fit.x, fit.y, fit.w, fit.h)
  if (!whole) ctx.restore()
  return { band: { top: fit.y, bottom: fit.y + fit.h } }
}

export const LOOKS = { stack: renderStack, plate: renderPlate, split: renderSplit, ai: renderAiConcept }

/** True when adCanvas should hand this layout to a look in this file. */
export function hasLook(layout) {
  return Object.prototype.hasOwnProperty.call(LOOKS, layout)
}

/** Paints one look. Same contract as renderAd: returns the free band. */
export function renderLook(ctx, size, content, assets, opts = {}) {
  const paint = LOOKS[content.layout]
  return paint(ctx, size, content, assets, opts)
}
