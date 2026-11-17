// Self-check for the Content tab's rollup. Run: node scripts/check-content-hub.mjs
//
// Who shows, in what order, with what numbers. The ordering is the part that
// makes the tab useful (the client you worked on this morning is at the top)
// and the easiest to break by accident.

import { ago, driveFolders, hubStats, rollupClients, searchClients, sortForContent } from '../src/lib/contentHub.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

const CLIENTS = [
  { id: 'A', name: 'Belk', industry: 'HVAC', archived: false, is_internal: false, drive_folder_id: 'f1', extra_drive_folder_ids: null },
  { id: 'B', name: 'Horizon HVAC', industry: 'HVAC', archived: false, is_internal: true, drive_folder_id: null, extra_drive_folder_ids: [] },
  { id: 'C', name: 'Plumbquick', industry: 'Plumbing', archived: false, is_internal: false, drive_folder_id: 'f2', extra_drive_folder_ids: ['f3', 'f4'] },
  { id: 'D', name: 'Exodus', industry: '', archived: true, is_internal: false, drive_folder_id: null },
  { id: 'E', name: 'Active Air', industry: 'HVAC', archived: false, is_internal: false, drive_folder_id: 'f5' },
]
const SAVED = [
  { client_id: 'A', created_at: '2026-09-01T00:00:00Z' },
  { client_id: 'C', created_at: '2026-09-20T00:00:00Z' },
  { client_id: 'D', created_at: '2026-09-23T00:00:00Z' },
]
const PUBLISHED = [
  { client_id: 'A', created_at: '2026-09-10T00:00:00Z', status: 'ACTIVE' },
  { client_id: 'A', created_at: '2026-09-11T00:00:00Z', status: 'PAUSED' },
  { client_id: 'B', created_at: '2026-09-22T00:00:00Z', status: 'ACTIVE' },
]
const VIDEOS = [{ client_id: 'B', created_at: '2026-09-15T00:00:00Z' }]

const rows = rollupClients(CLIENTS, SAVED, PUBLISHED, VIDEOS)
const byId = Object.fromEntries(rows.map((r) => [r.id, r]))

check('archived clients are left out', rows.map((r) => r.id).sort(), ['A', 'B', 'C', 'E'])
check('internal businesses stay, and are marked', byId.B.internal, true)
check('folders: primary first, then extras', byId.C.folders, ['f2', 'f3', 'f4'])
check('folders: a null extras column is fine', byId.A.folders, ['f1'])
check('folders: none', byId.B.folders, [])
check('driveFolders on nothing is empty', driveFolders(null), [])
check('saved count', byId.A.saved, 1)
check('published and live counts', [byId.A.published, byId.A.live], [2, 1])
check('videos count', byId.B.videos, 1)
check('last published is the newest published row', byId.A.lastPublished, '2026-09-11T00:00:00Z')
check('last activity is the newest of anything', byId.B.lastActivity, '2026-09-22T00:00:00Z')
check('a client with nothing has no activity', byId.E.lastActivity, null)

check('most recent activity first, untouched last', sortForContent(rows).map((r) => r.id), ['B', 'C', 'A', 'E'])
check('search matches name', searchClients(rows, 'plumb').map((r) => r.id), ['C'])
check('search matches industry', searchClients(rows, 'hvac').map((r) => r.id).sort(), ['A', 'B', 'E'])
check('empty search is everything', searchClients(rows, '  ').length, 4)

check('hub stats', hubStats(rows), {
  clients: 4,
  saved: 2,
  videos: 1,
  withDrive: 3,
  folders: 5,
  pages: 0,
  withPages: 0,
  published: 3,
  live: 2,
  readyToPublish: 3,
})

const NOW = new Date('2026-09-24T12:00:00Z')
check('ago: today', ago('2026-09-24T08:00:00Z', NOW), 'today')
check('ago: yesterday', ago('2026-09-23T08:00:00Z', NOW), 'yesterday')
check('ago: days', ago('2026-09-20T08:00:00Z', NOW), '4 days ago')
check('ago: weeks', ago('2026-09-05T08:00:00Z', NOW), '2 wk ago')
check('ago: months', ago('2026-06-05T08:00:00Z', NOW), '3 mo ago')
check('ago: nothing', ago(null, NOW), '')

// 2026-11-16: "add in create lead form as option". A door on the Content hub
// that opens each client's instant form builder.
{
  const { readFileSync } = await import('node:fs')
  const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
  const page = read('src/pages/ContentPage.jsx')
  const detail = read('src/pages/ClientDetailPage.jsx')
  check('Create lead form: a door on the hub, its client list opens the form builder on the client page', [page.includes("key: 'forms',"), page.includes("title: 'Create lead form',"), page.includes("tab === 'forms' ? `/client/${r.id}?open=form`"), detail.includes("else if (want === 'form') openStudio('form')")], [true, true, true, true])
  check('...and says when a client has no Facebook Page to put a form on', [page.includes('No Facebook Page ID yet'), rollupClients([{ id: 'a', name: 'A', meta_page_id: '123' }, { id: 'b', name: 'B' }], [], [], []).map((r) => r.metaPage)], [true, [true, false]])
}

// 2026-11-17: "on mobile I'm unable to click clear over on the right side".
// The "Which client?" list, as wide as the longest client name, stretched the
// board past a phone's edge (measured: 542px wide on a 390px iPhone, Clear at
// the edge); a grid item must be allowed to shrink.
{
  const { readFileSync } = await import('node:fs')
  const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
  const video = read('src/components/VideoDropBoard.jsx')
  const statics = read('src/components/StaticDropBoard.jsx')
  check('both drop boards stay inside a phone: the board can shrink, the client list and the note box too', [video.includes('`min-w-0 max-w-full rounded-3xl'), statics.includes('`min-w-0 max-w-full rounded-3xl'), video.includes('min-w-0 max-w-full flex-1 rounded-lg'), video.includes('w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm sm:w-64'), !video.includes('className="w-64 '), !statics.includes('className="min-w-[16rem] flex-1')], [true, true, true, true, true, true])
}

if (failures) {
  console.log(`\n${failures} check${failures === 1 ? '' : 's'} failed`)
  process.exit(1)
}
console.log('\nAll content-hub checks passed')
