// Deliverables: the grouping rules, and the JS/SQL agreement.
//
// The reason this exists at all is a bug that was live when it was written:
// DeliverableForm offered 'ghl setup' in its Type dropdown while the database
// check constraint allowed only five types, so picking it failed the save with
// a constraint violation. Two lists of the same thing, in two languages, with
// nothing holding them together.
//
// So the first thing checked here is that the type list in the JS and the check
// constraint in supabase/deliverable-templates.sql say the same thing. The rest
// pins the ordering and grouping, which is the part that makes the page usable
// and the easiest to break by accident.
//
// Run with: node scripts/check-deliverables.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DELIVERABLE_STATUSES,
  DELIVERABLE_TYPES,
  OTHER_PHASE,
  PHASE_ORDER,
  TYPE_ICONS,
  byLaunchOrder,
  groupByClient,
  groupByStage,
  isLate,
  launchSummary,
  mergeOverallProgress,
  progress,
} from '../src/lib/deliverables.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

let failures = 0
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`PASS  ${name}`)
  } else {
    failures++
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// --- the JS and the database have to agree -------------------------------
const sql = read('supabase/deliverable-templates.sql')

const typeConstraint = sql.match(
  /add constraint deliverables_type_check\s*\n?\s*check \(type in \(([\s\S]*?)\)\)/
)
if (!typeConstraint) {
  failures++
  console.error('FAIL  could not find the type check constraint in the SQL — did it move?')
} else {
  const sqlTypes = [...typeConstraint[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  check(
    'the type list matches the database check constraint',
    JSON.stringify([...sqlTypes].sort()) === JSON.stringify([...DELIVERABLE_TYPES].sort()),
    `SQL has [${sqlTypes}], JS has [${DELIVERABLE_TYPES}]`
  )
}

const statusConstraint = read('supabase/deliverables.sql').match(
  /status text not null default 'todo'\s*\n?\s*check \(status in \(([\s\S]*?)\)\)/
)
if (statusConstraint) {
  const sqlStatuses = [...statusConstraint[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  check(
    'the status list matches the database',
    JSON.stringify(sqlStatuses) === JSON.stringify(DELIVERABLE_STATUSES),
    `SQL [${sqlStatuses}] vs JS [${DELIVERABLE_STATUSES}]`
  )
}

check(
  'every type has an icon',
  DELIVERABLE_TYPES.every((t) => TYPE_ICONS[t]),
  `missing: ${DELIVERABLE_TYPES.filter((t) => !TYPE_ICONS[t])}`
)

// Every template the seeding function inserts, read straight out of the SQL.
const templates = [...sql.matchAll(/\('((?:meta|ghl)-[a-z0-9-]+)', '([^']+)', '([^']+)', (\d+), '(\w+)'/g)].map(
  (m) => ({ key: m[1], title: m[2], type: m[3], sortOrder: Number(m[4]), phase: m[5] })
)

check('the SQL defines all eight templates', templates.length === 8, `found ${templates.length}`)
check(
  'every template uses a type the constraint allows',
  templates.every((t) => DELIVERABLE_TYPES.includes(t.type)),
  `bad: ${templates.filter((t) => !DELIVERABLE_TYPES.includes(t.type)).map((t) => t.type)}`
)
check(
  'every template phase is a known phase',
  templates.every((t) => PHASE_ORDER.includes(t.phase)),
  `unknown: ${templates.filter((t) => !PHASE_ORDER.includes(t.phase)).map((t) => t.phase)}`
)
check(
  'template sort orders are unique',
  new Set(templates.map((t) => t.sortOrder)).size === templates.length
)
check(
  'hand-typed work (default 500) sorts after every seeded launch step',
  templates.every((t) => t.sortOrder < 500)
)

// The specific dependency that matters operationally: A2P is the long pole and
// SMS cannot work until it clears, so A2P must never sort after SMS.
const order = (key) => templates.find((t) => t.key === key)?.sortOrder
const before = (a, b) =>
  order(a) !== undefined && order(b) !== undefined && order(a) < order(b)

check('A2P comes before SMS automation', before('ghl-a2p', 'ghl-sms'))
check('getting access comes before going live', before('meta-access', 'meta-live'))
check(
  'access and go-live are separate templates, not one row',
  order('meta-access') !== undefined &&
    order('meta-live') !== undefined &&
    order('meta-access') !== order('meta-live')
)

// --- ordering ------------------------------------------------------------
const d = (over = {}) => ({
  id: Math.random().toString(36).slice(2),
  client_id: 'c1',
  clients: { name: 'Acme' },
  title: 'thing',
  type: 'other',
  status: 'todo',
  sort_order: 500,
  phase: null,
  due_date: null,
  ...over,
})

const ordered = [
  d({ title: 'z', sort_order: 40 }),
  d({ title: 'a', sort_order: 10 }),
  d({ title: 'm', sort_order: 500 }),
].sort(byLaunchOrder)
check(
  'launch order beats alphabetical',
  ordered.map((x) => x.title).join('') === 'azm',
  ordered.map((x) => x.title).join('')
)

const dated = [
  d({ title: 'no date' }),
  d({ title: 'later', due_date: '2026-09-10' }),
  d({ title: 'sooner', due_date: '2026-09-01' }),
].sort(byLaunchOrder)
check(
  'at equal launch order, dated work comes first and earliest leads',
  dated.map((x) => x.title).join('|') === 'sooner|later|no date',
  dated.map((x) => x.title).join('|')
)

// --- grouping by client --------------------------------------------------
const rows = [
  // Acme: half done.
  d({ client_id: 'a', clients: { name: 'Acme' }, sort_order: 10, phase: 'Meta', status: 'done' }),
  d({ client_id: 'a', clients: { name: 'Acme' }, sort_order: 20, phase: 'Meta' }),
  d({ client_id: 'a', clients: { name: 'Acme' }, sort_order: 110, phase: 'GoHighLevel' }),
  d({ client_id: 'a', clients: { name: 'Acme' }, sort_order: 500, phase: null }),
  // Bravo: everything done.
  d({ client_id: 'b', clients: { name: 'Bravo' }, sort_order: 10, phase: 'Meta', status: 'done' }),
  // Charlie: nothing done, most outstanding.
  d({ client_id: 'c', clients: { name: 'Charlie' }, sort_order: 10, phase: 'Meta' }),
  d({ client_id: 'c', clients: { name: 'Charlie' }, sort_order: 20, phase: 'Meta' }),
  d({ client_id: 'c', clients: { name: 'Charlie' }, sort_order: 30, phase: 'Meta' }),
]

const groups = groupByClient(rows)
check('one group per client', groups.length === 3)
check(
  'the client with the most outstanding work leads',
  groups[0].clientName === 'Charlie',
  groups.map((g) => g.clientName).join(', ')
)
check(
  'a fully launched client sinks to the bottom',
  groups[groups.length - 1].clientName === 'Bravo',
  groups.map((g) => g.clientName).join(', ')
)

// Acme and Charlie both have 3 outstanding; Charlie has got nowhere, Acme is
// a quarter done. The neglected one leads.
check(
  'at equal outstanding work, least progress leads',
  groups[0].percent === 0 && groups[1].percent === 25,
  groups.map((g) => `${g.clientName}:${g.percent}%`).join(', ')
)

const acme = groups.find((g) => g.clientName === 'Acme')
check('progress is counted per client', acme.done === 1 && acme.total === 4)
check('percent is rounded', acme.percent === 25, String(acme.percent))
check(
  'phases run Meta, then GoHighLevel, then hand-typed work',
  acme.phases.map((p) => p.phase).join(' > ') === `Meta > GoHighLevel > ${OTHER_PHASE}`,
  acme.phases.map((p) => p.phase).join(' > ')
)
check('each phase carries its own progress', acme.phases[0].done === 1 && acme.phases[0].total === 2)

// --- grouping by stage ---------------------------------------------------
const stageRows = [
  d({ client_id: 'a', clients: { name: 'Zulu' }, template_key: 'meta-video', title: 'Make the video ad', sort_order: 20, phase: 'Meta' }),
  d({ client_id: 'b', clients: { name: 'Alpha' }, template_key: 'meta-video', title: 'Make the video ad', sort_order: 20, phase: 'Meta' }),
  d({ client_id: 'a', clients: { name: 'Zulu' }, template_key: 'ghl-a2p', title: 'A2P registration', sort_order: 110, phase: 'GoHighLevel' }),
  // Retitled by hand, but still the same piece of work.
  d({ client_id: 'c', clients: { name: 'Mike' }, template_key: 'meta-video', title: 'Make TWO video ads', sort_order: 20, phase: 'Meta' }),
  // Genuinely hand-typed, no template.
  d({ client_id: 'a', clients: { name: 'Zulu' }, title: 'Write the newsletter' }),
  d({ client_id: 'b', clients: { name: 'Alpha' }, title: 'Write the newsletter' }),
]

const stages = groupByStage(stageRows)
const video = stages.find((s) => s.key === 'meta-video')
check('a retitled seeded item stays with its own kind', video.items.length === 3, String(video.items.length))
check(
  'clients within a stage are alphabetical, so the batch reads predictably',
  video.items.map((i) => i.clients.name).join(',') === 'Alpha,Mike,Zulu',
  video.items.map((i) => i.clients.name).join(',')
)
check(
  'hand-typed work with the same title gathers instead of scattering',
  stages.find((s) => s.key === 'manual:Write the newsletter').items.length === 2
)
check(
  'stages run in launch order, hand-typed last',
  stages.map((s) => s.key).join(' > ') === 'meta-video > ghl-a2p > manual:Write the newsletter',
  stages.map((s) => s.key).join(' > ')
)

// --- progress survives filtering ----------------------------------------
// The bug this pins: grouping the filtered list gave Acme "0/3" under the
// default open filter when the truth is 1 of 4 done.
const openOnly = rows.filter((r) => r.status !== 'done')
const naive = groupByClient(openOnly).find((g) => g.clientName === 'Acme')
check(
  'grouping a filtered list alone gets the totals wrong',
  naive.done === 0 && naive.total === 3,
  `${naive.done}/${naive.total}`
)

const merged = mergeOverallProgress(groupByClient(openOnly), groups).find(
  (g) => g.clientName === 'Acme'
)
check(
  'merged progress reports the real totals',
  merged.done === 1 && merged.total === 4 && merged.percent === 25,
  `${merged.done}/${merged.total} (${merged.percent}%)`
)
check(
  'the rows shown are still only the filtered ones',
  merged.items.every((i) => i.status !== 'done') && merged.items.length === 3,
  String(merged.items.length)
)
const mergedMeta = merged.phases.find((p) => p.phase === 'Meta')
check('phase totals are corrected too', mergedMeta.done === 1 && mergedMeta.total === 2)

const mergedStages = mergeOverallProgress(
  groupByStage(stageRows.filter((r) => r.status !== 'done')),
  groupByStage(stageRows),
  'key'
)
check('stage groups can be merged on their own key', mergedStages.length > 0)

// A group that vanished from the unfiltered set entirely must pass through
// untouched rather than throw.
check(
  'an unmatched group is left alone',
  mergeOverallProgress([{ clientId: 'nope', done: 0, total: 1, percent: 0 }], groups)[0].total === 1
)

// --- lateness ------------------------------------------------------------
check('an overdue open item is late', isLate(d({ due_date: '2026-01-01' }), '2026-08-31'))
check(
  'an overdue DONE item is not late',
  !isLate(d({ due_date: '2026-01-01', status: 'done' }), '2026-08-31')
)
check('an item with no due date is never late', !isLate(d(), '2026-08-31'))
check(
  'due today is not yet late',
  !isLate(d({ due_date: '2026-08-31' }), '2026-08-31')
)

// --- the header read -----------------------------------------------------
const summary = launchSummary(groups)
check('summary counts clients, not rows', summary.clients === 3, String(summary.clients))
check('one client is fully launched', summary.launched === 1)
check('two are still in flight', summary.inFlight === 2)
check('one has not been started at all', summary.notStarted === 1)

check('an empty list does not divide by zero', progress([]).percent === 0)
check('an empty list groups to nothing', groupByClient([]).length === 0)

if (failures > 0) {
  console.error(`\ndeliverables checks FAILED (${failures})`)
  process.exit(1)
}
console.log('\nAll deliverables checks passed')
