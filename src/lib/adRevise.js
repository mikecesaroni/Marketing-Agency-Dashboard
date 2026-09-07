/**
 * Applying an owner's "needs changes" note to a saved ad.
 *
 * Pure: no Supabase import, so scripts/check-ad-revise.mjs can reach it. The
 * IO (the model call, the re-render, the overwrite) lives in adRevisionStore.js.
 *
 * The rule: THE REVISED AD REPLACES THE OLD ONE. Same stamp, same three
 * storage paths, same recipe row. An owner who wrote "Pennsylvania instead"
 * wants that ad fixed, not a fourth version next to the other three, and the
 * approval link they already have should show the fix when they open it again.
 */

// The slots the model may change. Anything else it answers with is dropped:
// the value goes straight into the recipe and onto the artboard, so the field
// name is the boundary.
export const REVISABLE = [
  'badge',
  'hook',
  'offerAmount',
  'offerDetail',
  'subhead',
  'proof',
  'primaryText',
  'headline',
  'description',
]

// What each slot is called on screen. The model answers with the state key,
// which is not what the field is labelled in the form.
export const FIELD_LABELS = {
  badge: 'Location badge',
  hook: 'Hook',
  offerAmount: 'Offer amount',
  offerDetail: 'Offer detail',
  subhead: 'Subhead',
  proof: 'Proof strip',
  primaryText: 'Primary text',
  headline: 'Headline',
  description: 'Description',
}

/**
 * Lays the model's changes over the current content.
 *
 * Returns the new content and the list of what actually moved, so the UI can
 * say "Location badge: Delaware to Pennsylvania" rather than "done". A change
 * to a field outside REVISABLE, or one that leaves the value as it was, is not
 * a change and is not reported as one.
 */
export function applyChanges(content, changes) {
  const next = { ...(content || {}) }
  const applied = []
  for (const c of changes || []) {
    const field = String(c?.field || '')
    if (!REVISABLE.includes(field)) continue
    const to = String(c?.value ?? '').trim()
    const from = String(next[field] ?? '').trim()
    if (to === from) continue
    next[field] = to
    applied.push({ field, from, to })
  }
  return { content: next, applied }
}

/** One line per change, in the words the form uses. */
export function describeApplied(applied) {
  return (applied || []).map(
    (a) => `${FIELD_LABELS[a.field] || a.field}: “${a.from || '(empty)'}” → “${a.to || '(empty)'}”`
  )
}

/** ads/<client>/<stamp>-<size>.png → the stamp, or null for anything else. */
export function stampFromPath(storagePath) {
  const m = String(storagePath || '').match(/\/(\d+)-[a-z]+\.png$/)
  return m ? m[1] : null
}

/**
 * The same public URL with a version on it.
 *
 * The bucket sits behind a CDN that caches by URL for an hour, so after an
 * overwrite the old picture would keep coming back at the same address. A
 * query string is a different address to the cache and the same object to the
 * bucket. Nothing is appended when there is no version to append.
 */
export function versioned(url, version) {
  if (!url || version == null || version === '') return url || ''
  const v = typeof version === 'number' ? version : Date.parse(version) || String(version)
  return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(v)}`
}

/**
 * The "needs changes" items on a link that can be acted on: a comment to act
 * on and a saved set with a recipe to act on it with. An ad saved before
 * recipes existed is a flat picture; there is nothing to edit.
 */
export function actionableChanges(link, sets) {
  const out = []
  for (const item of link?.items || []) {
    if (item.decision !== 'changes' || !item.comment?.trim()) continue
    const stamp = stampFromPath(item.storage_path)
    const set = (sets || []).find((s) => String(s.stamp) === stamp) || null
    out.push({ ...item, stamp, set, canApply: Boolean(set?.recipe) })
  }
  return out
}
