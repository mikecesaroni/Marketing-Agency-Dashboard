// Self-check for how a paid Stripe invoice is booked. Run:
//
//   node --experimental-strip-types scripts/check-stripe-ghl.mjs
//
// (The webhook is TypeScript for Deno; node strips the types to run it. There
// is no test runner in this project and this does not add one.)
//
// It exists because of one specific way the books can go wrong. recordPayment
// settles the OLDEST OUTSTANDING ROW OF THE TYPE IT IS GIVEN, ignoring the
// amount. A client on both the marketing retainer and the $399 GHL plan gets
// two invoices a month; if both were booked as 'monthly', the $399 would mark
// the $998 retainer paid and every later month would be a month ahead and
// $599 short -- silently, and only visible once a client is chased for money
// they already sent.
//
// The case that guards it is "No price id: $399 still lands on GHL".

import { handleEvent } from '../supabase/functions/stripe-webhook/index.ts'

// A stand-in for PostgREST that understands only the handful of query shapes
// this function issues. Enough to prove which schedule row a payment settles.
function makeFake({ client, payments, priceId }) {
  const rows = payments.map((p, i) => ({ id: `p${i}`, notes: null, ...p }))
  const log = []
  const db = {
    async get(path) {
      if (path.startsWith('app_settings')) return priceId ? [{ value: priceId }] : []
      if (path.startsWith('stripe_ignored_customers')) return []
      if (path.startsWith('stripe_unmatched')) return []
      if (path.startsWith('clients')) {
        // Only resolve by the id/customer this test actually set up.
        const m = /eq\.([^&]+)/.exec(path)[1]
        return m === client.id || m === client.stripe_customer_id ? [client] : []
      }
      if (path.startsWith('payments')) {
        const type = /payment_type=eq\.(\w+)/.exec(path)[1]
        const statuses = path.includes('status=eq.pending') ? ['pending'] : ['pending', 'overdue']
        const hit = rows
          .filter((r) => r.payment_type === type && statuses.includes(r.status))
          .sort((a, b) => a.due_date.localeCompare(b.due_date))
        return hit.slice(0, 1)
      }
      return []
    },
    async post(table, body) {
      log.push({ op: 'insert', table, body })
      return new Response('{}')
    },
    async patch(path, body) {
      const id = /id=eq\.([^&]+)/.exec(path)?.[1]
      const row = rows.find((r) => r.id === id)
      if (row) Object.assign(row, body)
      log.push({ op: 'patch', path, body })
      return new Response('{}')
    },
  }
  return { db, rows, log }
}

const CLIENT = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Acme HVAC',
  stripe_customer_id: 'cus_1',
  ghl_plan: true,
  ghl_billing: 'separate',
  ghl_monthly_fee: 399,
  monthly_fee: 998,
}

// The going-forward arrangement: one $1,500 subscription that already includes
// GHL. One invoice a month, one schedule, and ghl_monthly_fee is a share of
// that invoice rather than anything separately billed.
const BUNDLED = {
  ...CLIENT,
  ghl_billing: 'bundled',
  monthly_fee: 1500,
}

const BUNDLED_SCHEDULE = [
  { payment_type: 'monthly', amount: 1500, due_date: '2026-09-01', status: 'pending' },
  { payment_type: 'monthly', amount: 1500, due_date: '2026-10-01', status: 'pending' },
]

const SCHEDULE = [
  { payment_type: 'monthly', amount: 998, due_date: '2026-09-01', status: 'pending' },
  { payment_type: 'monthly', amount: 998, due_date: '2026-10-01', status: 'pending' },
  { payment_type: 'ghl', amount: 399, due_date: '2026-09-01', status: 'pending' },
  { payment_type: 'ghl', amount: 399, due_date: '2026-10-01', status: 'pending' },
]

function invoice(amountCents, priceId) {
  return {
    id: 'evt_x',
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_1',
        customer: 'cus_1',
        amount_paid: amountCents,
        created: 1788000000,
        status_transitions: { paid_at: 1788000000 },
        lines: { data: [{ price: priceId ? { id: priceId } : undefined }] },
      },
    },
  }
}

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

// Which rows are paid, as a compact signature.
const settled = (rows) =>
  rows.filter((r) => r.status === 'paid').map((r) => `${r.payment_type}:${r.due_date}`)

// --- 1. price id configured, GHL invoice ---
{
  const { db, rows } = makeFake({ client: CLIENT, payments: structuredClone(SCHEDULE), priceId: 'price_ghl' })
  const r = await handleEvent(db, invoice(39900, 'price_ghl'))
  check('GHL invoice settles the GHL row', settled(rows), ['ghl:2026-09-01'])
  check('  ...and is noted as ghl', r.note?.startsWith('ghl 399'), true)
}

// --- 2. price id configured, retainer invoice ---
{
  const { db, rows } = makeFake({ client: CLIENT, payments: structuredClone(SCHEDULE), priceId: 'price_ghl' })
  await handleEvent(db, invoice(99800, 'price_retainer'))
  check('Retainer invoice settles the monthly row', settled(rows), ['monthly:2026-09-01'])
}

// --- 3. THE BUG THIS PREVENTS: no price id, amount tells them apart ---
{
  const { db, rows } = makeFake({ client: CLIENT, payments: structuredClone(SCHEDULE) })
  await handleEvent(db, invoice(39900))
  check('No price id: $399 still lands on GHL, not the $998 row', settled(rows), ['ghl:2026-09-01'])
}

// --- 4. no price id, retainer amount ---
{
  const { db, rows } = makeFake({ client: CLIENT, payments: structuredClone(SCHEDULE) })
  await handleEvent(db, invoice(99800))
  check('No price id: $998 lands on monthly', settled(rows), ['monthly:2026-09-01'])
}

// --- 4b. bundled client: the whole $1,500 settles the one monthly row ---
{
  const { db, rows } = makeFake({ client: BUNDLED, payments: structuredClone(BUNDLED_SCHEDULE) })
  await handleEvent(db, invoice(150000))
  check('Bundled: $1,500 settles the monthly row', settled(rows), ['monthly:2026-09-01'])
}

// --- 4c. THE OTHER WAY TO BREAK THE BOOKS ---
// A bundled client's ghl_monthly_fee is a share of a larger invoice, not an
// amount anyone is billed. If the amount fallback fired on it, a $399 refund
// top-up or proration would be booked as a GHL subscription payment against a
// schedule that does not exist.
{
  const { db, rows, log } = makeFake({ client: BUNDLED, payments: structuredClone(BUNDLED_SCHEDULE) })
  await handleEvent(db, invoice(39900))
  check('Bundled: a $399 invoice is never a GHL payment', settled(rows), ['monthly:2026-09-01'])
  check('Bundled: no stray ghl row inserted',
    log.filter((l) => l.op === 'insert' && l.body.payment_type === 'ghl').length, 0)
}

// --- 4d. bundled client, GHL price id genuinely charged ---
// Authoritative evidence still wins: if the GHL price really was invoiced, it
// is a GHL payment, and having no schedule for it is exactly what should make
// it visible as an unscheduled row.
{
  const { db, log } = makeFake({
    client: BUNDLED,
    payments: structuredClone(BUNDLED_SCHEDULE),
    priceId: 'price_ghl',
  })
  await handleEvent(db, invoice(39900, 'price_ghl'))
  check('Bundled: an actual GHL price still books as ghl',
    log.filter((l) => l.op === 'insert').map((l) => [l.body.payment_type, l.body.amount]),
    [['ghl', 399]])
}

// --- 5. client not on the GHL plan: amount fallback must never fire ---
{
  const noGhl = { ...CLIENT, ghl_plan: false }
  const { db, rows } = makeFake({ client: noGhl, payments: structuredClone(SCHEDULE) })
  await handleEvent(db, invoice(39900))
  check('Not on GHL: a $399 invoice is still a monthly payment', settled(rows), ['monthly:2026-09-01'])
}

// --- 6. price id configured but this invoice carries none: not GHL ---
{
  const { db, rows } = makeFake({ client: CLIENT, payments: structuredClone(SCHEDULE), priceId: 'price_ghl' })
  await handleEvent(db, invoice(39900))
  check('Price id set, none on the invoice: treated as monthly', settled(rows), ['monthly:2026-09-01'])
}

// --- 7. both months of both plans, in order ---
{
  const { db, rows } = makeFake({ client: CLIENT, payments: structuredClone(SCHEDULE), priceId: 'price_ghl' })
  await handleEvent(db, invoice(39900, 'price_ghl'))
  await handleEvent(db, invoice(99800, 'price_retainer'))
  await handleEvent(db, invoice(39900, 'price_ghl'))
  await handleEvent(db, invoice(99800, 'price_retainer'))
  check('Two months of both plans settle their own rows', settled(rows).sort(), [
    'ghl:2026-09-01', 'ghl:2026-10-01', 'monthly:2026-09-01', 'monthly:2026-10-01',
  ])
}

// --- 8. failed GHL invoice must not push the retainer overdue ---
{
  const { db, rows } = makeFake({ client: CLIENT, payments: structuredClone(SCHEDULE), priceId: 'price_ghl' })
  await handleEvent(db, {
    id: 'evt_f', type: 'invoice.payment_failed',
    data: { object: { customer: 'cus_1', amount_due: 39900, created: 1788000000,
      lines: { data: [{ price: { id: 'price_ghl' } }] } } },
  })
  check('Failed GHL invoice marks the GHL row overdue',
    rows.filter((r) => r.status === 'overdue').map((r) => r.payment_type), ['ghl'])
}

// --- 9. a GHL charge with no schedule still records, as ghl ---
{
  const { db, log } = makeFake({ client: CLIENT, payments: [], priceId: 'price_ghl' })
  await handleEvent(db, invoice(39900, 'price_ghl'))
  check('Unscheduled GHL charge inserts a ghl row',
    log.filter((l) => l.op === 'insert').map((l) => [l.table, l.body.payment_type, l.body.amount]),
    [['payments', 'ghl', 399]])
}

// --- 10. cache must not leak between events ---
{
  const { db, rows } = makeFake({ client: CLIENT, payments: structuredClone(SCHEDULE), priceId: 'price_ghl' })
  await handleEvent(db, invoice(39900, 'price_ghl'))
  // Same db, new event: the price id is refetched rather than remembered.
  await handleEvent(db, invoice(99800, 'price_retainer'))
  check('Second event classifies independently', settled(rows).sort(), ['ghl:2026-09-01', 'monthly:2026-09-01'])
}

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
