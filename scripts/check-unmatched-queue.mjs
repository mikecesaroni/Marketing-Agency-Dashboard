// Self-check for how the unmatched Stripe queue describes a parked row.
// Run: node scripts/check-unmatched-queue.mjs
//
// The rule: STRIPE SAYS HOW MONEY ARRIVED, THE CRM DOES NOT GUESS, AND THE
// PERSON ASSIGNING IT SAYS WHAT IT IS.

import { bookAs, unmatchedKind, unmatchedNote } from '../src/lib/unmatchedQueue.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

check('a one-off checkout reads as a one-time payment, not "setup"', unmatchedKind({ payment_type: 'setup' }), 'one-time payment')
check('a subscription checkout reads as a subscription started', unmatchedKind({ payment_type: 'monthly' }), 'subscription started')
check("a subscription's invoice reads as one", unmatchedKind({ payment_type: 'monthly', stripe_invoice_id: 'in_1' }), 'subscription invoice')
check('a parked decline reads as one', unmatchedKind({ payment_type: 'monthly', stripe_invoice_id: 'in_1', failed: true }), 'card declined')

check('booked as what the person picked', [bookAs({ payment_type: 'setup' }, 'monthly'), bookAs({ payment_type: 'monthly' }, 'setup')], ['monthly', 'setup'])
check("else as Stripe's shape says", [bookAs({ payment_type: 'setup' }), bookAs({ payment_type: 'monthly' }, 'nonsense'), bookAs({})], ['setup', 'monthly', 'monthly'])

check('a one-time payment carries the warning that nothing recurs', unmatchedNote({ payment_type: 'setup' }).startsWith('A one-time payment'), true)
check('a subscription or a decline carries none', [unmatchedNote({ payment_type: 'monthly' }), unmatchedNote({ payment_type: 'setup', failed: true })], ['', ''])

if (failures) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll unmatched queue checks passed')
