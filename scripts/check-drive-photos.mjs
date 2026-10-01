// Self-check for the Drive photos page's arithmetic: newest added first,
// grouped by local day with plain labels. Run: node scripts/check-drive-photos.mjs
import { groupByAdded, kindOf, sortNewestAdded } from '../src/lib/drivePhotos.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

const today = new Date(2026, 9, 2, 15, 0, 0) // Oct 2 2026, 3pm local
const iso = (y, m, d, h = 12) => new Date(y, m - 1, d, h).toISOString()
const files = [
  { id: 'old', name: 'old.jpg', mime_type: 'image/jpeg', created_time: iso(2026, 9, 20), modified_time: iso(2026, 10, 2) },
  { id: 'today', name: 'today.heic', mime_type: 'image/heic', created_time: iso(2026, 10, 2, 9) },
  { id: 'yday', name: 'clip.mp4', mime_type: 'video/mp4', created_time: iso(2026, 10, 1, 23) },
  { id: 'nodate', name: 'logo.pdf', mime_type: 'application/pdf' },
  { id: 'legacy', name: 'legacy.png', mime_type: 'image/png', modified_time: iso(2026, 10, 2, 8) },
]

check('newest ADDED first, not newest changed', sortNewestAdded(files).map((f) => f.id), ['today', 'legacy', 'yday', 'old', 'nodate'])
check('a listing without created_time falls back to modified_time', sortNewestAdded(files)[1].id, 'legacy')
check('kinds', files.map(kindOf), ['photo', 'photo', 'video', 'pdf', 'photo'])

const groups = groupByAdded(files, today)
check('grouped by local day, newest day first, with plain labels', groups.map((g) => [g.label, g.files.map((f) => f.id)]), [
  ['Added today', ['today', 'legacy']],
  ['Added yesterday', ['yday']],
  [new Date(2026, 8, 20).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }), ['old']],
  ['No date', ['nodate']],
])
check('an older year shows the year', groupByAdded([{ id: 'x', created_time: iso(2025, 1, 5) }], today)[0].label, new Date(2025, 0, 5).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }))
check('empty in, empty out', groupByAdded([], today), [])

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
