// Self-check for the task board's rules. Run: node scripts/check-tasks.mjs
//
// The rules that decide where a task shows up: what counts as overdue, how a
// group is ordered, what "Me mode" matches, and how the quick-add line is
// read. Each one is the kind of thing that looks right on the screen you
// happen to be testing and wrong on the one you are not.
//
// The last block checks the JS status and priority lists against the check
// constraints in supabase/tasks.sql, because two lists of the same thing in
// two languages is how a dropdown offers a value the database refuses.

import { readFileSync } from 'node:fs'
import {
  STATUS_KEYS,
  TASK_PRIORITIES,
  addDays,
  assigneeCounts,
  initials,
  dueBucket,
  filterTasks,
  groupTasks,
  isOverdue,
  knownNames,
  matchPlace,
  nestSubtasks,
  parseQuickAdd,
  personColumns,
  progress,
  reassign,
  sortTasks,
  summarise,
} from '../src/lib/tasks.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

const TODAY = '2026-09-24' // a Thursday

// --------------------------------------------------------------- due dates
check('addDays crosses a month end', addDays('2026-09-30', 1), '2026-10-01')
check('yesterday is overdue', dueBucket({ due_date: '2026-09-23', status: 'todo' }, TODAY), 'overdue')
check('a done task is never overdue', dueBucket({ due_date: '2026-09-01', status: 'done' }, TODAY), 'later')
check('today is today', dueBucket({ due_date: TODAY, status: 'todo' }, TODAY), 'today')
check('tomorrow is tomorrow', dueBucket({ due_date: '2026-09-25', status: 'todo' }, TODAY), 'tomorrow')
check('seven days out is this week', dueBucket({ due_date: '2026-10-01', status: 'todo' }, TODAY), 'week')
check('eight days out is later', dueBucket({ due_date: '2026-10-02', status: 'todo' }, TODAY), 'later')
check('no date is its own bucket', dueBucket({ status: 'todo' }, TODAY), 'none')
check('isOverdue agrees', isOverdue({ due_date: '2026-09-23', status: 'review' }, TODAY), true)
check('isOverdue ignores done', isOverdue({ due_date: '2026-09-23', status: 'done' }, TODAY), false)

// ------------------------------------------------------------------ order
{
  const sorted = sortTasks([
    { id: 'a', priority: 'normal', due_date: '2026-09-25', created_at: '1' },
    { id: 'b', priority: 'urgent', due_date: null, created_at: '2' },
    { id: 'c', priority: 'normal', due_date: '2026-09-24', created_at: '3' },
    { id: 'd', priority: 'normal', due_date: null, created_at: '4' },
    { id: 'e', priority: 'low', due_date: '2026-09-20', created_at: '5' },
  ]).map((t) => t.id)
  check('urgent first, then by due date, undated last, low at the bottom', sorted, ['b', 'c', 'a', 'd', 'e'])
}

// ---------------------------------------------------------------- filters
const TASKS = [
  { id: '1', title: 'Fix Reliable form', status: 'todo', priority: 'high', assignees: ['Ethan'], tags: ['meta'], client_id: 'C1', due_date: '2026-09-23' },
  { id: '2', title: 'Write SOP', status: 'in_progress', priority: 'normal', assignees: ['Maria'], tags: [], list_id: 'L1', due_date: TODAY },
  { id: '3', title: 'Old thing', status: 'done', priority: 'low', assignees: ['ethan'], tags: [], client_id: 'C1' },
  { id: '4', title: 'Inbox idea', status: 'todo', priority: 'normal', assignees: [], tags: [], due_date: '2026-10-20' },
  { id: '5', title: 'Sub of 1', status: 'todo', priority: 'normal', assignees: [], tags: [], client_id: 'C1', parent_id: '1' },
]
const ids = (list) => list.map((t) => t.id)

check('done is hidden by default', ids(filterTasks(TASKS)), ['1', '2', '4', '5'])
check('and shown when asked', ids(filterTasks(TASKS, { showDone: true })), ['1', '2', '3', '4', '5'])
check('Me mode is case-insensitive on the name', ids(filterTasks(TASKS, { assignee: 'ETHAN', showDone: true })), ['1', '3'])
check('a client scope', ids(filterTasks(TASKS, { scope: { kind: 'client', id: 'C1' } })), ['1', '5'])
check('a list scope', ids(filterTasks(TASKS, { scope: { kind: 'list', id: 'L1' } })), ['2'])
check('the inbox is tasks with no client and no list', ids(filterTasks(TASKS, { scope: { kind: 'inbox' } })), ['4'])
check('search reads tags too', ids(filterTasks(TASKS, { search: 'META' })), ['1'])
check('due today includes overdue', ids(filterTasks(TASKS, { due: 'today' }, TODAY)), ['1', '2'])
check('due overdue is only overdue', ids(filterTasks(TASKS, { due: 'overdue' }, TODAY)), ['1'])

// --------------------------------------------------------------- grouping
{
  const g = groupTasks(filterTasks(TASKS), 'status')
  check('status groups are always all four, in order', g.map((x) => x.key), ['todo', 'in_progress', 'review', 'done'])
  check('an empty status group survives', g[2].tasks.length, 0)
}
{
  const g = groupTasks(filterTasks(TASKS), 'due', { today: TODAY })
  check('due groups in Home order, empties dropped', g.map((x) => x.key), ['overdue', 'today', 'later', 'none'])
}
{
  const g = groupTasks(filterTasks(TASKS), 'assignee')
  check('assignee groups, unassigned last', g.map((x) => x.label), ['Ethan', 'Maria', 'Unassigned'])
}
{
  const g = groupTasks(filterTasks(TASKS), 'client', { names: { clients: { C1: 'Reliable' }, lists: { L1: 'Agency' } } })
  check('client groups name the client and the list, inbox last', g.map((x) => x.label), ['Agency', 'Reliable', 'Inbox'])
}

// ---------------------------------------------------------------- nesting
{
  const nested = nestSubtasks(filterTasks(TASKS))
  check('subtasks fold under their parent', nested.find((t) => t.id === '1').subtasks.map((s) => s.id), ['5'])
  check('and are not also top level', ids(nested), ['1', '2', '4'])
  const orphan = nestSubtasks([{ id: 'x', parent_id: 'gone', status: 'todo' }])
  check('a subtask whose parent is out of view shows on its own', ids(orphan), ['x'])
}
check(
  'progress counts checklist and subtasks together',
  progress({ checklist: [{ done: true }, { done: false }], subtasks: [{ status: 'done' }] }),
  { done: 2, total: 3 }
)

// -------------------------------------------------------------- quick add
{
  const p = parseQuickAdd('Fix the Reliable form !high @ethan #meta due tomorrow', TODAY, ['Ethan'])
  check('quick add reads the flag', p.priority, 'high')
  check('the assignee, matched to a known name', p.assignees, ['Ethan'])
  check('the tag', p.tags, ['meta'])
  check('the due date', p.due_date, '2026-09-25')
  check('and leaves the title clean', p.title, 'Fix the Reliable form')
}
check('a plain line is just a title', parseQuickAdd('Call Comfort Experts about TOS', TODAY), {
  title: 'Call Comfort Experts about TOS',
  priority: 'normal',
  assignees: [],
  tags: [],
  due_date: null,
  place: null,
})
check('"urgent" as a word is not a flag', parseQuickAdd('urgent call back', TODAY).priority, 'normal')
check('due fri on a Thursday is tomorrow', parseQuickAdd('x due fri', TODAY).due_date, '2026-09-25')
check('due thu on a Thursday is NEXT Thursday', parseQuickAdd('x due thu', TODAY).due_date, '2026-10-01')
check('an explicit date passes through', parseQuickAdd('x due 2026-12-01', TODAY).due_date, '2026-12-01')
check('an email-like handle keeps its dots', parseQuickAdd('x @j.doe', TODAY).assignees, ['j.doe'])
{
  const PLACES = [
    { key: 'c:1', name: 'Reliable Heating and Cooling' },
    { key: 'c:2', name: 'Horizon HVAC' },
    { key: 'c:3', name: 'Horizon Water Co' },
    { key: 'l:1', name: 'Agency' },
  ]
  check('>reli files under Reliable', parseQuickAdd('Fix form >reli', TODAY, [], PLACES).place, 'c:1')
  check('and the word is gone from the title', parseQuickAdd('Fix form >reli', TODAY, [], PLACES).title, 'Fix form')
  check('>agency files under the list', parseQuickAdd('Write SOP >agency', TODAY, [], PLACES).place, 'l:1')
  check('a word matching two clients matches neither', parseQuickAdd('x >horizon', TODAY, [], PLACES).place, null)
  check('and stays in the title so it is not lost', parseQuickAdd('x >horizon', TODAY, [], PLACES).title, 'x >horizon')
  check('>water is enough to pick Horizon Water Co', parseQuickAdd('x >water', TODAY, [], PLACES).place, 'c:3')
  check('matchPlace is case-insensitive', matchPlace('HVAC', PLACES)?.key, 'c:2')
  check('matchPlace with nothing is null', matchPlace('', PLACES), null)
  check('a plain line has no place', parseQuickAdd('x', TODAY, [], PLACES).place, null)
}

// ---------------------------------------------------------------- summary
{
  const s = summarise(TASKS, TODAY)
  check('open counts top-level open tasks only', s.open, 3)
  check('overdue counted', s.overdue, 1)
  check('per client', s.byClient, { C1: 1 })
  check('per list', s.byList, { L1: 1 })
  check('inbox', s.inbox, 1)
}
check('known names are deduped case-insensitively', knownNames(TASKS), ['Ethan', 'Maria'])
check(
  'the roster comes first in roster order, then names seen on tasks',
  knownNames(TASKS, [{ name: 'Maria' }, { name: 'ethan' }, { name: 'Sam' }]),
  ['Maria', 'ethan', 'Sam']
)
check('roster spelling wins over a task spelling', knownNames([{ assignees: ['ETHAN'] }], [{ name: 'Ethan' }]), ['Ethan'])
check('per-person counts are open, top-level, case-insensitive', assigneeCounts(TASKS), { ethan: 1, maria: 1 })
check('initials from two words', initials('Ethan Cesaroni'), 'EC')
check('initials from one word', initials('maria'), 'M')
check('initials of nothing is nothing', initials(''), '')

// --------------------------------------------------------------- the Team view
{
  const cols = personColumns(filterTasks(TASKS), [{ name: 'Maria' }, { name: 'Ethan' }, { name: 'Sam' }])
  check('columns follow roster order, then Unassigned', cols.map((c) => c.label), ['Maria', 'Ethan', 'Sam', 'Unassigned'])
  check('an empty roster column survives', cols[2].tasks.length, 0)
  check('Ethan\u2019s column matches case-insensitively', ids(cols[1].tasks), ['1'])
  check('unassigned holds the rest', ids(cols[3].tasks), ['4', '5'])
  const withExtra = personColumns([{ id: 'z', status: 'todo', assignees: ['Zed'] }], [{ name: 'Maria' }])
  check('a name not on the roster gets its own column after Unassigned', withExtra.map((c) => c.label), ['Maria', 'Unassigned', 'Zed'])
}
check('reassign swaps the person it left for the one it landed on', reassign(['Maria', 'Sam'], 'Maria', 'Ethan'), ['Sam', 'Ethan'])
check('reassign from Unassigned adds', reassign([], null, 'Ethan'), ['Ethan'])
check('reassign to Unassigned removes', reassign(['Maria'], 'Maria', null), [])
check('reassign onto someone already on it does not duplicate', reassign(['Maria', 'Ethan'], 'Maria', 'ethan'), ['Ethan'])

// ---------------------------------------- the JS and the SQL say the same
{
  const sql = readFileSync(new URL('../supabase/tasks.sql', import.meta.url), 'utf8')
  const statuses = sql.match(/check \(status in \(([^)]+)\)\)/)?.[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1))
  const priorities = sql.match(/check \(priority in \(([^)]+)\)\)/)?.[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1))
  check('status list matches the SQL constraint', statuses, STATUS_KEYS)
  check('priority list matches the SQL constraint', priorities, TASK_PRIORITIES.map((p) => p.key))
}

if (failures) {
  console.log(`\n${failures} check${failures === 1 ? '' : 's'} failed`)
  process.exit(1)
}
console.log('\nAll task checks passed')
