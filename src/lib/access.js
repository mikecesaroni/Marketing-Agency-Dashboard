// Who can open what.
//
// Two roles, and the whole difference between them is money. An admin sees
// everything. A VA sees everything except the Payments tab, the Team page, and
// the per-client payment tracker, because those carry what clients pay and
// what the partners take out.
//
// This file decides only what the interface shows. What a VA can actually
// READ is decided in Postgres by row-level security (migration
// auth_roles_and_rls): the payments, expenses, partner_payouts and stripe_*
// tables have a policy that admits only admins, so a VA who types /payments
// into the address bar gets a redirect from RequireAuth and, if they got past
// that, an empty table from the database. The two layers agree on purpose and
// this list is the one to keep in step with the migration.
//
// Pure on purpose: scripts/check-access.mjs imports it, so nothing here may
// touch the DOM, React or supabaseClient.

export const ROLES = ['admin', 'va']

export const ROLE_LABELS = { admin: 'Admin', va: 'VA' }

// Paths only an admin may open. A path matches itself and anything under it.
export const ADMIN_ONLY = ['/payments', '/team']

export function isAdmin(role) {
  return role === 'admin'
}

/** Whether someone with this role may open this path. No role, no entry. */
export function canOpen(role, path) {
  if (!ROLES.includes(role)) return false
  if (isAdmin(role)) return true
  const p = String(path || '')
  return !ADMIN_ONLY.some((a) => p === a || p.startsWith(`${a}/`))
}

/**
 * The nav groups this role should see. Groups left with no items disappear,
 * so a VA does not get an empty "Money" heading over nothing.
 */
export function visibleNav(groups, role) {
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => canOpen(role, i.to)) }))
    .filter((g) => g.items.length > 0)
}

// Supabase's floor is six characters, which is a PIN, not a password. This is
// an agency CRM with client money in it.
export const MIN_PASSWORD = 10

/** The reason a password is not acceptable, or '' when it is. */
export function passwordProblem(pw) {
  const s = String(pw || '')
  if (s.length < MIN_PASSWORD) return `At least ${MIN_PASSWORD} characters.`
  if (!/[a-z]/i.test(s) || !/\d/.test(s)) return 'Mix letters and at least one number.'
  return ''
}

/**
 * Whether the acting admin may change or remove a member, and why not.
 *
 * Two rules, both about not locking the agency out of its own CRM:
 *   - nobody may remove or demote themself, because the person doing it is by
 *     definition logged in and about to lose the page they are on;
 *   - the last admin cannot be removed or demoted, because then nobody can
 *     manage the team, and the fix is a database console.
 *
 * members: [{ user_id, role }], actorId: the admin clicking.
 */
export function memberChangeProblem({ members, actorId, targetId, action }) {
  const target = (members || []).find((m) => m.user_id === targetId)
  if (!target) return 'That person is no longer on the team.'
  if (targetId === actorId && (action === 'remove' || action === 'demote')) {
    return action === 'remove' ? 'You cannot remove yourself.' : 'You cannot demote yourself.'
  }
  const admins = (members || []).filter((m) => m.role === 'admin').length
  if (target.role === 'admin' && admins <= 1 && (action === 'remove' || action === 'demote')) {
    return 'That is the only admin. Make someone else an admin first.'
  }
  return ''
}
