// Self-check for the Stripe reconciliation. Run: node scripts/check-reconcile.mjs
//
// The fixtures are the real shapes this found in production on 2026-08-30:
// clients who had moved onto a $1,500 package while the CRM still said $998,
// one paying that total as two Stripe subscriptions, and one payment recorded
// twice because the CSV importer and the webhook store different Stripe
// identifiers and neither can see the other's rows.

import assert from 'node:assert/strict'
import { feeMismatches, duplicateSuspects, latestBillingMonth } from '../src/lib/reconcile.js'

const client = (over) => ({ id: over.name, monthly_fee: 998, archived: false, ...over })
const paid = (id, type, amount, date, stripe) => ({
  id: `${id}-${type}-${amount}-${date}`, client_id: id, payment_type: type,
  amount, paid_date: date, status: 'paid',
  stripe_invoice_id: stripe ? `in_${id}${amount}` : null, stripe_event_id: null,
})

// --- fee drift -------------------------------------------------------------
{
  const clients = [
    // Moved onto the $1,500 package; the CRM still says $998. The real case.
    client({ name: 'moved-up', stripe_customer_id: 'cus_1' }),
    // Pays the same total as two Stripe subscriptions, and the fee says so.
    client({ name: 'two-subs', monthly_fee: 1397 }),
    // Agrees.
    client({ name: 'fine', stripe_customer_id: 'cus_2' }),
  ]
  const payments = [
    paid('moved-up', 'monthly', 1500, '2026-08-24', true),
    paid('two-subs', 'monthly', 998, '2026-08-28', true),
    paid('two-subs', 'monthly', 399, '2026-08-28', true),
    paid('fine', 'monthly', 998, '2026-08-16', true),
  ]

  const found = feeMismatches(clients, payments)
  assert.equal(found.length, 1, 'only the drifted client is flagged')
  assert.equal(found[0].client.name, 'moved-up')
  assert.equal(found[0].expected, 998)
  assert.equal(found[0].collected, 1500)
  assert.deepEqual(found[0].suggestion, { monthly_fee: 1500 })
  console.log('PASS  a client moved onto a bigger package is flagged')
  console.log('PASS  the suggestion is the total Stripe collected')
}

// Two charges adding up to the fee is not a mismatch. The monthly fee is the
// monthly total, however many subscriptions make it up, so the number of
// charges is deliberately not checked.
{
  const clients = [client({ name: 'split', monthly_fee: 1397 })]
  const payments = [
    paid('split', 'monthly', 998, '2026-08-28', true),
    paid('split', 'monthly', 399, '2026-08-28', true),
  ]
  assert.equal(feeMismatches(clients, payments).length, 0)
  console.log('PASS  two charges summing to the fee is not a mismatch')
}

// But two charges that do NOT add up still are.
{
  const clients = [client({ name: 'short', monthly_fee: 1500 })]
  const payments = [
    paid('short', 'monthly', 998, '2026-08-28', true),
    paid('short', 'monthly', 399, '2026-08-28', true),
  ]
  const [row] = feeMismatches(clients, payments)
  assert.equal(row.collected, 1397)
  assert.equal(row.difference, -103)
  console.log('PASS  charges that do not add up to the fee are flagged')
}

// Only the most recent month counts, so an old price is not held against a
// client who has since been corrected.
{
  const clients = [client({ name: 'moved', monthly_fee: 1500 })]
  const payments = [
    paid('moved', 'monthly', 998, '2026-06-01', true),
    paid('moved', 'monthly', 998, '2026-07-01', true),
    paid('moved', 'monthly', 1500, '2026-08-01', true),
  ]
  assert.equal(feeMismatches(clients, payments).length, 0)
  assert.equal(latestBillingMonth(payments).moved.month, '2026-08')
  console.log('PASS  only the latest billing month is compared')
}

// A setup fee is a one-off and must not count toward a monthly comparison.
{
  const clients = [client({ name: 's' })]
  const payments = [
    paid('s', 'setup', 2500, '2026-08-01', true),
    paid('s', 'monthly', 998, '2026-08-01', true),
  ]
  assert.equal(feeMismatches(clients, payments).length, 0)
  console.log('PASS  a setup fee does not count as monthly revenue')
}

// Nobody who has never paid is flagged, and neither are archived clients.
{
  const never = [client({ name: 'new' })]
  assert.equal(feeMismatches(never, []).length, 0)
  const gone = [client({ name: 'old', monthly_fee: 1, archived: true })]
  assert.equal(feeMismatches(gone, [paid('old', 'monthly', 998, '2026-08-01', true)]).length, 0)
  console.log('PASS  clients who never paid, and archived ones, are left out')
}

// --- partial client rows ---------------------------------------------------
// A projection missing the columns these functions read fails silently and
// produces a plausible wrong number, which is the worst kind. The real fix is
// CLIENT_BILLING_COLUMNS in billing.js; this records the failure so a future
// projection that drops one is caught here rather than by someone reading a
// wrong figure off the page.
{
  const full = client({ name: 'ok', monthly_fee: 1500 })
  const payments = [paid('ok', 'monthly', 1500, '2026-08-24', true)]
  assert.equal(feeMismatches([full], payments).length, 0, 'a complete row reconciles')

  const noFee = { id: full.id, name: full.name, status: 'active' }
  const wrong = feeMismatches([noFee], payments)
  assert.equal(wrong.length, 1, 'a row without monthly_fee reads as billing nothing')
  assert.equal(wrong[0].expected, 0)

  const noArchived = { id: 'gone', name: 'gone', monthly_fee: 1 }
  assert.equal(
    feeMismatches([noArchived], [paid('gone', 'monthly', 998, '2026-08-01', true)]).length,
    1,
    'and without the archived flag a churned client cannot be excluded'
  )
  console.log('PASS  a complete client row reconciles cleanly')
  console.log('PASS  the partial-row failure mode is pinned down')
}

// --- duplicates ------------------------------------------------------------
{
  const clients = [{ id: 'rel', name: 'Reliable Heating and Cooling' }]
  const webhook = paid('rel', 'monthly', 399, '2026-08-28', true)
  const imported = { ...paid('rel', 'monthly', 399, '2026-08-28', false), id: 'imported-row' }
  const other = paid('rel', 'monthly', 998, '2026-08-28', true)

  const dupes = duplicateSuspects([webhook, imported, other], clients)
  assert.equal(dupes.length, 1, 'the $998 is not a duplicate of the $399')
  assert.equal(dupes[0].amount, 399)
  assert.equal(dupes[0].confident, true)
  assert.equal(dupes[0].keep.id, webhook.id, 'the row with a Stripe invoice id is kept')
  assert.deepEqual(dupes[0].extras.map((r) => r.id), ['imported-row'])
  console.log('PASS  the same payment recorded twice is caught')
  console.log('PASS  the row carrying Stripe provenance is the one kept')
}

// Two rows with no Stripe id either way cannot be judged automatically.
{
  const clients = [{ id: 'x', name: 'X' }]
  const a = { ...paid('x', 'monthly', 500, '2026-08-01', false), id: 'a' }
  const b = { ...paid('x', 'monthly', 500, '2026-08-01', false), id: 'b' }
  const [d] = duplicateSuspects([a, b], clients)
  assert.equal(d.confident, false)
  console.log('PASS  a pair with no Stripe provenance is surfaced but not judged')
}

// Unpaid rows are a schedule, not money, and never duplicates of each other.
{
  const clients = [{ id: 'y', name: 'Y' }]
  const pending = (n) => ({ id: n, client_id: 'y', payment_type: 'monthly', amount: 998,
    due_date: '2026-09-01', paid_date: null, status: 'pending' })
  assert.equal(duplicateSuspects([pending('1'), pending('2')], clients).length, 0)
  console.log('PASS  pending schedule rows are not duplicates')
}

console.log('\nAll checks passed')
