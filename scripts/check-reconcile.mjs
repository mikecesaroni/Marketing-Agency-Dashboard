// Self-check for the Stripe reconciliation. Run: node scripts/check-reconcile.mjs
//
// The fixtures are the real shapes this found in production on 2026-08-30:
// two clients who had moved onto the combined $1,500 plan while the CRM still
// said $998 + $399, one genuinely on two subscriptions, and one $399 payment
// recorded twice because the CSV importer and the webhook store different
// Stripe identifiers and neither can see the other's rows.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The app imports without file extensions, which Vite resolves and node does
// not. Rather than bend the codebase to suit this script, the extension is
// added to a throwaway copy here.
const lib = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib')
const patched = path.join(os.tmpdir(), `reconcile.${process.pid}.mjs`)
fs.writeFileSync(
  patched,
  fs
    .readFileSync(path.join(lib, 'reconcile.js'), 'utf8')
    .replace("from './ghlSetupFields'", `from ${JSON.stringify(path.join(lib, 'ghlSetupFields.js'))}`)
)
const { feeMismatches, duplicateSuspects, latestBillingMonth } = await import(`file://${patched}`)
fs.unlinkSync(patched)

const client = (over) => ({
  id: over.name, monthly_fee: 998, ghl_monthly_fee: 399,
  ghl_plan: false, ghl_billing: 'bundled', ...over,
})
const paid = (id, type, amount, date, stripe) => ({
  id: `${id}-${type}-${amount}-${date}`, client_id: id, payment_type: type,
  amount, paid_date: date, status: 'paid',
  stripe_invoice_id: stripe ? `in_${id}${amount}` : null, stripe_event_id: null,
})

// --- fee drift -------------------------------------------------------------
{
  const clients = [
    // Moved to the combined plan; CRM still says separate. The real Belk case.
    client({ name: 'belk', ghl_plan: true, ghl_billing: 'separate' }),
    // Genuinely two subscriptions. The real Reliable case.
    client({ name: 'reliable', ghl_plan: true, ghl_billing: 'separate' }),
    // Plain retainer, agrees.
    client({ name: 'plain' }),
  ]
  const payments = [
    paid('belk', 'monthly', 1500, '2026-08-24', true),
    paid('reliable', 'monthly', 998, '2026-08-28', true),
    paid('reliable', 'ghl', 399, '2026-08-28', true),
    paid('plain', 'monthly', 998, '2026-08-16', true),
  ]

  const found = feeMismatches(clients, payments)
  assert.equal(found.length, 1, 'only the drifted client is flagged')
  assert.equal(found[0].client.name, 'belk')
  assert.equal(found[0].expected, 1397)
  assert.equal(found[0].collected, 1500)
  assert.deepEqual(found[0].suggestion, {
    monthly_fee: 1500, ghl_billing: 'bundled', ghl_monthly_fee: 399,
    label: 'one charge of 1500',
  })
  console.log('PASS  a client moved onto the combined plan is flagged')
  console.log('PASS  a client genuinely on two subscriptions is not')
}

// Same money, wrong shape: the CRM thinks one combined $1,397 charge, Stripe
// sends two. MRR happens to agree, but the client gets one scheduled row and
// two payments, so one lands unscheduled every month.
{
  const clients = [client({ name: 'r', ghl_plan: true, ghl_billing: 'bundled', monthly_fee: 1397 })]
  const payments = [
    paid('r', 'monthly', 998, '2026-08-28', true),
    paid('r', 'ghl', 399, '2026-08-28', true),
  ]
  const [m] = feeMismatches(clients, payments)
  assert.ok(m, 'a shape mismatch is flagged even when the totals agree')
  assert.equal(m.amountOff, false)
  assert.equal(m.shapeOff, true)
  assert.deepEqual(m.suggestion, {
    monthly_fee: 998, ghl_billing: 'separate', ghl_monthly_fee: 399, label: '998 + 399',
  })
  console.log('PASS  right total but wrong number of charges is still flagged')
  console.log('PASS  two charges are read back as a separate GHL subscription')
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

// A client on the GHL plan who is not yet being charged for it pays once, and
// must not be flagged every month for a second charge that is not due. The
// real Summit Water Pros case.
{
  const clients = [client({ name: 'summit', ghl_plan: true, ghl_billing: 'separate', ghl_monthly_fee: 0 })]
  const payments = [paid('summit', 'monthly', 998, '2026-08-01', true)]
  assert.equal(feeMismatches(clients, payments).length, 0)
  console.log('PASS  on the GHL plan but not yet billed for it is not a mismatch')
}

// Nobody who has never paid is flagged, and neither are archived clients.
{
  const never = [client({ name: 'new' })]
  assert.equal(feeMismatches(never, []).length, 0)
  const gone = [client({ name: 'old', monthly_fee: 1, archived: true })]
  assert.equal(feeMismatches(gone, [paid('old', 'monthly', 998, '2026-08-01', true)]).length, 0)
  console.log('PASS  clients who never paid, and archived ones, are left out')
}

// --- duplicates ------------------------------------------------------------
{
  const clients = [{ id: 'rel', name: 'Reliable Heating and Cooling' }]
  const webhook = paid('rel', 'ghl', 399, '2026-08-28', true)
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
