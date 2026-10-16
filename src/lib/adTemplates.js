/**
 * The templates: the loud, seasonal, direct-mail school of home-services ad.
 *
 * The looks in adLooks.js are compositions of a photo and some words. These
 * are posters: a painted background for the season (snow, leaves, sun, a
 * warm glow), condensed capitals that shout, a price in a starburst, a grid
 * of offers, a furnace or a condenser standing in the corner, Google stars.
 * The kind of ad that gets a thumb to stop because it looks like a deal.
 *
 * Every template draws from the same words the Studio already has (badge,
 * hook, offer, subhead, proof) plus five it adds for this family:
 *   kicker   the season or the shout above the headline ("Fall Special",
 *            "MASSIVE", "CALL NOW FOR"); empty means one for the season
 *   sticker  the words in the starburst or the seal ("EASY FINANCING")
 *   offers   up to four offer tiles [{amount, detail}]; empty means the
 *            main offer alone
 *   cutout   a piece of equipment: a built-in drawing (ac, furnace, boiler,
 *            water_heater, mini_split, thermostat) or stock:<path> to a
 *            photo in the stock library; '' for none
 *   theme    the painted background; '' means the one for the season
 *
 * The logo sits on the theme with no box (logoCutout.js knocks the white out
 * and reverses a dark mark on a dark surface), and the footer that holds it
 * is measured before anything else is drawn, so no words can run into it.
 *
 * No phone numbers and no painted buttons: Meta draws the real button under
 * the creative, and the number belongs on the landing page.
 */

import { readableTextOn } from './logoColours'
import { CONDENSED, SCRIPT, drawLines, fitText, roundRect, setFont, typographic, widest } from './adText'
import { SLATE, badgeSize, drawBadge, drawCoverIn, frameMargins } from './adLooks'
import { logoFor } from './logoCutout'
import { createAudit } from './adAudit'

// THE OVERLAP AUDIT (adAudit.js). renderTemplate() opens one per paint and
// every helper below records the box it painted, so the Studio can say
// "the badge and the kicker overlap on the Story" before the ad is saved,
// and the render tests fail on it.
let audit = null
const note = (kind, box, label) => audit?.add(kind, box, label)

/** The badge, recorded. Returns its height like drawBadge. */
function badge(ctx, label, x, y, maxW, color) {
  if (!label || !String(label).trim()) return 0
  const size = badgeSize(ctx, label, maxW)
  const h = drawBadge(ctx, label, x, y, maxW, color)
  note('badge', { x, y, w: size.w, h }, 'the location badge')
  return h
}
import { CUTOUTS, PHOTO_TEMPLATES, TEMPLATE_KEYS, THEME_KEYS, THEME_LAYOUTS, kickerFor, offersFor, seasonKicker, themeFor } from './adTemplateMeta'

export { CUTOUTS, PHOTO_TEMPLATES, TEMPLATE_KEYS, THEME_KEYS, kickerFor, offersFor, seasonKicker, themeFor }

const WHITE = '#FFFFFF'
const GOLD = '#F5B301'
const r = Math.round

// ---------------------------------------------------------------------------
// seeded scatter: the snow, the leaves, the rays land in the same place on
// every paint, so the three sizes agree and a saved ad re-renders the same.
// ---------------------------------------------------------------------------

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// themes: painted backgrounds
// ---------------------------------------------------------------------------

function vgrad(ctx, w, h, stops) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  for (const [at, c] of stops) g.addColorStop(at, c)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function snowflake(ctx, x, y, s, alpha) {
  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`
  ctx.lineWidth = Math.max(1.5, s / 9)
  ctx.lineCap = 'round'
  for (let i = 0; i < 3; i++) {
    ctx.rotate(Math.PI / 3)
    ctx.beginPath()
    ctx.moveTo(-s, 0)
    ctx.lineTo(s, 0)
    ctx.moveTo(s * 0.55, 0)
    ctx.lineTo(s * 0.75, -s * 0.2)
    ctx.moveTo(s * 0.55, 0)
    ctx.lineTo(s * 0.75, s * 0.2)
    ctx.moveTo(-s * 0.55, 0)
    ctx.lineTo(-s * 0.75, -s * 0.2)
    ctx.moveTo(-s * 0.55, 0)
    ctx.lineTo(-s * 0.75, s * 0.2)
    ctx.stroke()
  }
  ctx.restore()
}

function leaf(ctx, x, y, s, rot, color, alpha) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, -s)
  ctx.bezierCurveTo(s * 0.9, -s * 0.6, s * 0.9, s * 0.5, 0, s)
  ctx.bezierCurveTo(-s * 0.9, s * 0.5, -s * 0.9, -s * 0.6, 0, -s)
  ctx.fill()
  ctx.strokeStyle = 'rgba(80,30,0,0.35)'
  ctx.lineWidth = Math.max(1, s / 14)
  ctx.beginPath()
  ctx.moveTo(0, -s * 0.9)
  ctx.lineTo(0, s * 1.15)
  ctx.stroke()
  ctx.restore()
}

export const THEMES = {
  snow: {
    paint(ctx, w, h) {
      vgrad(ctx, w, h, [[0, '#9CC7E6'], [0.55, '#C9E3F3'], [1, '#EAF4FB']])
      const rand = rng(7)
      for (let i = 0; i < 90; i++) {
        const x = rand() * w
        const y = rand() * h * 0.85
        const s = 2 + rand() * 7
        ctx.fillStyle = `rgba(255,255,255,${0.35 + rand() * 0.5})`
        ctx.beginPath()
        ctx.arc(x, y, s, 0, Math.PI * 2)
        ctx.fill()
      }
      for (let i = 0; i < 9; i++) snowflake(ctx, rand() * w, rand() * h * 0.7, 18 + rand() * 26, 0.5 + rand() * 0.4)
      // The drift along the bottom.
      ctx.fillStyle = WHITE
      ctx.beginPath()
      ctx.moveTo(0, h)
      ctx.lineTo(0, h * 0.86)
      ctx.bezierCurveTo(w * 0.25, h * 0.8, w * 0.4, h * 0.92, w * 0.6, h * 0.88)
      ctx.bezierCurveTo(w * 0.8, h * 0.84, w * 0.9, h * 0.9, w, h * 0.86)
      ctx.lineTo(w, h)
      ctx.closePath()
      ctx.fill()
    },
  },
  leaves: {
    paint(ctx, w, h) {
      vgrad(ctx, w, h, [[0, '#7A1E06'], [0.45, '#C2410C'], [1, '#F59E0B']])
      const rand = rng(11)
      const colors = ['#F97316', '#DC2626', '#FBBF24', '#B45309', '#EA580C']
      for (let i = 0; i < 38; i++) {
        leaf(ctx, rand() * w, rand() * h, 28 + rand() * 46, rand() * Math.PI * 2, colors[i % colors.length], 0.35 + rand() * 0.45)
      }
    },
  },
  sun: {
    paint(ctx, w, h) {
      vgrad(ctx, w, h, [[0, '#FDE68A'], [0.5, '#FBBF24'], [1, '#F97316']])
      // Rays from the top-right corner.
      ctx.save()
      ctx.translate(w * 0.9, -h * 0.05)
      ctx.fillStyle = 'rgba(255,255,255,0.22)'
      for (let i = 0; i < 14; i++) {
        ctx.rotate(Math.PI / 14)
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(w * 2.5, -w * 0.06)
        ctx.lineTo(w * 2.5, w * 0.06)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()
    },
  },
  fresh: {
    paint(ctx, w, h) {
      vgrad(ctx, w, h, [[0, '#0F766E'], [1, '#14B8A6']])
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      ctx.beginPath()
      ctx.moveTo(0, h * 0.55)
      ctx.lineTo(w, h * 0.25)
      ctx.lineTo(w, h * 0.4)
      ctx.lineTo(0, h * 0.7)
      ctx.closePath()
      ctx.fill()
      const rand = rng(5)
      for (let i = 0; i < 22; i++) leaf(ctx, rand() * w, rand() * h, 16 + rand() * 24, rand() * 6.3, '#A7F3D0', 0.18 + rand() * 0.25)
    },
  },
  glow: {
    paint(ctx, w, h) {
      ctx.fillStyle = '#F8FAFC'
      ctx.fillRect(0, 0, w, h)
      const g = ctx.createRadialGradient(w * 0.5, h * 0.7, 10, w * 0.5, h * 0.7, h * 0.75)
      g.addColorStop(0, 'rgba(249,115,22,0.95)')
      g.addColorStop(0.45, 'rgba(251,146,60,0.55)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      // Flames along the base.
      const rand = rng(3)
      for (let i = 0; i < 14; i++) {
        const x = (i + 0.5) * (w / 14)
        const fh = h * (0.12 + rand() * 0.14)
        const fw = w / 14 * (0.9 + rand() * 0.6)
        const fg = ctx.createLinearGradient(0, h - fh, 0, h)
        fg.addColorStop(0, 'rgba(255,255,255,0)')
        fg.addColorStop(0.5, 'rgba(249,115,22,0.75)')
        fg.addColorStop(1, 'rgba(220,38,38,0.9)')
        ctx.fillStyle = fg
        ctx.beginPath()
        ctx.moveTo(x - fw / 2, h)
        ctx.bezierCurveTo(x - fw * 0.5, h - fh * 0.5, x + fw * 0.2, h - fh * 0.7, x, h - fh)
        ctx.bezierCurveTo(x - fw * 0.1, h - fh * 0.6, x + fw * 0.5, h - fh * 0.4, x + fw / 2, h)
        ctx.closePath()
        ctx.fill()
      }
    },
  },
  night: {
    paint(ctx, w, h) {
      vgrad(ctx, w, h, [[0, '#0B1220'], [1, '#1E293B']])
      ctx.fillStyle = 'rgba(255,255,255,0.04)'
      for (let i = -6; i < 14; i++) {
        ctx.beginPath()
        ctx.moveTo(i * 140, 0)
        ctx.lineTo(i * 140 + 70, 0)
        ctx.lineTo(i * 140 + 70 - h * 0.6, h)
        ctx.lineTo(i * 140 - h * 0.6, h)
        ctx.closePath()
        ctx.fill()
      }
      const g = ctx.createRadialGradient(w * 0.85, h * 0.15, 10, w * 0.85, h * 0.15, w * 0.9)
      g.addColorStop(0, 'rgba(220,38,38,0.35)')
      g.addColorStop(1, 'rgba(220,38,38,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    },
  },
  holiday: {
    paint(ctx, w, h) {
      vgrad(ctx, w, h, [[0, '#7F1D1D'], [1, '#B91C1C']])
      const rand = rng(19)
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.25 + rand() * 0.5})`
        ctx.beginPath()
        ctx.arc(rand() * w, rand() * h, 2 + rand() * 6, 0, Math.PI * 2)
        ctx.fill()
      }
      for (let i = 0; i < 6; i++) snowflake(ctx, rand() * w, rand() * h * 0.6, 16 + rand() * 22, 0.6)
      ctx.fillStyle = '#14532D'
      ctx.fillRect(0, h * 0.9, w, h * 0.1)
      ctx.fillStyle = GOLD
      ctx.fillRect(0, h * 0.9 - 8, w, 8)
    },
  },
  paper: {
    paint(ctx, w, h) {
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, w, h)
      const rand = rng(23)
      ctx.fillStyle = 'rgba(15,23,42,0.035)'
      for (let i = 0; i < 400; i++) {
        ctx.beginPath()
        ctx.arc(rand() * w, rand() * h, 1 + rand() * 2, 0, Math.PI * 2)
        ctx.fill()
      }
    },
  },
  brand: {
    paint(ctx, w, h, c) {
      const base = c.badgeColor || '#0F172A'
      ctx.fillStyle = base
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      ctx.beginPath()
      ctx.moveTo(w * 0.55, 0)
      ctx.lineTo(w, 0)
      ctx.lineTo(w, h)
      ctx.lineTo(w * 0.3, h)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = c.accent || '#F97316'
      ctx.fillRect(0, 0, w, 14)
    },
  },
}

/** Dark or light type for a theme (the brand theme reads its colour). */
function inkFor(theme, content) {
  const ink = THEME_LAYOUTS.find((t) => t.key === theme)?.ink || 'auto'
  if (ink === 'auto') return readableTextOn(content.badgeColor || '#0F172A') === WHITE ? 'light' : 'dark'
  return ink
}

function paintTheme(ctx, w, h, content) {
  const key = themeFor(content)
  ;(THEMES[key] || THEMES.brand).paint(ctx, w, h, content)
  return { key, ink: inkFor(key, content) }
}

// ---------------------------------------------------------------------------
// equipment cutouts: flat drawings with a little shading, bottom-aligned in
// their box, or a stock photo fitted into it
// ---------------------------------------------------------------------------

function shadow(ctx, cx, y, rx, ry) {
  const g = ctx.createRadialGradient(cx, y, 2, cx, y, rx)
  g.addColorStop(0, 'rgba(2,6,23,0.35)')
  g.addColorStop(1, 'rgba(2,6,23,0)')
  ctx.save()
  ctx.scale(1, ry / rx)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, (y * rx) / ry, rx, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function metal(ctx, x, y, w, h, light = '#E2E8F0', dark = '#94A3B8') {
  const g = ctx.createLinearGradient(x, 0, x + w, 0)
  g.addColorStop(0, dark)
  g.addColorStop(0.35, light)
  g.addColorStop(0.7, light)
  g.addColorStop(1, dark)
  return g
}

// The drawings share one style: a product shot in a shallow oblique view
// (the front, a sliver of the side, the top) in brand-neutral light grey
// with a dark base, crisp edges, copper and white PVC pipework, and the
// burner glowing behind a sight glass where there is one.
const EDGE = 'rgba(15,23,42,0.45)'
const lwFor = (size) => Math.max(1.2, size * 0.006)
const COPPER = { body: '#D97706', highlight: '#FCD34D' }

/** A round sight glass with the burner glowing behind it, the glow spilling onto the panel around it. */
function sightGlass(ctx, gx, gy, gr, lw) {
  const spill = ctx.createRadialGradient(gx, gy, gr * 0.6, gx, gy, gr * 2.4)
  spill.addColorStop(0, 'rgba(251,146,60,0.35)')
  spill.addColorStop(1, 'rgba(251,146,60,0)')
  ctx.fillStyle = spill
  ctx.beginPath()
  ctx.arc(gx, gy, gr * 2.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#1E293B'
  ctx.beginPath()
  ctx.arc(gx, gy, gr, 0, Math.PI * 2)
  ctx.fill()
  const flame = ctx.createRadialGradient(gx, gy + gr * 0.15, 1, gx, gy, gr * 0.8)
  flame.addColorStop(0, '#FEF3C7')
  flame.addColorStop(0.35, '#FB923C')
  flame.addColorStop(0.8, '#9A3412')
  flame.addColorStop(1, '#1E293B')
  ctx.fillStyle = flame
  ctx.beginPath()
  ctx.arc(gx, gy, gr * 0.8, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = lw
  ctx.beginPath()
  ctx.arc(gx, gy, gr * 0.8, Math.PI * 1.1, Math.PI * 1.6)
  ctx.stroke()
}

/**
 * A round pipe along a run of points with rounded elbows: an outline, the
 * body, and a highlight down the middle when one is given (copper shines,
 * white PVC does not).
 */
function pipe(ctx, pts, d, { body = '#F8FAFC', highlight = '', lw = 1.5, radius } = {}) {
  const r = radius ?? d
  const path = () => {
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length - 1; i++) ctx.arcTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r)
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1])
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = EDGE
  ctx.lineWidth = d + lw * 2
  path()
  ctx.stroke()
  ctx.strokeStyle = body
  ctx.lineWidth = d
  path()
  ctx.stroke()
  if (highlight) {
    ctx.strokeStyle = highlight
    ctx.lineWidth = d * 0.3
    path()
    ctx.stroke()
  }
  ctx.lineCap = 'butt'
}

/** A raised door or panel on a cabinet front: a light line along the top, a shadow along the bottom. */
function raisedPanel(ctx, d, fw, ch, lw) {
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  roundRect(ctx, d.x, d.y, d.w, d.h, fw * 0.02)
  ctx.fill()
  ctx.strokeStyle = 'rgba(15,23,42,0.28)'
  ctx.lineWidth = lw
  roundRect(ctx, d.x, d.y, d.w, d.h, fw * 0.02)
  ctx.stroke()
  ctx.fillStyle = 'rgba(15,23,42,0.16)'
  ctx.fillRect(d.x + fw * 0.02, d.y + d.h, d.w - fw * 0.04, Math.max(2, ch * 0.006))
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.fillRect(d.x + fw * 0.02, d.y + lw, d.w - fw * 0.04, Math.max(1, ch * 0.003))
  return d
}

/** A cabinet in the oblique view: the side, the top, the front with its sheen, outlined. */
function cabinet(ctx, bx, by, fw, ch, sd, sh, lw, { top = '#CBD5E1' } = {}) {
  const side = ctx.createLinearGradient(bx + fw, 0, bx + fw + sd, 0)
  side.addColorStop(0, '#64748B')
  side.addColorStop(1, '#475569')
  quad(ctx, [[bx + fw, by], [bx + fw + sd, by - sh], [bx + fw + sd, by + ch - sh], [bx + fw, by + ch]], side, EDGE, lw)
  quad(ctx, [[bx, by], [bx + sd, by - sh], [bx + fw + sd, by - sh], [bx + fw, by]], top, EDGE, lw)
  const front = ctx.createLinearGradient(bx, 0, bx + fw, 0)
  front.addColorStop(0, '#CBD5E1')
  front.addColorStop(0.3, '#F8FAFC')
  front.addColorStop(0.65, '#EEF2F7')
  front.addColorStop(1, '#B6C2D1')
  ctx.fillStyle = front
  ctx.fillRect(bx, by, fw, ch)
  ctx.strokeStyle = EDGE
  ctx.lineWidth = lw
  ctx.strokeRect(bx, by, fw, ch)
}

/** The dark base of a cabinet, front and side. */
function cabinetBase(ctx, bx, by, fw, ch, sd, sh, from = 0.945) {
  ctx.fillStyle = '#334155'
  ctx.fillRect(bx, by + ch * from, fw, ch * (1 - from))
  quad(ctx, [[bx + fw, by + ch * from], [bx + fw + sd, by + ch * from - sh], [bx + fw + sd, by + ch - sh], [bx + fw, by + ch]], '#1E293B')
}

/**
 * An outdoor condenser as a product shot: a slim cabinet in the oblique
 * view, louvered coil panels on the front and the side, a solid service
 * panel on the corner, the fan grille set into the dark top, a base pan,
 * and the insulated line set running from the service corner to the ground.
 */
function drawAc(ctx, x, y, w, h) {
  const total = Math.min(w, h * 0.72)
  const sd = total * 0.24
  const sh = sd * 0.5
  const fw = total - sd
  const ch = Math.min(h * 0.8 - sh, total * 1.05)
  const bx = x + (w - total) / 2
  const by = y + h - ch
  const lw = lwFor(fw)
  shadow(ctx, bx + total / 2, by + ch - 4, total * 0.72, total * 0.13)
  cabinet(ctx, bx, by, fw, ch, sd, sh, lw)
  // Louvers down the side, following the oblique.
  ctx.strokeStyle = 'rgba(15,23,42,0.4)'
  ctx.lineWidth = lw
  for (let i = 0; i <= 16; i++) {
    const yy = by + ch * 0.1 + (i * ch * 0.8) / 16
    ctx.beginPath()
    ctx.moveTo(bx + fw + sd * 0.08, yy - sh * 0.08)
    ctx.lineTo(bx + fw + sd * 0.92, yy - sh * 0.92)
    ctx.stroke()
  }
  // The fan grille in the top: a dark disc, rings and spokes, the hub.
  const cx = bx + fw / 2 + sd / 2
  const cy = by - sh / 2
  const rx = fw * 0.46
  const ry = sh * 0.44
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(1, ry / rx)
  ctx.fillStyle = '#1E293B'
  ctx.beginPath()
  ctx.arc(0, 0, rx, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(203,213,225,0.7)'
  ctx.lineWidth = lw
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath()
    ctx.arc(0, 0, rx * (i / 4), 0, Math.PI * 2)
    ctx.stroke()
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * rx * 0.2, Math.sin(a) * rx * 0.2)
    ctx.lineTo(Math.cos(a) * rx, Math.sin(a) * rx)
    ctx.stroke()
  }
  ctx.fillStyle = '#475569'
  ctx.beginPath()
  ctx.arc(0, 0, rx * 0.14, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  // The front: a band along the top, the coil louvers, the service panel.
  ctx.fillStyle = 'rgba(15,23,42,0.08)'
  ctx.fillRect(bx, by, fw, ch * 0.08)
  const coil = { x: bx + fw * 0.05, y: by + ch * 0.12, w: fw * 0.66, h: ch * 0.78 }
  ctx.fillStyle = 'rgba(15,23,42,0.06)'
  ctx.fillRect(coil.x, coil.y, coil.w, coil.h)
  const slotH = Math.max(2, ch * 0.012)
  for (let i = 0; i < 16; i++) {
    const sy = coil.y + coil.h * 0.04 + (i * coil.h * 0.92) / 16
    ctx.fillStyle = '#334155'
    roundRect(ctx, coil.x + coil.w * 0.04, sy, coil.w * 0.92, slotH, slotH / 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillRect(coil.x + coil.w * 0.04, sy + slotH, coil.w * 0.92, Math.max(1, slotH * 0.4))
  }
  const panel = raisedPanel(ctx, { x: bx + fw * 0.75, y: by + ch * 0.12, w: fw * 0.2, h: ch * 0.78 }, fw, ch, lw)
  ctx.fillStyle = '#0F172A'
  roundRect(ctx, panel.x + panel.w * 0.15, panel.y + panel.h * 0.06, panel.w * 0.7, ch * 0.05, 3)
  ctx.fill()
  ctx.fillStyle = 'rgba(15,23,42,0.35)'
  for (const fy of [0.3, 0.9]) {
    ctx.beginPath()
    ctx.arc(panel.x + panel.w / 2, panel.y + panel.h * fy, Math.max(1.5, fw * 0.012), 0, Math.PI * 2)
    ctx.fill()
  }
  cabinetBase(ctx, bx, by, fw, ch, sd, sh, 0.93)
  // The line set: the insulated suction line and the copper liquid line,
  // from the service corner down to the ground and away.
  const d = fw * 0.06
  const sx = panel.x + panel.w * 0.5
  const sy = by + ch * 0.76
  const gy = by + ch - d * 0.7
  const ex = x + w - d
  pipe(ctx, [[sx, sy], [sx, gy], [ex, gy]], d, { body: '#1F2937', lw, radius: d * 1.2 })
  pipe(ctx, [[sx + d * 0.9, sy], [sx + d * 0.9, gy - d * 0.9], [ex, gy - d * 0.9]], d * 0.45, { ...COPPER, lw, radius: d * 0.8 })
}

/** A parallelogram from four points, filled and optionally outlined. */
function quad(ctx, pts, fill, stroke, lineWidth) {
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.closePath()
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = lineWidth || 1.5
    ctx.stroke()
  }
}

/**
 * A high-efficiency gas furnace as a product shot: a two-door cabinet in a
 * shallow oblique view (the front, a sliver of the side, the top), a louvered
 * vent and a sight glass with the burner glowing behind it on the upper
 * door, a recessed pull on the blower door, a dark base, a galvanized supply
 * plenum stub on top and two white PVC vent pipes bending away. Everything
 * is clipped to the box. (The old drawing was a plain grey slab with two
 * faint rectangles; it read as a refrigerator.)
 */
function drawFurnace(ctx, x, y, w, h) {
  const ch = h * 0.84 // the cabinet; the plenum and the pipes take the rest
  const total = Math.min(w, ch * 0.66) // the front and the side together
  const sd = total * 0.16 // the side's depth on the page
  const sh = sd * 0.5 // how far the back edge rises
  const fw = total - sd
  const bx = x + (w - total) / 2
  const by = y + h - ch
  const edge = EDGE
  const lw = lwFor(fw)
  shadow(ctx, bx + total / 2, by + ch - 4, total * 0.72, total * 0.13)
  cabinet(ctx, bx, by, fw, ch, sd, sh, lw)
  // The two doors.
  const upper = raisedPanel(ctx, { x: bx + fw * 0.06, y: by + ch * 0.05, w: fw * 0.88, h: ch * 0.4 }, fw, ch, lw)
  const lower = raisedPanel(ctx, { x: bx + fw * 0.06, y: by + ch * 0.49, w: fw * 0.88, h: ch * 0.43 }, fw, ch, lw)

  // The upper door: a louvered vent, the sight glass with the flame behind
  // it, and a small rating plate.
  const slotH = Math.max(2, ch * 0.012)
  for (let i = 0; i < 7; i++) {
    const sy = upper.y + upper.h * 0.1 + i * ch * 0.03
    ctx.fillStyle = '#334155'
    roundRect(ctx, upper.x + upper.w * 0.2, sy, upper.w * 0.6, slotH, slotH / 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillRect(upper.x + upper.w * 0.2, sy + slotH, upper.w * 0.6, Math.max(1, slotH * 0.4))
  }
  sightGlass(ctx, upper.x + upper.w * 0.5, upper.y + upper.h * 0.7, fw * 0.085, lw)
  ctx.fillStyle = '#0F172A'
  roundRect(ctx, upper.x + upper.w * 0.08, upper.y + upper.h * 0.86, upper.w * 0.3, ch * 0.03, 3)
  ctx.fill()
  ctx.fillStyle = '#F97316'
  ctx.fillRect(upper.x + upper.w * 0.1, upper.y + upper.h * 0.86 + ch * 0.008, upper.w * 0.05, ch * 0.014)

  // The blower door: a recessed pull and an embossed line.
  ctx.fillStyle = 'rgba(15,23,42,0.55)'
  roundRect(ctx, lower.x + lower.w * 0.33, lower.y + lower.h * 0.1, lower.w * 0.34, ch * 0.028, ch * 0.014)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.fillRect(lower.x + lower.w * 0.33, lower.y + lower.h * 0.1 + ch * 0.028, lower.w * 0.34, Math.max(1, ch * 0.004))
  ctx.fillStyle = 'rgba(15,23,42,0.14)'
  ctx.fillRect(lower.x + lower.w * 0.08, lower.y + lower.h * 0.58, lower.w * 0.84, Math.max(1, ch * 0.004))
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.fillRect(lower.x + lower.w * 0.08, lower.y + lower.h * 0.58 + Math.max(1, ch * 0.004), lower.w * 0.84, Math.max(1, ch * 0.003))

  cabinetBase(ctx, bx, by, fw, ch, sd, sh)

  // The supply plenum stub on top: a galvanized duct with its open end.
  const st = h * 0.09
  const pd = sd * 0.6
  const ph = sh * 0.6
  const px = bx + fw * 0.19
  const pw = fw * 0.6
  const pBottom = by - sh * 0.35
  const pTop = pBottom - st
  quad(ctx, [[px + pw, pTop], [px + pw + pd, pTop - ph], [px + pw + pd, pBottom - ph], [px + pw, pBottom]], '#64748B', edge, lw)
  ctx.fillStyle = metal(ctx, px, 0, pw, 0, '#E2E8F0', '#94A3B8')
  ctx.fillRect(px, pTop, pw, st)
  ctx.strokeStyle = edge
  ctx.lineWidth = lw
  ctx.strokeRect(px, pTop, pw, st)
  ctx.fillStyle = 'rgba(15,23,42,0.3)'
  ctx.fillRect(px, pTop + st * 0.45, pw, Math.max(1.5, st * 0.03))
  quad(ctx, [[px, pTop], [px + pd, pTop - ph], [px + pw + pd, pTop - ph], [px + pw, pTop]], '#1E293B', edge, lw)
  quad(ctx, [[px + lw * 2, pTop - lw], [px + pd, pTop - ph + lw * 2], [px + pw + pd - lw * 2, pTop - ph + lw * 2], [px + pw - lw, pTop - lw]], 'rgba(203,213,225,0.35)')

  // Two white PVC vent pipes off the top, nested elbows bending away.
  const d = fw * 0.075
  const sx = bx + fw * 0.93
  const sy = by - sh * 0.5
  const ex = bx + fw + sd - d * 0.4
  const bend1 = pTop - ph * 0.2
  pipe(ctx, [[sx, sy], [sx, bend1], [ex, bend1]], d, { lw })
  pipe(ctx, [[sx - d * 1.5, sy], [sx - d * 1.5, bend1 - d * 1.5], [ex, bend1 - d * 1.5]], d, { lw })
}

/**
 * A floor-standing gas boiler as a product shot: a squat cabinet in the
 * oblique view with a dark control strip (a display, two knobs, a round
 * gauge), the burner door with its sight glass and a louver band, a dark
 * base; on top the flue and the copper supply and return, a circulator
 * pump on the supply and a ball valve on the return.
 */
function drawBoiler(ctx, x, y, w, h) {
  const ch = h * 0.6
  const total = Math.min(w, ch)
  const sd = total * 0.18
  const sh = sd * 0.5
  const fw = total - sd
  const bx = x + (w - total) / 2
  const by = y + h - ch
  const lw = lwFor(fw)
  shadow(ctx, bx + total / 2, by + ch - 4, total * 0.72, total * 0.13)
  // The pipework first, so the cabinet top sits over its feet.
  const topY = by - sh * 0.5
  const flueD = fw * 0.15
  const flueX = bx + fw * 0.74
  const flueTop = y + h * 0.03 + flueD * 0.2
  pipe(ctx, [[flueX, topY], [flueX, flueTop]], flueD, { body: '#94A3B8', highlight: 'rgba(255,255,255,0.35)', lw })
  ctx.fillStyle = '#475569'
  ctx.beginPath()
  ctx.ellipse(flueX, flueTop, flueD / 2, flueD * 0.18, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = EDGE
  ctx.lineWidth = lw
  ctx.stroke()
  const cd = fw * 0.07
  const supX = bx + fw * 0.2
  const supY = y + h * 0.1
  const retX = bx + fw * 0.42
  const retY = y + h * 0.25
  pipe(ctx, [[supX, topY], [supX, supY], [bx + fw * 0.58, supY]], cd, { ...COPPER, lw })
  pipe(ctx, [[retX, topY], [retX, retY], [bx + fw * 0.6, retY]], cd, { ...COPPER, lw })
  // Unions at the open ends, the valve handle on the return, the circulator.
  ctx.fillStyle = '#A16207'
  roundRect(ctx, bx + fw * 0.56, supY - cd * 0.8, cd * 1.2, cd * 1.6, cd * 0.2)
  ctx.fill()
  roundRect(ctx, bx + fw * 0.58, retY - cd * 0.8, cd * 1.2, cd * 1.6, cd * 0.2)
  ctx.fill()
  ctx.fillStyle = '#DC2626'
  roundRect(ctx, retX + cd * 2.6, retY - cd * 1.8, cd * 0.5, cd * 1.4, cd * 0.2)
  ctx.fill()
  const pumpY = (topY + supY) / 2 + cd
  ctx.fillStyle = '#1E293B'
  roundRect(ctx, supX - cd * 1.3, pumpY - cd * 1.1, cd * 2.6, cd * 2.2, cd * 0.4)
  ctx.fill()
  ctx.strokeStyle = EDGE
  ctx.lineWidth = lw
  ctx.stroke()
  ctx.fillStyle = '#64748B'
  ctx.beginPath()
  ctx.arc(supX + cd * 0.3, pumpY, cd * 0.7, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#0F172A'
  ctx.beginPath()
  ctx.arc(supX + cd * 0.3, pumpY, cd * 0.25, 0, Math.PI * 2)
  ctx.fill()

  cabinet(ctx, bx, by, fw, ch, sd, sh, lw)
  // The control strip: a display, two knobs, the gauge.
  const strip = { x: bx + fw * 0.05, y: by + ch * 0.07, w: fw * 0.9, h: ch * 0.2 }
  ctx.fillStyle = '#1E293B'
  roundRect(ctx, strip.x, strip.y, strip.w, strip.h, fw * 0.02)
  ctx.fill()
  ctx.fillStyle = '#0EA5E9'
  roundRect(ctx, strip.x + strip.w * 0.06, strip.y + strip.h * 0.25, strip.w * 0.3, strip.h * 0.5, 3)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.fillRect(strip.x + strip.w * 0.1, strip.y + strip.h * 0.42, strip.w * 0.18, strip.h * 0.16)
  for (const kx of [0.48, 0.6]) {
    ctx.fillStyle = '#94A3B8'
    ctx.beginPath()
    ctx.arc(strip.x + strip.w * kx, strip.y + strip.h / 2, strip.h * 0.22, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0F172A'
    ctx.fillRect(strip.x + strip.w * kx - lw / 2, strip.y + strip.h * 0.3, lw, strip.h * 0.2)
  }
  const gcx = strip.x + strip.w * 0.84
  const gcy = strip.y + strip.h / 2
  const grad = strip.h * 0.36
  ctx.fillStyle = '#F8FAFC'
  ctx.beginPath()
  ctx.arc(gcx, gcy, grad, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#94A3B8'
  ctx.lineWidth = lw
  ctx.stroke()
  ctx.strokeStyle = '#DC2626'
  ctx.lineWidth = Math.max(1.2, grad * 0.12)
  ctx.beginPath()
  ctx.moveTo(gcx, gcy)
  ctx.lineTo(gcx + grad * 0.55, gcy - grad * 0.5)
  ctx.stroke()
  ctx.fillStyle = '#0F172A'
  ctx.beginPath()
  ctx.arc(gcx, gcy, grad * 0.15, 0, Math.PI * 2)
  ctx.fill()
  // The burner door: the sight glass and a louver band.
  const door = raisedPanel(ctx, { x: bx + fw * 0.06, y: by + ch * 0.33, w: fw * 0.88, h: ch * 0.56 }, fw, ch, lw)
  sightGlass(ctx, door.x + door.w * 0.5, door.y + door.h * 0.42, fw * 0.08, lw)
  const slotH = Math.max(2, ch * 0.014)
  for (let i = 0; i < 4; i++) {
    const sy = door.y + door.h * 0.74 + i * ch * 0.035
    ctx.fillStyle = '#334155'
    roundRect(ctx, door.x + door.w * 0.2, sy, door.w * 0.6, slotH, slotH / 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillRect(door.x + door.w * 0.2, sy + slotH, door.w * 0.6, Math.max(1, slotH * 0.4))
  }
  cabinetBase(ctx, bx, by, fw, ch, sd, sh, 0.93)
}

/**
 * A gas water heater as a product shot: a tall white tank with its dome,
 * the draft hood and flue on top, the hot and cold copper risers with a
 * red and a blue ring, the rating label, the gas control valve with its
 * red dial, the burner access cover and the T&P valve down the side.
 */
function drawWaterHeater(ctx, x, y, w, h) {
  const ch = h * 0.84
  const bw = Math.min(w * 0.62, ch * 0.42)
  const bx = x + (w - bw) / 2
  const by = y + h - ch
  const cx = bx + bw / 2
  const ry = bw * 0.16
  const lw = lwFor(bw)
  shadow(ctx, cx, by + ch - 4, bw * 0.75, bw * 0.16)
  // Behind the tank: the risers, the flue and its hood.
  const pd = bw * 0.08
  const riserTop = y + pd * 1.6
  for (const [rx, ring] of [[cx - bw * 0.26, '#DC2626'], [cx + bw * 0.26, '#2563EB']]) {
    pipe(ctx, [[rx, by + ry], [rx, riserTop]], pd, { ...COPPER, lw })
    ctx.fillStyle = '#A16207'
    roundRect(ctx, rx - pd * 0.85, riserTop - pd * 0.4, pd * 1.7, pd, pd * 0.2)
    ctx.fill()
    ctx.fillStyle = ring
    ctx.fillRect(rx - pd * 0.7, by - ry * 0.7, pd * 1.4, pd * 0.7)
  }
  const flueD = bw * 0.2
  const hoodTop = by - bw * 0.16
  pipe(ctx, [[cx, hoodTop], [cx, y + flueD * 0.6]], flueD, { body: '#94A3B8', highlight: 'rgba(255,255,255,0.35)', lw })
  quad(ctx, [[cx - flueD / 2, hoodTop], [cx + flueD / 2, hoodTop], [cx + bw * 0.2, by + ry * 0.2], [cx - bw * 0.2, by + ry * 0.2]], '#64748B', EDGE, lw)
  // The tank: a cylinder shaded across, the dome lit from the upper left.
  const body = ctx.createLinearGradient(bx, 0, bx + bw, 0)
  body.addColorStop(0, '#64748B')
  body.addColorStop(0.18, '#CBD5E1')
  body.addColorStop(0.38, '#F8FAFC')
  body.addColorStop(0.62, '#E2E8F0')
  body.addColorStop(0.85, '#94A3B8')
  body.addColorStop(1, '#475569')
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.moveTo(bx, by + ry)
  ctx.lineTo(bx, by + ch - ry * 0.5)
  ctx.ellipse(cx, by + ch - ry * 0.5, bw / 2, ry * 0.5, 0, Math.PI, 0, true)
  ctx.lineTo(bx + bw, by + ry)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = EDGE
  ctx.lineWidth = lw
  ctx.stroke()
  const dome = ctx.createRadialGradient(cx - bw * 0.15, by + ry * 0.5, 1, cx, by + ry, bw * 0.6)
  dome.addColorStop(0, '#FFFFFF')
  dome.addColorStop(0.6, '#E2E8F0')
  dome.addColorStop(1, '#94A3B8')
  ctx.fillStyle = dome
  ctx.beginPath()
  ctx.ellipse(cx, by + ry, bw / 2, ry, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = 'rgba(15,23,42,0.18)'
  for (const f of [0.28, 0.8]) {
    ctx.beginPath()
    ctx.ellipse(cx, by + ch * f, bw / 2, ry * 0.5, 0, 0, Math.PI)
    ctx.stroke()
  }
  // The rating label.
  const lab = { x: bx + bw * 0.22, y: by + ch * 0.32, w: bw * 0.56, h: ch * 0.13 }
  ctx.fillStyle = '#F1F5F9'
  roundRect(ctx, lab.x, lab.y, lab.w, lab.h, 3)
  ctx.fill()
  ctx.strokeStyle = 'rgba(15,23,42,0.2)'
  ctx.stroke()
  ctx.fillStyle = '#F97316'
  ctx.fillRect(lab.x + lab.w * 0.08, lab.y + lab.h * 0.12, lab.w * 0.22, lab.h * 0.14)
  ctx.fillStyle = 'rgba(15,23,42,0.28)'
  for (let i = 0; i < 4; i++) ctx.fillRect(lab.x + lab.w * 0.08, lab.y + lab.h * (0.38 + i * 0.15), lab.w * (0.84 - (i % 2) * 0.3), Math.max(1, lab.h * 0.06))
  // The gas control valve, its pilot line, the burner access cover.
  const gv = { x: bx + bw * 0.28, y: by + ch * 0.66, w: bw * 0.44, h: ch * 0.085 }
  ctx.fillStyle = '#334155'
  roundRect(ctx, gv.x, gv.y, gv.w, gv.h, gv.h * 0.2)
  ctx.fill()
  ctx.strokeStyle = EDGE
  ctx.stroke()
  ctx.fillStyle = '#DC2626'
  ctx.beginPath()
  ctx.arc(gv.x + gv.w * 0.72, gv.y + gv.h / 2, gv.h * 0.36, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#0F172A'
  ctx.beginPath()
  ctx.arc(gv.x + gv.w * 0.72, gv.y + gv.h / 2, gv.h * 0.14, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#CBD5E1'
  roundRect(ctx, gv.x + gv.w * 0.12, gv.y + gv.h * 0.3, gv.w * 0.3, gv.h * 0.4, 2)
  ctx.fill()
  pipe(ctx, [[gv.x + gv.w * 0.5, gv.y + gv.h], [gv.x + gv.w * 0.5, by + ch * 0.85]], Math.max(1.5, bw * 0.02), { ...COPPER, lw: 0.8 })
  ctx.fillStyle = '#1E293B'
  roundRect(ctx, bx + bw * 0.3, by + ch * 0.85, bw * 0.4, ch * 0.045, 3)
  ctx.fill()
  // The T&P valve on the side with its discharge pipe.
  ctx.fillStyle = '#A16207'
  roundRect(ctx, bx + bw * 0.86, by + ch * 0.2, bw * 0.12, bw * 0.1, 2)
  ctx.fill()
  pipe(ctx, [[bx + bw * 0.94, by + ch * 0.2 + bw * 0.1], [bx + bw * 0.94, by + ch * 0.66]], bw * 0.05, { ...COPPER, lw })
}

/**
 * A ductless mini split head as a product shot: the white body with its
 * intake grille along the top, the seam, the display pod, the vane open on
 * the underside, and the cool air falling from it.
 */
function drawMiniSplit(ctx, x, y, w, h) {
  const bw = Math.min(w, h * 2.4)
  const bh = bw * 0.3
  const bx = x + (w - bw) / 2
  const by = y + Math.max(bh * 0.2, (h - bh) / 2 - bh * 0.4)
  const fh = bh * 0.74
  const lw = lwFor(bw * 0.5)
  shadow(ctx, bx + bw / 2, by + bh + bh * 0.2, bw * 0.5, bh * 0.25)
  // The cool air: three soft blue sweeps falling and drifting left.
  const airLen = Math.min(bh * 2.2, y + h - (by + bh) - bh * 0.1)
  if (airLen > bh * 0.5) {
    const g = ctx.createLinearGradient(0, by + bh, 0, by + bh + airLen)
    g.addColorStop(0, 'rgba(125,211,252,0.5)')
    g.addColorStop(1, 'rgba(125,211,252,0)')
    ctx.strokeStyle = g
    ctx.lineWidth = bh * 0.09
    ctx.lineCap = 'round'
    for (let i = 0; i < 3; i++) {
      const sx = bx + bw * (0.28 + i * 0.2)
      ctx.beginPath()
      ctx.moveTo(sx, by + bh + bh * 0.05)
      ctx.quadraticCurveTo(sx - bw * 0.04, by + bh + airLen * 0.55, sx - bw * 0.14, by + bh + airLen)
      ctx.stroke()
    }
    ctx.lineCap = 'butt'
  }
  // The underside, the dark outlet and the flap hanging open.
  const inset = bh * 0.12
  const uy = by + fh
  const uh = bh - fh
  quad(ctx, [[bx + bh * 0.1, uy], [bx + bw - bh * 0.1, uy], [bx + bw - inset - bh * 0.1, by + bh], [bx + inset + bh * 0.1, by + bh]], '#CBD5E1', EDGE, lw)
  quad(ctx, [[bx + bw * 0.08, uy + uh * 0.2], [bx + bw * 0.74, uy + uh * 0.2], [bx + bw * 0.73, uy + uh * 0.85], [bx + bw * 0.09, uy + uh * 0.85]], '#1E293B')
  quad(ctx, [[bx + bw * 0.08, uy + uh * 0.6], [bx + bw * 0.74, uy + uh * 0.6], [bx + bw * 0.73, by + bh + uh * 0.25], [bx + bw * 0.09, by + bh + uh * 0.25]], '#E2E8F0', EDGE, lw)
  // The body.
  const face = ctx.createLinearGradient(0, by, 0, by + fh)
  face.addColorStop(0, '#FFFFFF')
  face.addColorStop(1, '#E8EEF5')
  ctx.fillStyle = face
  roundRect(ctx, bx, by, bw, fh, fh * 0.3)
  ctx.fill()
  ctx.strokeStyle = EDGE
  ctx.lineWidth = lw
  ctx.stroke()
  // The intake grille along the top, the seam, the display pod.
  ctx.strokeStyle = 'rgba(15,23,42,0.18)'
  for (let i = 1; i <= 4; i++) {
    const yy = by + fh * 0.08 * i
    ctx.beginPath()
    ctx.moveTo(bx + bw * 0.08, yy)
    ctx.lineTo(bx + bw * 0.7, yy)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(15,23,42,0.12)'
  ctx.fillRect(bx + bw * 0.04, by + fh * 0.6, bw * 0.92, Math.max(1, fh * 0.012))
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillRect(bx + bw * 0.04, by + fh * 0.6 + Math.max(1, fh * 0.012), bw * 0.92, Math.max(1, fh * 0.01))
  const pod = { x: bx + bw * 0.8, y: by + fh * 0.3, w: bw * 0.13, h: fh * 0.3 }
  ctx.fillStyle = '#0F172A'
  roundRect(ctx, pod.x, pod.y, pod.w, pod.h, pod.h * 0.3)
  ctx.fill()
  ctx.fillStyle = '#38BDF8'
  roundRect(ctx, pod.x + pod.w * 0.12, pod.y + pod.h * 0.3, pod.w * 0.5, pod.h * 0.4, 2)
  ctx.fill()
  ctx.fillStyle = '#22C55E'
  ctx.beginPath()
  ctx.arc(pod.x + pod.w * 0.82, pod.y + pod.h / 2, pod.h * 0.12, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * A round smart thermostat: a brushed metal ring lit from the upper left,
 * black glass with a soft reflection, tick marks round the dial with the
 * heating range in orange, the set temperature large and HEATING under it.
 */
function drawThermostat(ctx, x, y, w, h) {
  const d = Math.min(w, h) * 0.85
  const cx = x + w / 2
  const cy = y + h / 2
  const lw = lwFor(d)
  shadow(ctx, cx, cy + d * 0.55, d * 0.5, d * 0.12)
  const ring = ctx.createLinearGradient(cx - d / 2, cy - d / 2, cx + d / 2, cy + d / 2)
  ring.addColorStop(0, '#F8FAFC')
  ring.addColorStop(0.35, '#94A3B8')
  ring.addColorStop(0.6, '#E2E8F0')
  ring.addColorStop(1, '#475569')
  ctx.fillStyle = ring
  ctx.beginPath()
  ctx.arc(cx, cy, d / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = EDGE
  ctx.lineWidth = lw
  ctx.stroke()
  const face = ctx.createRadialGradient(cx - d * 0.1, cy - d * 0.1, d * 0.05, cx, cy, d * 0.42)
  face.addColorStop(0, '#1E293B')
  face.addColorStop(1, '#020617')
  ctx.fillStyle = face
  ctx.beginPath()
  ctx.arc(cx, cy, d * 0.41, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.stroke()
  // Ticks with a gap at the bottom; the heating range in orange; the setpoint a long white tick.
  const start = Math.PI * 0.75
  const span = Math.PI * 1.5
  const set = Math.PI * 1.9
  for (let i = 0; i <= 48; i++) {
    const a = start + (i / 48) * span
    const hot = a >= Math.PI * 1.3 && a <= set
    ctx.strokeStyle = hot ? '#FB923C' : 'rgba(255,255,255,0.3)'
    ctx.lineWidth = Math.max(1, d * 0.008)
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * d * 0.33, cy + Math.sin(a) * d * 0.33)
    ctx.lineTo(cx + Math.cos(a) * d * 0.37, cy + Math.sin(a) * d * 0.37)
    ctx.stroke()
  }
  ctx.strokeStyle = WHITE
  ctx.lineWidth = Math.max(1.5, d * 0.014)
  ctx.beginPath()
  ctx.moveTo(cx + Math.cos(set) * d * 0.31, cy + Math.sin(set) * d * 0.31)
  ctx.lineTo(cx + Math.cos(set) * d * 0.38, cy + Math.sin(set) * d * 0.38)
  ctx.stroke()
  // The reflection on the glass.
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, d * 0.41, 0, Math.PI * 2)
  ctx.clip()
  const gloss = ctx.createLinearGradient(cx - d * 0.3, cy - d * 0.45, cx + d * 0.05, cy)
  gloss.addColorStop(0, 'rgba(255,255,255,0.16)')
  gloss.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gloss
  ctx.fillRect(cx - d / 2, cy - d / 2, d, d)
  ctx.restore()
  setFont(ctx, '800', d * 0.27, -1)
  ctx.fillStyle = WHITE
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('72°', cx, cy - d * 0.02)
  setFont(ctx, '800', d * 0.065, 2)
  ctx.fillStyle = '#FB923C'
  ctx.fillText('HEATING', cx, cy + d * 0.17)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

const CUTOUT_DRAW = { ac: drawAc, furnace: drawFurnace, boiler: drawBoiler, water_heater: drawWaterHeater, mini_split: drawMiniSplit, thermostat: drawThermostat }

/** True when the content names a cutout that can be drawn (a built-in, or a stock photo that loaded). */
function hasCutout(content, assets) {
  const key = String(content?.cutout || '')
  if (!key) return false
  if (key.startsWith('stock:')) return Boolean(assets?.cutoutImage)
  return Boolean(CUTOUT_DRAW[key])
}

/** Draws the cutout bottom-aligned inside the box. Returns true when something was drawn. */
export function drawCutout(ctx, content, assets, box) {
  const key = String(content?.cutout || '')
  if (!key) return false
  // No room (a short Story band, a frame full of words): no unit, and no
  // negative-radius gradient throwing from the shadow.
  if (!box || box.w < 60 || box.h < 60) return false
  if (key.startsWith('stock:')) {
    const img = assets?.cutoutImage
    if (!img) return false
    const scale = Math.min(box.w / img.width, box.h / img.height)
    const dw = img.width * scale
    const dh = img.height * scale
    const dx = box.x + (box.w - dw) / 2
    const dy = box.y + box.h - dh
    shadow(ctx, dx + dw / 2, dy + dh - 4, dw * 0.55, dw * 0.12)
    ctx.drawImage(img, dx, dy, dw, dh)
    note('cutout', { x: dx, y: dy, w: dw, h: dh }, 'the equipment photo')
    return true
  }
  const fn = CUTOUT_DRAW[key]
  if (!fn) return false
  // The drawings set line widths, caps and text alignment of their own;
  // none of it may leak into whatever paints next.
  ctx.save()
  fn(ctx, box.x, box.y, box.w, box.h)
  ctx.restore()
  // The drawings stand on the box's floor and fill most of it; the box is
  // close enough to what they cover.
  note('cutout', box, 'the equipment')
  return true
}

// ---------------------------------------------------------------------------
// shared elements
// ---------------------------------------------------------------------------

/** Condensed capitals, optionally outlined, one or more lines. Returns the height used. */
function shout(ctx, text, x, y, maxW, { px = 120, minPx = 48, lines = 2, fill = SLATE, stroke = '', strokeW = 0, align = 'left', ratio = 0.98, maxHeight, face = CONDENSED, tracking = 1, label = 'the words' } = {}) {
  const t = String(text || '').trim()
  if (!t) return 0
  const fit = fitText(ctx, t.toUpperCase(), maxW, lines, px, minPx, '400', tracking, { lineRatio: ratio, maxHeight, face })
  setFont(ctx, '400', fit.px, tracking, face)
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  const wide = widest(ctx, fit.lines) + strokeW
  const tall = fit.lines.length * fit.px * ratio + fit.px * 0.1
  note('text', { x: align === 'right' ? x - wide : align === 'center' ? x - wide / 2 : x, y, w: wide, h: tall }, label)
  let by = y + fit.px * 0.92
  for (const line of fit.lines) {
    if (stroke && strokeW) {
      ctx.lineJoin = 'round'
      ctx.strokeStyle = stroke
      ctx.lineWidth = strokeW
      ctx.strokeText(line, x, by)
    }
    ctx.fillStyle = fill
    ctx.fillText(line, x, by)
    by += fit.px * ratio
  }
  ctx.textAlign = 'left'
  return tall
}

/** The script word: "Fall", "summer". Returns the height used. */
function script(ctx, text, x, y, maxW, { px = 110, minPx = 50, fill = WHITE, align = 'left', stroke = '', strokeW = 0, label = 'the season word' } = {}) {
  const t = String(text || '').trim()
  if (!t) return 0
  const fit = fitText(ctx, t, maxW, 1, px, minPx, '400', 0, { lineRatio: 1, face: SCRIPT })
  setFont(ctx, '400', fit.px, 0, SCRIPT)
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  const wide = ctx.measureText(fit.lines[0] || t).width + strokeW
  note('text', { x: align === 'right' ? x - wide : align === 'center' ? x - wide / 2 : x, y: y + fit.px * 0.2, w: wide, h: fit.px * 0.75 }, label)
  const by = y + fit.px * 0.9
  if (stroke && strokeW) {
    ctx.lineJoin = 'round'
    ctx.strokeStyle = stroke
    ctx.lineWidth = strokeW
    ctx.strokeText(fit.lines[0] || t, x, by)
  }
  ctx.fillStyle = fill
  ctx.fillText(fit.lines[0] || t, x, by)
  ctx.textAlign = 'left'
  return fit.px * 1.1
}

/** Inter body copy. Returns the height used. */
function body(ctx, text, x, y, maxW, { px = 30, minPx = 20, lines = 3, weight = '600', fill = SLATE, align = 'left', ratio = 1.3, maxHeight, label = 'the subhead' } = {}) {
  const t = String(text || '').trim()
  if (!t) return 0
  if (maxHeight !== undefined && maxHeight < minPx * ratio) return 0
  const fit = fitText(ctx, typographic(t), maxW, lines, px, minPx, weight, 0, { lineRatio: ratio, maxHeight })
  setFont(ctx, weight, fit.px, 0)
  const wide = widest(ctx, fit.lines)
  note('text', { x: align === 'right' ? x - wide : align === 'center' ? x - wide / 2 : x, y, w: wide, h: fit.lines.length * fit.px * ratio }, label)
  ctx.fillStyle = fill
  drawLines(ctx, fit.lines, x, y + fit.px * 0.9, fit.px, ratio, align)
  ctx.textAlign = 'left'
  return fit.lines.length * fit.px * ratio
}

/** Five gold stars and the proof line beside them. Returns the height. */
function starsLine(ctx, proof, x, y, maxW, { ink = SLATE, align = 'left', px = 24 } = {}) {
  const t = String(proof || '').trim()
  if (!t) return 0
  const starW = px * 1.05
  const starsW = starW * 5
  setFont(ctx, '700', px, 0)
  const textW = t ? Math.min(ctx.measureText(t).width, maxW - starsW - 14) : 0
  const total = starsW + (t ? 14 + textW : 0)
  let sx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x
  note('stars', { x: sx, y, w: total, h: px * 1.2 }, 'the stars')
  ctx.fillStyle = GOLD
  setFont(ctx, '700', px * 1.15, 0)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < 5; i++) ctx.fillText('★', sx + i * starW, y + px * 0.55)
  if (t) {
    setFont(ctx, '700', px, 0)
    ctx.fillStyle = ink
    const fit = fitText(ctx, t, maxW - starsW - 14, 1, px, 16, '700', 0, { lineRatio: 1 })
    setFont(ctx, '700', fit.px, 0)
    ctx.fillText(fit.lines[0] || t, sx + starsW + 14, y + px * 0.55)
  }
  ctx.textBaseline = 'alphabetic'
  return px * 1.2
}

/** A starburst with words in it. */
function starburst(ctx, cx, cy, radius, text, { fill = GOLD, ink = SLATE, points = 14 } = {}) {
  note('sticker', { x: cx - radius, y: cy - radius, w: radius * 2, h: radius * 2 }, 'the sticker')
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(-0.12)
  ctx.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? radius : radius * 0.8
    const a = (i / (points * 2)) * Math.PI * 2
    ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad)
  }
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  const words = String(text || '').trim().toUpperCase()
  const fit = fitText(ctx, words, radius * 1.25, 3, radius * 0.34, radius * 0.16, '900', 0, { lineRatio: 1.05 })
  setFont(ctx, '900', fit.px, 0)
  ctx.fillStyle = ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const total = fit.lines.length * fit.px * 1.05
  let ly = -total / 2 + (fit.px * 1.05) / 2
  for (const line of fit.lines) {
    ctx.fillText(line, 0, ly)
    ly += fit.px * 1.05
  }
  ctx.restore()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

/** A round seal with words in it. */
function seal(ctx, cx, cy, radius, text, { fill = SLATE, ink = WHITE, ring = WHITE } = {}) {
  note('sticker', { x: cx - radius, y: cy - radius, w: radius * 2, h: radius * 2 }, 'the seal')
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = ring
  ctx.lineWidth = Math.max(3, radius * 0.05)
  ctx.beginPath()
  ctx.arc(cx, cy, radius * 0.86, 0, Math.PI * 2)
  ctx.stroke()
  const words = String(text || '').trim().toUpperCase()
  const fit = fitText(ctx, words, radius * 1.4, 3, radius * 0.3, radius * 0.14, '900', 0, { lineRatio: 1.08 })
  setFont(ctx, '900', fit.px, 0)
  ctx.fillStyle = ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const total = fit.lines.length * fit.px * 1.08
  let ly = cy - total / 2 + (fit.px * 1.08) / 2
  for (const line of fit.lines) {
    ctx.fillText(line, cx, ly)
    ly += fit.px * 1.08
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

/** A diagonal ribbon across the top-right corner with a word on it. */
function ribbon(ctx, w, text, { fill = '#DC2626', ink = WHITE, size = 300 } = {}) {
  // The band crosses the corner; its box is the corner it covers.
  note('sticker', { x: w - size * 0.8, y: 0, w: size * 0.8, h: size * 0.8 }, 'the ribbon')
  ctx.save()
  ctx.translate(w - size * 0.5, size * 0.5)
  ctx.rotate(Math.PI / 4)
  ctx.fillStyle = fill
  ctx.fillRect(-size, -size * 0.14, size * 2, size * 0.28)
  const words = String(text || '').trim().toUpperCase()
  let fit = fitText(ctx, words, size * 0.9, 1, size * 0.2, size * 0.09, '900', 2, { lineRatio: 1 })
  // A ribbon is one line: when the whole sticker will not go, the first word does.
  if (fit.lines.length > 1) fit = fitText(ctx, words.split(/\s+/)[0], size * 0.9, 1, size * 0.2, size * 0.09, '900', 2, { lineRatio: 1 })
  setFont(ctx, '900', fit.px, 2)
  ctx.fillStyle = ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(fit.lines[0] || words, 0, 2)
  ctx.restore()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

/**
 * Offer tiles in a grid: a big amount and a small detail each. `columns`
 * decides the grid; a single offer gets the whole width.
 */
function tiles(ctx, offers, rect, { fill = '#DC2626', ink = WHITE, amountInk, columns = 2, gap = 14, radius = 12, border = '' } = {}) {
  const list = offers.slice(0, 4)
  if (list.length === 0) return 0
  const cols = Math.min(columns, list.length)
  const rows = Math.ceil(list.length / cols)
  const tw = (rect.w - gap * (cols - 1)) / cols
  const th = (rect.h - gap * (rows - 1)) / rows
  list.forEach((o, i) => {
    const cx = rect.x + (i % cols) * (tw + gap)
    const cy = rect.y + Math.floor(i / cols) * (th + gap)
    ctx.fillStyle = fill
    roundRect(ctx, cx, cy, tw, th, radius)
    ctx.fill()
    note('tile', { x: cx, y: cy, w: tw, h: th }, `offer tile ${i + 1}`)
    if (border) {
      ctx.strokeStyle = border
      ctx.lineWidth = 4
      roundRect(ctx, cx + 2, cy + 2, tw - 4, th - 4, radius)
      ctx.stroke()
    }
    const pad = Math.min(24, tw * 0.08)
    const innerW = tw - pad * 2
    const amountFit = o.amount ? fitText(ctx, o.amount, innerW, 1, Math.min(th * 0.52, 110), 28, '400', 0, { lineRatio: 1, face: CONDENSED }) : null
    const detailFit = o.detail ? fitText(ctx, o.detail.toUpperCase(), innerW, 2, Math.min(th * 0.2, 30), 14, '800', 0.5, { lineRatio: 1.15 }) : null
    const ah = amountFit ? amountFit.px * 0.95 : 0
    const dh = detailFit ? detailFit.lines.length * detailFit.px * 1.15 : 0
    let ty = cy + (th - (ah + (ah && dh ? 8 : 0) + dh)) / 2
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    if (amountFit) {
      setFont(ctx, '400', amountFit.px, 0, CONDENSED)
      ctx.fillStyle = amountInk || ink
      ctx.fillText(amountFit.lines[0] || o.amount, cx + tw / 2, ty + amountFit.px * 0.82)
      ty += ah + (dh ? 8 : 0)
    }
    if (detailFit) {
      setFont(ctx, '800', detailFit.px, 0.5)
      ctx.fillStyle = ink
      let ly = ty + detailFit.px * 0.9
      for (const line of detailFit.lines) {
        ctx.fillText(line, cx + tw / 2, ly)
        ly += detailFit.px * 1.15
      }
    }
  })
  ctx.textAlign = 'left'
  return rect.h
}

/** The logo fitted inside a width and a height. */
function logoFitBox(logo, maxW, maxH) {
  if (!logo || !logo.width || !logo.height) return null
  const scale = Math.min(maxW / logo.width, maxH / logo.height)
  return { w: logo.width * scale, h: logo.height * scale }
}

/**
 * The logo for the surface (reversed to white on a dark one when its own
 * colours would sink; see logoCutout.js), fitted inside maxW by maxH and
 * drawn at the anchor. Returns the box drawn, or null.
 */
function logoAt(ctx, assets, onDark, x, y, { maxW = 300, maxH = 100, align = 'left', bottom = false } = {}) {
  const logo = logoFor(assets, onDark)
  const fit = logoFitBox(logo, maxW, maxH)
  if (!fit) return null
  const lx = align === 'right' ? x - fit.w : align === 'center' ? x - fit.w / 2 : x
  const ly = bottom ? y - fit.h : y
  ctx.drawImage(logo, lx, ly, fit.w, fit.h)
  note('logo', { x: lx, y: ly, w: fit.w, h: fit.h }, 'the logo')
  return { x: lx, y: ly, w: fit.w, h: fit.h }
}

/**
 * THE FOOTER: the logo in one bottom corner and the stars in the other, or
 * the logo centred over the stars. Measured before anything else is drawn,
 * so every template stops its words, its stickers and its unit at `top`,
 * and nothing can ever run into the logo. Drawn last.
 */
function footer(ctx, m, content, assets, { onDark = false, ink = SLATE, logo = 'right', maxW = 300, maxH = 90, starsPx = 24, bottom, left, right } = {}) {
  const { w, padX, contentBottom } = m
  const floor = bottom ?? contentBottom
  const x0 = left ?? padX
  const x1 = right ?? w - padX
  const width = x1 - x0
  const img = logo === 'none' ? null : logoFor(assets, onDark)
  const fit = logoFitBox(img, maxW, maxH)
  const proof = String(content.proof || '').trim()
  const starsH = proof ? starsPx * 1.2 : 0
  const stacked = logo === 'center'
  const height = stacked ? (fit ? fit.h + (starsH ? 14 : 0) : 0) + starsH : Math.max(fit ? fit.h : 0, starsH)
  const top = floor - height
  const draw = () => {
    if (stacked) {
      if (fit) {
        ctx.drawImage(img, (x0 + x1) / 2 - fit.w / 2, floor - starsH - (starsH ? 14 : 0) - fit.h, fit.w, fit.h)
        note('logo', { x: (x0 + x1) / 2 - fit.w / 2, y: floor - starsH - (starsH ? 14 : 0) - fit.h, w: fit.w, h: fit.h }, 'the logo')
      }
      if (starsH) starsLine(ctx, proof, (x0 + x1) / 2, floor - starsH, width, { ink, align: 'center', px: starsPx })
      return
    }
    if (fit) {
      ctx.drawImage(img, logo === 'right' ? x1 - fit.w : x0, floor - fit.h, fit.w, fit.h)
      note('logo', { x: logo === 'right' ? x1 - fit.w : x0, y: floor - fit.h, w: fit.w, h: fit.h }, 'the logo')
    }
    if (!starsH) return
    const sw = width - (fit ? fit.w + 30 : 0)
    const sy = fit && fit.h > starsH ? floor - fit.h / 2 - starsH / 2 : floor - starsH
    if (logo === 'right') starsLine(ctx, proof, x0, sy, sw, { ink, align: 'left', px: starsPx })
    else starsLine(ctx, proof, x1, sy, sw, { ink, align: 'right', px: starsPx })
  }
  return { top, height, fit, draw }
}

/** A small condensed label pill: BEFORE, AFTER. Returns its size. */
function tag(ctx, text, x, y, { fill = SLATE, ink = WHITE, px = 30, align = 'left' } = {}) {
  setFont(ctx, '400', px, 2, CONDENSED)
  const tw = ctx.measureText(text).width + 28
  const th = px * 1.5
  const tx = align === 'right' ? x - tw : x
  note('badge', { x: tx, y, w: tw, h: th }, `the ${String(text).toLowerCase()} tag`)
  ctx.fillStyle = fill
  roundRect(ctx, tx, y, tw, th, 6)
  ctx.fill()
  ctx.fillStyle = ink
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, tx + 14, y + th / 2 + 1)
  ctx.textBaseline = 'alphabetic'
  return { x: tx, y, w: tw, h: th }
}

const CENTRE = { x: 0.5, y: 0.5 }

/** A photo in a rectangle, or a plain box asking for one. */
function photoIn(ctx, img, rect, label, focus) {
  note('photo', rect, `the ${label.toLowerCase()} photo`)
  if (img) {
    drawCoverIn(ctx, img, rect, focus || CENTRE)
    return
  }
  ctx.fillStyle = 'rgba(15,23,42,0.35)'
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
  setFont(ctx, '600', Math.min(26, rect.w / 12), 0)
  ctx.fillStyle = WHITE
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`Pick the ${label.toLowerCase()} photo`, rect.x + rect.w / 2, rect.y + rect.h / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

/**
 * The Before and After pair in an area: side by side, or one above the
 * other when the area is taller than it is wide (the Story), a seam in the
 * accent colour between, each half tagged. The first picker's photo is the
 * Before, the After picker's the After.
 */
function drawPair(ctx, assets, content, area, accent, gap = 8) {
  const stacked = area.h > area.w * 1.1
  const before = stacked ? { x: area.x, y: area.y, w: area.w, h: (area.h - gap) / 2 } : { x: area.x, y: area.y, w: (area.w - gap) / 2, h: area.h }
  const after = stacked
    ? { x: area.x, y: area.y + before.h + gap, w: area.w, h: area.h - before.h - gap }
    : { x: area.x + before.w + gap, y: area.y, w: area.w - before.w - gap, h: area.h }
  photoIn(ctx, assets?.background, before, 'Before', content.focus)
  photoIn(ctx, assets?.after, after, 'After', CENTRE)
  ctx.fillStyle = accent
  if (stacked) ctx.fillRect(area.x, before.y + before.h, area.w, gap)
  else ctx.fillRect(before.x + before.w, area.y, gap, area.h)
  tag(ctx, 'BEFORE', before.x + 14, before.y + 14, { fill: SLATE })
  tag(ctx, 'AFTER', after.x + 14, after.y + 14, { fill: accent, ink: readableTextOn(accent) })
}

/** A dark band across the bottom of the frame, for proof and the logo. Returns its top. */
function band(ctx, w, h, height, fill) {
  ctx.fillStyle = fill
  ctx.fillRect(0, h - height, w, height)
  return h - height
}

function stickerWords(content) {
  return String(content?.sticker || '').trim()
}

function kickerWords(content) {
  return kickerFor(content)
}

function amountWords(content) {
  return String(content?.offerAmount || '').trim()
}

// ---------------------------------------------------------------------------
// the templates
//
// Every one of them: paint the theme, measure the footer, then flow the
// words down with a height budget to the footer's top (B). The unit stands
// in whatever is left beside the words and stops at B too.
// ---------------------------------------------------------------------------

/** 1. Winter shout: the Horizon winter poster. Logo up top, a giant outlined offer, the unit in the snow. */
function winterShout(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, padX, contentTop, contentBottom, maxWidth } = m
  const { accent, badgeColor } = content
  const theme = paintTheme(ctx, w, m.h, content)
  const onDark = theme.ink === 'light'
  const brand = badgeColor || SLATE
  const navy = onDark ? WHITE : brand
  const outline = onDark ? 'rgba(2,6,23,0.6)' : WHITE
  const cutOn = hasCutout(content, assets)
  const cutW = cutOn ? Math.min(maxWidth * 0.46, 520) : 0
  const textW = maxWidth - (cutW ? cutW + 30 : 0)
  const foot = footer(ctx, m, content, assets, { onDark, ink: navy, logo: 'none', right: padX + textW })
  const B = foot.top - 14
  let y = contentTop
  const lb = logoAt(ctx, assets, onDark, w / 2, y, { maxW: 320, maxH: 110, align: 'center' })
  if (lb) y += lb.h + 18
  const badgeH = badge(ctx, content.badge, padX, y, 400, accent)
  if (badgeH) y += badgeH + 14
  y += shout(ctx, kickerWords(content), w / 2, y, maxWidth, { px: 96, minPx: 48, lines: 1, fill: navy, stroke: outline, strokeW: 10, align: 'center', maxHeight: (B - y) * 0.2, label: 'the kicker' }) + 4
  const amount = amountWords(content)
  if (amount) y += shout(ctx, amount, w / 2, y, maxWidth, { px: 230, minPx: 100, lines: 1, fill: WHITE, stroke: brand, strokeW: 16, align: 'center', tracking: 2, maxHeight: (B - y) * 0.4, label: 'the offer' })
  y += shout(ctx, content.offerDetail, w / 2, y, maxWidth, { px: 84, minPx: 40, lines: 2, fill: WHITE, stroke: brand, strokeW: 10, align: 'center', maxHeight: (B - y) * 0.35, label: 'the offer detail' }) + 10
  // The unit stands beside the headline column, from under the offer down.
  const cutTop = y
  y += shout(ctx, content.hook, padX, y, textW, { px: 70, minPx: 36, lines: 4, fill: WHITE, stroke: brand, strokeW: 8, maxHeight: (B - y) * 0.6, label: 'the headline' }) + 14
  body(ctx, content.subhead, padX, y, textW, { px: 30, minPx: 20, lines: 3, weight: '700', fill: navy, maxHeight: B - y })
  if (cutW) {
    const top = Math.max(cutTop, contentBottom - cutW * 1.2)
    drawCutout(ctx, content, assets, { x: w - padX - cutW, y: top, w: cutW, h: contentBottom - top })
  }
  foot.draw()
  return { band: { top: y, bottom: B } }
}

/** 2. Massive deal: the boiler poster. Two-tone shout, a price that fills the frame, a seal and a star. */
function massiveDeal(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, padX, contentTop, maxWidth } = m
  const { accent, badgeColor } = content
  const theme = paintTheme(ctx, w, m.h, content)
  const onDark = theme.ink === 'light'
  const ink = onDark ? WHITE : SLATE
  const brand = onDark ? WHITE : badgeColor || SLATE
  const foot = footer(ctx, m, content, assets, { onDark, ink, logo: 'center', maxW: 320, maxH: 90 })
  const B = foot.top - 16
  let y = contentTop
  const badgeH = badge(ctx, content.badge, padX, y, 400, accent)
  if (badgeH) y += badgeH + 16
  y += shout(ctx, kickerWords(content), w / 2, y, maxWidth, { px: 150, minPx: 64, lines: 1, fill: brand, align: 'center', tracking: 6, maxHeight: (B - y) * 0.25, label: 'the kicker' })
  y += shout(ctx, content.hook, w / 2, y, maxWidth, { px: 118, minPx: 48, lines: 2, fill: ink, align: 'center', tracking: 2, maxHeight: (B - y) * 0.3, label: 'the headline' }) + 20
  // Left: the unit. Right: the price.
  const cutOn = hasCutout(content, assets)
  const colW = cutOn ? maxWidth * 0.52 : maxWidth
  const align = cutOn ? 'right' : 'center'
  const ax = cutOn ? w - padX : w / 2
  let py = y
  py += body(ctx, content.subhead, ax, py, colW, { px: 40, minPx: 24, lines: 2, weight: '800', fill: ink, align, maxHeight: (B - py) * 0.25 })
  const amount = amountWords(content)
  if (amount) py += shout(ctx, amount, ax, py, colW, { px: 240, minPx: 90, lines: 1, fill: accent, stroke: WHITE, strokeW: 14, align, tracking: 2, maxHeight: (B - py) * 0.5, label: 'the offer' })
  py += shout(ctx, content.offerDetail, ax, py, colW, { px: 70, minPx: 36, lines: 2, fill: brand, align, maxHeight: (B - py) * 0.5, label: 'the offer detail' })
  const st = stickerWords(content)
  const stickerRoom = B - py
  if (st && stickerRoom > 150) {
    const rad = Math.min(130, colW * 0.25, (stickerRoom - 40) / 2)
    // Beside the unit the pair sits at the column's right edge; with the
    // column centred they sit either side of the middle, inside the frame.
    const sealX = cutOn ? ax - rad - 10 : ax + rad * 1.25
    const starX = cutOn ? ax - rad * 3.2 : ax - rad * 1.15
    seal(ctx, sealX, py + rad + 20, rad, st, { fill: brand, ink: onDark ? badgeColor || SLATE : WHITE, ring: WHITE })
    starburst(ctx, starX, py + rad + 40, rad * 0.95, 'SALE', { fill: GOLD, ink: SLATE })
    py += rad * 2 + 40
  }
  if (cutOn) {
    const cw = maxWidth - colW - 30
    const top = Math.max(y, B - cw * 1.35)
    drawCutout(ctx, content, assets, { x: padX, y: top, w: cw, h: B - top })
  }
  foot.draw()
  return { band: { top: py, bottom: B } }
}

/** 4. Price grid: the RCL sale. A script season, a big sale headline, a grid of prices beside the equipment. */
function priceGrid(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, contentBottom, maxWidth } = m
  const { accent, badgeColor } = content
  paintTheme(ctx, w, h, content)
  // The waves top and bottom in the accent colour.
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(w, 0)
  ctx.lineTo(w, 40)
  ctx.bezierCurveTo(w * 0.7, 110, w * 0.3, -10, 0, 70)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(0, h)
  ctx.lineTo(w, h)
  ctx.lineTo(w, h - 60)
  ctx.bezierCurveTo(w * 0.7, h - 120, w * 0.3, h + 10, 0, h - 50)
  ctx.closePath()
  ctx.fill()
  const foot = footer(ctx, m, content, assets, { onDark: false, ink: SLATE, logo: 'left', maxW: 280, maxH: 90, starsPx: 28, bottom: contentBottom - 10 })
  const B = foot.top - 16
  let y = contentTop + 30
  const badgeH = badge(ctx, content.badge, padX, y, 380, badgeColor)
  if (badgeH) y += badgeH + 10
  y += script(ctx, kickerWords(content), w / 2, y, maxWidth, { px: 96, minPx: 48, fill: SLATE, align: 'center', label: 'the season word' }) - 10
  y += shout(ctx, content.hook, w / 2, y, maxWidth, { px: 124, minPx: 52, lines: 2, fill: badgeColor || '#0369A1', align: 'center', tracking: 3, maxHeight: (B - y) * 0.35, label: 'the headline' }) + 20
  const offers = offersFor(content)
  const cutOn = hasCutout(content, assets)
  const gridW = cutOn ? maxWidth * 0.52 : maxWidth
  const gridH = Math.max(140, Math.min(B - y - 120, offers.length > 2 ? 560 : offers.length === 2 ? 400 : 300))
  tiles(ctx, offers, { x: padX, y, w: gridW, h: gridH }, { fill: '#FFFFFF', ink: badgeColor || '#0369A1', amountInk: accent, columns: 2, gap: 16, radius: 6, border: accent })
  if (cutOn) drawCutout(ctx, content, assets, { x: padX + gridW + 24, y: y - 10, w: maxWidth - gridW - 24, h: Math.min(gridH + 40, B - (y - 10)) })
  y += gridH + 26
  y += body(ctx, content.subhead, padX, y, maxWidth, { px: 30, minPx: 18, lines: 2, weight: '600', fill: '#334155', maxHeight: B - y })
  const st = stickerWords(content)
  if (st) {
    const room = B - y
    const rad = Math.min(150, room / 2 - 10)
    if (rad > 70) starburst(ctx, w / 2, y + room / 2, rad, st, { fill: GOLD, ink: SLATE })
  }
  foot.draw()
  return { band: { top: y, bottom: B } }
}

/** 5. Fall special: leaves, a script "Fall", two stacked offers with OR between, a seal, the unit. */
function fallSpecial(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, contentBottom, maxWidth } = m
  const { accent, badgeColor } = content
  const theme = paintTheme(ctx, w, h, content)
  const ink = theme.ink === 'dark' ? SLATE : WHITE
  const bandH = 150
  const bandTop = band(ctx, w, h, bandH + (h - contentBottom), 'rgba(2,6,23,0.82)')
  const B = bandTop - 20
  let y = contentTop
  const badgeH = badge(ctx, content.badge, padX, y, 400, badgeColor)
  if (badgeH) y += badgeH + 10
  const kw = kickerWords(content)
  const words = kw.split(/\s+/)
  const first = words[0]
  const rest = words.slice(1).join(' ')
  y += script(ctx, first, padX, y, maxWidth * 0.5, { px: 150, minPx: 60, fill: ink, label: 'the season word' }) - 14
  if (rest) y += shout(ctx, rest, padX, y, maxWidth * 0.5, { px: 70, minPx: 36, lines: 1, fill: GOLD, tracking: 6, label: 'the kicker' })
  y += shout(ctx, content.hook, padX, y + 14, maxWidth * 0.46, { px: 60, minPx: 30, lines: 4, fill: WHITE, maxHeight: Math.max(120, (B - y) * 0.4), label: 'the headline' }) + 14
  // Offers on the right, stacked, "OR" between.
  const offers = offersFor(content)
  const colW = maxWidth * 0.52
  const colX = w - padX
  let oy = contentTop + (badgeH ? 0 : 0)
  offers.slice(0, 2).forEach((o, i) => {
    if (i > 0) oy += shout(ctx, 'OR', colX, oy, colW, { px: 60, minPx: 30, lines: 1, fill: GOLD, align: 'right', tracking: 8, maxHeight: (B - oy) * 0.3, label: 'the OR' })
    if (o.amount) oy += shout(ctx, o.amount, colX, oy, colW, { px: 150, minPx: 70, lines: 1, fill: WHITE, stroke: 'rgba(2,6,23,0.5)', strokeW: 8, align: 'right', tracking: 2, maxHeight: (B - oy) * 0.5, label: 'an offer' }) - 6
    if (o.detail) oy += shout(ctx, o.detail, colX, oy, colW, { px: 56, minPx: 28, lines: 2, fill: ink, align: 'right', maxHeight: (B - oy) * 0.5, label: 'an offer detail' }) + 10
  })
  oy += body(ctx, content.subhead, colX, oy, colW, { px: 24, minPx: 16, lines: 3, weight: '600', fill: 'rgba(255,255,255,0.9)', align: 'right', maxHeight: (B - oy) * 0.5 })
  // The seal between the offers and the band, when there is room; the unit bottom-left.
  const st = stickerWords(content)
  if (st) {
    const sealR = Math.min(110, (B - oy - 20) / 2)
    if (sealR >= 55) seal(ctx, w - padX - sealR, Math.min(B - sealR, Math.max(oy + sealR + 20, h * 0.6)), sealR, st, { fill: accent, ink: WHITE })
  }
  if (hasCutout(content, assets)) {
    const cw = Math.min(maxWidth * 0.44, 480)
    const top = Math.max(y + 10, B - cw * 1.05)
    drawCutout(ctx, content, assets, { x: padX, y: top, w: cw, h: B + 10 - top })
  }
  // The band: logo left, stars right, centred in its height.
  const foot = footer(ctx, m, content, assets, { onDark: true, ink: WHITE, logo: 'left', maxW: 260, maxH: 80, bottom: bandTop + bandH / 2 + 40 })
  foot.draw()
  return { band: { top: oy, bottom: bandTop } }
}

/** 6. Season sale: sun, snow, leaves or fresh behind a big SALE, the offer, the unit, a starburst. */
function seasonSale(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, maxWidth } = m
  const { accent, badgeColor } = content
  const theme = paintTheme(ctx, w, h, content)
  const dark = theme.ink === 'dark'
  const onDark = !dark
  const ink = dark ? SLATE : WHITE
  const brand = dark ? badgeColor || SLATE : WHITE
  const foot = footer(ctx, m, content, assets, { onDark, ink, logo: 'right', maxW: 260, maxH: 90 })
  const B = foot.top - 16
  const st = stickerWords(content)
  const topW = maxWidth - (st ? 250 : 0)
  let y = contentTop
  const badgeH = badge(ctx, content.badge, padX, y, topW, badgeColor)
  if (badgeH) y += badgeH + 18
  const kw = kickerWords(content)
  const parts = kw.split(/\s+/)
  const last = parts[parts.length - 1]
  const head = parts.slice(0, -1).join(' ')
  if (head) y += script(ctx, head, padX, y, topW, { px: 110, minPx: 50, fill: dark ? accent : GOLD, stroke: dark ? '' : 'rgba(2,6,23,0.35)', strokeW: 6, label: 'the season word' }) - 16
  y += shout(ctx, last, padX, y, topW, { px: 210, minPx: 90, lines: 1, fill: brand, stroke: dark ? WHITE : 'rgba(2,6,23,0.4)', strokeW: 12, tracking: 8, maxHeight: (B - y) * 0.35, label: 'the kicker' })
  const cutTop = y
  const cutOn = hasCutout(content, assets)
  const cutW = cutOn ? Math.min(maxWidth * 0.42, 460) : 0
  const textW = maxWidth - (cutW ? cutW + 24 : 0)
  y += shout(ctx, content.hook, padX, y, textW, { px: 76, minPx: 36, lines: 3, fill: ink, maxHeight: (B - y) * 0.4, label: 'the headline' }) + 10
  const amount = amountWords(content)
  if (amount) y += shout(ctx, amount, padX, y, textW, { px: 170, minPx: 70, lines: 1, fill: accent, stroke: WHITE, strokeW: 12, tracking: 2, maxHeight: (B - y) * 0.5, label: 'the offer' })
  y += shout(ctx, content.offerDetail, padX, y, textW, { px: 56, minPx: 28, lines: 2, fill: ink, maxHeight: (B - y) * 0.5, label: 'the offer detail' }) + 10
  y += body(ctx, content.subhead, padX, y, textW, { px: 28, minPx: 18, lines: 3, weight: '600', fill: ink, maxHeight: B - y })
  if (cutW) {
    const top = Math.max(cutTop, st ? contentTop + 300 : contentTop + 120, B - cutW * 1.1)
    drawCutout(ctx, content, assets, { x: w - padX - cutW, y: top, w: cutW, h: B - top })
  }
  if (st) starburst(ctx, w - padX - 120, contentTop + 160, 118, st, { fill: GOLD, ink: SLATE })
  foot.draw()
  return { band: { top: y, bottom: B } }
}

/** 7. Holiday: red and green, snow, the season sale's bones. */
function holidayDeals(ctx, size, content, assets, opts) {
  return seasonSale(ctx, size, { ...content, theme: themeFor(content), kicker: content.kicker || 'Holiday Deals' }, assets, opts)
}

/** 8. Tune-up: a fresh green spring board with the service price in a starburst. */
function tuneUp(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, maxWidth } = m
  const { accent, badgeColor } = content
  const theme = paintTheme(ctx, w, h, content)
  const dark = theme.ink === 'dark'
  const ink = dark ? SLATE : WHITE
  const foot = footer(ctx, m, content, assets, { onDark: !dark, ink, logo: 'left', maxW: 260, maxH: 90 })
  const B = foot.top - 16
  let y = contentTop
  const badgeH = badge(ctx, content.badge, padX, y, maxWidth * 0.6, dark ? badgeColor : accent)
  if (badgeH) y += badgeH + 18
  y += shout(ctx, kickerWords(content), padX, y, maxWidth * 0.62, { px: 96, minPx: 44, lines: 2, fill: ink, tracking: 3, maxHeight: (B - y) * 0.3, label: 'the kicker' })
  const amount = amountWords(content)
  const rad = Math.min(170, maxWidth * 0.19)
  const sx = w - padX - rad
  const sy = contentTop + rad + (badgeH ? 30 : 10)
  if (amount) starburst(ctx, sx, sy, rad, amount, { fill: GOLD, ink: SLATE, points: 16 })
  y = Math.max(y, sy + rad + 8)
  y += shout(ctx, content.offerDetail, padX, y, maxWidth, { px: 76, minPx: 36, lines: 2, fill: dark ? accent : GOLD, stroke: dark ? '' : 'rgba(2,6,23,0.3)', strokeW: 6, maxHeight: (B - y) * 0.35, label: 'the offer detail' }) + 10
  const cutOn = hasCutout(content, assets)
  const cutW = cutOn ? Math.min(maxWidth * 0.38, 400) : 0
  const textW = maxWidth - (cutW ? cutW + 24 : 0)
  const cutTop = Math.max(y, sy + rad + 20)
  y += shout(ctx, content.hook, padX, y, textW, { px: 64, minPx: 32, lines: 3, fill: ink, maxHeight: (B - y) * 0.5, label: 'the headline' }) + 10
  y += body(ctx, content.subhead, padX, y, textW, { px: 28, minPx: 18, lines: 3, weight: '600', fill: ink, maxHeight: B - y })
  if (cutW) drawCutout(ctx, content, assets, { x: w - padX - cutW, y: cutTop, w: cutW, h: B - cutTop })
  foot.draw()
  return { band: { top: y, bottom: B } }
}

/** 9. Poster: the Horizon winter post. White, condensed capitals stacked and alternating colours, logo and stars, the unit. */
function poster(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, contentBottom, maxWidth } = m
  const { accent, badgeColor } = content
  const theme = paintTheme(ctx, w, h, content)
  const onDark = theme.ink === 'light'
  const navy = onDark ? WHITE : badgeColor || '#1E3A8A'
  const red = onDark ? GOLD : accent
  let y = contentTop
  const badgeH = badge(ctx, content.badge, padX, y, 400, accent)
  if (badgeH) y += badgeH + 10
  y += shout(ctx, kickerWords(content), w / 2, y, maxWidth, { px: 150, minPx: 60, lines: 2, fill: navy, align: 'center', tracking: 3, maxHeight: (contentBottom - y) * 0.25, label: 'the kicker' })
  y += shout(ctx, content.hook, w / 2, y, maxWidth, { px: 120, minPx: 52, lines: 2, fill: red, align: 'center', tracking: 3, maxHeight: (contentBottom - y) * 0.3, label: 'the headline' })
  y += shout(ctx, content.subhead, w / 2, y, maxWidth, { px: 70, minPx: 32, lines: 3, fill: navy, align: 'center', tracking: 1, maxHeight: (contentBottom - y) * 0.3, label: 'the subhead' }) + 20
  // Below: logo left, stars and the offer right; the unit bottom-left.
  const cutOn = hasCutout(content, assets)
  const lb = logoAt(ctx, assets, onDark, padX, y, { maxW: 320, maxH: 120 })
  const rightX = w - padX
  const rightW = maxWidth - (lb ? lb.w + 40 : 0)
  const proof = String(content.proof || '').trim()
  if (proof) starsLine(ctx, proof, rightX, y + 10, rightW, { ink: navy, align: 'right', px: 28 })
  let oy = y + (proof ? 70 : 10)
  const colW = cutOn ? Math.min(rightW, maxWidth * 0.52) : rightW
  const amount = amountWords(content)
  if (amount) oy += shout(ctx, amount, rightX, oy, colW, { px: 120, minPx: 50, lines: 1, fill: red, align: 'right', maxHeight: (contentBottom - oy) * 0.5, label: 'the offer' })
  oy += shout(ctx, content.offerDetail, rightX, oy, colW, { px: 64, minPx: 30, lines: 2, fill: navy, align: 'right', maxHeight: (contentBottom - oy) * 0.6, label: 'the offer detail' })
  if (cutOn) {
    const cw = Math.min(maxWidth * 0.45, 480)
    const top = Math.max(lb ? lb.y + lb.h + 20 : y + 20, contentBottom - cw * 1.1)
    drawCutout(ctx, content, assets, { x: padX, y: top, w: cw, h: contentBottom - top })
  }
  return { band: { top: oy, bottom: contentBottom } }
}

/** 10. Same-day: dark, urgent, a 24/7 seal, the headline huge. */
function emergency(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, maxWidth } = m
  const { accent, badgeColor } = content
  const theme = paintTheme(ctx, w, h, content)
  const onDark = theme.ink === 'light'
  const ink = onDark ? WHITE : SLATE
  const foot = footer(ctx, m, content, assets, { onDark, ink, logo: 'right', maxW: 260, maxH: 90 })
  const B = foot.top - 16
  let y = contentTop
  const badgeH = badge(ctx, content.badge, padX, y, maxWidth - 260, badgeColor)
  const st = stickerWords(content) || '24/7'
  seal(ctx, w - padX - 110, contentTop + 110, 110, st, { fill: accent, ink: WHITE, ring: WHITE })
  y += Math.max(badgeH + 26, 0)
  y += shout(ctx, kickerWords(content), padX, y, maxWidth - 260, { px: 90, minPx: 40, lines: 1, fill: onDark ? accent : badgeColor || accent, tracking: 4, label: 'the kicker' })
  y = Math.max(y + 10, contentTop + 240)
  const cutOn = hasCutout(content, assets)
  const cutW = cutOn ? Math.min(maxWidth * 0.4, 420) : 0
  y += shout(ctx, content.hook, padX, y, maxWidth, { px: 170, minPx: 60, lines: 3, fill: ink, tracking: 2, maxHeight: (B - y) * 0.5, label: 'the headline' }) + 16
  const cutTop = y
  y += body(ctx, content.subhead, padX, y, maxWidth - (cutW ? cutW + 20 : 0), { px: 34, minPx: 22, lines: 3, weight: '600', fill: onDark ? 'rgba(255,255,255,0.85)' : '#334155', maxHeight: (B - y) * 0.5 }) + 24
  const amount = amountWords(content)
  if ((amount || content.offerDetail) && B - y > 70) {
    const pillH = Math.min(110, B - y)
    const text = `${amount}${amount && content.offerDetail ? '  ' : ''}${String(content.offerDetail || '').toUpperCase()}`
    const fit = fitText(ctx, text, maxWidth - 60 - (cutW ? cutW + 20 : 0), 1, 60, 26, '400', 2, { lineRatio: 1, face: CONDENSED })
    setFont(ctx, '400', fit.px, 2, CONDENSED)
    const pw = Math.min(maxWidth, widest(ctx, fit.lines) + 60)
    ctx.fillStyle = accent
    roundRect(ctx, padX, y, pw, pillH, 14)
    ctx.fill()
    ctx.fillStyle = WHITE
    ctx.textBaseline = 'middle'
    ctx.fillText(fit.lines[0] || text, padX + 30, y + pillH / 2 + 2)
    ctx.textBaseline = 'alphabetic'
    y += pillH + 20
  }
  if (cutW) drawCutout(ctx, content, assets, { x: w - padX - cutW, y: cutTop, w: cutW, h: B - cutTop })
  foot.draw()
  return { band: { top: y, bottom: B } }
}

/** 11. Financing: $0 down, monthly payments, two price tiles, the unit. */
function financing(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, maxWidth } = m
  const { accent, badgeColor } = content
  const theme = paintTheme(ctx, w, h, content)
  const dark = theme.ink === 'dark'
  const ink = dark ? SLATE : WHITE
  const foot = footer(ctx, m, content, assets, { onDark: !dark, ink, logo: 'left', maxW: 260, maxH: 90 })
  const B = foot.top - 16
  let y = contentTop
  const badgeH = badge(ctx, content.badge, padX, y, maxWidth, dark ? badgeColor : accent)
  if (badgeH) y += badgeH + 20
  const cutOn = hasCutout(content, assets)
  const cutW = cutOn ? Math.min(maxWidth * 0.4, 440) : 0
  const textW = maxWidth - (cutW ? cutW + 24 : 0)
  y += shout(ctx, kickerWords(content), padX, y, textW, { px: 80, minPx: 40, lines: 2, fill: dark ? badgeColor || accent : accent, tracking: 4, maxHeight: (B - y) * 0.2, label: 'the kicker' })
  const amount = amountWords(content)
  if (amount) y += shout(ctx, amount, padX, y, textW, { px: 250, minPx: 100, lines: 1, fill: WHITE, stroke: dark ? badgeColor || SLATE : 'rgba(2,6,23,0.35)', strokeW: 14, tracking: 2, maxHeight: (B - y) * 0.4, label: 'the offer' })
  y += shout(ctx, content.offerDetail, padX, y, textW, { px: 70, minPx: 32, lines: 2, fill: ink, maxHeight: (B - y) * 0.35, label: 'the offer detail' }) + 10
  y += shout(ctx, content.hook, padX, y, textW, { px: 60, minPx: 30, lines: 3, fill: ink, maxHeight: (B - y) * 0.4, label: 'the headline' }) + 10
  y += body(ctx, content.subhead, padX, y, textW, { px: 28, minPx: 18, lines: 2, weight: '600', fill: ink, maxHeight: (B - y) * 0.5 }) + 20
  let cutBottom = contentTop + 60
  if (cutW) {
    const ch = Math.min(cutW * 1.3, h * 0.5, B - (contentTop + 60))
    cutBottom = contentTop + 60 + ch
    drawCutout(ctx, content, assets, { x: w - padX - cutW, y: contentTop + 60, w: cutW, h: ch })
  }
  const st = stickerWords(content) || 'Monthly payments available'
  const sealR = Math.min(120, (B - Math.max(cutBottom + 20, y)) / 2)
  if (sealR >= 60) seal(ctx, w - padX - sealR, Math.max(cutBottom + 20 + sealR, Math.min(B - sealR, Math.max(y + 100, h * 0.62))), sealR, st, { fill: accent, ink: WHITE })
  const offers = offersFor(content).filter((o) => o.amount !== amount || o.detail !== String(content.offerDetail || '').trim())
  if (offers.length) {
    const gh = Math.min(offers.length > 2 ? 420 : 240, B - y)
    if (gh > 90) tiles(ctx, offers, { x: padX, y, w: maxWidth - 280, h: gh }, { fill: 'rgba(255,255,255,0.12)', ink: WHITE, amountInk: WHITE, columns: 2, gap: 12, radius: 10, border: 'rgba(255,255,255,0.3)' })
    y += gh + 20
  }
  foot.draw()
  return { band: { top: y, bottom: B } }
}

/** 12. Coupon: a dashed coupon with the offer inside, the fine print, the logo. */
function coupon(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, maxWidth } = m
  const { accent, badgeColor } = content
  const theme = paintTheme(ctx, w, h, content)
  const dark = theme.ink === 'dark'
  const ink = dark ? SLATE : WHITE
  const cutOn = hasCutout(content, assets)
  const cutW = cutOn ? Math.min(maxWidth * 0.42, 440) : 0
  const foot = footer(ctx, m, content, assets, { onDark: !dark, ink, logo: 'none', right: w - padX - cutW - (cutW ? 20 : 0) })
  const B = foot.top - 16
  let y = contentTop
  const lb = logoAt(ctx, assets, !dark, padX, y, { maxW: 300, maxH: 100 })
  const badgeH = badge(ctx, content.badge, w - padX - 380, y, 380, badgeColor)
  y += Math.max(lb ? lb.h : 0, badgeH) + 26
  y += shout(ctx, kickerWords(content), padX, y, maxWidth, { px: 70, minPx: 36, lines: 1, fill: accent, tracking: 4, maxHeight: (B - y) * 0.2, label: 'the kicker' }) + 10
  // The coupon box, sized to what goes in it: measured first, drawn after.
  const innerW = maxWidth - 100
  const amount = amountWords(content)
  const roomH = Math.min(h * 0.46, B - y - 160)
  const aFit = amount ? fitText(ctx, amount.toUpperCase(), innerW, 1, 220, 90, '400', 2, { lineRatio: 0.98, maxHeight: roomH * 0.5, face: CONDENSED }) : null
  const dFit = content.offerDetail ? fitText(ctx, String(content.offerDetail).toUpperCase(), innerW, 2, 64, 30, '400', 1, { lineRatio: 0.98, maxHeight: roomH * 0.3, face: CONDENSED }) : null
  const sFit = content.subhead ? fitText(ctx, typographic(content.subhead), innerW, 2, 24, 16, '600', 0, { lineRatio: 1.3 }) : null
  const need = 100 + (aFit ? aFit.px * 1.08 : 0) + (dFit ? dFit.lines.length * dFit.px * 0.98 + dFit.px * 0.1 + 10 : 0) + (sFit ? sFit.lines.length * sFit.px * 1.3 : 0)
  const boxH = Math.max(200, Math.min(roomH, need))
  ctx.fillStyle = WHITE
  roundRect(ctx, padX, y, maxWidth, boxH, 18)
  ctx.fill()
  ctx.save()
  ctx.setLineDash([18, 14])
  ctx.strokeStyle = badgeColor || SLATE
  ctx.lineWidth = 6
  roundRect(ctx, padX + 14, y + 14, maxWidth - 28, boxH - 28, 12)
  ctx.stroke()
  ctx.restore()
  setFont(ctx, '700', 40, 0)
  ctx.fillStyle = badgeColor || SLATE
  ctx.fillText('✂', padX + 40, y + 28)
  let cy = y + 50
  if (amount) cy += shout(ctx, amount, w / 2, cy, innerW, { px: 220, minPx: 90, lines: 1, fill: accent, align: 'center', tracking: 2, maxHeight: boxH * 0.5, label: 'the offer' })
  cy += shout(ctx, content.offerDetail, w / 2, cy, innerW, { px: 64, minPx: 30, lines: 2, fill: badgeColor || SLATE, align: 'center', maxHeight: boxH * 0.3, label: 'the offer detail' }) + 10
  body(ctx, content.subhead, w / 2, cy, innerW, { px: 24, minPx: 16, lines: 2, weight: '600', fill: '#475569', align: 'center', maxHeight: y + boxH - 20 - cy })
  y += boxH + 24
  // The headline under the coupon, the unit beside it.
  const cutTop = y - 10
  y += shout(ctx, content.hook, padX, y, maxWidth - (cutW ? cutW + 20 : 0), { px: 84, minPx: 30, lines: 4, fill: ink, maxHeight: B - y, label: 'the headline' })
  if (cutW) drawCutout(ctx, content, assets, { x: w - padX - cutW, y: cutTop, w: cutW, h: m.contentBottom - 10 - cutTop })
  foot.draw()
  return { band: { top: y, bottom: B } }
}

/** 13. Big number: the amount fills the width and that is the ad. */
function bigNumber(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, maxWidth } = m
  const { accent, badgeColor } = content
  const theme = paintTheme(ctx, w, h, content)
  const dark = theme.ink === 'dark'
  const ink = dark ? SLATE : WHITE
  const foot = footer(ctx, m, content, assets, { onDark: !dark, ink, logo: 'right', maxW: 260, maxH: 90 })
  const B = foot.top - 16
  let y = contentTop
  const badgeH = badge(ctx, content.badge, padX, y, maxWidth, dark ? badgeColor : accent)
  if (badgeH) y += badgeH + 20
  const st = stickerWords(content)
  const topW = maxWidth - (st ? 250 : 0)
  y += shout(ctx, kickerWords(content), padX, y, topW, { px: 70, minPx: 36, lines: 1, fill: dark ? badgeColor || accent : accent, tracking: 4, maxHeight: (B - y) * 0.2, label: 'the kicker' })
  y += shout(ctx, content.hook, padX, y, topW, { px: 80, minPx: 36, lines: 3, fill: ink, maxHeight: (B - y) * 0.25, label: 'the headline' }) + 10
  const amount = amountWords(content)
  const starBottom = st ? contentTop + (badgeH ? badgeH + 140 : 110) + 108 + 10 : 0
  if (amount) y = Math.max(y, starBottom)
  if (amount) y += shout(ctx, amount, padX, y, maxWidth, { px: 420, minPx: 120, lines: 1, fill: accent, stroke: WHITE, strokeW: 16, tracking: -4, maxHeight: (B - y) * 0.55, label: 'the offer' })
  const cutOn = hasCutout(content, assets)
  const cutW = cutOn ? Math.min(maxWidth * 0.38, 400) : 0
  const cutTop = y
  y += shout(ctx, content.offerDetail, padX, y, maxWidth - (cutW ? cutW + 20 : 0), { px: 90, minPx: 36, lines: 2, fill: ink, tracking: 3, maxHeight: (B - y) * 0.5, label: 'the offer detail' }) + 14
  y += body(ctx, content.subhead, padX, y, maxWidth - (cutW ? cutW + 20 : 0), { px: 32, minPx: 20, lines: 3, weight: '600', fill: ink, maxHeight: B - y })
  if (st) starburst(ctx, w - padX - 110, contentTop + (badgeH ? badgeH + 140 : 110), 108, st, { fill: GOLD, ink: SLATE })
  if (cutW) drawCutout(ctx, content, assets, { x: w - padX - cutW, y: cutTop, w: cutW, h: B - cutTop })
  foot.draw()
  return { band: { top: y, bottom: B } }
}

/** 14. Photo sale: the photo full-bleed, a SALE ribbon in the corner, the offers on a band below. */
function photoSale(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, contentBottom, maxWidth } = m
  const { accent, badgeColor, focus } = content
  const bandH = r(Math.min(h * 0.34, 420))
  const bandTop = contentBottom - bandH + 40
  if (assets?.background) drawCoverIn(ctx, assets.background, { x: 0, y: 0, w, h: bandTop + 30 }, focus)
  else paintTheme(ctx, w, h, content)
  // A lift at the top for the badge and the kicker.
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.4)
  g.addColorStop(0, 'rgba(2,6,23,0.55)')
  g.addColorStop(1, 'rgba(2,6,23,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h * 0.4)
  let y = contentTop
  const badgeH = badge(ctx, content.badge, padX, y, maxWidth - 300, badgeColor)
  if (badgeH) y += badgeH + 18
  ribbon(ctx, w, stickerWords(content) || 'SALE', { fill: accent, ink: WHITE, size: 360 })
  y += shout(ctx, kickerWords(content), padX, y, maxWidth - 260, { px: 90, minPx: 40, lines: 1, fill: WHITE, stroke: 'rgba(2,6,23,0.6)', strokeW: 8, tracking: 3, label: 'the kicker' })
  shout(ctx, content.hook, padX, y, y < 300 ? maxWidth - 260 : maxWidth - 60, { px: 84, minPx: 36, lines: 3, fill: WHITE, stroke: 'rgba(2,6,23,0.6)', strokeW: 8, maxHeight: (bandTop - y) * 0.6, label: 'the headline' })
  // The band: tiles, the subhead, then the logo and the stars.
  const bandFill = badgeColor || SLATE
  const onBandDark = readableTextOn(bandFill) === WHITE
  const bandInk = onBandDark ? WHITE : SLATE
  ctx.fillStyle = bandFill
  roundRect(ctx, 0, bandTop, w, h - bandTop + 40, 36)
  ctx.fill()
  const foot = footer(ctx, m, content, assets, { onDark: onBandDark, ink: bandInk, logo: 'right', maxW: 240, maxH: 70, starsPx: 22, bottom: contentBottom - 8 })
  const B = foot.top - 14
  const offers = offersFor(content)
  let by = bandTop + 30
  if (offers.length) {
    const th = Math.min(170, bandH * 0.5, (B - by) * 0.6)
    if (th > 70) {
      tiles(ctx, offers, { x: padX, y: by, w: maxWidth, h: th }, { fill: accent, ink: WHITE, amountInk: WHITE, columns: Math.min(offers.length, 3), gap: 12, radius: 12 })
      by += th + 18
    }
  }
  body(ctx, content.subhead, padX, by, maxWidth, { px: 28, minPx: 18, lines: 2, weight: '600', fill: onBandDark ? 'rgba(255,255,255,0.9)' : '#334155', maxHeight: B - by })
  foot.draw()
  return { band: { top: y, bottom: bandTop } }
}

/** 15. Before and after sale: the pair up top, the kicker, the headline and the offer tiles on the season below. */
function beforeSale(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, maxWidth } = m
  const { accent, badgeColor } = content
  const theme = paintTheme(ctx, w, h, content)
  const onDark = theme.ink === 'light'
  const ink = onDark ? WHITE : SLATE
  const foot = footer(ctx, m, content, assets, { onDark, ink, logo: 'right', maxW: 260, maxH: 90 })
  const B = foot.top - 16
  // The pair on a white print border.
  const area = { x: padX, y: contentTop, w: maxWidth, h: r((B - contentTop) * 0.46) }
  ctx.fillStyle = WHITE
  roundRect(ctx, area.x - 8, area.y - 8, area.w + 16, area.h + 16, 10)
  ctx.fill()
  drawPair(ctx, assets, content, area, accent)
  let y = area.y + area.h + 26
  const badgeH = badge(ctx, content.badge, padX, y, 400, badgeColor)
  if (badgeH) y += badgeH + 12
  y += shout(ctx, kickerWords(content), padX, y, maxWidth, { px: 96, minPx: 44, lines: 1, fill: onDark ? GOLD : accent, tracking: 3, maxHeight: (B - y) * 0.3, label: 'the kicker' })
  y += shout(ctx, content.hook, padX, y, maxWidth, { px: 72, minPx: 34, lines: 3, fill: ink, maxHeight: (B - y) * 0.45, label: 'the headline' }) + 12
  const offers = offersFor(content)
  if (offers.length) {
    const th = Math.min(150, (B - y) * 0.5)
    if (th > 76) {
      tiles(ctx, offers, { x: padX, y, w: maxWidth, h: th }, { fill: accent, ink: readableTextOn(accent), amountInk: readableTextOn(accent), columns: Math.min(offers.length, 3), gap: 12, radius: 12 })
      y += th + 14
    }
  }
  body(ctx, content.subhead, padX, y, maxWidth, { px: 28, minPx: 18, lines: 2, weight: '600', fill: ink, maxHeight: B - y })
  foot.draw()
  return { band: { top: y, bottom: B } }
}

/** 16. Before inset: the After photo whole, the Before as a framed inset, the words on a brand-colour plate. */
function reveal(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, contentBottom, maxWidth } = m
  const { accent, badgeColor, focus } = content
  if (assets?.after) drawCoverIn(ctx, assets.after, { x: 0, y: 0, w, h }, CENTRE)
  else paintTheme(ctx, w, h, content)
  // A lift at the top for the badge and the tag.
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.3)
  g.addColorStop(0, 'rgba(2,6,23,0.5)')
  g.addColorStop(1, 'rgba(2,6,23,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h * 0.3)
  badge(ctx, content.badge, padX, contentTop, maxWidth - 200, badgeColor)
  tag(ctx, assets?.after ? 'AFTER' : 'PICK THE AFTER PHOTO', w - padX, contentTop + 6, { fill: accent, ink: readableTextOn(accent), align: 'right', px: 34 })
  // The plate, from a little over half way down to the bottom of the frame.
  const plateFill = badgeColor || SLATE
  const onPlate = readableTextOn(plateFill) === WHITE
  const plateInk = onPlate ? WHITE : SLATE
  const plateTop = r(contentTop + (contentBottom - contentTop) * 0.56)
  ctx.fillStyle = plateFill
  roundRect(ctx, 0, plateTop, w, h - plateTop + 40, 36)
  ctx.fill()
  // The inset, bottom-left, overlapping the plate's top edge.
  const insetW = r(maxWidth * 0.38)
  const insetH = r(insetW * 0.75)
  const inset = { x: padX, y: plateTop - insetH + 44, w: insetW, h: insetH }
  ctx.fillStyle = WHITE
  roundRect(ctx, inset.x - 8, inset.y - 8, inset.w + 16, inset.h + 16, 10)
  ctx.fill()
  photoIn(ctx, assets?.background, inset, 'Before', focus)
  tag(ctx, 'BEFORE', inset.x + 12, inset.y + 12, { fill: SLATE, px: 26 })
  const insetBottom = inset.y + inset.h + 8
  const foot = footer(ctx, m, content, assets, { onDark: onPlate, ink: plateInk, logo: 'right', maxW: 240, maxH: 80, starsPx: 22, bottom: contentBottom - 8 })
  const B = foot.top - 14
  // The words: beside the inset first, then the whole width under it.
  const tx = inset.x + inset.w + 28
  const tw = w - padX - tx
  let y = plateTop + 26
  y += shout(ctx, kickerWords(content), tx, y, tw, { px: 70, minPx: 32, lines: 1, fill: onPlate ? GOLD : accent, tracking: 3, maxHeight: Math.max(60, (insetBottom - y) * 0.5), label: 'the kicker' })
  y += shout(ctx, content.hook, tx, y, tw, { px: 64, minPx: 30, lines: 3, fill: plateInk, maxHeight: Math.max(70, insetBottom + 60 - y), label: 'the headline' }) + 10
  y = Math.max(y, insetBottom + 16)
  const amount = amountWords(content)
  const detail = String(content.offerDetail || '').trim()
  if (amount || detail) {
    const text = [amount, detail].filter(Boolean).join('  ')
    y += shout(ctx, text, padX, y, maxWidth, { px: 110, minPx: 40, lines: 2, fill: accent, stroke: WHITE, strokeW: 8, tracking: 1, maxHeight: (B - y) * 0.6, label: 'the offer' }) + 8
  }
  body(ctx, content.subhead, padX, y, maxWidth, { px: 28, minPx: 18, lines: 2, weight: '600', fill: onPlate ? 'rgba(255,255,255,0.9)' : '#334155', maxHeight: B - y })
  foot.draw()
  return { band: { top: plateTop, bottom: B } }
}

/** 17. Maintenance plan: a membership card with the price a month and what is included, from the subhead. */
function planCard(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, maxWidth } = m
  const { accent, badgeColor } = content
  const theme = paintTheme(ctx, w, h, content)
  const onDark = theme.ink === 'light'
  const ink = onDark ? WHITE : SLATE
  const foot = footer(ctx, m, content, assets, { onDark, ink, logo: 'right', maxW: 260, maxH: 90 })
  const B = foot.top - 16
  let y = contentTop
  const badgeH = badge(ctx, content.badge, padX, y, maxWidth, onDark ? accent : badgeColor)
  if (badgeH) y += badgeH + 16
  const stickerOn = Boolean(stickerWords(content))
  y += shout(ctx, content.hook, padX, y, maxWidth - (stickerOn ? 200 : 0), { px: 84, minPx: 36, lines: 2, fill: ink, maxHeight: (B - y) * 0.28, label: 'the headline' }) + 18
  // What goes on the card decides its height: the checklist rows on the
  // left, the price block on the right, whichever is taller, so a short
  // plan does not leave a white void. The unit stands under it when there
  // is room.
  const items = String(content.subhead || '')
    .split(/\s*(?:[,;|•\n]|\.\s)\s*/)
    .map((t) => t.trim().replace(/^(and|or|plus)\s+/i, '').replace(/\.$/, ''))
    .filter(Boolean)
    .slice(0, 6)
  const amount = amountWords(content)
  const headH = 86
  const rowH = 62
  const listH = items.length * rowH
  const priceH = amount ? 120 + (content.offerDetail ? 90 : 0) : 0
  const card = { x: padX, y, w: maxWidth, h: Math.min(B - y - 6, headH + 26 + Math.max(listH, priceH, 120) + 28) }
  if (card.h < 200) {
    foot.draw()
    return { band: { top: y, bottom: B } }
  }
  ctx.fillStyle = 'rgba(2,6,23,0.18)'
  roundRect(ctx, card.x + 6, card.y + 10, card.w, card.h, 24)
  ctx.fill()
  ctx.fillStyle = WHITE
  roundRect(ctx, card.x, card.y, card.w, card.h, 24)
  ctx.fill()
  const head = badgeColor || SLATE
  ctx.fillStyle = head
  roundRect(ctx, card.x, card.y, card.w, headH, 24)
  ctx.fill()
  ctx.fillRect(card.x, card.y + headH / 2, card.w, headH / 2)
  const st = stickerWords(content)
  shout(ctx, kickerWords(content), card.x + 28, card.y + 16, card.w - 56 - (st ? 150 : 0), { px: 54, minPx: 26, lines: 1, fill: readableTextOn(head), tracking: 2, maxHeight: headH - 20, label: 'the kicker' })
  // The price on the right, what is included on the left.
  const inner = { x: card.x + 32, y: card.y + headH + 26, w: card.w - 64, bottom: card.y + card.h - 28 }
  const priceW = amount ? Math.min(inner.w * 0.42, 380) : 0
  if (amount) {
    const rx = inner.x + inner.w
    let py = inner.y
    py += shout(ctx, amount, rx, py, priceW, { px: 120, minPx: 50, lines: 1, fill: accent, align: 'right', maxHeight: (inner.bottom - py) * 0.5, label: 'the offer' })
    shout(ctx, content.offerDetail, rx, py, priceW, { px: 36, minPx: 20, lines: 3, fill: head, align: 'right', maxHeight: (inner.bottom - py) * 0.6, label: 'the offer detail' })
  }
  const listW = inner.w - (priceW ? priceW + 30 : 0)
  let ly = inner.y + 4
  for (const item of items) {
    if (ly + rowH > inner.bottom + 4) break
    const cy = ly + rowH / 2
    ctx.fillStyle = '#16A34A'
    ctx.beginPath()
    ctx.arc(inner.x + 18, cy, 16, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = WHITE
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(inner.x + 10, cy)
    ctx.lineTo(inner.x + 16, cy + 6)
    ctx.lineTo(inner.x + 27, cy - 7)
    ctx.stroke()
    const fit = fitText(ctx, typographic(item), listW - 50, 2, Math.min(32, rowH * 0.5), 18, '600', 0, { lineRatio: 1.2, maxHeight: rowH })
    setFont(ctx, '600', fit.px, 0)
    ctx.fillStyle = SLATE
    drawLines(ctx, fit.lines, inner.x + 48, cy - ((fit.lines.length - 1) * fit.px * 1.2) / 2 + fit.px * 0.35, fit.px, 1.2, 'left')
    ly += rowH
  }
  if (st) starburst(ctx, card.x + card.w - 70, card.y + 12, 92, st, { fill: GOLD, ink: SLATE })
  // The unit under the card, bottom-right, when there is room for it.
  const below = card.y + card.h + 20
  if (hasCutout(content, assets) && B - below > 160) {
    const cw = Math.min(maxWidth * 0.4, 420, (B - below) * 0.9)
    drawCutout(ctx, content, assets, { x: w - padX - cw, y: below, w: cw, h: B - below })
  }
  foot.draw()
  return { band: { top: y, bottom: B } }
}

export const TEMPLATES = {
  winter_shout: winterShout,
  massive_deal: massiveDeal,
  price_grid: priceGrid,
  fall_special: fallSpecial,
  season_sale: seasonSale,
  holiday_deals: holidayDeals,
  tune_up: tuneUp,
  poster,
  emergency,
  financing,
  coupon,
  big_number: bigNumber,
  photo_sale: photoSale,
  before_sale: beforeSale,
  reveal,
  plan_card: planCard,
}

export function hasTemplate(key) {
  return Boolean(TEMPLATES[key])
}

export function renderTemplate(ctx, size, content, assets, opts = {}) {
  const fn = TEMPLATES[content.layout]
  if (!fn) return null
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.letterSpacing = '0px'
  audit = createAudit({ w: size.w, h: size.h })
  let out
  try {
    out = fn(ctx, size, content, assets, opts)
  } finally {
    const done = audit
    audit = null
    out = { ...(out || {}), problems: done.problems() }
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.letterSpacing = '0px'
  ctx.setLineDash([])
  return out
}
