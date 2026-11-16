// Self-check for the live client count. Run: node scripts/check-live-clients.mjs
//
// 2026-11-16: "'Clients 20 live' make so this is live clients who are not
// paused or archived."

import { readFileSync } from 'node:fs'
import { liveClients } from '../src/lib/liveClients.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const clients = [
  { name: 'Live', archived: false, paused_at: null },
  { name: 'Paused', archived: false, paused_at: '2026-10-01' },
  { name: 'Archived', archived: true, paused_at: null },
  { name: 'Both', archived: true, paused_at: '2026-10-01' },
  { name: 'No flags' },
]
check('live is not archived and not paused', liveClients(clients).map((c) => c.name), ['Live', 'No flags'])
check('nothing is an empty list', liveClients(), [])

const home = read('src/pages/HomePage.jsx')
const page = read('src/pages/ClientsPage.jsx')
check('the Clients tile, the Clients card and the Clients page all count live clients', [home.includes("'/clients': `${active.length} live`"), /label="Clients"\s+value=\{active\.length\}/.test(home), home.includes('liveClients(clients)'), page.includes('liveClients(clients).length')], [true, true, true, true])

if (failures) {
  console.log(`\n${failures} FAILED`)
  process.exit(1)
}
console.log('\nAll live client checks passed.')
