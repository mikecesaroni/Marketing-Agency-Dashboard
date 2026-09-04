/**
 * Choosing saved ads to send an owner, and reading back what they said.
 *
 * Pure on purpose: no Supabase import, so scripts/check-ad-approval.mjs can
 * reach it. The IO lives in adApprovalStore.js. Same split as
 * adVideos/adVideoStore and driveLabels/driveAssets.
 */

/**
 * ONE IMAGE PER SELECTED AD, which is the whole point.
 *
 * An owner asked to approve creatives does not want three crops of the same
 * ad; they want to see the ads. Three sizes each turns four ads into twelve
 * pictures and makes the answer "which one?" instead of "yes".
 *
 * `preferred` is tried first and the rest of the set is the fallback, in the
 * Studio's own order, so an ad that was never saved at the preferred size
 * still goes rather than silently dropping out of the batch.
 */
export function onePerSet(sets, preferred = 'square') {
  const out = []
  for (const set of sets || []) {
    const ordered = set?.ordered || []
    const pick =
      ordered.find((x) => x.size?.key === preferred) || ordered.find((x) => x.file) || null
    if (!pick?.file?.storage_path) continue
    out.push({
      stamp: set.stamp,
      sizeKey: pick.size?.key || 'ad',
      storage_path: pick.file.storage_path,
      url: pick.file.url || '',
      // True when the ad had no image at the size that was asked for, so the
      // UI can say so rather than quietly sending a different shape.
      substituted: pick.size?.key !== preferred,
    })
  }
  return out
}

/** Which sizes the current selection could actually all be sent at. */
export function sizesAvailable(sets) {
  const keys = new Set()
  for (const set of sets || []) {
    for (const item of set?.ordered || []) {
      if (item?.file && item.size?.key) keys.add(item.size.key)
    }
  }
  return [...keys]
}

/**
 * Where an approval stands, for the line shown next to the link.
 *
 * Counted rather than reduced to a single word because "3 of 4 approved" is
 * the sentence that tells you whether to publish, and "pending" is not.
 */
export function approvalSummary(items) {
  const list = items || []
  const approved = list.filter((i) => i.decision === 'approved').length
  const changes = list.filter((i) => i.decision === 'changes').length
  return {
    total: list.length,
    approved,
    changes,
    waiting: list.length - approved - changes,
    // Only when every ad has been approved. One request for changes, or one
    // ad nobody has looked at, is not a green light.
    allApproved: list.length > 0 && approved === list.length,
  }
}

/** The line under the link, in the words that matter. */
export function approvalStatusLine(items, opened) {
  const s = approvalSummary(items)
  if (s.total === 0) return 'Nothing in this link yet.'
  if (!opened && s.approved + s.changes === 0) return `Not opened yet · ${s.total} ads`
  if (s.allApproved) return `All ${s.total} approved`
  const parts = []
  if (s.approved) parts.push(`${s.approved} approved`)
  if (s.changes) parts.push(`${s.changes} needs changes`)
  if (s.waiting) parts.push(`${s.waiting} waiting`)
  return parts.join(' · ')
}

/** The URL to send. Built from the app's own origin so it works on any host. */
export function approvalUrl(origin, token) {
  return `${String(origin || '').replace(/\/+$/, '')}/approve/${token}`
}
