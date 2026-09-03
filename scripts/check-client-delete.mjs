// Self-check for permanently deleting a client. Run:
//
//   node scripts/check-client-delete.mjs
//
// The rules being pinned down:
//
//   A client can be permanently deleted only when it is ARCHIVED and has NO
//   COLLECTED MONEY, and only when the person types its name.
//
// The money rule is the one that matters. Every paid payment feeds the
// lifetime profit split, so cascading one away moves money out of Ethan's
// column with nothing left to explain the change -- Exodus is $2,248
// collected, $1,124 of it his at 50%. Archiving is the answer for a client
// with history; this is only for one created by accident.
//
// The database enforces both rules in a BEFORE DELETE trigger, which is what
// makes them real -- this app has no login. What is checked here is that the
// UI agrees with the database rather than offering a button that will fail.

import {
  attachedRows,
  blockers,
  canDelete,
  nameMatches,
  readyToDelete,
  rowsDestroyed,
  rowsKept,
} from '../src/lib/clientDelete.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

// Shaped exactly like client_delete_preview() returns. These three are the
// real archived clients as the live database reported them.
const AIRBENDER = {
  client_id: 'fb3bc207-4805-4ddf-8743-122f8f81c4ed',
  name: 'Airbender Marketing',
  archived: true,
  collected: '0',
  settled_payments: 0,
  blockers: [],
  can_delete: true,
  attached: [
    { table: 'deliverable_seeds', rows: 1, action: 'deleted' },
    { table: 'deliverables', rows: 4, action: 'deleted' },
    { table: 'onboarding_links', rows: 1, action: 'deleted' },
  ],
}

const EXODUS = {
  client_id: '08b71756-3bc4-4292-ab35-bd87e25cf9fc',
  name: 'Exodus',
  archived: true,
  collected: '2248',
  settled_payments: 0,
  blockers: [
    'Exodus has $2248.00 of collected payments, which is in the lifetime profit split. Deleting it would move money out of the books with no record.',
  ],
  can_delete: false,
  attached: [
    { table: 'ad_daily', rows: 109, action: 'deleted' },
    { table: 'client_chats', rows: 1, action: 'deleted' },
    { table: 'client_files', rows: 9, action: 'deleted' },
    { table: 'onboarding_intake', rows: 1, action: 'deleted' },
    { table: 'payments', rows: 13, action: 'deleted' },
    { table: 'weekly_kpis', rows: 6, action: 'deleted' },
  ],
}

const LIVE_CLIENT = {
  name: 'Pillar HVAC',
  archived: false,
  collected: '3498',
  blockers: [
    'Archive the client first — archiving is the step you can undo.',
    'Pillar HVAC has $3498.00 of collected payments, which is in the lifetime profit split. Deleting it would move money out of the books with no record.',
  ],
  can_delete: false,
  attached: [{ table: 'payments', rows: 13, action: 'deleted' }],
}

// --- who can be deleted at all -------------------------------------------

check('an archived client with no money can be deleted', canDelete(AIRBENDER), true)
check('collected money blocks the delete', canDelete(EXODUS), false)
check('and says why, in money terms', blockers(EXODUS).length, 1)
check('a live client is blocked twice over', blockers(LIVE_CLIENT).length, 2)
check('archiving is named as the first step', blockers(LIVE_CLIENT)[0].includes('Archive'), true)

{
  // The dangerous shape: the database says yes but lists a blocker anyway.
  // Trusting can_delete alone would offer a button that fails on click.
  const contradictory = { ...AIRBENDER, can_delete: true, blockers: ['something is wrong'] }
  check('a blocker overrides can_delete', canDelete(contradictory), false)
}

{
  // A preview that failed to load is not permission to delete.
  check('no preview means no delete', canDelete(null), false)
  check('an empty object means no delete', canDelete({}), false)
  check('and neither blows up', [blockers(null), attachedRows(null)], [[], []])
}

// --- typing the name ------------------------------------------------------

check('the exact name confirms', nameMatches('Airbender Marketing', 'Airbender Marketing'), true)
check('case and padding do not matter', nameMatches('  airbender marketing ', 'Airbender Marketing'), true)
check('a different name does not confirm', nameMatches('Airbender', 'Airbender Marketing'), false)
check('empty text never confirms', nameMatches('', 'Airbender Marketing'), false)
check('whitespace never confirms', nameMatches('   ', 'Airbender Marketing'), false)
check('a null name is not confirmable', nameMatches('', null), false)

// --- the two gates together ----------------------------------------------

check('both gates open', readyToDelete(AIRBENDER, 'Airbender Marketing'), true)
check('right name, blocked client', readyToDelete(EXODUS, 'Exodus'), false)
check('deletable client, wrong name', readyToDelete(AIRBENDER, 'Airbender'), false)

// --- what the person is shown --------------------------------------------

// The fixture is in the database's own alphabetical order (109, 1, 9, 1, 13,
// 6), so this only passes if the sort actually runs.
check('rows are listed biggest first', attachedRows(EXODUS).map((r) => r.rows), [109, 13, 9, 6, 1, 1])
check('and nothing is lost in the sort', rowsDestroyed(EXODUS), 139)
check('the destroyed count sums the cascades', rowsDestroyed(AIRBENDER), 6)

{
  // Unlinked rows must NOT be counted as destroyed. An expense survives its
  // client -- the money really was spent -- and telling someone it was deleted
  // when it was not is the kind of wrong that costs trust in the whole dialog.
  const mixed = {
    ...AIRBENDER,
    attached: [
      { table: 'payments', rows: 3, action: 'deleted' },
      { table: 'expenses', rows: 2, action: 'kept, unlinked' },
    ],
  }
  check('unlinked rows are not counted as destroyed', rowsDestroyed(mixed), 3)
  check('and are reported separately', rowsKept(mixed).map((r) => r.table), ['expenses'])
  check('a clean client keeps nothing', rowsKept(AIRBENDER), [])
}

console.log(failures === 0 ? '\nAll client-delete checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
