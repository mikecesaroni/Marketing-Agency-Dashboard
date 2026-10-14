/**
 * The feed copy a static needs before it can publish, written without a click.
 *
 * A static saved from "Make 3 ads" or from a chat creative set already carries
 * its primary text, headline and description. One designed by hand in the
 * Studio often does not, and until now the publish page just said "Needs
 * primary text" and waited. Now a ticked static with no primary text gets its
 * three feed lines written from the words painted on it and the client's
 * brief, and they land in the fields, editable, like a version picked for a
 * video.
 *
 * Pure: what to ask for, how to read the answer, which fields may be filled.
 * The network call is adCopy.suggestImageFeedCopy; the loop is in
 * PublishToMetaPanel.
 */

export const FEED_FIELDS = ['primaryText', 'headline', 'description']

// Studio field name → the copy record's column, as the publish function reads it.
const COLUMN = { primaryText: 'primary_text', headline: 'headline', description: 'description' }

/** True when the copy record cannot publish yet: no primary text typed or written. */
export function needsFeedCopy(copy) {
  return !String(copy?.primary_text || '').trim()
}

/**
 * The painted words and the feed fields as the copy assistant expects them,
 * from a saved recipe row (snake_case columns) and the copy as it stands.
 */
export function staticCurrent(recipe, copy) {
  const r = recipe || {}
  const c = copy || {}
  return {
    badge: r.badge || '',
    hook: r.hook || '',
    offerAmount: r.offer_amount || '',
    offerDetail: r.offer_detail || '',
    subhead: r.subhead || '',
    proof: r.proof || '',
    primaryText: c.primary_text || '',
    headline: c.headline || '',
    description: c.description || '',
  }
}

/** What to ask. The painted slots travel in `current`; this only says which three to write. */
export function feedCopyInstruction() {
  return 'This is an IMAGE ad and the painted words (badge, hook, offer, subhead, proof) are final. Write the three feed fields that go beside the image: primaryText, headline and description. One option each is enough. The first line of the primaryText carries the offer on its own; the headline is not word for word the hook.'
}

/**
 * The first option per feed field, as a copy patch. Options for painted slots
 * are ignored: the image is already saved and nothing here repaints it.
 */
export function feedCopyFromOptions(options) {
  const out = {}
  for (const o of options || []) {
    const col = COLUMN[o?.field]
    if (!col || out[col] !== undefined) continue
    const value = String(o.value || '').trim()
    if (value) out[col] = value
  }
  return out
}

/** Fills only the fields still blank, so a line somebody typed is never replaced. */
export function mergeWritten(copy, written) {
  const next = { ...(copy || {}) }
  for (const [col, value] of Object.entries(written || {})) {
    if (!String(next[col] || '').trim()) next[col] = value
  }
  return next
}

/**
 * The next ticked static to write for: ticked, no primary text, not written
 * for yet, in the order they were ticked. One at a time keeps the requests
 * from bursting when "tick the newest 3" is pressed.
 */
export function nextToWrite({ picked, copies, done }) {
  for (const stamp of picked || []) {
    if (done?.has?.(stamp)) continue
    if (needsFeedCopy(copies?.[stamp])) return stamp
  }
  return ''
}
