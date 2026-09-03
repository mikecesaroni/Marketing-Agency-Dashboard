/**
 * Permanently deleting a client — for the ones created by accident.
 *
 * Archiving already exists and is the right answer almost always: an archived
 * client keeps its history and drops out of MRR, the Meta sync and every list.
 * This is for the other case, a client typed in by mistake that should never
 * have existed.
 *
 * TWO RULES, AND THEY LIVE IN THE DATABASE, NOT HERE.
 *
 *   1. The client must be archived first. Archiving is the reversible step.
 *   2. The client must have no collected money. Every paid payment feeds the
 *      lifetime profit split, so deleting one moves money out of Ethan's
 *      column with nothing left to explain the change. Exodus is the live
 *      example: $2,248 collected, $1,124 of it his at 50%.
 *
 * A BEFORE DELETE trigger on clients enforces both, so a stray fetch against
 * PostgREST cannot walk past them -- this app has no login, and a guard that
 * exists only in a React component is not a guard. The functions here are the
 * pleasant path to the same rules, not the rules themselves.
 *
 * Pending schedule rows are not money: the CRM generates twelve months of them
 * on its own, so they go with the client.
 *
 * Everything here is pure so scripts/check-client-delete.mjs can run it. The
 * two RPC calls live in DeleteClientButton, which is already doing IO.
 */

/** Rows the delete will destroy, biggest first — that is the alarming number. */
export function attachedRows(preview) {
  const rows = Array.isArray(preview?.attached) ? preview.attached : []
  return [...rows].sort((a, b) => Number(b.rows) - Number(a.rows))
}

/** How many rows go, across every table. Excludes the ones merely unlinked. */
export function rowsDestroyed(preview) {
  return attachedRows(preview)
    .filter((r) => r.action === 'deleted')
    .reduce((sum, r) => sum + Number(r.rows || 0), 0)
}

/**
 * Rows that SURVIVE, unattached. Worth showing separately: an expense stays on
 * the books after its client is gone, which is correct -- the money was really
 * spent -- but it is surprising unless said out loud.
 */
export function rowsKept(preview) {
  return attachedRows(preview).filter((r) => r.action !== 'deleted')
}

export function blockers(preview) {
  return Array.isArray(preview?.blockers) ? preview.blockers : []
}

export function canDelete(preview) {
  return Boolean(preview?.can_delete) && blockers(preview).length === 0
}

/**
 * Typing the name is the confirmation. A one-click confirm dialog on an
 * irreversible action is a reflex, not a decision; typing "Noah" is a moment
 * of actually reading which client is on screen.
 *
 * Trimmed and case-insensitive, because the check is "do you know which client
 * this is", not "can you match whitespace".
 */
export function nameMatches(typed, name) {
  const a = String(typed ?? '').trim().toLowerCase()
  const b = String(name ?? '').trim().toLowerCase()
  return a.length > 0 && a === b
}

/** True when the whole form is ready to fire. */
export function readyToDelete(preview, typed) {
  return canDelete(preview) && nameMatches(typed, preview?.name)
}
