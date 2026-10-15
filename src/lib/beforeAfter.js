/**
 * Finding real before-and-after pairs among a client's photos: the pure half.
 *
 * Two routes. File names first: "furnace-before.jpg" with "furnace-after.jpg"
 * is a pair and needs no model. Then the model looks at the rest: it is shown
 * the photos numbered and asked for pairs of the same job, one before the
 * work and one after, as JSON. This file holds the name matching, the prompt
 * and the parsing; the network lives in beforeAfterStore.js.
 */

const BEFORE = /\b(before|old|pre|b4)\b/i
const AFTER = /\b(after|new|post|done|finished|installed)\b/i

/** The stem of a file name with the before/after word and the extension taken out. */
function stem(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/\b(before|after|old|new|pre|post|b4|done|finished|installed)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Pairs by name: every "before" photo matched to an "after" photo with the
 * same stem (the rest of the name once the word and the extension are gone).
 * A stem with one before and one after is a pair; anything less sure is left
 * to the model. Each pair is { before, after, what, how: 'names' }.
 */
export function pairsByName(pool = []) {
  const groups = new Map()
  for (const p of pool) {
    const name = p.name || p.path || ''
    const isBefore = BEFORE.test(name)
    const isAfter = AFTER.test(name)
    if (isBefore === isAfter) continue
    const key = stem(name)
    const g = groups.get(key) || { before: [], after: [] }
    g[isBefore ? 'before' : 'after'].push(p)
    groups.set(key, g)
  }
  const out = []
  for (const [key, g] of groups) {
    if (g.before.length === 1 && g.after.length === 1) out.push({ before: g.before[0], after: g.after[0], what: key ? key.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Before and after', how: 'names' })
  }
  return out
}

/** What the model is asked, with the photos attached in this order. */
export function finderPrompt(shown = [], tradeWords = 'home services') {
  const list = shown.map((p, i) => `${i + 1} ${p.name || `photo ${i + 1}`}`).join(', ')
  return [
    `Attached are ${shown.length} photos from a ${tradeWords} company's files, numbered in this order: ${list}.`,
    'Find real before-and-after pairs: two photos of the same job or the same spot, one taken before the work (old, rusted, damaged, dirty, broken, leaking) and one after (new, clean, repaired, installed). The two must clearly show the same place or the same kind of equipment in the same setting. Never pair two unrelated photos, never pair a person or a van with a unit, and never pair two photos that both look like afters.',
    'Answer with JSON only, nothing else: {"pairs":[{"before":n,"after":n,"what":"four to eight words on what the job was"}]}. An empty list when there is no real pair.',
  ].join('\n\n')
}

export const FINDER_SYSTEM = 'You look at job photos for a home-services marketing team and answer with JSON only. You are careful: a wrong pair ends up in an ad, so when in doubt it is not a pair.'

/**
 * The pairs in a reply, mapped back onto the photos shown. Out-of-range
 * numbers, a photo paired with itself and repeats are dropped.
 */
export function parsePairs(text, shown = []) {
  const s = String(text || '')
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  let data
  try {
    data = JSON.parse(s.slice(start, end + 1))
  } catch {
    return []
  }
  const seen = new Set()
  const out = []
  for (const p of Array.isArray(data?.pairs) ? data.pairs : []) {
    const b = Number(p?.before)
    const a = Number(p?.after)
    if (!(b >= 1 && b <= shown.length && a >= 1 && a <= shown.length) || a === b) continue
    const key = `${b}-${a}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ before: shown[b - 1], after: shown[a - 1], what: String(p?.what || '').trim() || 'Before and after', how: 'looked' })
  }
  return out
}
