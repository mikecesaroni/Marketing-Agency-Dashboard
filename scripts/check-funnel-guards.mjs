// Self-check for the funnel's guards. Run: node scripts/check-funnel-guards.mjs
import { buildGuards, builtTodayFrom, isFreshAccount } from '../src/lib/funnelGuards.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

const healthy = { status: 1, amount_spent: '125000', has_funding: true }
const fresh = { status: 1, amount_spent: '0', has_funding: false }
const closing = { status: 100, amount_spent: '0', has_funding: false }

check('a healthy account with nothing built is clear', buildGuards({ account: healthy }), { blockers: [], warnings: [] })
check('fresh: never spent and no card', [isFreshAccount(fresh), isFreshAccount(healthy), isFreshAccount(null)], [true, false, false])
check('a fresh account blocks until acknowledged', buildGuards({ account: fresh }).blockers.length, 1)
check('acknowledged, it only warns', [buildGuards({ account: fresh, acknowledged: { fresh: true } }).blockers.length, buildGuards({ account: fresh, acknowledged: { fresh: true } }).warnings.length], [0, 1])
check('a closing account blocks, and no tick clears it', buildGuards({ account: closing, acknowledged: { fresh: true, duplicate: true } }).blockers[0].includes('pending closure'), true)
check('built today blocks until acknowledged', [buildGuards({ account: healthy, builtToday: ['WC_X — Top of funnel — 2026-10-07'] }).blockers.length, buildGuards({ account: healthy, builtToday: ['WC_X'], acknowledged: { duplicate: true } }).blockers.length], [1, 0])
check('no account info (inspect failed) does not block', buildGuards({ account: null }), { blockers: [], warnings: [] })

const campaigns = [
  { name: 'WC_Dynamic Flow — Top of funnel — 2026-10-07', created: '2026-10-07T10:24:30-0700' },
  { name: 'WC_Dynamic Flow — Retargeting — 2026-10-07', created: '2026-10-07T10:24:32-0700' },
  { name: 'WC_Dynamic Flow — Top of funnel — 2026-10-01', created: '2026-10-01T09:00:00-0700' },
  { name: 'Client made this one', created: '2026-10-07T08:00:00-0700' },
]
check('built today: only WC_ campaigns created today', builtTodayFrom(campaigns, '2026-10-07'), ['WC_Dynamic Flow — Top of funnel — 2026-10-07', 'WC_Dynamic Flow — Retargeting — 2026-10-07'])
check('built today: none on another day', builtTodayFrom(campaigns, '2026-10-08'), [])

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
