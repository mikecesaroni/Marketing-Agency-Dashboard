// The looks beyond the classic composition: the same words, painted
// differently, so a client's set of ads reads as a campaign rather than one
// template with the headline swapped.
//
//   stack  one giant accent word over the photo, the rest of the hook under
//          it, and a white offer card: the "FREE second opinion" shape that
//          home-services ads keep landing on
//   plate  the photo on top, the words on a brand-colour plate below
//   wash   the photo whole, its lower part under a wash of the brand colour
//          behind a curved seam in the accent, the logo in a white pill on
//          the seam, the offer huge in the accent with a white outline
//   typed  the photo whole, the headline typed over it the way Instagram
//          types text with a background: a black box per line, white words,
//          the numbers in the brand colour, tipped a touch; the offer typed
//          smaller below, a location sticker and a small logo
//   split  a brand-colour panel beside (or above) the photo
//   ai     a finished AI concept, fitted whole with a blurred surround, no
//          words painted
//
// Every look respects the same safe margins as the classic one, measures
// before it draws, and shrinks type rather than let it run off the frame.
// Nothing here paints a call-to-action button: Meta draws the real one under
// the creative, and a painted one is a decoy (see adCanvas.js).

import { readableTextOn } from './logoColours'
import { logoFor } from './logoCutout'
import { PAD, drawLines, fitText, roundRect, setFont, typographic, widest } from './adText'
import { DEFAULT_BG, accentWord, containRect, coverRect, beforeRects, plateRects, splitRects, typedBoxes, typedColours, typedWords, washColours, washRects } from './adLayout'

export const SLATE = '#0F172A'
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
export function drawCoverIn(ctx, img, rect, focus) {
  const c = coverRect(rect.w, rect.h, img, focus)
  ctx.save()
  ctx.beginPath()
  ctx.rect(rect.x, rect.y, rect.w, rect.h)
  ctx.clip()
  ctx.drawImage(img, rect.x + c.x, rect.y + c.y, c.w, c.h)
  ctx.restore()
}

export function scrim(ctx, x, y, w, h, stops, vertical = true) {
  const g = vertical ? ctx.createLinearGradient(0, y, 0, y + h) : ctx.createLinearGradient(x, 0, x + w, 0)
  for (const [at, color] of stops) g.addColorStop(at, color)
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)
}

/** The location badge pill, top-left of a rectangle. Returns its height. */
/** The badge's size for its words and room, the words shrunk to fit the room (never past the box). */
export function badgeSize(ctx, label, maxW) {
  const text = String(label || '').trim().toUpperCase()
  if (!text) return { w: 0, h: 0, px: 22 }
  let px = 22
  let tracking = 1.4
  setFont(ctx, '800', px, tracking)
  let textW = ctx.measureText(text).width
  while (textW + 38 > maxW && px > 13) {
    px -= 1
    tracking = px >= 18 ? 1.4 : 0.6
    setFont(ctx, '800', px, tracking)
    textW = ctx.measureText(text).width
  }
  return { w: Math.min(textW + 38, maxW), h: 52, px, tracking }
}

export function drawBadge(ctx, label, x, y, maxW, color) {
  if (!label || !String(label).trim()) return 0
  const text = label.trim().toUpperCase()
  const size = badgeSize(ctx, text, maxW)
  setFont(ctx, '800', size.px, size.tracking)
  const boxW = size.w
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
export function logoFit(logo, box) {
  if (!logo) return null
  const scale = Math.min(box / logo.width, box / logo.height)
  return { w: logo.width * scale, h: logo.height * scale }
}

/**
 * The logo on a photo with no box: the mark with its background knocked
 * out (src/lib/logoCutout.js), a dark mark reversed to white the way a
 * reversed logo sits on a van, and a soft shadow so it holds on a busy
 * picture. It used to sit on a white pill, which read as a sticker. Pass
 * the assets (or a bare image, which is drawn as it is).
 */
export function drawLogoPill(ctx, assetsOrLogo, x, y, box, { align = 'left', bottom = false } = {}) {
  const logo = assetsOrLogo && (assetsOrLogo.logoCut || assetsOrLogo.logo !== undefined) ? logoFor(assetsOrLogo, true) : assetsOrLogo
  const fit = logoFit(logo, box)
  if (!fit) return null
  const padP = 6
  const pw = fit.w + padP * 2
  const ph = fit.h + padP * 2
  const px = align === 'right' ? x - pw : x
  const py = bottom ? y - ph : y
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 2
  ctx.drawImage(logo, px + padP, py + padP, fit.w, fit.h)
  ctx.restore()
  return { x: px, y: py, w: pw, h: ph }
}

// ---------------------------------------------------------------------------
// The offer card: white, rounded, the amount in the accent colour, the detail
// under it, a thin rule, then the proof. Measured first so the look can place
// it; drawn where the look says.
// ---------------------------------------------------------------------------

export function measureOfferCard(ctx, { offerAmount, offerDetail, proof }, maxW, { ink = SLATE, accent } = {}) {
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

export function drawOfferCard(ctx, card, x, y, { align = 'left' } = {}) {
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
  const { background } = assets || {}
  // "Typed on Instagram": the giant word, the rest and the subhead each on
  // their own black boxes, no haze, the badge as a location sticker. The
  // offer card and the logo stay: the look keeps its shape, the words get
  // the typed treatment.
  const typed = Boolean(content.typedText)
  const tc = typed ? typedColours(accent, badgeColor) : null
  const tPad = (px) => Math.round(px * 0.18)

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
  const restWords = typed ? typedWords(typographic(rest)) : null
  const restText = typed ? restWords.map((x) => x.word).join(' ') : typographic(rest)
  let y = contentTop
  const badgeH = badge ? (typed ? 56 : 52) : 0
  if (badgeH) y += badgeH + 28
  const stackTop = y

  const room = contentBottom - y - 40
  let wordFit = null
  if (word) {
    wordFit = fitText(ctx, word.toUpperCase(), colW - (typed ? 2 * Math.round(190 * 0.42) : 0), 1, 190, 90, '900', -6, { lineRatio: typed ? 1.0 : 0.98 })
  }
  const restFit = rest
    ? fitText(ctx, restText, colW - (typed ? 56 : 0), 3, word ? 74 : 92, 40, typed ? '800' : '900', typed ? -1 : -2, {
        maxHeight: Math.max(120, room * 0.42),
        lineRatio: typed ? 1.18 : 1.02,
      })
    : null
  const deck = subhead?.trim()
    ? fitText(ctx, typographic(subhead), colW - (typed ? 30 : 0), 2, 30, 22, '600', 0, { lineRatio: typed ? 1.24 : 1.3 })
    : null
  // The giant word's box hugs its capitals (a 190px word with the usual
  // padding sat in a box twice its height).
  const wordH = wordFit ? (typed ? wordFit.px * 0.95 + 2 * Math.round(wordFit.px * 0.06) + 12 : wordFit.px * 0.98 + 6) : 0
  const restH = restFit ? (typed ? restFit.lines.length * restFit.px * 1.18 + 2 * tPad(restFit.px) + 12 : restFit.lines.length * restFit.px * 1.02 + 8) : 0
  const deckH = deck ? (typed ? deck.lines.length * deck.px * 1.24 + 2 * tPad(deck.px) + 10 : deck.lines.length * deck.px * 1.3 + 10) : 0
  const stackH = wordH + restH + deckH
  const stackBottom = stackTop + stackH

  // The haze: white, strong under every line of the stack, gone a little
  // below it; and a dark lift along the bottom for the logo. Typed words
  // carry their own boxes, so no haze.
  const hazeTo = Math.min(h, stackBottom + 70)
  if (!typed) scrim(ctx, 0, 0, w, hazeTo, [
    [0, 'rgba(255,255,255,0.86)'],
    [0.72, 'rgba(255,255,255,0.66)'],
    [1, 'rgba(255,255,255,0)'],
  ])
  scrim(ctx, 0, h * 0.7, w, h * 0.3, [
    [0, 'rgba(2,6,23,0)'],
    [1, 'rgba(2,6,23,0.55)'],
  ])
  if (typed) drawLocationSticker(ctx, badge, padX, contentTop + 56, maxWidth * 0.6)
  else drawBadge(ctx, badge, padX, contentTop, maxWidth, badgeColor)

  // Draw the stack, right-aligned to the column.
  const right = colX + colW

  if (typed) {
    // Each block's box ends at the column's right edge, so the text sits a
    // pad in from it.
    if (wordFit) {
      const o = drawTypedBlock(ctx, { words: wordFit.lines.flatMap((l) => l.split(' ').map((wd) => ({ word: wd, hot: true }))), lines: wordFit.lines, px: wordFit.px, weight: '900', tracking: -6, x: right - Math.round(wordFit.px * 0.42), y, lineRatio: 0.95, padYRatio: 0.06, align: 'right', pill: tc.pill, ink: tc.ink, pop: tc.pop })
      y += (o ? o.h : 0) + 12
    }
    if (restFit) {
      const o = drawTypedBlock(ctx, { words: restWords, lines: restFit.lines, px: restFit.px, weight: '800', tracking: -1, x: right - Math.round(restFit.px * 0.42), y, lineRatio: 1.18, align: 'right', tilt: (-1.6 * Math.PI) / 180, pill: tc.pill, ink: tc.ink, pop: tc.pop })
      y += (o ? o.h : 0) + 12
    }
    if (deck) {
      const o = drawTypedBlock(ctx, { words: typedWords(typographic(subhead)), lines: deck.lines, px: deck.px, weight: '600', tracking: 0, x: right - Math.round(deck.px * 0.42), y, lineRatio: 1.24, align: 'right', pill: tc.pill, ink: tc.ink, pop: tc.pop })
      y += (o ? o.h : 0) + 10
    }
  }

  // "Panel behind the hook": a white card behind the whole stack, sized to
  // its widest line, for a photo too busy for any haze. Same switch as on
  // the classic look, so it does what it says on this one too.
  if (!typed && hookPlate && (wordFit || restFit || deck)) {
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
  if (!typed && subheadPlate && !hookPlate && deck) {
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

  if (!typed && wordFit) {
    setFont(ctx, '900', wordFit.px, -6)
    ctx.fillStyle = accent
    drawLines(ctx, wordFit.lines, right, y + wordFit.px * 0.86, wordFit.px, 0.98, 'right')
    y += wordFit.px * 0.98 + 6
  }
  if (!typed && restFit) {
    setFont(ctx, '900', restFit.px, -2)
    ctx.fillStyle = ink
    drawLines(ctx, restFit.lines, right, y + restFit.px * 0.86, restFit.px, 1.02, 'right')
    y += restFit.lines.length * restFit.px * 1.02 + 8
  }
  if (!typed && deck) {
    setFont(ctx, '600', deck.px, 0)
    ctx.fillStyle = '#1E293B'
    drawLines(ctx, deck.lines, right, y + deck.px * 0.9, deck.px, 1.3, 'right')
    y += deck.lines.length * deck.px * 1.3 + 10
  }

  // The offer card hangs under the stack on the same column, and the logo
  // sits bottom-left on the photo with no box.
  const card = measureOfferCard(ctx, { offerAmount, offerDetail, proof }, colW, { ink, accent })
  const cardY = Math.min(y + 26, contentBottom - (card?.h || 0))
  if (card) drawOfferCard(ctx, card, right - card.w, Math.max(cardY, y + 10), { align: 'left' })
  drawLogoPill(ctx, assets, padX, contentBottom, 150, { bottom: true })

  const bottomOfText = card ? Math.max(cardY, y + 10) + card.h : y
  return { band: { top: bottomOfText, bottom: contentBottom } }
}

// ---------------------------------------------------------------------------
// plate
// ---------------------------------------------------------------------------

function renderPlate(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, maxWidth, safeTop, safeBottom } = m
  const { badge, accent, badgeColor, focus } = content
  const { background } = assets || {}
  const plateColor = badgeColor || DEFAULT_BG

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
  drawPlateBody(ctx, m, content, assets, plate)
  return { band: { top: photo.y, bottom: plate.y } }
}

/**
 * The plate and the words on it: hook, subhead, offer pill, proof, and the
 * logo beside the bottom stack. Shared by the plate look and the before and
 * after look, which differ only in what sits above the plate.
 */
function drawPlateBody(ctx, m, content, assets, plate) {
  const { w, padX, contentBottom, maxWidth } = m
  const { hook, offerAmount, offerDetail, subhead, proof, accent, badgeColor } = content
  const plateColor = badgeColor || DEFAULT_BG
  const ink = readableTextOn(plateColor)
  // The logo sits on the solid plate with no box: the mark with its white
  // knocked out, reversed to white on a dark plate (src/lib/logoCutout.js).
  const logo = logoFor(assets, ink === '#FFFFFF')
  const soft = ink === '#FFFFFF' ? 'rgba(255,255,255,0.78)' : 'rgba(15,23,42,0.7)'

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
  // The logo lives beside the bottom stack (the pill and the proof) and
  // never rises above it, and the pill and the proof keep clear of its
  // column, so no word on the plate can run under it.
  const logoRoom = logoFit(logo, 150)
  const textW = maxWidth
  const besideLogo = textW - (logoRoom ? logoRoom.w + 30 : 0)
  let y = plate.y + 34 + 8 + 30
  const bottom = contentBottom
  const proofFit = proof?.trim() ? fitText(ctx, typographic(proof), besideLogo, 2, 22, 17, '600', 0, { lineRatio: 1.3 }) : null
  const proofH = proofFit ? proofFit.lines.length * proofFit.px * 1.3 : 0
  const amount = offerAmount?.trim() || ''
  const detail = offerDetail?.trim().toUpperCase() || ''
  let pill = null
  if (amount || detail) {
    const padP = 26
    setFont(ctx, '900', 40, -0.5)
    const amountW = amount ? ctx.measureText(amount).width : 0
    const fit = detail ? fitText(ctx, detail, besideLogo - padP * 2 - (amount ? amountW + 18 : 0), 2, 22, 16, '800', 1, { lineRatio: 1.25 }) : null
    const detailW = fit ? widest(ctx, fit.lines) : 0
    const pillH = Math.max(40, fit ? fit.lines.length * fit.px * 1.25 : 0) + padP * 1.2
    pill = { amount, amountW, fit, padP, w: Math.min(besideLogo, amountW + (amount && fit ? 18 : 0) + detailW + padP * 2), h: r(pillH) }
  }
  const stackBottomH = (pill ? pill.h + 22 : 0) + proofH
  // No taller than the stack it sits beside, so it cannot reach the subhead.
  const logoBox = logoRoom ? logoFit(logo, Math.min(150, Math.max(64, stackBottomH))) : null
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

}

// ---------------------------------------------------------------------------
// brand wash
// ---------------------------------------------------------------------------

/** A hex colour with an alpha, for the wash; anything else falls back to slate. */
function withAlpha(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return `rgba(15,23,42,${alpha})`
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/**
 * The photo whole, its lower part under a wash of the brand colour behind a
 * seam that curves down into the frame, the logo in a white pill on the
 * seam, and the words centred on the wash: the offer huge in the accent
 * with a white outline and a hard shadow, the rest in white. Modelled on
 * the Belknap Heating and Cooling ad (2026-11-05): the technician at the
 * condenser up top, navy over the rest, "5% OFF" in red. Any photo from the
 * client's Drive folder drops in; dragging the artboard moves what the top
 * keeps.
 *
 * The wash is the darker of the brand's two colours, the seam and the big
 * word the other (washColours). A one-colour brand, or two darks, gets the
 * big word in white with a dark outline instead, so it never vanishes into
 * the wash.
 */
function renderWash(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, contentBottom, maxWidth, safeTop, safeBottom } = m
  const { badge, hook, offerAmount, offerDetail, subhead, proof, accent, badgeColor, focus } = content
  const { background, logo } = assets || {}
  const { wash: washColor, pop, popReads } = washColours(accent, badgeColor)
  const ink = readableTextOn(washColor)
  const light = ink === '#FFFFFF'
  const soft = light ? 'rgba(255,255,255,0.9)' : 'rgba(15,23,42,0.74)'
  const bigFill = popReads ? pop : '#FFFFFF'
  const bigStroke = popReads ? '#FFFFFF' : 'rgba(2,6,23,0.85)'
  const seamColor = popReads ? pop : '#FFFFFF'

  const { photo, seam, wash } = washRects(w, h, { safeTop, safeBottom })

  // The photo, whole, with a little lift at the top for the badge.
  ctx.fillStyle = SLATE
  ctx.fillRect(0, 0, w, h)
  if (background) drawCoverIn(ctx, background, photo, focus)
  else {
    ctx.fillStyle = '#1E293B'
    ctx.fillRect(0, 0, w, h)
  }
  scrim(ctx, 0, 0, w, r(seam.edgeY * 0.35), [
    [0, 'rgba(2,6,23,0.42)'],
    [1, 'rgba(2,6,23,0)'],
  ])

  // The seam: the bottom of a circle, lowest in the middle. Everything under
  // it is the wash: the brand colour over the photo, darker towards the
  // bottom so the small words read whatever the picture is.
  const curve = () => {
    ctx.beginPath()
    ctx.moveTo(0, seam.edgeY)
    ctx.quadraticCurveTo(w / 2, seam.y + seam.bulge, w, seam.edgeY)
  }
  ctx.save()
  curve()
  ctx.lineTo(w, h)
  ctx.lineTo(0, h)
  ctx.closePath()
  ctx.clip()
  ctx.fillStyle = withAlpha(washColor, 0.86)
  ctx.fillRect(wash.x, wash.y, wash.w, wash.h)
  scrim(ctx, wash.x, wash.y, wash.w, wash.h, [
    [0, 'rgba(2,6,23,0)'],
    [1, light ? 'rgba(2,6,23,0.38)' : 'rgba(255,255,255,0.22)'],
  ])
  ctx.restore()
  ctx.save()
  curve()
  ctx.lineWidth = 14
  ctx.strokeStyle = seamColor
  ctx.shadowColor = 'rgba(2,6,23,0.4)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 4
  ctx.stroke()
  ctx.restore()

  drawBadge(ctx, badge, padX, contentTop, maxWidth, popReads ? pop : washColor)

  // The logo in a white pill, centred on the seam's lowest point: the one
  // place on this look where the logo keeps its box, because the box IS the
  // look (the white badge over the seam in the reference ad). The original
  // mark, not the knocked-out one: it was drawn to sit on white.
  let wordsTop = seam.y + seam.bulge + 44
  if (logo) {
    const scale = Math.min(Math.min(420, maxWidth * 0.6) / logo.width, 104 / logo.height)
    const lw = logo.width * scale
    const lh = logo.height * scale
    const padW = 26
    const padH = 16
    const pw = lw + padW * 2
    const ph = lh + padH * 2
    const px = r(w / 2 - pw / 2)
    const py = r(seam.y - ph / 2)
    ctx.save()
    ctx.shadowColor = 'rgba(2,6,23,0.4)'
    ctx.shadowBlur = 28
    ctx.shadowOffsetY = 8
    ctx.fillStyle = '#FFFFFF'
    roundRect(ctx, px, py, pw, ph, 22)
    ctx.fill()
    ctx.restore()
    ctx.drawImage(logo, px + padW, py + padH, lw, lh)
    wordsTop = py + ph + 40
  }

  // The words, centred on the wash. The offer amount is the huge word (5%
  // OFF, $89, FREE); with no amount the headline takes its place. Then the
  // offer detail, the headline, the subhead; the proof on the last line.
  const amount = offerAmount?.trim() || ''
  const big = amount ? amount.toUpperCase() : typographic(hook || '')
  const restHook = amount ? typographic(hook || '') : ''
  const bottom = contentBottom
  const proofFit = proof?.trim() ? fitText(ctx, typographic(proof), maxWidth, 2, 22, 17, '600', 0, { lineRatio: 1.3 }) : null
  const proofH = proofFit ? proofFit.lines.length * proofFit.px * 1.3 + 22 : 0
  let room = bottom - proofH - wordsTop
  // Each block takes a share of what is left, the big word first, so the
  // subhead is never the one squeezed to nothing.
  const bigFit = big ? fitText(ctx, big, maxWidth, amount ? 2 : 3, amount ? 170 : 120, amount ? 72 : 48, '900', -3, { maxHeight: Math.max(80, room * (amount ? 0.38 : 0.5)), lineRatio: 1.0 }) : null
  const bigH = bigFit ? bigFit.lines.length * bigFit.px * 1.0 + 18 : 0
  room -= bigH
  const detailFit = offerDetail?.trim() ? fitText(ctx, typographic(offerDetail), maxWidth, 2, 36, 24, '800', 0, { maxHeight: Math.max(40, room * 0.36), lineRatio: 1.2 }) : null
  const detailH = detailFit ? detailFit.lines.length * detailFit.px * 1.2 + 16 : 0
  room -= detailH
  const hookFit = restHook ? fitText(ctx, restHook, maxWidth, 2, 42, 26, '700', -0.5, { maxHeight: Math.max(30, room * 0.5), lineRatio: 1.14 }) : null
  const hookH = hookFit ? hookFit.lines.length * hookFit.px * 1.14 + 14 : 0
  room -= hookH
  const deck = subhead?.trim() ? fitText(ctx, typographic(subhead), maxWidth, 3, 30, 22, '500', 0, { maxHeight: Math.max(28, room), lineRatio: 1.3 }) : null

  let y = wordsTop
  const cx = w / 2
  if (bigFit) {
    setFont(ctx, '900', bigFit.px, -3)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.lineJoin = 'round'
    let by = y + bigFit.px * 0.84
    for (const line of bigFit.lines) {
      // The outline first, carrying a hard shadow, so the whole shape casts
      // it; then the colour on top with no shadow.
      ctx.save()
      ctx.lineWidth = Math.max(6, bigFit.px * 0.08)
      ctx.strokeStyle = bigStroke
      ctx.shadowColor = 'rgba(2,6,23,0.45)'
      ctx.shadowBlur = 0
      ctx.shadowOffsetX = 5
      ctx.shadowOffsetY = 7
      ctx.strokeText(line, cx, by)
      ctx.restore()
      ctx.fillStyle = bigFill
      ctx.fillText(line, cx, by)
      by += bigFit.px * 1.0
    }
    y += bigH
  }
  if (detailFit) {
    setFont(ctx, '800', detailFit.px, 0)
    ctx.fillStyle = ink
    drawLines(ctx, detailFit.lines, cx, y + detailFit.px * 0.86, detailFit.px, 1.2, 'center')
    y += detailH
  }
  if (hookFit) {
    setFont(ctx, '700', hookFit.px, -0.5)
    ctx.fillStyle = ink
    drawLines(ctx, hookFit.lines, cx, y + hookFit.px * 0.86, hookFit.px, 1.14, 'center')
    y += hookH
  }
  if (deck) {
    setFont(ctx, '500', deck.px, 0)
    ctx.fillStyle = soft
    drawLines(ctx, deck.lines, cx, y + deck.px * 0.9, deck.px, 1.3, 'center')
    y += deck.lines.length * deck.px * 1.3
  }
  if (proofFit) {
    setFont(ctx, '600', proofFit.px, 0)
    ctx.fillStyle = soft
    drawLines(ctx, proofFit.lines, cx, bottom - (proofFit.lines.length - 1) * proofFit.px * 1.3 - proofFit.px * 0.25, proofFit.px, 1.3, 'center')
  }
  ctx.textAlign = 'left'
  return { band: { top: wordsTop, bottom: contentBottom } }
}

// ---------------------------------------------------------------------------
// story text: typed on Instagram
// ---------------------------------------------------------------------------

/**
 * A concave quarter-round at the corner where a wider box meets a narrower
 * one: the corner at (x, y), the square it fills reaching `dx` (1 or -1)
 * across and `dy` (1 or -1) down, minus the quarter disc. Instagram rounds
 * the inner corners of stacked text boxes like the outer ones; without this
 * the steps between lines are sharp notches.
 */
function fillet(ctx, x, y, dx, dy, r) {
  const cx = x + dx * r
  const cy = y + dy * r
  const a1 = Math.atan2(y - cy, x + dx * r - cx)
  const a2 = Math.atan2(y + dy * r - cy, x - cx)
  let sweep = a2 - a1
  while (sweep <= -Math.PI) sweep += Math.PI * 2
  while (sweep > Math.PI) sweep -= Math.PI * 2
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + dx * r, y)
  ctx.arc(cx, cy, r, a1, a2, sweep < 0)
  ctx.closePath()
  ctx.fill()
}

/**
 * One typed block: the lines on their boxes (typedBoxes), the joints filled
 * and the inner corners rounded so the boxes read as one shape, then the
 * words painted one at a time so the hot ones take the colour. `x` is the
 * text's left edge, right edge or centre by `align`; `tilt` turns the whole
 * block about its centre. Returns the block's outer box before the tilt.
 * Shared with the classic look, the stack, the before-and-after labels and
 * the Photo sale template, which type their words this way when the ad's
 * "Typed on Instagram" words choice is on.
 */
export function drawTypedBlock(ctx, { words, lines, px, weight, tracking = 0, x, y, lineRatio = 1.24, padYRatio = 0.18, align = 'left', tilt = 0, pill = '#000000', ink = '#FFFFFF', pop = '#FFFFFF' }) {
  if (!lines?.length) return null
  setFont(ctx, weight, px, tracking)
  const lineH = px * lineRatio
  const padX = Math.round(px * 0.42)
  const padY = Math.round(px * padYRatio)
  const radius = Math.round(px * 0.36)
  const widths = lines.map((l) => ctx.measureText(l).width)
  const anchor = align === 'right' ? x + padX : align === 'center' ? x : x - padX
  const lineX = (i) => (align === 'right' ? x - widths[i] : align === 'center' ? x - widths[i] / 2 : x)
  const boxes = typedBoxes(widths, { x: anchor, y: y + padY, lineH, padX, radius, align })
  boxes[0].y -= padY
  boxes[0].h += padY
  boxes[boxes.length - 1].h += padY
  const left = Math.min(...boxes.map((b) => b.x))
  const right = Math.max(...boxes.map((b) => b.x + b.w))
  const last = boxes[boxes.length - 1]
  const outer = { x: left, y: boxes[0].y, w: right - left, h: last.y + last.h - boxes[0].y }

  ctx.save()
  if (tilt) {
    const cx = outer.x + outer.w / 2
    const cy = outer.y + outer.h / 2
    ctx.translate(cx, cy)
    ctx.rotate(tilt)
    ctx.translate(-cx, -cy)
  }
  ctx.fillStyle = pill
  for (const b of boxes) {
    roundRect(ctx, b.x, b.y, b.w, b.h, radius)
    ctx.fill()
  }
  for (let i = 0; i < boxes.length - 1; i++) {
    const a = boxes[i]
    const b = boxes[i + 1]
    const aR = a.x + a.w
    const bR = b.x + b.w
    const seam = b.y
    // The joint across the shared width, so the two boxes' rounded corners
    // leave no notch at the seam; then the inner corners where one box steps
    // in from the other.
    const l = Math.max(a.x, b.x)
    const rr = Math.min(aR, bR)
    if (rr > l) ctx.fillRect(l, seam - radius, rr - l, radius * 2)
    if (b.x > a.x) fillet(ctx, b.x, seam, -1, 1, radius)
    else if (b.x < a.x) fillet(ctx, a.x, seam, -1, -1, radius)
    if (bR < aR) fillet(ctx, bR, seam, 1, 1, radius)
    else if (bR > aR) fillet(ctx, aR, seam, 1, -1, radius)
  }

  // The words, one at a time, each at the x it has in its line so the
  // spacing is the line's own; the hot ones in the colour.
  setFont(ctx, weight, px, tracking)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  let wi = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const base = boxes[i].y + (i === 0 ? padY : 0) + lineH / 2 + px * 0.35
    let from = 0
    const tx = lineX(i)
    for (const word of line.split(' ')) {
      const at = line.indexOf(word, from)
      const dx = ctx.measureText(line.slice(0, at)).width
      ctx.fillStyle = words?.[wi]?.hot ? pop : ink
      ctx.fillText(word, tx + dx, base)
      from = at + word.length
      wi++
    }
  }
  ctx.restore()
  return outer
}

/**
 * Instagram's location sticker: a white pill with a pin and the place in
 * bold, carrying the badge's words. Returns its box; null without a badge.
 */
export function drawLocationSticker(ctx, label, x, bottom, maxW) {
  const text = String(label || '').trim()
  if (!text || maxW < 120) return null
  const pinW = 22
  const padL = 18
  const padR = 22
  const gap = 8
  let px = 26
  setFont(ctx, '700', px, -0.2)
  while (ctx.measureText(text).width + padL + pinW + gap + padR > maxW && px > 16) {
    px -= 1
    setFont(ctx, '700', px, -0.2)
  }
  const tw = Math.min(ctx.measureText(text).width, maxW - padL - pinW - gap - padR)
  const bw = Math.round(tw + padL + pinW + gap + padR)
  const bh = 56
  const y = bottom - bh
  ctx.save()
  ctx.shadowColor = 'rgba(2,6,23,0.25)'
  ctx.shadowBlur = 14
  ctx.shadowOffsetY = 3
  ctx.fillStyle = '#FFFFFF'
  roundRect(ctx, x, y, bw, bh, 16)
  ctx.fill()
  ctx.restore()
  // The pin: a drop with a hole in it.
  const pcx = x + padL + pinW / 2
  const pcy = y + bh / 2 - 1
  ctx.fillStyle = '#111827'
  ctx.beginPath()
  ctx.arc(pcx, pcy - 3, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(pcx - 7.2, pcy + 0.5)
  ctx.lineTo(pcx + 7.2, pcy + 0.5)
  ctx.lineTo(pcx, pcy + 12)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.beginPath()
  ctx.arc(pcx, pcy - 3, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#111827'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, bw - padR + 12, bh)
  ctx.clip()
  ctx.fillText(text, x + padL + pinW + gap, y + bh / 2 + 1)
  ctx.restore()
  ctx.textBaseline = 'alphabetic'
  return { x, y, w: bw, h: bh }
}

/**
 * The words the way Instagram paints typed text with a background: each
 * line on its own black box hugging its width, the boxes stacked into one
 * rounded shape, white words with the numbers, the price or the words
 * marked with asterisks in the brand's bright colour, the block tipped a
 * couple of degrees the way a thumb leaves it. The photo is the whole frame
 * and nothing is drawn on it but the words, a location sticker and a small
 * logo, so the ad reads as a post somebody typed over their own photo and
 * not as a designed ad. Modelled on a State Solar ad (2026-11-08): "A GAF
 * Master Elite Contractor, only about 2-3% of roofers earn this" over a
 * roof being replaced, the 2-3% in the brand's lime.
 *
 * The headline is the block up top; the offer (amount and detail, else the
 * subhead) is typed smaller just above the footer, straight. The proof is
 * left for the caption: nobody types their review count on a photo.
 */
function renderTyped(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, contentBottom, maxWidth } = m
  const { badge, hook, offerAmount, offerDetail, subhead, accent, badgeColor, focus } = content
  const { background } = assets || {}
  const { pill, ink, pop } = typedColours(accent, badgeColor)

  ctx.fillStyle = SLATE
  ctx.fillRect(0, 0, w, h)
  if (background) drawCoverIn(ctx, background, { x: 0, y: 0, w, h }, focus)
  else {
    ctx.fillStyle = '#1E293B'
    ctx.fillRect(0, 0, w, h)
  }

  // The footer: the logo small bottom-right the way a watermark sits, the
  // location sticker bottom-left. No scrim: the photo is the point.
  let footTop = contentBottom
  const logoBox = drawLogoPill(ctx, assets, w - padX, contentBottom, 84, { align: 'right', bottom: true })
  if (logoBox) footTop = Math.min(footTop, logoBox.y)
  const sticker = drawLocationSticker(ctx, badge, padX, contentBottom, Math.min(maxWidth * 0.62, maxWidth - (logoBox ? logoBox.w + 24 : 0)))
  if (sticker) footTop = Math.min(footTop, sticker.y)
  if (footTop < contentBottom) footTop -= 28

  const room = footTop - contentTop
  const blockMax = Math.min(maxWidth - 48, 900)
  const tilt = (-2.2 * Math.PI) / 180

  // The headline, typed up top. fitText wraps the clean words; the flags
  // are read back in the same order while they are painted.
  const hookWords = typedWords(typographic(hook || ''))
  const hookText = hookWords.map((x) => x.word).join(' ')
  let y = contentTop + Math.round(room * 0.06)
  const band = { top: y, bottom: footTop }
  if (hookText) {
    const fit = fitText(ctx, hookText, blockMax - 56, 4, 66, 40, '800', -0.6, { maxHeight: Math.max(120, room * 0.55), lineRatio: 1.24 })
    const padXpx = Math.round(fit.px * 0.42)
    const textW = widest(ctx, fit.lines)
    const left = Math.round((w - (textW + padXpx * 2)) / 2) + padXpx
    const outer = drawTypedBlock(ctx, { words: hookWords, lines: fit.lines, px: fit.px, weight: '800', tracking: -0.6, x: left, y, lineRatio: 1.24, tilt, pill, ink, pop })
    if (outer) {
      y = outer.y + outer.h + Math.round(fit.px * 0.6)
      band.top = y
    }
  }

  // The offer, typed smaller and straight, just above the footer.
  const offerText = [offerAmount, offerDetail].map((s) => String(s || '').trim()).filter(Boolean).join(' ') || String(subhead || '').trim()
  if (offerText && footTop - y > 80) {
    const words = typedWords(typographic(offerText))
    const text = words.map((x) => x.word).join(' ')
    const fit = fitText(ctx, text, Math.min(blockMax, maxWidth * 0.8) - 40, 3, 46, 30, '700', -0.3, { maxHeight: Math.max(60, (footTop - y) * 0.5), lineRatio: 1.24 })
    const padY = Math.round(fit.px * 0.18)
    const blockH = fit.lines.length * fit.px * 1.24 + padY * 2
    const padXpx = Math.round(fit.px * 0.42)
    const textW = widest(ctx, fit.lines)
    const left = Math.round((w - (textW + padXpx * 2)) / 2) + padXpx
    const top = Math.round(footTop - blockH)
    if (top > y) {
      drawTypedBlock(ctx, { words, lines: fit.lines, px: fit.px, weight: '700', tracking: -0.3, x: left, y: top, lineRatio: 1.24, tilt: 0, pill, ink, pop })
      band.bottom = top - 16
    }
  }
  ctx.textAlign = 'left'
  return { band }
}

// ---------------------------------------------------------------------------
// before and after
// ---------------------------------------------------------------------------

/**
 * Two photos, Before and After, side by side on the square and the feed and
 * one above the other on the Story, a seam in the accent colour between
 * them, and the words on a plate below. A half with no photo yet says so,
 * so the second picker is obvious.
 */
function renderBefore(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, maxWidth, safeTop, safeBottom } = m
  const { badge, accent, badgeColor, focus } = content
  const { background, after } = assets || {}
  const plateColor = badgeColor || DEFAULT_BG
  const { stacked, before: beforeRect, after: afterRect, photo, plate } = beforeRects(w, h, { safeTop, safeBottom })

  ctx.fillStyle = SLATE
  ctx.fillRect(0, 0, w, h)
  const half = (img, rect, label) => {
    if (img) drawCoverIn(ctx, img, rect, focus)
    else {
      ctx.fillStyle = '#1E293B'
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
      setFont(ctx, '600', 26, 0)
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`Pick the ${label.toLowerCase()} photo`, rect.x + rect.w / 2, rect.y + rect.h / 2)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    }
    // The label, top-right of its half, clear of the badge top-left and of
    // the Story's own chrome at the top of the frame. With "Typed on
    // Instagram" on it is typed the way people write BEFORE and AFTER on
    // their own photos: a black box, white capitals.
    const text = label.toUpperCase()
    const py = Math.max(rect.y + 20, safeTop + 20)
    if (content.typedText) {
      drawTypedBlock(ctx, { words: [{ word: text, hot: false }], lines: [text], px: 26, weight: '800', tracking: 1, x: rect.x + rect.w - 20 - Math.round(26 * 0.42), y: py, lineRatio: 1.24, align: 'right' })
      return
    }
    setFont(ctx, '800', 22, 1.4)
    const pw = ctx.measureText(text).width + 38
    const px = rect.x + rect.w - 20 - pw
    ctx.fillStyle = 'rgba(2,6,23,0.72)'
    roundRect(ctx, px, py, pw, 44, 8)
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, px + 19, py + 23)
    ctx.textBaseline = 'alphabetic'
  }
  half(background, beforeRect, 'Before')
  half(after, afterRect, 'After')
  // The seam between the two, in the accent colour.
  ctx.fillStyle = accent
  if (stacked) ctx.fillRect(0, beforeRect.h, w, afterRect.y - beforeRect.h)
  else ctx.fillRect(beforeRect.w, 0, afterRect.x - beforeRect.w, photo.h)

  scrim(ctx, 0, 0, w, Math.round(photo.h * 0.25), [
    [0, 'rgba(2,6,23,0.4)'],
    [1, 'rgba(2,6,23,0)'],
  ])
  drawBadge(ctx, badge, padX, contentTop, maxWidth - 220, badgeColor === plateColor ? accent : badgeColor)
  drawPlateBody(ctx, m, content, assets, plate)
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
  // On the stacked frame the logo pill shares the badge row, top-right, so
  // the badge may not run under it and the headline starts below it: a
  // square logo makes a pill taller than the badge, and a hook laid out from
  // the badge's height ran its last word under the pill.
  const pillFit = stacked ? logoFit(logo, 120) : null
  const pillW = pillFit ? pillFit.w + 28 : 0
  const pillH = pillFit ? pillFit.h + 28 : 0
  const badgeH = drawBadge(ctx, badge, px, y, textW - (pillW ? pillW + 16 : 0), badgeColor === panelColor ? accent : badgeColor)
  if (badgeH) y += badgeH + 26
  if (pillH) y = Math.max(y, contentTop + pillH + 22)
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
    if (stacked) {
      // On the panel: the mark with no box, reversed to white on a dark panel.
      const mark = logoFor(assets, ink === '#FFFFFF')
      const fit = logoFit(mark, 120)
      ctx.drawImage(mark, w - padX - fit.w, contentTop + 4, fit.w, fit.h)
    } else drawLogoPill(ctx, assets, w - padX, contentBottom, 140, { align: 'right', bottom: true })
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

export const LOOKS = { stack: renderStack, plate: renderPlate, wash: renderWash, typed: renderTyped, split: renderSplit,
  before: renderBefore, ai: renderAiConcept }

/** True when adCanvas should hand this layout to a look in this file. */
export function hasLook(layout) {
  return Object.prototype.hasOwnProperty.call(LOOKS, layout)
}

/** Paints one look. Same contract as renderAd: returns the free band. */
export function renderLook(ctx, size, content, assets, opts = {}) {
  const paint = LOOKS[content.layout]
  return paint(ctx, size, content, assets, opts)
}
