// Self-check for the nightly learnings block. Run: node scripts/check-ad-learnings.mjs
//
// The rule: EVERY AI SURFACE READS THE SAME BLOCK, THIS CLIENT FIRST, THE
// AGENCY SECOND, AND AN EMPTY TABLE PRODUCES NOTHING RATHER THAN A HEADING
// OVER NOTHING.

import { accountRows, clientRows, clientSummary, learningsBlock } from '../src/lib/adLearnings.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

const rows = [
  { scope: 'account', client_id: null, kind: 'worst_ads', sort_order: 55, headline: 'MOST EXPENSIVE: x.', computed_at: '2026-09-06T08:40:00Z' },
  { scope: 'account', client_id: null, kind: 'format_split', sort_order: 10, headline: 'FORMAT: video $37 per lead.', computed_at: '2026-09-06T08:40:00Z' },
  { scope: 'client', client_id: 'c1', kind: 'client_fatigue', sort_order: 30, headline: 'FATIGUE WATCH: "A" CTR 2.1% -> 1.5%.', computed_at: '2026-09-06T08:40:00Z' },
  { scope: 'client', client_id: 'c1', kind: 'client_summary', sort_order: 10, headline: 'Belk, LAST 30 DAYS: $900 spent.', evidence: { last7_leads: 4 }, computed_at: '2026-09-06T08:40:00Z' },
  { scope: 'client', client_id: 'c2', kind: 'client_summary', sort_order: 10, headline: 'Other client.', computed_at: '2026-09-06T08:40:00Z' },
]

check('account rows sorted', accountRows(rows).map((r) => r.kind), ['format_split', 'worst_ads'])
check('client rows are that client only, sorted', clientRows(rows, 'c1').map((r) => r.kind), ['client_summary', 'client_fatigue'])
check('client summary evidence comes back', clientSummary(rows, 'c1'), { last7_leads: 4 })
check('no summary, null', clientSummary(rows, 'zz'), null)

const block = learningsBlock(rows, 'c1')
check('block is headed and dated', /WHAT OUR OWN DATA SAYS[^\n]*2026-09-06/.test(block), true)
check('block says these win over general rules', /they win for these clients/.test(block), true)
check('this client comes before the agency', block.indexOf('THIS CLIENT:') < block.indexOf('ACROSS THE AGENCY:'), true)
check('other clients are not leaked into this one', /Other client/.test(block), false)
check('lines are bullets with the headline verbatim', block.includes('- Belk, LAST 30 DAYS: $900 spent.'), true)
check('no client id: agency block only', /THIS CLIENT/.test(learningsBlock(rows)), false)
check('empty table: empty string, not a heading', learningsBlock([], 'c1'), '')
check('null rows: empty string', learningsBlock(null, 'c1'), '')

console.log(failures ? `\n${failures} check(s) failed` : '\nAll learnings checks pass')
process.exit(failures ? 1 : 0)
