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
        // Three shapes now: by invoice id, by payment type, or both. The
        // invoice lookup is what keeps a retry on the row it failed on.
        const statuses = path.includes('status=eq.pending') ? ['pending'] : ['pending', 'overdue']
        const invoice = /stripe_invoice_id=eq\.([^&]+)/.exec(path)?.[1]
        const type = /payment_type=eq\.(\w+)/.exec(path)?.[1]
        return rows
          .filter((r) => statuses.includes(r.status))
          .filter((r) => (invoice ? r.stripe_invoice_id === decodeURIComponent(invoice) : true))
          .filter((r) => (type ? r.payment_type === type : true))
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

// --- FAILED CARDS, AND THE RETRY THAT FIXES THEM --------------------------
// MBD Pressure Washing's card failed on 2026-08-30 and Stripe retried it
// successfully on the 31st. The money is real and the row is correctly paid,
// but the failure had been recorded by appending a sentence to the notes
// column -- and a sentence cannot be resolved, so the row went on announcing
// "Stripe payment failed" under a green Paid button. These pin down the shape
// that fixed it: failures live in columns, and the retry lands on the row it
// failed on.

const FAILED_AT = 1788118944 // 2026-08-30T19:42:24Z
const RETRY_AT = 1788298978 // 2026-09-01T21:42:58Z

const failedInvoice = (over = {}) => ({
  id: 'evt_fail',
  type: 'invoice.payment_failed',
  data: {
    object: {
      id: 'in_mbd',
      customer: 'cus_1',
      amount_due: 99800,
      amount_paid: 0,
      created: FAILED_AT,
      attempt_count: 1,
      next_payment_attempt: RETRY_AT,
      hosted_invoice_url: 'https://invoice.stripe.com/i/acct_x/live_y',
      ...over,
    },
  },
})

{
  const { db, rows } = makeFake({ client: CLIENT, payments: structuredClone(SCHEDULE) })
  await handleEvent(db, failedInvoice())
  const hit = rows.find((r) => r.status === 'overdue')
  check('a failure is recorded in columns, not in the notes', [
    hit.last_failed_at,
    hit.failure_count,
    hit.next_attempt_at,
    hit.stripe_hosted_invoice_url,
    hit.notes,
  ], [
    '2026-08-30T19:42:24.000Z',
    1,
    '2026-09-01T21:42:58.000Z',
    'https://invoice.stripe.com/i/acct_x/live_y',
    null,
  ])
  check('and the invoice is stamped on the row so the retry can find it',
    hit.stripe_invoice_id, 'in_mbd')
}

{
  // The whole point. Fail, then succeed, on the same invoice.
  const { db, rows } = makeFake({ client: CLIENT, payments: structuredClone(SCHEDULE) })
  await handleEvent(db, failedInvoice())
  await handleEvent(db, {
    id: 'evt_paid',
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_mbd',
        customer: 'cus_1',
        amount_paid: 99800,
        created: 1788173835,
        status_transitions: { paid_at: 1788173835 },
      },
    },
  })
  const hit = rows.find((r) => r.stripe_invoice_id === 'in_mbd')
  check('the retry settles the row it failed on, not the next month',
    [settled(rows), hit.due_date], [['monthly:2026-09-01'], '2026-09-01'])
  check('the money arriving cancels the pending retry',
    hit.next_attempt_at, null)
  check('but what happened is still on the record',
    hit.last_failed_at, '2026-08-30T19:42:24.000Z')
  check('and no other month was disturbed',
    rows.filter((r) => r.status === 'overdue').length, 0)
}

{
  // A card that fails twice must not drag an innocent future month down with
  // it -- the second failure belongs to the same invoice.
  const { db, rows } = makeFake({ client: CLIENT, payments: structuredClone(SCHEDULE) })
  await handleEvent(db, failedInvoice())
  await handleEvent(db, failedInvoice({ attempt_count: 2, created: FAILED_AT + 86400 }))
  check('a second failure lands on the same row', rows.filter((r) => r.status === 'overdue').length, 1)
  check('and counts the attempt', rows.find((r) => r.status === 'overdue').failure_count, 2)
}

{
  // No next attempt is Stripe saying it has given up, which is the difference
  // between something to wait out and something that needs a new card.
  const { db, rows } = makeFake({ client: CLIENT, payments: structuredClone(SCHEDULE) })
  await handleEvent(db, failedInvoice({ attempt_count: 4, next_payment_attempt: null }))
  const hit = rows.find((r) => r.status === 'overdue')
  check('Stripe giving up leaves no retry date', [hit.next_attempt_at, hit.failure_count], [null, 4])
}

{
  const { db, log } = makeFake({ client: CLIENT, payments: [] })
  const r = await handleEvent(db, failedInvoice())
  check('a failure with no month to mark is handled rather than thrown',
    [r.status, log.length], ['processed', 0])
}

// The case the invoice match exists for: an OLDER month is still unpaid when a
// later invoice fails, so "oldest open month" and "the month this invoice is
// for" are two different rows.
//
// A FIRST failure still takes the oldest open month, because nothing yet ties
// a Stripe invoice to a CRM schedule row -- the schedule is generated twelve
// months ahead and its due dates are the CRM's guess at Stripe's billing
// periods, not Stripe's own. Deliberately the SAME heuristic recordPayment
// uses for a successful invoice, so the two agree about which row an invoice
// owns: whichever row the failure lands on is the row the retry settles, and
// the count of open months comes out right either way.
//
// What the invoice id buys is everything after that first stamp -- pinned down
// in the two blocks below.
const WITH_ARREARS = [
  { payment_type: 'monthly', amount: 1500, due_date: '2026-07-01', status: 'pending' },
  { payment_type: 'monthly', amount: 1500, due_date: '2026-09-01', status: 'pending' },
]

{
  const { db, rows } = makeFake({ client: CLIENT, payments: structuredClone(WITH_ARREARS) })
  // The September invoice is the one failing; July was never collected.
  await handleEvent(db, failedInvoice({ id: 'in_sept' }))
  const hit = rows.find((r) => r.status === 'overdue')
  check('a first failure takes the oldest open month, and claims it',
    [hit.due_date, hit.stripe_invoice_id], ['2026-07-01', 'in_sept'])
}

{
  const { db, rows } = makeFake({
    client: CLIENT,
    payments: [
      { payment_type: 'monthly', amount: 1500, due_date: '2026-07-01', status: 'pending' },
      { payment_type: 'monthly', amount: 998, due_date: '2026-09-01', status: 'overdue',
        stripe_invoice_id: 'in_sept', last_failed_at: '2026-08-30T19:42:24.000Z', failure_count: 1,
        next_attempt_at: '2026-09-01T21:42:58.000Z' },
    ],
  })
  await handleEvent(db, {
    id: 'evt_retry',
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_sept',
        customer: 'cus_1',
        amount_paid: 99800,
        created: 1788173835,
        status_transitions: { paid_at: 1788173835 },
      },
    },
  })
  check('a successful retry settles its own invoice, leaving arrears alone',
    settled(rows), ['monthly:2026-09-01'])
  const july = rows.find((r) => r.due_date === '2026-07-01')
  check('the older unpaid month is untouched', july.status, 'pending')
}

{
  // And a second failure on that same later invoice must not reach back either.
  const { db, rows } = makeFake({
    client: CLIENT,
    payments: [
      { payment_type: 'monthly', amount: 1500, due_date: '2026-07-01', status: 'pending' },
      { payment_type: 'monthly', amount: 998, due_date: '2026-09-01', status: 'overdue',
        stripe_invoice_id: 'in_sept', last_failed_at: '2026-08-30T19:42:24.000Z', failure_count: 1 },
    ],
  })
  await handleEvent(db, failedInvoice({ id: 'in_sept', attempt_count: 2 }))
  check('a repeat failure stays on its own invoice',
    rows.filter((r) => r.status === 'overdue').map((r) => [r.due_date, r.failure_count]),
    [['2026-09-01', 2]])
  check('and does not mark the older month overdue',
    rows.find((r) => r.due_date === '2026-07-01').status, 'pending')
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
