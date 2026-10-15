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
import { SLATE, drawBadge, drawCoverIn, frameMargins } from './adLooks'
import { logoFor } from './logoCutout'
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
  if (!t) return 0
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
      if (fit) ctx.drawImage(img, (x0 + x1) / 2 - fit.w / 2, floor - starsH - (starsH ? 14 : 0) - fit.h, fit.w, fit.h)
      if (starsH) starsLine(ctx, proof, (x0 + x1) / 2, floor - starsH, width, { ink, align: 'center', px: starsPx })
      return
    }
    if (fit) ctx.drawImage(img, logo === 'right' ? x1 - fit.w : x0, floor - fit.h, fit.w, fit.h)
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
  const badgeH = drawBadge(ctx, content.badge, padX, y, 400, accent)
  if (badgeH) y += badgeH + 14
  y += shout(ctx, kickerWords(content), w / 2, y, maxWidth, { px: 96, minPx: 48, lines: 1, fill: navy, stroke: outline, strokeW: 10, align: 'center', maxHeight: (B - y) * 0.2 }) + 4
  const amount = amountWords(content)
  if (amount) y += shout(ctx, amount, w / 2, y, maxWidth, { px: 230, minPx: 100, lines: 1, fill: WHITE, stroke: brand, strokeW: 16, align: 'center', tracking: 2, maxHeight: (B - y) * 0.4 })
  y += shout(ctx, content.offerDetail, w / 2, y, maxWidth, { px: 84, minPx: 40, lines: 2, fill: WHITE, stroke: brand, strokeW: 10, align: 'center', maxHeight: (B - y) * 0.35 }) + 10
  // The unit stands beside the headline column, from under the offer down.
  const cutTop = y
  y += shout(ctx, content.hook, padX, y, textW, { px: 70, minPx: 36, lines: 4, fill: WHITE, stroke: brand, strokeW: 8, maxHeight: (B - y) * 0.6 }) + 14
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
  const badgeH = drawBadge(ctx, content.badge, padX, y, 400, accent)
  if (badgeH) y += badgeH + 16
  y += shout(ctx, kickerWords(content), w / 2, y, maxWidth, { px: 150, minPx: 64, lines: 1, fill: brand, align: 'center', tracking: 6, maxHeight: (B - y) * 0.25 })
  y += shout(ctx, content.hook, w / 2, y, maxWidth, { px: 118, minPx: 48, lines: 2, fill: ink, align: 'center', tracking: 2, maxHeight: (B - y) * 0.3 }) + 20
  // Left: the unit. Right: the price.
  const cutOn = hasCutout(content, assets)
  const colW = cutOn ? maxWidth * 0.52 : maxWidth
  const align = cutOn ? 'right' : 'center'
  const ax = cutOn ? w - padX : w / 2
  let py = y
  py += body(ctx, content.subhead, ax, py, colW, { px: 40, minPx: 24, lines: 2, weight: '800', fill: ink, align, maxHeight: (B - py) * 0.25 })
  const amount = amountWords(content)
  if (amount) py += shout(ctx, amount, ax, py, colW, { px: 240, minPx: 90, lines: 1, fill: accent, stroke: WHITE, strokeW: 14, align, tracking: 2, maxHeight: (B - py) * 0.5 })
  py += shout(ctx, content.offerDetail, ax, py, colW, { px: 70, minPx: 36, lines: 2, fill: brand, align, maxHeight: (B - py) * 0.5 })
  const st = stickerWords(content)
  const stickerRoom = B - py
  if (st && stickerRoom > 150) {
    const rad = Math.min(130, colW * 0.25, (stickerRoom - 40) / 2)
    seal(ctx, ax - (cutOn ? rad : -rad * 1.2) - (cutOn ? 10 : 0), py + rad + 20, rad, st, { fill: brand, ink: onDark ? badgeColor || SLATE : WHITE, ring: WHITE })
    starburst(ctx, ax - (cutOn ? rad * 3.2 : -rad * 3.4), py + rad + 40, rad * 0.95, 'SALE', { fill: GOLD, ink: SLATE })
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

/** 3. Stay warm: photo on the right under a diagonal, headline stack on the left, a band of offers. */
function stayWarm(ctx, size, content, assets, opts) {
  const m = frameMargins(size, opts.safeMode)
  const { w, h, padX, contentTop, contentBottom, maxWidth } = m
  const { accent, badgeColor, focus } = content
  const tall = h / w >= 1.6
  const bandH = r(Math.min(h * 0.24, 320))
  const bandTop = contentBottom - bandH + 20
  const bandFill = badgeColor || SLATE
  const onBandDark = readableTextOn(bandFill) === WHITE
  const bandInk = onBandDark ? WHITE : SLATE
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
  const colB = bandTop - 30
  const badgeH = drawBadge(ctx, content.badge, padX, y, textW, badgeColor)
  if (badgeH) y += badgeH + 20
  y += shout(ctx, kickerWords(content), padX, y, textW, { px: 120, minPx: 48, lines: 2, fill: accent, maxHeight: (colB - y) * 0.3 })
  y += shout(ctx, content.hook, padX, y, textW, { px: 110, minPx: 44, lines: 4, fill: SLATE, maxHeight: (colB - y) * 0.5 }) + 12
  y += body(ctx, content.subhead, padX, y, textW, { px: 34, minPx: 22, lines: 4, weight: '600', fill: '#334155', maxHeight: (colB - y) * 0.6 })
  // The sticker at the foot of the column when there is room for it.
  const st = stickerWords(content)
  if (st) {
    const rad = Math.min(130, textW * 0.42)
    if (colB - y > rad * 2 + 20) starburst(ctx, padX + rad + 6, colB - rad, rad, st, { fill: GOLD, ink: SLATE })
  }
  // The band of offers, the logo and the stars in its last row.
  ctx.fillStyle = bandFill
  ctx.fillRect(0, bandTop, w, h - bandTop)
  const foot = footer(ctx, m, content, assets, { onDark: onBandDark, ink: bandInk, logo: 'left', maxW: 220, maxH: 56, starsPx: 20, bottom: contentBottom - 8 })
  const offers = offersFor(content)
  const inner = { x: padX, y: bandTop + 22, w: maxWidth, h: foot.top - 16 - (bandTop + 22) }
  if (inner.h > 70) tiles(ctx, offers, inner, { fill: 'rgba(255,255,255,0.1)', ink: bandInk, amountInk: bandInk, columns: Math.min(4, Math.max(1, offers.length)), gap: 10, radius: 8 })
  foot.draw()
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
  const foot = footer(ctx, m, content, assets, { onDark: false, ink: SLATE, logo: 'left', maxW: 280, maxH: 90, starsPx: 28, bottom: contentBottom - 10 })
  const B = foot.top - 16
  let y = contentTop + 30
  const badgeH = drawBadge(ctx, content.badge, padX, contentTop + 50, 380, badgeColor)
  y += script(ctx, kickerWords(content), w / 2, y, maxWidth - (badgeH ? 460 : 0), { px: 96, minPx: 48, fill: SLATE, align: 'center' }) - 10
  y += shout(ctx, content.hook, w / 2, y, maxWidth, { px: 124, minPx: 52, lines: 2, fill: badgeColor || '#0369A1', align: 'center', tracking: 3, maxHeight: (B - y) * 0.35 }) + 20
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
  const badgeH = drawBadge(ctx, content.badge, padX, y, 400, badgeColor)
  if (badgeH) y += badgeH + 10
  const kw = kickerWords(content)
  const words = kw.split(/\s+/)
  const first = words[0]
  const rest = words.slice(1).join(' ')
  y += script(ctx, first, padX, y, maxWidth * 0.5, { px: 150, minPx: 60, fill: ink }) - 20
  if (rest) y += shout(ctx, rest, padX, y, maxWidth * 0.5, { px: 70, minPx: 36, lines: 1, fill: GOLD, tracking: 6 })
  y += shout(ctx, content.hook, padX, y + 14, maxWidth * 0.46, { px: 60, minPx: 30, lines: 4, fill: WHITE, maxHeight: Math.max(120, (B - y) * 0.4) }) + 14
  // Offers on the right, stacked, "OR" between.
  const offers = offersFor(content)
  const colW = maxWidth * 0.52
  const colX = w - padX
  let oy = contentTop + (badgeH ? 0 : 0)
  offers.slice(0, 2).forEach((o, i) => {
    if (i > 0) oy += shout(ctx, 'OR', colX, oy, colW, { px: 60, minPx: 30, lines: 1, fill: GOLD, align: 'right', tracking: 8, maxHeight: (B - oy) * 0.3 })
    if (o.amount) oy += shout(ctx, o.amount, colX, oy, colW, { px: 150, minPx: 70, lines: 1, fill: WHITE, stroke: 'rgba(2,6,23,0.5)', strokeW: 8, align: 'right', tracking: 2, maxHeight: (B - oy) * 0.5 }) - 6
    if (o.detail) oy += shout(ctx, o.detail, colX, oy, colW, { px: 56, minPx: 28, lines: 2, fill: ink, align: 'right', maxHeight: (B - oy) * 0.5 }) + 10
  })
  oy += body(ctx, content.subhead, colX, oy, colW, { px: 24, minPx: 16, lines: 3, weight: '600', fill: 'rgba(255,255,255,0.9)', align: 'right', maxHeight: (B - oy) * 0.5 })
  // The seal between the offers and the band, when there is room; the unit bottom-left.
  const st = stickerWords(content)
  if (st) {
    const sealR = Math.min(110, (B - oy - 20) / 2)
    if (sealR >= 55) seal(ctx, w - padX - sealR, Math.min(B - sealR, Math.max(oy + sealR + 20, h * 0.6)), sealR, st, { fill: accent, ink: WHITE })
  }
  if (hasCutout(content, assets)) {
    const cw = Math.min(maxWidth * 0.5, 520)
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
  const badgeH = drawBadge(ctx, content.badge, padX, y, topW, badgeColor)
  if (badgeH) y += badgeH + 18
  const kw = kickerWords(content)
  const parts = kw.split(/\s+/)
  const last = parts[parts.length - 1]
  const head = parts.slice(0, -1).join(' ')
  if (head) y += script(ctx, head, padX, y, topW, { px: 110, minPx: 50, fill: dark ? accent : GOLD, stroke: dark ? '' : 'rgba(2,6,23,0.35)', strokeW: 6 }) - 16
  y += shout(ctx, last, padX, y, topW, { px: 210, minPx: 90, lines: 1, fill: brand, stroke: dark ? WHITE : 'rgba(2,6,23,0.4)', strokeW: 12, tracking: 8, maxHeight: (B - y) * 0.35 })
  const cutOn = hasCutout(content, assets)
  const cutW = cutOn ? Math.min(maxWidth * 0.42, 460) : 0
  const textW = maxWidth - (cutW ? cutW + 24 : 0)
  y += shout(ctx, content.hook, padX, y, textW, { px: 76, minPx: 36, lines: 3, fill: ink, maxHeight: (B - y) * 0.4 }) + 10
  const amount = amountWords(content)
  if (amount) y += shout(ctx, amount, padX, y, textW, { px: 170, minPx: 70, lines: 1, fill: accent, stroke: WHITE, strokeW: 12, tracking: 2, maxHeight: (B - y) * 0.5 })
  y += shout(ctx, content.offerDetail, padX, y, textW, { px: 56, minPx: 28, lines: 2, fill: ink, maxHeight: (B - y) * 0.5 }) + 10
  y += body(ctx, content.subhead, padX, y, textW, { px: 28, minPx: 18, lines: 3, weight: '600', fill: ink, maxHeight: B - y })
  if (cutW) {
    const top = Math.max(contentTop + 120, B - cutW * 1.1)
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
  const badgeH = drawBadge(ctx, content.badge, padX, y, maxWidth * 0.6, dark ? badgeColor : accent)
  if (badgeH) y += badgeH + 18
  y += shout(ctx, kickerWords(content), padX, y, maxWidth * 0.62, { px: 96, minPx: 44, lines: 2, fill: ink, tracking: 3, maxHeight: (B - y) * 0.3 })
  const amount = amountWords(content)
  const rad = Math.min(170, maxWidth * 0.19)
  const sx = w - padX - rad
  const sy = contentTop + rad + (badgeH ? 30 : 10)
  if (amount) starburst(ctx, sx, sy, rad, amount, { fill: GOLD, ink: SLATE, points: 16 })
  y = Math.max(y, sy + rad - 40)
  y += shout(ctx, content.offerDetail, padX, y, maxWidth, { px: 76, minPx: 36, lines: 2, fill: dark ? accent : GOLD, stroke: dark ? '' : 'rgba(2,6,23,0.3)', strokeW: 6, maxHeight: (B - y) * 0.35 }) + 10
  const cutOn = hasCutout(content, assets)
  const cutW = cutOn ? Math.min(maxWidth * 0.38, 400) : 0
  const textW = maxWidth - (cutW ? cutW + 24 : 0)
  const cutTop = Math.max(y, sy + rad + 20)
  y += shout(ctx, content.hook, padX, y, textW, { px: 64, minPx: 32, lines: 3, fill: ink, maxHeight: (B - y) * 0.5 }) + 10
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
  const badgeH = drawBadge(ctx, content.badge, padX, y, 400, accent)
  if (badgeH) y += badgeH + 10
  y += shout(ctx, kickerWords(content), w / 2, y, maxWidth, { px: 150, minPx: 60, lines: 2, fill: navy, align: 'center', tracking: 3, maxHeight: (contentBottom - y) * 0.25 })
  y += shout(ctx, content.hook, w / 2, y, maxWidth, { px: 120, minPx: 52, lines: 2, fill: red, align: 'center', tracking: 3, maxHeight: (contentBottom - y) * 0.3 })
  y += shout(ctx, content.subhead, w / 2, y, maxWidth, { px: 70, minPx: 32, lines: 3, fill: navy, align: 'center', tracking: 1, maxHeight: (contentBottom - y) * 0.3 }) + 20
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
  if (amount) oy += shout(ctx, amount, rightX, oy, colW, { px: 120, minPx: 50, lines: 1, fill: red, align: 'right', maxHeight: (contentBottom - oy) * 0.5 })
  oy += shout(ctx, content.offerDetail, rightX, oy, colW, { px: 64, minPx: 30, lines: 2, fill: navy, align: 'right', maxHeight: (contentBottom - oy) * 0.6 })
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
  const badgeH = drawBadge(ctx, content.badge, padX, y, maxWidth - 260, badgeColor)
  const st = stickerWords(content) || '24/7'
  seal(ctx, w - padX - 110, contentTop + 110, 110, st, { fill: accent, ink: WHITE, ring: WHITE })
  y += Math.max(badgeH + 26, 0)
  y += shout(ctx, kickerWords(content), padX, y, maxWidth - 260, { px: 90, minPx: 40, lines: 1, fill: onDark ? accent : badgeColor || accent, tracking: 4 })
  y = Math.max(y + 10, contentTop + 240)
  const cutOn = hasCutout(content, assets)
  const cutW = cutOn ? Math.min(maxWidth * 0.4, 420) : 0
  y += shout(ctx, content.hook, padX, y, maxWidth, { px: 170, minPx: 60, lines: 3, fill: ink, tracking: 2, maxHeight: (B - y) * 0.5 }) + 16
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
  const badgeH = drawBadge(ctx, content.badge, padX, y, maxWidth, dark ? badgeColor : accent)
  if (badgeH) y += badgeH + 20
  y += shout(ctx, kickerWords(content), padX, y, maxWidth, { px: 80, minPx: 40, lines: 1, fill: dark ? badgeColor || accent : accent, tracking: 4, maxHeight: (B - y) * 0.2 })
  const cutOn = hasCutout(content, assets)
  const cutW = cutOn ? Math.min(maxWidth * 0.4, 440) : 0
  const textW = maxWidth - (cutW ? cutW + 24 : 0)
  const amount = amountWords(content)
  if (amount) y += shout(ctx, amount, padX, y, textW, { px: 250, minPx: 100, lines: 1, fill: WHITE, stroke: dark ? badgeColor || SLATE : 'rgba(2,6,23,0.35)', strokeW: 14, tracking: 2, maxHeight: (B - y) * 0.4 })
  y += shout(ctx, content.offerDetail, padX, y, textW, { px: 70, minPx: 32, lines: 2, fill: ink, maxHeight: (B - y) * 0.35 }) + 10
  y += shout(ctx, content.hook, padX, y, textW, { px: 60, minPx: 30, lines: 3, fill: ink, maxHeight: (B - y) * 0.4 }) + 10
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
  const badgeH = drawBadge(ctx, content.badge, w - padX - 380, y, 380, badgeColor)
  y += Math.max(lb ? lb.h : 0, badgeH) + 26
  y += shout(ctx, kickerWords(content), padX, y, maxWidth, { px: 70, minPx: 36, lines: 1, fill: accent, tracking: 4, maxHeight: (B - y) * 0.2 }) + 10
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
  if (amount) cy += shout(ctx, amount, w / 2, cy, innerW, { px: 220, minPx: 90, lines: 1, fill: accent, align: 'center', tracking: 2, maxHeight: boxH * 0.5 })
  cy += shout(ctx, content.offerDetail, w / 2, cy, innerW, { px: 64, minPx: 30, lines: 2, fill: badgeColor || SLATE, align: 'center', maxHeight: boxH * 0.3 }) + 10
  body(ctx, content.subhead, w / 2, cy, innerW, { px: 24, minPx: 16, lines: 2, weight: '600', fill: '#475569', align: 'center', maxHeight: y + boxH - 20 - cy })
  y += boxH + 24
  // The headline under the coupon, the unit beside it.
  const cutTop = y - 10
  y += shout(ctx, content.hook, padX, y, maxWidth - (cutW ? cutW + 20 : 0), { px: 84, minPx: 30, lines: 4, fill: ink, maxHeight: B - y })
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
  const badgeH = drawBadge(ctx, content.badge, padX, y, maxWidth, dark ? badgeColor : accent)
  if (badgeH) y += badgeH + 20
  const st = stickerWords(content)
  const topW = maxWidth - (st ? 250 : 0)
  y += shout(ctx, kickerWords(content), padX, y, topW, { px: 70, minPx: 36, lines: 1, fill: dark ? badgeColor || accent : accent, tracking: 4, maxHeight: (B - y) * 0.2 })
  y += shout(ctx, content.hook, padX, y, topW, { px: 80, minPx: 36, lines: 3, fill: ink, maxHeight: (B - y) * 0.25 }) + 10
  const amount = amountWords(content)
  if (amount) y += shout(ctx, amount, padX, y, maxWidth, { px: 420, minPx: 120, lines: 1, fill: accent, stroke: WHITE, strokeW: 16, tracking: -4, maxHeight: (B - y) * 0.55 })
  const cutOn = hasCutout(content, assets)
  const cutW = cutOn ? Math.min(maxWidth * 0.38, 400) : 0
  const cutTop = y
  y += shout(ctx, content.offerDetail, padX, y, maxWidth - (cutW ? cutW + 20 : 0), { px: 90, minPx: 36, lines: 2, fill: ink, tracking: 3, maxHeight: (B - y) * 0.5 }) + 14
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
  const badgeH = drawBadge(ctx, content.badge, padX, y, maxWidth - 300, badgeColor)
  if (badgeH) y += badgeH + 18
  ribbon(ctx, w, stickerWords(content) || 'SALE', { fill: accent, ink: WHITE, size: 360 })
  y += shout(ctx, kickerWords(content), padX, y, maxWidth - 260, { px: 90, minPx: 40, lines: 1, fill: WHITE, stroke: 'rgba(2,6,23,0.6)', strokeW: 8, tracking: 3 })
  shout(ctx, content.hook, padX, y, maxWidth - 60, { px: 84, minPx: 36, lines: 3, fill: WHITE, stroke: 'rgba(2,6,23,0.6)', strokeW: 8, maxHeight: (bandTop - y) * 0.6 })
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
  const badgeH = drawBadge(ctx, content.badge, padX, y, 400, badgeColor)
  if (badgeH) y += badgeH + 12
  y += shout(ctx, kickerWords(content), padX, y, maxWidth, { px: 96, minPx: 44, lines: 1, fill: onDark ? GOLD : accent, tracking: 3, maxHeight: (B - y) * 0.3 })
  y += shout(ctx, content.hook, padX, y, maxWidth, { px: 72, minPx: 34, lines: 3, fill: ink, maxHeight: (B - y) * 0.45 }) + 12
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
  drawBadge(ctx, content.badge, padX, contentTop, maxWidth - 200, badgeColor)
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
  y += shout(ctx, kickerWords(content), tx, y, tw, { px: 70, minPx: 32, lines: 1, fill: onPlate ? GOLD : accent, tracking: 3, maxHeight: Math.max(60, (insetBottom - y) * 0.5) })
  y += shout(ctx, content.hook, tx, y, tw, { px: 64, minPx: 30, lines: 3, fill: plateInk, maxHeight: Math.max(70, insetBottom + 60 - y) }) + 10
  y = Math.max(y, insetBottom + 16)
  const amount = amountWords(content)
  const detail = String(content.offerDetail || '').trim()
  if (amount || detail) {
    const text = [amount, detail].filter(Boolean).join('  ')
    y += shout(ctx, text, padX, y, maxWidth, { px: 110, minPx: 40, lines: 2, fill: accent, stroke: WHITE, strokeW: 8, tracking: 1, maxHeight: (B - y) * 0.6 }) + 8
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
  const badgeH = drawBadge(ctx, content.badge, padX, y, maxWidth, onDark ? accent : badgeColor)
  if (badgeH) y += badgeH + 16
  y += shout(ctx, content.hook, padX, y, maxWidth, { px: 84, minPx: 36, lines: 2, fill: ink, maxHeight: (B - y) * 0.28 }) + 18
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
  shout(ctx, kickerWords(content), card.x + 28, card.y + 16, card.w - 56 - (st ? 150 : 0), { px: 54, minPx: 26, lines: 1, fill: readableTextOn(head), tracking: 2, maxHeight: headH - 20 })
  // The price on the right, what is included on the left.
  const inner = { x: card.x + 32, y: card.y + headH + 26, w: card.w - 64, bottom: card.y + card.h - 28 }
  const priceW = amount ? Math.min(inner.w * 0.42, 380) : 0
  if (amount) {
    const rx = inner.x + inner.w
    let py = inner.y
    py += shout(ctx, amount, rx, py, priceW, { px: 120, minPx: 50, lines: 1, fill: accent, align: 'right', maxHeight: (inner.bottom - py) * 0.5 })
    shout(ctx, content.offerDetail, rx, py, priceW, { px: 36, minPx: 20, lines: 3, fill: head, align: 'right', maxHeight: (inner.bottom - py) * 0.6 })
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
  const out = fn(ctx, size, content, assets, opts)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.letterSpacing = '0px'
  ctx.setLineDash([])
  return out
}
