// Self-check for "our ads, not the client's own": campaigns that were
// spending before the account was connected to the CRM are left out of the
// flags, the live check and the weekly status.
// Run: node scripts/check-our-ads.mjs

import { legacyKey, legacySet, withoutLegacy } from '../src/lib/ourAds.js'
import { leadTotals } from '../src/lib/clientStatus.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

// Coelho Paiva: a Google account connected on Nov 2 carrying a search
// campaign that had been spending since Oct 6 ("we haven't had any live
// ads yet").
const legacy = [
  { client_id: 'coelho', channel: 'google', campaign_id: '111' },
  { client_id: 'coelho', channel: 'google', campaign_id: '222' },
]
const googleRows = [
  { client_id: 'coelho', campaign_id: 111, date: '2026-11-02', cost: 19.92, conversions: 0 },
  { client_id: 'coelho', campaign_id: '111', date: '2026-10-31', cost: 19.94, conversions: 0 },
  { client_id: 'coelho', campaign_id: '222', date: '2026-10-23', cost: 19.78, conversions: 0 },
  // A campaign we built after the connection counts.
  { client_id: 'coelho', campaign_id: '333', date: '2026-11-05', cost: 40, conversions: 1 },
  // Another client's campaign with the same id is not touched.
  { client_id: 'other', campaign_id: '111', date: '2026-11-02', cost: 10, conversions: 2 },
]

check('a key is client, channel and campaign', legacyKey('c', 'google', '9'), 'c:google:9')
check('the set is built from the view rows, once', legacySet(legacy).size, 2)
check('a Set passed in comes back as is', legacySet(new Set(['x'])).has('x'), true)
check("the client's own campaigns drop out, by client and channel; ours and other clients' stay", withoutLegacy(googleRows, legacy, 'google').map((r) => `${r.client_id}:${r.campaign_id}`), ['coelho:333', 'other:111'])
check('a number campaign id matches a text one in the view', withoutLegacy([googleRows[0]], legacy, 'google').length, 0)
check('the same campaign id on the other channel is not legacy', withoutLegacy([{ client_id: 'coelho', campaign_id: '111', date: '2026-11-02' }], legacy, 'meta').length, 1)
check('a row with no campaign id is kept', withoutLegacy([{ client_id: 'coelho', date: '2026-11-02' }], legacy, 'google').length, 1)
check('no legacy at all: the rows come back untouched', withoutLegacy(googleRows, [], 'google').length, 5)

// What the brief saw, and what it sees now.
const asDays = (rows) => rows.map((r) => ({ date: r.date, leads: r.conversions, spend: r.cost }))
const before = leadTotals(asDays(googleRows.filter((r) => r.client_id === 'coelho' && r.campaign_id !== '333')), '2026-11-03')
check('before: the legacy campaign counted as days of our ads', before.spendDays14 >= 2 && before.leads14 === 0, true)
const after = leadTotals(asDays(withoutLegacy(googleRows.filter((r) => r.client_id === 'coelho' && r.campaign_id !== '333'), legacy, 'google')), '2026-11-03')
check('after: no spend days, nothing to flag', [after.spendDays14, after.spend14], [0, 0])

if (failures) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
