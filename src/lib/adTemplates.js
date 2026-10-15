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
 * No phone numbers and no painted buttons: Meta draws the real button under
 * the creative, and the number belongs on the landing page.
 */

import { readableTextOn } from './logoColours'
import { CONDENSED, SCRIPT, drawLines, fitText, roundRect, setFont, typographic, widest } from './adText'
import { SLATE, drawBadge, drawCoverIn, drawLogoPill, frameMargins, logoFit } from './adLooks'
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

function drawAc(ctx, x, y, w, h) {
  const bw = Math.min(w, h * 1.05)
  const bh = bw * 0.95
  const bx = x + (w - bw) / 2
  const by = y + h - bh
  shadow(ctx, bx + bw / 2, by + bh - 6, bw * 0.6, bw * 0.12)
  ctx.fillStyle = metal(ctx, bx, by, bw, bh, '#CBD5E1', '#64748B')
  roundRect(ctx, bx, by + bh * 0.1, bw, bh * 0.9, bw * 0.06)
  ctx.fill()
  // Grille lines.
  ctx.strokeStyle = 'rgba(15,23,42,0.35)'
  ctx.lineWidth = 2
  for (let i = 0; i < 14; i++) {
    const gy = by + bh * 0.22 + i * (bh * 0.68 / 14)
    ctx.beginPath()
    ctx.moveTo(bx + bw * 0.06, gy)
    ctx.lineTo(bx + bw * 0.94, gy)
    ctx.stroke()
  }
  // The top with the fan.
  ctx.fillStyle = '#1E293B'
  roundRect(ctx, bx, by, bw, bh * 0.16, bw * 0.06)
  ctx.fill()
  ctx.save()
  ctx.translate(bx + bw / 2, by + bh * 0.08)
  ctx.scale(1, 0.38)
  ctx.fillStyle = '#0F172A'
  ctx.beginPath()
  ctx.arc(0, 0, bw * 0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(148,163,184,0.7)'
  ctx.lineWidth = 3
  for (let i = 1; i < 6; i++) {
    ctx.beginPath()
    ctx.arc(0, 0, bw * 0.4 * (i / 6), 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
  // Base.
  ctx.fillStyle = '#0F172A'
  roundRect(ctx, bx + bw * 0.03, by + bh * 0.96, bw * 0.94, bh * 0.04, 4)
  ctx.fill()
}

function drawFurnace(ctx, x, y, w, h) {
  const bh = h
  const bw = Math.min(w, h * 0.62)
  const bx = x + (w - bw) / 2
  const by = y
  shadow(ctx, bx + bw / 2, by + bh - 6, bw * 0.7, bw * 0.14)
  ctx.fillStyle = metal(ctx, bx, by, bw, bh)
  roundRect(ctx, bx, by, bw, bh, bw * 0.05)
  ctx.fill()
  // Two panels with a seam, a vent slot on the upper one.
  ctx.fillStyle = 'rgba(15,23,42,0.08)'
  roundRect(ctx, bx + bw * 0.08, by + bh * 0.07, bw * 0.84, bh * 0.4, bw * 0.03)
  ctx.fill()
  roundRect(ctx, bx + bw * 0.08, by + bh * 0.52, bw * 0.84, bh * 0.41, bw * 0.03)
  ctx.fill()
  ctx.strokeStyle = 'rgba(15,23,42,0.25)'
  ctx.lineWidth = 2
  roundRect(ctx, bx + bw * 0.08, by + bh * 0.07, bw * 0.84, bh * 0.4, bw * 0.03)
  ctx.stroke()
  roundRect(ctx, bx + bw * 0.08, by + bh * 0.52, bw * 0.84, bh * 0.41, bw * 0.03)
  ctx.stroke()
  ctx.fillStyle = '#334155'
  roundRect(ctx, bx + bw * 0.38, by + bh * 0.13, bw * 0.24, bh * 0.035, 6)
  ctx.fill()
  // Side shading.
  const sg = ctx.createLinearGradient(bx + bw * 0.8, 0, bx + bw, 0)
  sg.addColorStop(0, 'rgba(15,23,42,0)')
  sg.addColorStop(1, 'rgba(15,23,42,0.35)')
  ctx.fillStyle = sg
  roundRect(ctx, bx, by, bw, bh, bw * 0.05)
  ctx.fill()
}

function drawBoiler(ctx, x, y, w, h) {
  const bh = h * 0.92
  const bw = Math.min(w * 0.75, h * 0.55)
  const bx = x + (w - bw) / 2
  const by = y + h - bh
  shadow(ctx, bx + bw / 2, by + bh - 6, bw * 0.7, bw * 0.14)
  // Pipes on top.
  ctx.strokeStyle = '#A16207'
  ctx.lineWidth = bw * 0.06
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(bx + bw * 0.3, by + bh * 0.02)
  ctx.lineTo(bx + bw * 0.3, by - h * 0.06)
  ctx.lineTo(bx - bw * 0.15, by - h * 0.06)
  ctx.stroke()
  ctx.strokeStyle = '#94A3B8'
  ctx.beginPath()
  ctx.moveTo(bx + bw * 0.7, by + bh * 0.02)
  ctx.lineTo(bx + bw * 0.7, by - h * 0.04)
  ctx.stroke()
  ctx.fillStyle = metal(ctx, bx, by, bw, bh, '#2F6F4E', '#14532D')
  roundRect(ctx, bx, by, bw, bh, bw * 0.06)
  ctx.fill()
  ctx.fillStyle = '#0F172A'
  roundRect(ctx, bx + bw * 0.12, by + bh * 0.08, bw * 0.3, bh * 0.1, 6)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  roundRect(ctx, bx + bw * 0.12, by + bh * 0.3, bw * 0.76, bh * 0.55, bw * 0.04)
  ctx.fill()
  ctx.fillStyle = '#F59E0B'
  ctx.beginPath()
  ctx.arc(bx + bw * 0.78, by + bh * 0.13, bw * 0.045, 0, Math.PI * 2)
  ctx.fill()
}

function drawWaterHeater(ctx, x, y, w, h) {
  const bh = h * 0.94
  const bw = Math.min(w * 0.6, h * 0.42)
  const bx = x + (w - bw) / 2
  const by = y + h - bh
  shadow(ctx, bx + bw / 2, by + bh - 6, bw * 0.75, bw * 0.16)
  ctx.strokeStyle = '#94A3B8'
  ctx.lineWidth = bw * 0.07
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(bx + bw * 0.3, by + bh * 0.03)
  ctx.lineTo(bx + bw * 0.3, by - h * 0.05)
  ctx.moveTo(bx + bw * 0.7, by + bh * 0.03)
  ctx.lineTo(bx + bw * 0.7, by - h * 0.05)
  ctx.stroke()
  ctx.fillStyle = metal(ctx, bx, by, bw, bh, '#F1F5F9', '#94A3B8')
  roundRect(ctx, bx, by, bw, bh, bw * 0.5)
  ctx.fill()
  ctx.fillStyle = '#1E293B'
  roundRect(ctx, bx + bw * 0.2, by + bh * 0.55, bw * 0.6, bh * 0.1, 6)
  ctx.fill()
  ctx.strokeStyle = 'rgba(15,23,42,0.2)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(bx + bw * 0.08, by + bh * 0.2)
  ctx.lineTo(bx + bw * 0.92, by + bh * 0.2)
  ctx.moveTo(bx + bw * 0.08, by + bh * 0.8)
  ctx.lineTo(bx + bw * 0.92, by + bh * 0.8)
  ctx.stroke()
}

function drawMiniSplit(ctx, x, y, w, h) {
  const bw = Math.min(w, h * 2.6)
  const bh = bw * 0.32
  const bx = x + (w - bw) / 2
  const by = y + (h - bh) / 2
  shadow(ctx, bx + bw / 2, by + bh + bh * 0.3, bw * 0.5, bh * 0.35)
  ctx.fillStyle = metal(ctx, bx, by, bw, bh, '#FFFFFF', '#CBD5E1')
  roundRect(ctx, bx, by, bw, bh, bh * 0.35)
  ctx.fill()
  ctx.fillStyle = 'rgba(15,23,42,0.12)'
  roundRect(ctx, bx + bw * 0.05, by + bh * 0.62, bw * 0.9, bh * 0.22, bh * 0.1)
  ctx.fill()
  ctx.fillStyle = '#0EA5E9'
  ctx.beginPath()
  ctx.arc(bx + bw * 0.9, by + bh * 0.3, bh * 0.06, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(15,23,42,0.15)'
  ctx.lineWidth = 2
  for (let i = 1; i < 4; i++) {
    ctx.beginPath()
    ctx.moveTo(bx + bw * 0.1, by + bh * 0.15 * i)
    ctx.lineTo(bx + bw * 0.75, by + bh * 0.15 * i)
    ctx.stroke()
  }
}

function drawThermostat(ctx, x, y, w, h) {
  const d = Math.min(w, h) * 0.85
  const cx = x + w / 2
  const cy = y + h / 2
  shadow(ctx, cx, cy + d * 0.5, d * 0.5, d * 0.12)
  ctx.fillStyle = '#0F172A'
  ctx.beginPath()
  ctx.arc(cx, cy, d / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#94A3B8'
  ctx.lineWidth = d * 0.04
  ctx.beginPath()
  ctx.arc(cx, cy, d * 0.43, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = '#F97316'
  ctx.lineWidth = d * 0.05
  ctx.beginPath()
  ctx.arc(cx, cy, d * 0.36, Math.PI * 0.75, Math.PI * 1.9)
  ctx.stroke()
  setFont(ctx, '800', d * 0.26, -1)
  ctx.fillStyle = WHITE
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('72°', cx, cy + d * 0.02)
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
    return true
  }
  const fn = CUTOUT_DRAW[key]
  if (!fn) return false
  fn(ctx, box.x, box.y, box.w, box.h)
  return true
}

// ---------------------------------------------------------------------------
// shared elements
// ---------------------------------------------------------------------------

/** Condensed capitals, optionally outlined, one or more lines. Returns the height used. */
function shout(ctx, text, x, y, maxW, { px = 120, minPx = 48, lines = 2, fill = SLATE, stroke = '', strokeW = 0, align = 'left', ratio = 0.98, maxHeight, face = CONDENSED, tracking = 1 } = {}) {
  const t = String(text || '').trim()
  if (!t) return 0
  const fit = fitText(ctx, t.toUpperCase(), maxW, lines, px, minPx, '400', tracking, { lineRatio: ratio, maxHeight, face })
  setFont(ctx, '400', fit.px, tracking, face)
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
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
  return fit.lines.length * fit.px * ratio + fit.px * 0.1
}

/** The script word: "Fall", "summer". Returns the height used. */
function script(ctx, text, x, y, maxW, { px = 110, minPx = 50, fill = WHITE, align = 'left', stroke = '', strokeW = 0 } = {}) {
  const t = String(text || '').trim()
  if (!t) return 0
  const fit = fitText(ctx, t, maxW, 1, px, minPx, '400', 0, { lineRatio: 1, face: SCRIPT })
  setFont(ctx, '400', fit.px, 0, SCRIPT)
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
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
function body(ctx, text, x, y, maxW, { px = 30, minPx = 20, lines = 3, weight = '600', fill = SLATE, align = 'left', ratio = 1.3, maxHeight } = {}) {
  const t = String(text || '').trim()
  if (!t) return 0
  if (maxHeight !== undefined && maxHeight < minPx * ratio) return 0
  const fit = fitText(ctx, typographic(t), maxW, lines, px, minPx, weight, 0, { lineRatio: ratio, maxHeight })
  setFont(ctx, weight, fit.px, 0)
  ctx.fillStyle = fill
  drawLines(ctx, fit.lines, x, y + fit.px * 0.9, fit.px, ratio, align)
  ctx.textAlign = 'left'
  return fit.lines.length * fit.px * ratio
}

/** Five gold stars and the proof line beside them. Returns the height. */
function starsLine(ctx, proof, x, y, maxW, { ink = SLATE, align = 'left', px = 24 } = {}) {
  const t = String(proof || '').trim()
  const starW = px * 1.05
  const starsW = starW * 5
  setFont(ctx, '700', px, 0)
  const textW = t ? Math.min(ctx.measureText(t).width, maxW - starsW - 14) : 0
  const total = starsW + (t ? 14 + textW : 0)
  let sx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x
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

/** The logo flat on a light background, or on a white pill on a dark one. Returns the box drawn, or null. */
function logoAt(ctx, logo, x, y, box, { align = 'left', bottom = false, pill = false } = {}) {
  if (!logo) return null
  if (pill) return drawLogoPill(ctx, logo, x, y, box, { align, bottom })
  const fit = logoFit(logo, box)
  const lx = align === 'right' ? x - fit.w : align === 'center' ? x - fit.w / 2 : x
  const ly = bottom ? y - fit.h : y
  ctx.drawImage(logo, lx, ly, fit.w, fit.h)
  return { x: lx, y: ly, w: fit.w, h: fit.h }
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

// ---------------------------------------------------------------------------
// the templates
// ---------------------------------------------------------------------------

/** 1. Winter shout: the Horizon winter poster. Logo up top, a giant outlined offer, the unit in the snow. */
function winterShout(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, contentBottom, maxWidth } = m
  const { accent, badgeColor, logo } = { ...content, logo: assets?.logo }
  const theme = paintTheme(ctx, w, h, content)
  const dark = theme.ink === 'dark'
  const navy = dark ? badgeColor || SLATE : WHITE
  const outline = dark ? WHITE : badgeColor || SLATE
  let y = contentTop
  const lb = logoAt(ctx, logo, w / 2, y, 170, { align: 'center', pill: !dark })
  if (lb) y += lb.h + 26
  y += shout(ctx, kickerWords(content), w / 2, y, maxWidth, { px: 96, minPx: 48, lines: 1, fill: navy, stroke: outline, strokeW: 10, align: 'center' }) + 4
  const amount = String(content.offerAmount || '').trim()
  if (amount) y += shout(ctx, amount, w / 2, y, maxWidth, { px: 230, minPx: 100, lines: 1, fill: WHITE, stroke: badgeColor || SLATE, strokeW: 16, align: 'center', tracking: 2 })
  y += shout(ctx, content.offerDetail, w / 2, y, maxWidth, { px: 84, minPx: 40, lines: 2, fill: WHITE, stroke: badgeColor || SLATE, strokeW: 10, align: 'center' }) + 10
  // The headline beside the unit, the unit in the drift.
  const cutW = hasCutout(content, assets) ? Math.min(maxWidth * 0.46, 520) : 0
  const textW = maxWidth - (cutW ? cutW + 30 : 0)
  const bottomRoom = contentBottom - y
  y += shout(ctx, content.hook, padX, y, textW, { px: 70, minPx: 36, lines: 4, fill: WHITE, stroke: badgeColor || SLATE, strokeW: 8, maxHeight: bottomRoom * 0.55 }) + 14
  body(ctx, content.subhead, padX, y, textW, { px: 30, minPx: 20, lines: 3, weight: '700', fill: navy, maxHeight: contentBottom - 70 - y })
  if (cutW) drawCutout(ctx, content, assets, { x: w - padX - cutW, y: Math.max(y - 20, contentBottom - cutW * 1.1), w: cutW, h: Math.min(cutW * 1.1, contentBottom - Math.max(y - 20, contentBottom - cutW * 1.1)) })
  starsLine(ctx, content.proof, padX, contentBottom - 30, textW, { ink: navy })
  drawBadge(ctx, content.badge, padX, contentTop, 400, accent)
  return { band: { top: y, bottom: contentBottom } }
}

/** 2. Massive deal: the boiler poster. Two-tone shout, a price that fills the frame, a seal and a star. */
function massiveDeal(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, contentBottom, maxWidth } = m
  const { accent, badgeColor } = content
  const theme = paintTheme(ctx, w, h, content)
  const dark = theme.ink === 'dark'
  const ink = dark ? SLATE : WHITE
  const brand = dark ? badgeColor || SLATE : WHITE
  let y = contentTop
  const badgeH = drawBadge(ctx, content.badge, padX, y, 400, accent)
  if (badgeH) y += badgeH + 16
  y += shout(ctx, kickerWords(content), w / 2, y, maxWidth, { px: 150, minPx: 64, lines: 1, fill: brand, align: 'center', tracking: 6 })
  y += shout(ctx, content.hook, w / 2, y, maxWidth, { px: 118, minPx: 48, lines: 2, fill: ink, align: 'center', tracking: 2 }) + 20
  // Left: the unit. Right: the price.
  const cutOn = hasCutout(content, assets)
  const colW = cutOn ? maxWidth * 0.52 : maxWidth
  const align = cutOn ? 'right' : 'center'
  const ax = cutOn ? w - padX : w / 2
  let py = y
  py += body(ctx, content.subhead, ax, py, colW, { px: 40, minPx: 24, lines: 2, weight: '800', fill: ink, align })
  const amount = String(content.offerAmount || '').trim()
  if (amount) py += shout(ctx, amount, ax, py, colW, { px: 240, minPx: 90, lines: 1, fill: accent, stroke: WHITE, strokeW: 14, align, tracking: 2 })
  py += shout(ctx, content.offerDetail, ax, py, colW, { px: 70, minPx: 36, lines: 2, fill: brand, align })
  const st = stickerWords(content)
  // The logo and the stars take the last 170px; the stickers fit above them
  // or shrink, and go without when the frame has no room (a Reels-safe Story).
  const stickerRoom = contentBottom - 170 - py
  if (st && stickerRoom > 140) {
    const rad = Math.min(130, colW * 0.25, (stickerRoom - 40) / 2)
    seal(ctx, ax - (cutOn ? rad : -rad * 1.2) - (cutOn ? 10 : 0), py + rad + 20, rad, st, { fill: brand, ink: dark ? WHITE : badgeColor || SLATE, ring: WHITE })
    starburst(ctx, ax - (cutOn ? rad * 3.2 : -rad * 3.4), py + rad + 40, rad * 0.95, 'SALE', { fill: GOLD, ink: SLATE })
    py += rad * 2 + 40
  }
  if (cutOn) {
    const cx = padX
    const cw = maxWidth - colW - 30
    const ch = Math.min(contentBottom - 200 - y, cw * 1.35)
    drawCutout(ctx, content, assets, { x: cx, y: Math.max(y, contentBottom - 200 - ch), w: cw, h: ch })
  }
  // Bottom: the logo big, then stars and proof.
  const lb = logoAt(ctx, assets?.logo, w / 2, contentBottom - 60, 260, { align: 'center', bottom: true, pill: !dark })
  starsLine(ctx, content.proof, w / 2, contentBottom - 28, maxWidth, { ink, align: 'center' })
  return { band: { top: py, bottom: lb ? lb.y : contentBottom } }
}

/** 3. Stay warm: photo on the right under a diagonal, headline stack on the left, a band of offers. */
function stayWarm(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, contentBottom, maxWidth } = m
  const { accent, badgeColor, focus } = content
  const tall = h / w >= 1.6
  const bandH = r(Math.min(h * 0.22, 300))
  const bandTop = contentBottom - bandH + 20
  // The photo: the right half (the top half on a Story), the diagonal in the accent colour over its edge.
  ctx.fillStyle = '#F8FAFC'
  ctx.fillRect(0, 0, w, h)
  const photoRect = tall ? { x: 0, y: 0, w, h: h * 0.42 } : { x: w * 0.48, y: 0, w: w * 0.52, h: bandTop }
  if (assets?.background) drawCoverIn(ctx, assets.background, photoRect, focus)
  else {
    paintTheme(ctx, w, h, content)
    ctx.fillStyle = 'rgba(255,255,255,0.86)'
    if (tall) ctx.fillRect(0, photoRect.h, w, h - photoRect.h)
    else ctx.fillRect(0, 0, photoRect.x, h)
  }
  ctx.fillStyle = accent
  ctx.beginPath()
  if (tall) {
    ctx.moveTo(0, photoRect.h + 70)
    ctx.lineTo(w, photoRect.h - 40)
    ctx.lineTo(w, photoRect.h + 10)
    ctx.lineTo(0, photoRect.h + 120)
  } else {
    ctx.moveTo(photoRect.x - 90, 0)
    ctx.lineTo(photoRect.x + 30, 0)
    ctx.lineTo(photoRect.x - 60, bandTop)
    ctx.lineTo(photoRect.x - 180, bandTop)
  }
  ctx.closePath()
  ctx.fill()
  // The stack.
  let y = tall ? photoRect.h + 140 : contentTop
  const textW = tall ? maxWidth : photoRect.x - 110 - padX
  const badgeH = drawBadge(ctx, content.badge, padX, y, textW, badgeColor)
  if (badgeH) y += badgeH + 20
  y += shout(ctx, kickerWords(content), padX, y, textW, { px: 120, minPx: 48, lines: 2, fill: accent })
  y += shout(ctx, content.hook, padX, y, textW, { px: 110, minPx: 44, lines: 4, fill: SLATE, maxHeight: (bandTop - y) * 0.5 }) + 12
  y += body(ctx, content.subhead, padX, y, textW, { px: 34, minPx: 22, lines: 4, weight: '600', fill: '#334155' })
  // The sticker at the foot of the column when there is room for it.
  const st = stickerWords(content)
  if (st) {
    const rad = Math.min(130, textW * 0.42)
    if (bandTop - 40 - y > rad * 2 + 20) starburst(ctx, padX + rad + 6, bandTop - 40 - rad, rad, st, { fill: GOLD, ink: SLATE })
  }
  // The band of offers.
  ctx.fillStyle = badgeColor || SLATE
  ctx.fillRect(0, bandTop, w, h - bandTop)
  const offers = offersFor(content)
  const inner = { x: padX, y: bandTop + 22, w: maxWidth, h: bandH - 44 - 30 }
  tiles(ctx, offers, inner, { fill: 'rgba(255,255,255,0.08)', ink: WHITE, amountInk: WHITE, columns: Math.min(4, Math.max(1, offers.length)), gap: 10, radius: 8 })
  // Logo pill and the stars under the band's top edge.
  const lb = logoAt(ctx, assets?.logo, padX, inner.y + inner.h + 10, 72, { pill: true })
  starsLine(ctx, content.proof, w - padX, inner.y + inner.h + 10 + (lb ? lb.h / 2 - 12 : 0), maxWidth - (lb ? lb.w + 30 : 0), { ink: WHITE, align: 'right', px: 20 })
  return { band: { top: y, bottom: bandTop } }
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
  let y = contentTop + 30
  y += script(ctx, kickerWords(content), w / 2, y, maxWidth, { px: 96, minPx: 48, fill: SLATE, align: 'center' }) - 10
  y += shout(ctx, content.hook, w / 2, y, maxWidth, { px: 124, minPx: 52, lines: 2, fill: badgeColor || '#0369A1', align: 'center', tracking: 3 }) + 20
  const offers = offersFor(content)
  const cutOn = hasCutout(content, assets)
  const gridW = cutOn ? maxWidth * 0.52 : maxWidth
  const gridH = Math.max(160, Math.min(contentBottom - y - 270, offers.length > 2 ? 560 : offers.length === 2 ? 400 : 300))
  tiles(ctx, offers, { x: padX, y, w: gridW, h: gridH }, { fill: '#FFFFFF', ink: badgeColor || '#0369A1', amountInk: accent, columns: 2, gap: 16, radius: 6, border: accent })
  if (cutOn) drawCutout(ctx, content, assets, { x: padX + gridW + 24, y: y - 10, w: maxWidth - gridW - 24, h: gridH + 40 })
  y += gridH + 26
  y += body(ctx, content.subhead, padX, y, maxWidth, { px: 30, minPx: 18, lines: 2, weight: '600', fill: '#334155', maxHeight: contentBottom - 130 - y })
  const st = stickerWords(content)
  if (st) {
    const room = contentBottom - 130 - y
    const rad = Math.min(150, room / 2 - 10)
    if (rad > 70) starburst(ctx, w / 2, y + room / 2, rad, st, { fill: GOLD, ink: SLATE })
  }
  const lb = logoAt(ctx, assets?.logo, padX, contentBottom - 70, 200, { bottom: true })
  starsLine(ctx, content.proof, w - padX, contentBottom - 110, maxWidth - (lb ? lb.w + 30 : 0), { ink: SLATE, align: 'right', px: 30 })
  drawBadge(ctx, content.badge, padX, contentTop - 10 + 60, 380, badgeColor)
  return { band: { top: y, bottom: contentBottom - 80 } }
}

/** 5. Fall special: leaves, a script "Fall", two stacked offers with OR between, a seal, the van or unit. */
function fallSpecial(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, contentBottom, maxWidth } = m
  const { accent, badgeColor } = content
  const theme = paintTheme(ctx, w, h, content)
  const ink = theme.ink === 'dark' ? SLATE : WHITE
  const bandH = 150
  const bandTop = band(ctx, w, h, bandH + (h - contentBottom), 'rgba(2,6,23,0.82)')
  let y = contentTop
  const kw = kickerWords(content)
  const words = kw.split(/\s+/)
  const first = words[0]
  const rest = words.slice(1).join(' ')
  y += script(ctx, first, padX, y, maxWidth * 0.5, { px: 150, minPx: 60, fill: ink }) - 20
  if (rest) y += shout(ctx, rest, padX, y, maxWidth * 0.5, { px: 70, minPx: 36, lines: 1, fill: GOLD, tracking: 6 })
  y += shout(ctx, content.hook, padX, y + 14, maxWidth * 0.46, { px: 60, minPx: 30, lines: 4, fill: WHITE, maxHeight: 300 }) + 14
  // Offers on the right, stacked, "OR" between.
  const offers = offersFor(content)
  const colW = maxWidth * 0.56
  const colX = w - padX
  let oy = contentTop
  offers.slice(0, 2).forEach((o, i) => {
    if (i > 0) {
      oy += shout(ctx, 'OR', colX, oy, colW, { px: 60, minPx: 30, lines: 1, fill: GOLD, align: 'right', tracking: 8 })
    }
    if (o.amount) oy += shout(ctx, o.amount, colX, oy, colW, { px: 150, minPx: 70, lines: 1, fill: WHITE, stroke: 'rgba(2,6,23,0.5)', strokeW: 8, align: 'right', tracking: 2 }) - 6
    if (o.detail) oy += shout(ctx, o.detail, colX, oy, colW, { px: 56, minPx: 28, lines: 2, fill: ink, align: 'right' }) + 10
  })
  oy += body(ctx, content.subhead, colX, oy, colW, { px: 24, minPx: 16, lines: 3, weight: '600', fill: 'rgba(255,255,255,0.9)', align: 'right' })
  // The seal, then the unit bottom-left.
  const st = stickerWords(content)
  if (st) {
    const sealR = Math.min(110, (bandTop - 20 - oy - 20) / 2)
    if (sealR >= 55) seal(ctx, w - padX - sealR, Math.min(bandTop - sealR - 20, Math.max(oy + sealR + 20, h * 0.6)), sealR, st, { fill: accent, ink: WHITE })
  }
  if (hasCutout(content, assets)) {
    const cw = Math.min(maxWidth * 0.5, 520)
    const top = Math.max(y + 10, bandTop - cw * 1.05)
    drawCutout(ctx, content, assets, { x: padX, y: top, w: cw, h: bandTop - top - 10 })
  }
  // The band: logo and stars.
  const lb = logoAt(ctx, assets?.logo, padX, bandTop + bandH / 2 - 50, 100, { pill: true })
  starsLine(ctx, content.proof, w - padX, bandTop + bandH / 2 - 14, maxWidth - (lb ? lb.w + 30 : 0), { ink: WHITE, align: 'right' })
  drawBadge(ctx, content.badge, padX, bandTop - 70, 400, badgeColor)
  return { band: { top: oy, bottom: bandTop } }
}

/** 6. Season sale: sun, snow, leaves or fresh behind a big SALE, the offer, the unit, a starburst. */
function seasonSale(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, contentBottom, maxWidth } = m
  const { accent, badgeColor } = content
  const theme = paintTheme(ctx, w, h, content)
  const dark = theme.ink === 'dark'
  const ink = dark ? SLATE : WHITE
  const brand = dark ? badgeColor || SLATE : WHITE
  let y = contentTop
  const badgeH = drawBadge(ctx, content.badge, padX, y, maxWidth, badgeColor)
  if (badgeH) y += badgeH + 18
  const kw = kickerWords(content)
  const parts = kw.split(/\s+/)
  const last = parts[parts.length - 1]
  const head = parts.slice(0, -1).join(' ')
  if (head) y += script(ctx, head, padX, y, maxWidth, { px: 110, minPx: 50, fill: dark ? accent : GOLD, stroke: dark ? '' : 'rgba(2,6,23,0.35)', strokeW: 6 }) - 16
  y += shout(ctx, last, padX, y, maxWidth, { px: 210, minPx: 90, lines: 1, fill: brand, stroke: dark ? WHITE : 'rgba(2,6,23,0.4)', strokeW: 12, tracking: 8 })
  const cutOn = hasCutout(content, assets)
  const cutW = cutOn ? Math.min(maxWidth * 0.42, 460) : 0
  const textW = maxWidth - (cutW ? cutW + 24 : 0)
  y += shout(ctx, content.hook, padX, y, textW, { px: 76, minPx: 36, lines: 3, fill: ink, maxHeight: (contentBottom - y) * 0.4 }) + 10
  const amount = String(content.offerAmount || '').trim()
  if (amount) y += shout(ctx, amount, padX, y, textW, { px: 170, minPx: 70, lines: 1, fill: accent, stroke: WHITE, strokeW: 12, tracking: 2 })
  y += shout(ctx, content.offerDetail, padX, y, textW, { px: 56, minPx: 28, lines: 2, fill: ink }) + 10
  y += body(ctx, content.subhead, padX, y, textW, { px: 28, minPx: 18, lines: 3, weight: '600', fill: ink, maxHeight: contentBottom - 70 - y })
  if (cutW) drawCutout(ctx, content, assets, { x: w - padX - cutW, y: Math.max(contentTop + 120, contentBottom - 90 - cutW * 1.1), w: cutW, h: Math.min(cutW * 1.1, contentBottom - 90 - Math.max(contentTop + 120, contentBottom - 90 - cutW * 1.1)) })
  const st = stickerWords(content)
  if (st) starburst(ctx, w - padX - 120, contentTop + 160, 118, st, { fill: GOLD, ink: SLATE })
  const lb = logoAt(ctx, assets?.logo, w - padX, contentBottom, 130, { align: 'right', bottom: true, pill: !dark })
  starsLine(ctx, content.proof, padX, contentBottom - 30, maxWidth - (lb ? lb.w + 30 : 0), { ink })
  return { band: { top: y, bottom: contentBottom - 60 } }
}

/** 7. Poster: the Horizon winter post. White, condensed capitals stacked and alternating colours, logo and stars, the unit. */
function poster(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, contentBottom, maxWidth } = m
  const { accent, badgeColor } = content
  paintTheme(ctx, w, h, content)
  const navy = badgeColor || '#1E3A8A'
  let y = contentTop
  y += shout(ctx, kickerWords(content), w / 2, y, maxWidth, { px: 150, minPx: 60, lines: 2, fill: navy, align: 'center', tracking: 3 })
  y += shout(ctx, content.hook, w / 2, y, maxWidth, { px: 120, minPx: 52, lines: 2, fill: accent, align: 'center', tracking: 3, maxHeight: (contentBottom - y) * 0.35 })
  y += shout(ctx, content.subhead, w / 2, y, maxWidth, { px: 70, minPx: 32, lines: 3, fill: navy, align: 'center', tracking: 1, maxHeight: (contentBottom - y) * 0.35 }) + 20
  // Below: logo left, stars and the offer right; the unit bottom-left.
  const cutOn = hasCutout(content, assets)
  const lb = logoAt(ctx, assets?.logo, padX, y, 220)
  const rightX = w - padX
  const rightW = maxWidth - (lb ? lb.w + 40 : 0)
  starsLine(ctx, content.proof, rightX, y + 10, rightW, { ink: navy, align: 'right', px: 28 })
  let oy = y + 70
  const amount = String(content.offerAmount || '').trim()
  if (amount) oy += shout(ctx, amount, rightX, oy, rightW * (cutOn ? 0.9 : 1), { px: 120, minPx: 50, lines: 1, fill: accent, align: 'right' })
  oy += shout(ctx, content.offerDetail, rightX, oy, rightW * (cutOn ? 0.9 : 1), { px: 64, minPx: 30, lines: 2, fill: navy, align: 'right' })
  if (cutOn) {
    const cw = Math.min(maxWidth * 0.45, 480)
    const top = Math.max((lb ? lb.y + lb.h + 20 : y + 20), contentBottom - cw * 1.1)
    drawCutout(ctx, content, assets, { x: padX, y: top, w: cw, h: contentBottom - top })
  }
  drawBadge(ctx, content.badge, padX, contentTop - 44, 400, accent)
  return { band: { top: oy, bottom: contentBottom } }
}

/** 8. Same-day: dark, urgent, a 24/7 seal, the headline huge. */
function emergency(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, contentBottom, maxWidth } = m
  const { accent, badgeColor } = content
  paintTheme(ctx, w, h, content)
  let y = contentTop
  const badgeH = drawBadge(ctx, content.badge, padX, y, maxWidth - 260, badgeColor)
  const st = stickerWords(content) || '24/7'
  seal(ctx, w - padX - 110, contentTop + 110, 110, st, { fill: accent, ink: WHITE, ring: WHITE })
  y += Math.max(badgeH + 26, 0)
  y += shout(ctx, kickerWords(content), padX, y, maxWidth - 260, { px: 90, minPx: 40, lines: 1, fill: accent, tracking: 4 })
  y = Math.max(y + 10, contentTop + 240)
  const cutOn = hasCutout(content, assets)
  const cutW = cutOn ? Math.min(maxWidth * 0.4, 420) : 0
  y += shout(ctx, content.hook, padX, y, maxWidth, { px: 170, minPx: 60, lines: 3, fill: WHITE, tracking: 2, maxHeight: (contentBottom - y) * 0.5 }) + 16
  const cutTop = y
  y += body(ctx, content.subhead, padX, y, maxWidth - (cutW ? cutW + 20 : 0), { px: 34, minPx: 22, lines: 3, weight: '600', fill: 'rgba(255,255,255,0.85)', maxHeight: contentBottom - 200 - y }) + 24
  if (cutW) drawCutout(ctx, content, assets, { x: w - padX - cutW, y: cutTop, w: cutW, h: contentBottom - 150 - cutTop })
  const amount = String(content.offerAmount || '').trim()
  if (amount || content.offerDetail) {
    const pillH = 110
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
  const lb = logoAt(ctx, assets?.logo, w - padX, contentBottom, 130, { align: 'right', bottom: true, pill: true })
  starsLine(ctx, content.proof, padX, contentBottom - 30, maxWidth - (lb ? lb.w + 30 : 0), { ink: WHITE })
  return { band: { top: y, bottom: contentBottom - 60 } }
}

/** 9. Financing: $0 down, monthly payments, two price tiles, the unit. */
function financing(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, contentBottom, maxWidth } = m
  const { accent, badgeColor } = content
  const theme = paintTheme(ctx, w, h, content)
  const dark = theme.ink === 'dark'
  const ink = dark ? SLATE : WHITE
  let y = contentTop
  const badgeH = drawBadge(ctx, content.badge, padX, y, maxWidth, dark ? badgeColor : accent)
  if (badgeH) y += badgeH + 20
  y += shout(ctx, kickerWords(content), padX, y, maxWidth, { px: 80, minPx: 40, lines: 1, fill: accent, tracking: 4 })
  const cutOn = hasCutout(content, assets)
  const cutW = cutOn ? Math.min(maxWidth * 0.4, 440) : 0
  const textW = maxWidth - (cutW ? cutW + 24 : 0)
  const amount = String(content.offerAmount || '').trim()
  if (amount) y += shout(ctx, amount, padX, y, textW, { px: 250, minPx: 100, lines: 1, fill: WHITE, stroke: dark ? badgeColor || SLATE : 'rgba(2,6,23,0.35)', strokeW: 14, tracking: 2 })
  y += shout(ctx, content.offerDetail, padX, y, textW, { px: 70, minPx: 32, lines: 2, fill: ink }) + 10
  y += shout(ctx, content.hook, padX, y, textW, { px: 60, minPx: 30, lines: 3, fill: ink, maxHeight: (contentBottom - y) * 0.3 }) + 10
  y += body(ctx, content.subhead, padX, y, textW, { px: 28, minPx: 18, lines: 2, weight: '600', fill: ink, maxHeight: contentBottom - 90 - y }) + 20
  if (cutW) drawCutout(ctx, content, assets, { x: w - padX - cutW, y: contentTop + 60, w: cutW, h: Math.min(cutW * 1.3, h * 0.5) })
  const st = stickerWords(content) || 'Monthly payments available'
  seal(ctx, w - padX - 120, Math.min(contentBottom - 140, Math.max(y + 100, h * 0.62)), 120, st, { fill: accent, ink: WHITE })
  const offers = offersFor(content).filter((o) => o.amount !== amount || o.detail !== String(content.offerDetail || '').trim())
  if (offers.length) {
    const gh = Math.min(offers.length > 2 ? 420 : 240, contentBottom - 110 - y)
    if (gh > 90) tiles(ctx, offers, { x: padX, y, w: maxWidth - 280, h: gh }, { fill: 'rgba(255,255,255,0.12)', ink: WHITE, amountInk: WHITE, columns: 2, gap: 12, radius: 10, border: 'rgba(255,255,255,0.3)' })
    y += gh + 20
  }
  const lb = logoAt(ctx, assets?.logo, padX, contentBottom, 120, { bottom: true, pill: true })
  starsLine(ctx, content.proof, w - padX, contentBottom - 30, maxWidth - (lb ? lb.w + 30 : 0), { ink, align: 'right' })
  return { band: { top: y, bottom: contentBottom - 60 } }
}

/** 10. Coupon: a dashed coupon with the offer inside, the fine print, the logo. */
function coupon(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, contentBottom, maxWidth } = m
  const { accent, badgeColor } = content
  const theme = paintTheme(ctx, w, h, content)
  const dark = theme.ink === 'dark'
  const ink = dark ? SLATE : WHITE
  let y = contentTop
  const lb = logoAt(ctx, assets?.logo, padX, y, 150, { pill: !dark })
  const badgeH = drawBadge(ctx, content.badge, w - padX - 380, y, 380, badgeColor)
  y += Math.max(lb ? lb.h : 0, badgeH) + 26
  y += shout(ctx, kickerWords(content), padX, y, maxWidth, { px: 70, minPx: 36, lines: 1, fill: accent, tracking: 4 }) + 10
  // The coupon box, sized to what goes in it: measured first, drawn after.
  const innerW = maxWidth - 100
  const amount = String(content.offerAmount || '').trim()
  const roomH = Math.min(h * 0.46, contentBottom - y - 160)
  const aFit = amount ? fitText(ctx, amount.toUpperCase(), innerW, 1, 220, 90, '400', 2, { lineRatio: 0.98, maxHeight: roomH * 0.5, face: CONDENSED }) : null
  const dFit = content.offerDetail ? fitText(ctx, String(content.offerDetail).toUpperCase(), innerW, 2, 64, 30, '400', 1, { lineRatio: 0.98, maxHeight: roomH * 0.3, face: CONDENSED }) : null
  const sFit = content.subhead ? fitText(ctx, typographic(content.subhead), innerW, 2, 24, 16, '600', 0, { lineRatio: 1.3 }) : null
  const need = 100 + (aFit ? aFit.px * 1.08 : 0) + (dFit ? dFit.lines.length * dFit.px * 0.98 + dFit.px * 0.1 + 10 : 0) + (sFit ? sFit.lines.length * sFit.px * 1.3 : 0)
  const boxH = Math.max(220, Math.min(roomH, need))
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
  // Scissors mark on the dashed line.
  setFont(ctx, '700', 40, 0)
  ctx.fillStyle = badgeColor || SLATE
  ctx.fillText('✂', padX + 40, y + 28)
  let cy = y + 50
  if (amount) cy += shout(ctx, amount, w / 2, cy, innerW, { px: 220, minPx: 90, lines: 1, fill: accent, align: 'center', tracking: 2, maxHeight: boxH * 0.5 })
  cy += shout(ctx, content.offerDetail, w / 2, cy, innerW, { px: 64, minPx: 30, lines: 2, fill: badgeColor || SLATE, align: 'center', maxHeight: boxH * 0.3 }) + 10
  body(ctx, content.subhead, w / 2, cy, innerW, { px: 24, minPx: 16, lines: 2, weight: '600', fill: '#475569', align: 'center' })
  y += boxH + 24
  // The headline under the coupon, the unit beside it.
  const cutOn = hasCutout(content, assets)
  const cutW = cutOn ? Math.min(maxWidth * 0.42, 440) : 0
  const cutTop = y - 10
  y += shout(ctx, content.hook, padX, y, maxWidth - (cutW ? cutW + 20 : 0), { px: 84, minPx: 30, lines: 4, fill: ink, maxHeight: contentBottom - y - 60 })
  if (cutW) drawCutout(ctx, content, assets, { x: w - padX - cutW, y: cutTop, w: cutW, h: contentBottom - 50 - cutTop })
  starsLine(ctx, content.proof, padX, contentBottom - 30, maxWidth - cutW - 20, { ink })
  return { band: { top: y, bottom: contentBottom - 60 } }
}

/** 11. Big number: the amount fills the width and that is the ad. */
function bigNumber(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, contentBottom, maxWidth } = m
  const { accent, badgeColor } = content
  const theme = paintTheme(ctx, w, h, content)
  const dark = theme.ink === 'dark'
  const ink = dark ? SLATE : WHITE
  let y = contentTop
  const badgeH = drawBadge(ctx, content.badge, padX, y, maxWidth, dark ? badgeColor : accent)
  if (badgeH) y += badgeH + 20
  const st = stickerWords(content)
  const topW = maxWidth - (st ? 250 : 0)
  y += shout(ctx, kickerWords(content), padX, y, topW, { px: 70, minPx: 36, lines: 1, fill: accent, tracking: 4 })
  y += shout(ctx, content.hook, padX, y, topW, { px: 80, minPx: 36, lines: 3, fill: ink, maxHeight: (contentBottom - y) * 0.25 }) + 10
  const amount = String(content.offerAmount || '').trim()
  if (amount) y += shout(ctx, amount, padX, y, maxWidth, { px: 420, minPx: 120, lines: 1, fill: accent, stroke: WHITE, strokeW: 16, tracking: -4, maxHeight: (contentBottom - y) * 0.55 })
  const cutOn = hasCutout(content, assets)
  const cutW = cutOn ? Math.min(maxWidth * 0.38, 400) : 0
  const cutTop = y
  y += shout(ctx, content.offerDetail, padX, y, maxWidth - (cutW ? cutW + 20 : 0), { px: 90, minPx: 36, lines: 2, fill: ink, tracking: 3 }) + 14
  y += body(ctx, content.subhead, padX, y, maxWidth - (cutW ? cutW + 20 : 0), { px: 32, minPx: 20, lines: 3, weight: '600', fill: ink, maxHeight: contentBottom - 70 - y })
  if (st) starburst(ctx, w - padX - 110, contentTop + (badgeH ? badgeH + 140 : 110), 108, st, { fill: GOLD, ink: SLATE })
  if (cutW) drawCutout(ctx, content, assets, { x: w - padX - cutW, y: cutTop, w: cutW, h: contentBottom - 150 - cutTop })
  const lb = logoAt(ctx, assets?.logo, w - padX, contentBottom, 130, { align: 'right', bottom: true, pill: !dark })
  starsLine(ctx, content.proof, padX, contentBottom - 30, maxWidth - (lb ? lb.w + 30 : 0), { ink })
  return { band: { top: y, bottom: contentBottom - 60 } }
}

/** 12. Photo sale: the photo full-bleed, a SALE ribbon in the corner, the offers on a band below. */
function photoSale(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, contentBottom, maxWidth } = m
  const { accent, badgeColor, focus } = content
  const bandH = r(Math.min(h * 0.34, 420))
  const bandTop = contentBottom - bandH + 40
  if (assets?.background) drawCoverIn(ctx, assets.background, { x: 0, y: 0, w, h: bandTop + 30 }, focus)
  else {
    paintTheme(ctx, w, h, content)
  }
  // A lift at the top for the badge and the kicker.
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.4)
  g.addColorStop(0, 'rgba(2,6,23,0.55)')
  g.addColorStop(1, 'rgba(2,6,23,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h * 0.4)
  let y = contentTop
  const badgeH = drawBadge(ctx, content.badge, padX, y, maxWidth - 300, badgeColor)
  if (badgeH) y += badgeH + 18
  ribbon(ctx, w, stickerWords(content) || 'SALE', { fill: accent, ink: WHITE, size: 360 })
  y += shout(ctx, kickerWords(content), padX, y, maxWidth - 260, { px: 90, minPx: 40, lines: 1, fill: WHITE, stroke: 'rgba(2,6,23,0.6)', strokeW: 8, tracking: 3 })
  shout(ctx, content.hook, padX, y, maxWidth - 60, { px: 84, minPx: 36, lines: 3, fill: WHITE, stroke: 'rgba(2,6,23,0.6)', strokeW: 8, maxHeight: (bandTop - y) * 0.6 })
  // The band.
  ctx.fillStyle = badgeColor || SLATE
  roundRect(ctx, 0, bandTop, w, h - bandTop + 40, 36)
  ctx.fill()
  const offers = offersFor(content)
  const inner = { x: padX, y: bandTop + 30, w: maxWidth, h: Math.min(170, bandH * 0.5) }
  if (offers.length) tiles(ctx, offers, inner, { fill: accent, ink: WHITE, amountInk: WHITE, columns: Math.min(offers.length, 3), gap: 12, radius: 12 })
  let by = inner.y + (offers.length ? inner.h + 18 : 0)
  by += body(ctx, content.subhead, padX, by, maxWidth, { px: 28, minPx: 18, lines: 2, weight: '600', fill: 'rgba(255,255,255,0.9)' })
  const lb = logoAt(ctx, assets?.logo, w - padX, contentBottom, 110, { align: 'right', bottom: true, pill: true })
  starsLine(ctx, content.proof, padX, contentBottom - 28, maxWidth - (lb ? lb.w + 30 : 0), { ink: WHITE, px: 22 })
  return { band: { top: y, bottom: bandTop } }
}

/** 13. Holiday: red and green, snow, a gift-tag offer. */
function holidayDeals(ctx, size, content, assets, opts) {
  return seasonSale(ctx, size, { ...content, theme: themeFor(content), kicker: content.kicker || 'Holiday Deals' }, assets, opts)
}

/** 14. Tune-up: a fresh green spring board with the service price in a starburst. */
function tuneUp(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, contentBottom, maxWidth } = m
  const { accent, badgeColor } = content
  const theme = paintTheme(ctx, w, h, content)
  const dark = theme.ink === 'dark'
  const ink = dark ? SLATE : WHITE
  let y = contentTop
  const badgeH = drawBadge(ctx, content.badge, padX, y, maxWidth, dark ? badgeColor : accent)
  if (badgeH) y += badgeH + 18
  y += shout(ctx, kickerWords(content), padX, y, maxWidth * 0.62, { px: 96, minPx: 44, lines: 2, fill: ink, tracking: 3 })
  const amount = String(content.offerAmount || '').trim()
  const rad = Math.min(170, maxWidth * 0.19)
  const sx = w - padX - rad
  const sy = contentTop + rad + (badgeH ? 30 : 10)
  if (amount) starburst(ctx, sx, sy, rad, amount, { fill: GOLD, ink: SLATE, points: 16 })
  y = Math.max(y, sy + rad - 40)
  y += shout(ctx, content.offerDetail, padX, y, maxWidth, { px: 76, minPx: 36, lines: 2, fill: dark ? accent : GOLD, stroke: dark ? '' : 'rgba(2,6,23,0.3)', strokeW: 6 }) + 10
  const cutOn = hasCutout(content, assets)
  const cutW = cutOn ? Math.min(maxWidth * 0.38, 400) : 0
  const textW = maxWidth - (cutW ? cutW + 24 : 0)
  y += shout(ctx, content.hook, padX, y, textW, { px: 64, minPx: 32, lines: 3, fill: ink, maxHeight: (contentBottom - y) * 0.45 }) + 10
  y += body(ctx, content.subhead, padX, y, textW, { px: 28, minPx: 18, lines: 3, weight: '600', fill: ink, maxHeight: contentBottom - 90 - y })
  if (cutW) drawCutout(ctx, content, assets, { x: w - padX - cutW, y: Math.max(sy + rad + 20, contentBottom - 80 - cutW * 1.1), w: cutW, h: Math.min(cutW * 1.1, contentBottom - 80 - Math.max(sy + rad + 20, contentBottom - 80 - cutW * 1.1)) })
  const lb = logoAt(ctx, assets?.logo, padX, contentBottom, 120, { bottom: true, pill: true })
  starsLine(ctx, content.proof, w - padX, contentBottom - 30, maxWidth - (lb ? lb.w + 30 : 0), { ink, align: 'right' })
  return { band: { top: y, bottom: contentBottom - 60 } }
}

export const TEMPLATES = {
  winter_shout: winterShout,
  massive_deal: massiveDeal,
  stay_warm: stayWarm,
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
  const out = fn(ctx, size, content, assets, opts)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.letterSpacing = '0px'
  ctx.setLineDash([])
  return out
}
