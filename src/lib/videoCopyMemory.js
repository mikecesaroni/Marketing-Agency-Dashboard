// What the publish page keeps for a video between visits, the pure part.
//
// "If I click publish videos and the AI takes the time to transcribe videos
// and make ad copies, make it so it saves that; if I click away and come
// back it doesn't have to do all that over again and spend money." The
// transcript was already on the row (ad_videos.transcript). The three
// versions the copy assistant wrote and the copy picked or typed lived only
// in the page, so the next visit wrote them again. Now they ride on the row
// too (ad_videos.copy, ad_videos.versions; supabase/video-copy-memory.sql):
// these helpers say what goes in and how it comes back out.

/** The copy fields worth keeping: the words, not the Meta ids the page stamps on. */
export const COPY_FIELDS = ['primary_text', 'headline', 'description', 'ad_name']

/** The copy record as it is saved: the four text fields, trimmed, or null when all are blank. */
export function copyToSave(copy = {}) {
  const out = {}
  let any = false
  for (const k of COPY_FIELDS) {
    const v = String(copy?.[k] ?? '').trim()
    out[k] = v
    if (v) any = true
  }
  return any ? out : null
}

/** True when the words changed since `saved` (the ids and anything else are ignored). */
export function copyChanged(copy = {}, saved = null) {
  const a = copyToSave(copy)
  const b = copyToSave(saved || {})
  return JSON.stringify(a) !== JSON.stringify(b)
}

/**
 * The saved copy off a row, as a patch for the page's copy record: only the
 * words, only when the page has none yet, so a visit never overwrites what
 * somebody is typing right now.
 */
export function copyFromRow(row = {}, current = null) {
  const saved = row?.copy && typeof row.copy === 'object' ? row.copy : null
  if (!saved) return null
  if (String(current?.primary_text || '').trim()) return null
  const patch = {}
  for (const k of COPY_FIELDS) {
    const v = String(saved[k] ?? '').trim()
    if (v) patch[k] = v
  }
  return Object.keys(patch).length ? patch : null
}

/** The three versions off a row, in the shape the cards read, or null. */
export function versionsFromRow(row = {}) {
  const v = row?.versions
  if (!v || typeof v !== 'object' || !Array.isArray(v.variations) || !v.variations.length) return null
  return {
    note: String(v.note || ''),
    variations: v.variations.map((x) => ({
      angle: String(x?.angle || ''),
      primaryText: String(x?.primaryText || ''),
      headline: String(x?.headline || ''),
      description: String(x?.description || ''),
    })),
  }
}

/** The versions as they are saved: the note and the three, nothing else. */
export function versionsToSave(out = {}) {
  const v = versionsFromRow({ versions: out })
  return v
}
