// The moving half of the AI's knowledge: what the account's own ad data said
// last night, formatted for a prompt.
//
// The rows come from ad_learnings, written by refresh_ad_learnings() in
// Postgres after each morning's Meta sync (see migration
// ad_learnings_feedback_loop). Each row is already a sentence with its numbers
// in it; this file only decides the order and the framing so every AI surface
// (chat brief, Ad Doctor, copy assistant) reads the same thing.
//
// Pure on purpose: scripts/check-ad-learnings.mjs imports it. Fetching is in
// adLearningsStore.js.

/** Account-wide rows, in their sort order. */
export function accountRows(rows) {
  return (rows || []).filter((r) => r.scope === 'account').sort((a, b) => a.sort_order - b.sort_order)
}

/** One client's rows, in their sort order. */
export function clientRows(rows, clientId) {
  return (rows || [])
    .filter((r) => r.scope === 'client' && r.client_id === clientId)
    .sort((a, b) => a.sort_order - b.sort_order)
}

function stamp(rows) {
  const latest = (rows || []).map((r) => r.computed_at).filter(Boolean).sort().pop()
  if (!latest) return ''
  const d = new Date(latest)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * The prompt block. Empty string when there is nothing yet, so a caller can
 * append it unconditionally.
 *
 * The framing line matters: these are newer than anything in the static
 * knowledge base, they are about THESE clients, and the model is told to let
 * them win when the two disagree.
 */
export function learningsBlock(rows, clientId) {
  const acct = accountRows(rows)
  const mine = clientId ? clientRows(rows, clientId) : []
  if (acct.length === 0 && mine.length === 0) return ''
  const when = stamp([...acct, ...mine])
  const out = [
    `=== WHAT OUR OWN DATA SAYS (recomputed nightly from every client's Meta sync; this run ${when}) ===`,
    'These are this agency\'s real numbers and they are newer than everything above. Where they disagree with a general rule, they win for these clients, and you say so. Quote them by number when you use them.',
  ]
  if (mine.length) {
    out.push('', 'THIS CLIENT:')
    for (const r of mine) out.push(`- ${r.headline}`)
  }
  if (acct.length) {
    out.push('', 'ACROSS THE AGENCY:')
    for (const r of acct) out.push(`- ${r.headline}`)
  }
  return out.join('\n')
}

/** The client's own numbers as an object, for rules that want to compute. */
export function clientSummary(rows, clientId) {
  const row = clientRows(rows, clientId).find((r) => r.kind === 'client_summary')
  return row?.evidence || null
}
