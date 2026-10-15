/**
 * The overlap audit: the guarantee that nothing on an ad is cut off.
 *
 * Every template records the box of everything it paints (a block of words,
 * the badge, a sticker, the logo, the stars, the unit, a tile) in an audit.
 * When the paint is done the audit lists every pair of solid boxes that
 * overlap, and every box that runs past the frame. The Studio shows the
 * list as a warning before the ad is saved; the render tests fail on it.
 *
 * Kinds: text, badge, sticker, logo, stars, cutout, tile are solid and may
 * not overlap one another. photo and panel are surfaces that words sit on
 * by design, so they are never flagged. Pure: scripts/check-ad-audit.mjs.
 */

export const SOLID = new Set(['text', 'badge', 'sticker', 'logo', 'stars', 'cutout', 'tile'])

// Rounded corners and letter sidebearings touch without covering anything;
// an overlap has to be this deep in both directions to count.
const SLACK = 6

function overlapOf(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > SLACK && h > SLACK ? { w, h } : null
}

export function createAudit(frame = { w: 1080, h: 1080 }) {
  const boxes = []
  return {
    boxes,
    /** Records a painted box. Empty or absurd boxes are ignored. */
    add(kind, box, label = '') {
      if (!box || !(box.w > 0) || !(box.h > 0)) return
      if (![box.x, box.y, box.w, box.h].every(Number.isFinite)) return
      boxes.push({ kind, label: label || kind, x: box.x, y: box.y, w: box.w, h: box.h })
    },
    /** Every overlap between solid boxes and every box past the frame. */
    problems() {
      const out = []
      const solid = boxes.filter((b) => SOLID.has(b.kind))
      for (let i = 0; i < solid.length; i++) {
        const a = solid[i]
        if (a.x < -SLACK || a.y < -SLACK || a.x + a.w > frame.w + SLACK || a.y + a.h > frame.h + SLACK) {
          out.push({ type: 'edge', a: a.label, text: `${a.label} runs past the edge of the frame` })
        }
        for (let j = i + 1; j < solid.length; j++) {
          const b = solid[j]
          const o = overlapOf(a, b)
          if (o) out.push({ type: 'overlap', a: a.label, b: b.label, text: `${a.label} and ${b.label} overlap`, w: Math.round(o.w), h: Math.round(o.h) })
        }
      }
      return out
    },
  }
}

/** One line for a person, from a list of problems: '' when there are none. */
export function auditLine(problems, where = '') {
  if (!problems || problems.length === 0) return ''
  const first = problems.slice(0, 2).map((p) => p.text).join('; ')
  const more = problems.length > 2 ? ` and ${problems.length - 2} more` : ''
  return `${where ? `${where}: ` : ''}${first}${more}. Shorten the words, pick another template, or ask the chat to rewrite.`
}
