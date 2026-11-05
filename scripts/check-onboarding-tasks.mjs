// Self-check for Ken's onboarding tasks: the four tasks a new client gets,
// the package deciding the tracking line, the due dates, and the no-double
// rule.
// Run: node scripts/check-onboarding-tasks.mjs

import { readFileSync } from 'node:fs'
import { ONBOARDING_OWNER, ONBOARDING_TAG, SCRIPTS_TASK_OWNER, SCRIPTS_TASK_SUFFIX, landingPageTitle, missingOnboardingTasks, onboardingTasks, scriptsTaskTitle } from '../src/lib/onboardingTasks.js'
import { formSubmittedSlack, onboardingTasksSlack } from '../src/lib/teamBrief.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

// --- the landing page line follows the package -------------------------------------
check('$1,500 plan: pixel only', landingPageTitle('Express Home Services', 1), 'Express Home Services GHL Landing Page + Meta Pixel')
check('$2,500 plan: Meta and Google', landingPageTitle('Express Home Services', 2), 'Express Home Services GHL Landing Page + Meta & Google Ads Tracking')
check('$3,500 plan: Meta and Google too', landingPageTitle('Express Home Services', 3), 'Express Home Services GHL Landing Page + Meta & Google Ads Tracking')
check('no tier yet: pixel only, never a guess at Google', landingPageTitle(' Acme ', 0), 'Acme GHL Landing Page + Meta Pixel')

// --- the four tasks -----------------------------------------------------------------
const tasks = onboardingTasks({ id: 'c1', name: 'Paradise Home Services', tier: 2 }, { today: '2026-11-02', by: 'Ethan' })
check('four tasks, in the order the list was given', tasks.map((t) => t.key), ['landing', 'account', 'a2p', 'access'])
check('titles: the client first, then the job, the way the board reads', tasks.map((t) => t.title), [
  'Paradise Home Services GHL Landing Page + Meta & Google Ads Tracking',
  'Paradise Home Services GHL Account + Client Added as User',
  'Paradise Home Services A2P Verification',
  'Paradise Home Services Let Them Know How to Access Their Account + GHL How-To Video',
])
check('every task is Ken\'s, tagged, on the client, starting today, signed', tasks.map((t) => [t.assignees, t.tags, t.client_id, t.start_date, t.created_by, t.status, t.priority]), tasks.map(() => [[ONBOARDING_OWNER], [ONBOARDING_TAG], 'c1', '2026-11-02', 'Ethan', 'todo', 'normal']))
// "No need to add due dates for those": they start the day added and Ken
// dates them himself if he wants to, so nothing goes overdue on its own.
check('no due dates', tasks.map((t) => t.due_date), [null, null, null, null])
check('the account access task carries the four things to tell them', tasks[3].checklist.map((c) => c.text), ['How to log in', 'Download the app', 'Turn on notifications', 'GHL how-to video sent'])
check('checklist items have ids and start unticked', tasks[3].checklist.every((c) => c.id && c.done === false), true)
check('the $2,500 landing page lists Google tracking as a tick', tasks[0].checklist.map((c) => c.text), ['Landing page built on GHL', 'Meta pixel connected', 'Google Ads tracking connected'])
check('the account access description says what to send', tasks[3].description, 'Once they are added as a user, let the client know how to access their account: how to log in, download the app, turn on notifications. Send the GHL how-to video.')

const small = onboardingTasks({ id: 'c2', name: 'Acme', tier: 1 }, { today: '2026-11-02' })
check('$1,500 plan: the landing page says pixel only and no Google', [small[0].title, small[0].description, small[0].checklist.length], ['Acme GHL Landing Page + Meta Pixel', 'Build the landing page on GHL and connect the Meta pixel. $1,500 plan: no Google Ads tracking.', 2])
check('no name, no day: still four tasks, no start', onboardingTasks({}, {}).map((t) => [t.title.startsWith('New client'), t.due_date, t.start_date]), [[true, null, null], [true, null, null], [true, null, null], [true, null, null]])
check('no checklist ids collide inside a task', new Set(tasks[0].checklist.map((c) => c.id)).size, 3)

// --- made twice adds nothing ---------------------------------------------------------
check('tasks the client already has, by title, are not made again', missingOnboardingTasks(tasks, [{ title: 'paradise home services a2p verification' }, { title: 'Something else' }]).map((t) => t.key), ['landing', 'account', 'access'])
check('nothing there yet: all four', missingOnboardingTasks(tasks, []).length, 4)

// --- the channel hears, once, as one post -------------------------------------------
const rows = tasks.map((t, i) => ({ id: `t${i + 1}`, title: t.title, assignees: t.assignees, due_date: t.due_date }))
const post = onboardingTasksSlack({ client: { id: 'c1', name: 'Paradise Home Services' }, tasks: rows, by: 'ethan@example.com', appUrl: 'https://crm.example/' })
check('one post: who gave Ken how many onboarding tasks for whom', post.text, 'Ethan gave Ken 4 onboarding tasks for Paradise Home Services: Paradise Home Services GHL Landing Page + Meta & Google Ads Tracking, Paradise Home Services GHL Account + Client Added as User, Paradise Home Services A2P Verification, Paradise Home Services Let Them Know How to Access Their Account + GHL How-To Video')
check('the block lists each task on its own line, linked', post.blocks[0].text.text, '📋 *Ethan* gave *Ken* 4 onboarding tasks for <https://crm.example/client/c1|Paradise Home Services>:\n• <https://crm.example/tasks|Paradise Home Services GHL Landing Page + Meta &amp; Google Ads Tracking>\n• <https://crm.example/tasks|Paradise Home Services GHL Account + Client Added as User>\n• <https://crm.example/tasks|Paradise Home Services A2P Verification>\n• <https://crm.example/tasks|Paradise Home Services Let Them Know How to Access Their Account + GHL How-To Video>')
check('a task somebody dated later still shows its due day', onboardingTasksSlack({ client: { id: 'c1', name: 'Acme' }, tasks: [{ id: 't1', title: 'Acme A2P Verification', assignees: ['Ken'], due_date: '2026-11-05' }], by: 'Ethan' }).text, 'Ethan gave Ken 1 onboarding task for Acme: Acme A2P Verification (due Nov 5)')
check('the context links the board and their page', post.blocks[1].elements[0].text, '<https://crm.example/tasks|Tasks> · <https://crm.example/client/c1|Their page>')
check('one task reads singular, nobody known still a sentence', onboardingTasksSlack({ client: { id: 'c1', name: 'Acme' }, tasks: [{ id: 't1', title: 'Acme A2P Verification', assignees: ['Ken'] }] }).text, 'Someone gave Ken 1 onboarding task for Acme: Acme A2P Verification')
check('two people across the tasks read as a pair', onboardingTasksSlack({ client: { name: 'Acme' }, tasks: [{ title: 'A', assignees: ['Ken'] }, { title: 'B', assignees: ['Josh'] }], by: 'Ethan' }).text.startsWith('Ethan gave Ken and Josh 2 onboarding tasks for Acme'), true)
check('no tasks, no post', onboardingTasksSlack({ client: { name: 'Acme' }, tasks: [] }), null)

// --- the form's own task: Ethan sends the video scripts ---------------------------
// ("When a client fills in the onboarding form it auto adds a task for
// Ethan to send the client video scripts.") Made by the database the moment
// the form's submitted stamp is set; the wording here and in the SQL agree.
check('the scripts task reads like the others: the client first, then the job', scriptsTaskTitle(' Acme Heating '), 'Acme Heating Send Video Scripts')
check('it is for Ethan', SCRIPTS_TASK_OWNER, 'Ethan')
const sql = readFileSync(new URL('../supabase/scripts-task.sql', import.meta.url), 'utf8')
check('the trigger makes the same title, for the same person, tagged onboarding', [sql.includes(`|| ' ${SCRIPTS_TASK_SUFFIX}'`), sql.includes(`array['${SCRIPTS_TASK_OWNER}']`), sql.includes("array['onboarding']")], [true, true, true])
check('the trigger fires once, on the first submitted stamp, and never twice for a client', [sql.includes('old.intake_submitted_at is not null then'), sql.includes('lower(t.title) = lower(v_title)'), sql.includes('after update of intake_submitted_at on public.onboarding_links')], [true, true, true])
const formLine = formSubmittedSlack([{ client: { id: 'f1', name: 'Acme & Sons' }, form: 'intake', at: '2026-11-05T14:00:00Z', task: 'Ethan: send the video scripts' }], { appUrl: 'https://crm.example' })
check('the Form in line says the task was made and for whom', [formLine.text, formLine.blocks[0].text.text], ['Acme &amp; Sons filled in their onboarding form · task for Ethan: send the video scripts', '*Form in*\n📝 <https://crm.example/client/f1|Acme &amp; Sons> filled in their onboarding form · task for Ethan: send the video scripts'])
check('a GHL form, or a form with no task, reads as before', formSubmittedSlack([{ client: { id: 'f2', name: 'Belk' }, form: 'ghl' }]).text, 'Belk sent back their GHL account details')

if (failures) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
