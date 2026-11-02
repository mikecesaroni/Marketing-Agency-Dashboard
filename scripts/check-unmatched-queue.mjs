// Self-check for how the unmatched Stripe queue describes a parked row.
// Run: node scripts/check-unmatched-queue.mjs
//
// The rule: STRIPE SAYS HOW MONEY ARRIVED, THE CRM DOES NOT GUESS, AND THE
// PERSON ASSIGNING IT SAYS WHAT IT IS.

import { bookAs, collapseTwins, unmatchedIds, unmatchedKind, unmatchedNote } from '../src/lib/unmatchedQueue.js'

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

// One payment, one row: the checkout and the first invoice parked side by
// side (Justin Veda's $2,500, 2026-10-30) fold into the invoice row.
{
  const started = { id: 'a', stripe_customer_id: 'cus_v', amount: '2500', paid_date: '2026-10-30', payment_type: 'monthly', stripe_invoice_id: null, failed: false }
  const invoice = { id: 'b', stripe_customer_id: 'cus_v', amount: '2500', paid_date: '2026-10-30', payment_type: 'monthly', stripe_invoice_id: 'in_1', failed: false }
  const folded = collapseTwins([started, invoice])
  check('the checkout folds into the invoice row, which carries its id', [folded.length, folded[0].id, folded[0].twins], [1, 'b', ['a']])
  check('...so assigning or dismissing the one row takes both', unmatchedIds(folded[0]), ['b', 'a'])
  check('a row with no twin carries no twins', unmatchedIds({ id: 'x' }), ['x'])
  check('a different amount is a different payment', collapseTwins([started, { ...invoice, amount: '1500' }]).length, 2)
  check('a different day is a different payment', collapseTwins([started, { ...invoice, paid_date: '2026-11-30' }]).length, 2)
  check('a one-off and a subscription invoice of the same amount are two payments', collapseTwins([{ ...started, payment_type: 'setup' }, invoice]).length, 2)
  check('two invoices are two months', collapseTwins([invoice, { ...invoice, id: 'c', stripe_invoice_id: 'in_2' }]).length, 2)
  check('two checkouts with no invoice yet stay as they are', collapseTwins([started, { ...started, id: 'c' }]).length, 2)
  check('a decline is never folded into a payment', collapseTwins([{ ...started, failed: true, stripe_invoice_id: 'in_9' }, invoice]).length, 2)
  check('rows without a customer are left alone', collapseTwins([{ ...started, stripe_customer_id: null }, { ...invoice, stripe_customer_id: null }]).length, 2)
  check('the order of the queue is kept', collapseTwins([{ id: 'z', stripe_customer_id: 'cus_z', amount: '100' }, started, invoice]).map((r) => r.id), ['z', 'b'])
}

if (failures) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll unmatched queue checks passed')
