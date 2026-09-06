// Self-check for who may open what. Run: node scripts/check-access.mjs
//
// The rule: A VA SEES EVERYTHING EXCEPT MONEY, AN ADMIN SEES EVERYTHING, AND
// NOBODY CAN LOCK THE AGENCY OUT OF ITS OWN CRM. The nav, the route guard and
// the Team page all lean on these functions, so a wrong answer here is a VA
// looking at partner payouts or an admin removing the last admin.

import {
  ADMIN_ONLY,
  canOpen,
  memberChangeProblem,
  passwordProblem,
  visibleNav,
} from '../src/lib/access.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

// --- canOpen -----------------------------------------------------------------

check('admin opens payments', canOpen('admin', '/payments'), true)
check('admin opens team', canOpen('admin', '/team'), true)
check('VA cannot open payments', canOpen('va', '/payments'), false)
check('VA cannot open a payments sub-path', canOpen('va', '/payments/stripe'), false)
check('VA cannot open team', canOpen('va', '/team'), false)
check('VA opens clients', canOpen('va', '/clients'), true)
check('VA opens a client page', canOpen('va', '/client/abc'), true)
check('VA opens reports', canOpen('va', '/reports'), true)
check('a prefix is not a match: /paymentsx is not /payments', canOpen('va', '/paymentsx'), true)
check('no role opens nothing', canOpen(null, '/clients'), false)
check('an unknown role opens nothing', canOpen('owner', '/clients'), false)
check('the admin-only list is exactly payments and team', ADMIN_ONLY, ['/payments', '/team'])

// --- visibleNav --------------------------------------------------------------

const NAV = [
  { label: null, items: [{ to: '/', label: 'Dashboard' }, { to: '/clients', label: 'Clients' }] },
  { label: 'Money', items: [{ to: '/payments', label: 'Payments' }, { to: '/reports', label: 'Reports' }] },
  { label: 'Admin', items: [{ to: '/team', label: 'Team' }] },
]
check(
  'admin sees every group',
  visibleNav(NAV, 'admin').map((g) => g.items.map((i) => i.to)),
  [['/', '/clients'], ['/payments', '/reports'], ['/team']]
)
check(
  'VA loses payments and the whole Admin group, keeps Reports',
  visibleNav(NAV, 'va').map((g) => g.items.map((i) => i.to)),
  [['/', '/clients'], ['/reports']]
)
check('VA nav keeps the Money label for Reports', visibleNav(NAV, 'va')[1].label, 'Money')
check('nobody logged in sees no nav', visibleNav(NAV, null), [])

// --- passwords ---------------------------------------------------------------

check('a short password is refused', passwordProblem('abc123'), 'At least 10 characters.')
check('letters only is refused', passwordProblem('abcdefghijkl'), 'Mix letters and at least one number.')
check('digits only is refused', passwordProblem('1234567890'), 'Mix letters and at least one number.')
check('a real password passes', passwordProblem('Working-Class-2026'), '')

// --- team safety -------------------------------------------------------------

const members = [
  { user_id: 'a1', role: 'admin' },
  { user_id: 'a2', role: 'admin' },
  { user_id: 'v1', role: 'va' },
]
const soloAdmin = [{ user_id: 'a1', role: 'admin' }, { user_id: 'v1', role: 'va' }]

check('an admin removes a VA', memberChangeProblem({ members, actorId: 'a1', targetId: 'v1', action: 'remove' }), '')
check('an admin demotes another admin when two exist', memberChangeProblem({ members, actorId: 'a1', targetId: 'a2', action: 'demote' }), '')
check('nobody removes themself', memberChangeProblem({ members, actorId: 'a1', targetId: 'a1', action: 'remove' }), 'You cannot remove yourself.')
check('nobody demotes themself', memberChangeProblem({ members, actorId: 'a1', targetId: 'a1', action: 'demote' }), 'You cannot demote yourself.')
check(
  'the last admin cannot be removed',
  memberChangeProblem({ members: soloAdmin, actorId: 'a2', targetId: 'a1', action: 'remove' }),
  'That is the only admin. Make someone else an admin first.'
)
check(
  'the last admin cannot be demoted',
  memberChangeProblem({ members: soloAdmin, actorId: 'a2', targetId: 'a1', action: 'demote' }),
  'That is the only admin. Make someone else an admin first.'
)
check('promoting is always fine', memberChangeProblem({ members: soloAdmin, actorId: 'a1', targetId: 'v1', action: 'promote' }), '')
check('resetting a password is always fine', memberChangeProblem({ members: soloAdmin, actorId: 'a1', targetId: 'a1', action: 'password' }), '')
check('a vanished member is named', memberChangeProblem({ members, actorId: 'a1', targetId: 'zz', action: 'remove' }), 'That person is no longer on the team.')

console.log(failures ? `\n${failures} check(s) failed` : '\nAll access checks pass')
process.exit(failures ? 1 : 0)
