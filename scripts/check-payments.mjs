// Self-check for how a paid Stripe invoice is booked, and for MRR. Run:
//
//   node --experimental-strip-types scripts/check-payments.mjs
//
// (The webhook is TypeScript for Deno; node strips the types to run it. There
// is no test runner in this project and this does not add one.)
//
// The rule worth pinning down: recordPayment settles the OLDEST OUTSTANDING
// ROW OF THE TYPE IT IS GIVEN, ignoring the amount. That is fine while a
// client's whole monthly total arrives as one charge, and it is why a client
// billed as two Stripe subscriptions needs their monthly_fee set to the sum
// rather than to one of the parts.
//
// This replaced a pair of checks built around a 'ghl' payment type and a $399
// revenue carve-out. Both are gone: GHL is included in packages, a package
// price is just the package price, and splitting it invented a number nobody
// was billed.

import { handleEvent } from '../supabase/functions/stripe-webhook/index.ts'
import { calcMRR } from '../src/lib/billing.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

// --- the webhook -----------------------------------------------------------

// A stand-in for PostgREST that understands only the query shapes this
// function issues. Enough to prove which schedule row a payment settles.
function makeFake({ client, payments }) {
  const rows = payments.map((p, i) => ({ id: `p${i}`, notes: null, ...p }))
  const log = []
  const db = {
    async get(path) {
      if (path.startsWith('stripe_ignored_customers')) return []
      if (path.startsWith('stripe_unmatched')) return []
      if (path.startsWith('clients')) {
        const m = /eq\.([^&]+)/.exec(path)[1]
        return m === client.id || m === client.stripe_customer_id ? [client] : []
      }
      if (path.startsWith('payments')) {
        const type = /payment_type=eq\.(\w+)/.exec(path)[1]
        const statuses = path.includes('status=eq.pending') ? ['pending'] : ['pending', 'overdue']
        return rows
          .filter((r) => r.payment_type === type && statuses.includes(r.status))
          .sort((a, b) => a.due_date.localeCompare(b.due_date))
          .slice(0, 1)
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
  monthly_fee: 1500,
}

const SCHEDULE = [
  { payment_type: 'setup', amount: 2500, due_date: '2026-08-01', status: 'pending' },
  { payment_type: 'monthly', amount: 1500, due_date: '2026-09-01', status: 'pending' },
  { payment_type: 'monthly', amount: 1500, due_date: '2026-10-01', status: 'pending' },
]

function invoice(amountCents) {
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
      },
    },
  }
}

const settled = (rows) =>
  rows.filter((r) => r.status === 'paid').map((r) => `${r.payment_type}:${r.due_date}`)

{
  const { db, rows, log } = makeFake({ client: CLIENT, payments: structuredClone(SCHEDULE) })
  const r = await handleEvent(db, invoice(150000))
  check('a monthly invoice settles the oldest monthly row', settled(rows), ['monthly:2026-09-01'])
  check('...and never touches the setup fee',
    log.some((l) => l.op === 'insert'), false)
  check('...and says so', r.note?.startsWith('monthly 1500'), true)
}

// Two invoices in one month, which is what a client on two Stripe
// subscriptions looks like. They settle successive months, so a client billed
// this way must carry the SUM as their monthly_fee -- the reconciliation panel
// is what catches it when they do not.
{
  const { db, rows } = makeFake({ client: CLIENT, payments: structuredClone(SCHEDULE) })
  await handleEvent(db, invoice(99800))
  await handleEvent(db, invoice(39900))
  check('two charges settle two rows, oldest first',
    settled(rows).sort(), ['monthly:2026-09-01', 'monthly:2026-10-01'])
}

{
  const { db, log } = makeFake({ client: CLIENT, payments: [] })
  await handleEvent(db, invoice(150000))
  check('with no schedule, the payment is still recorded',
    log.filter((l) => l.op === 'insert').map((l) => [l.table, l.body.payment_type, l.body.amount]),
    [['payments', 'monthly', 1500]])
}

{
  const { db, rows } = makeFake({ client: CLIENT, payments: structuredClone(SCHEDULE) })
  await handleEvent(db, {
    id: 'evt_f', type: 'invoice.payment_failed',
    data: { object: { customer: 'cus_1', amount_due: 150000, created: 1788000000 } },
  })
  check('a failed invoice marks the monthly row overdue, not the setup fee',
    rows.filter((r) => r.status === 'overdue').map((r) => r.payment_type), ['monthly'])
}

{
  const { db, rows, log } = makeFake({ client: CLIENT, payments: structuredClone(SCHEDULE) })
  await handleEvent(db, {
    id: 'evt_z', type: 'invoice.paid',
    data: { object: { id: 'in_z', customer: 'cus_1', amount_paid: 0, created: 1788000000 } },
  })
  check('a zero-amount invoice records nothing', [settled(rows), log.length], [[], 0])
}

// --- MRR -------------------------------------------------------------------
// The monthly fee is the whole monthly total, whatever the package includes.

const c = (over) => ({ monthly_fee: 998, ...over })
const m = (id) => ({ client_id: id, payment_type: 'monthly' })

check('MRR sums the monthly fee of everyone with a schedule',
  calcMRR(
    [c({ id: 'a' }), c({ id: 'b', monthly_fee: 1500 }), c({ id: 'c', monthly_fee: 1397 })],
    [m('a'), m('b'), m('c')]
  ),
  { mrr: 998 + 1500 + 1397, count: 3 })

check('a client with no schedule is not billing yet',
  calcMRR([c({ id: 'new' })], []), { mrr: 0, count: 0 })

check('archived clients are excluded',
  calcMRR([c({ id: 'gone', archived: true })], [m('gone')]), { mrr: 0, count: 0 })

check('so are the businesses we run ourselves',
  calcMRR([c({ id: 'ours', is_internal: true })], [m('ours')]), { mrr: 0, count: 0 })

// A setup fee is not recurring revenue.
check('a setup-fee-only client is not counted as billing',
  calcMRR([c({ id: 's' })], [{ client_id: 's', payment_type: 'setup' }]), { mrr: 0, count: 0 })

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
