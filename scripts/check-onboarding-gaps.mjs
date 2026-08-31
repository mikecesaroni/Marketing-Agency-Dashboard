// Self-check for "who hasn't paid the setup fee" and "who hasn't subscribed".
// Run: node scripts/check-onboarding-gaps.mjs
//
// Both are absences rather than events, which is what makes them easy to get
// wrong. A client who never subscribed has no overdue row and no missing
// payment — nothing in the ledger is out of place, they are simply not there.
// The fixtures are the real states found in production on 2026-08-30.

import { onboardingGaps } from '../src/lib/billing.js'

const TODAY = '2026-08-30'

const client = (over) => ({
  id: over.name, setup_fee: 2500, monthly_fee: 998, archived: false, ...over,
})
const pay = (id, type, status, over = {}) => ({
  client_id: id, payment_type: type, amount: type === 'setup' ? 2500 : 998,
  status, due_date: '2026-08-01', paid_date: status === 'paid' ? '2026-08-01' : null, ...over,
})

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

// --- the real production shapes -------------------------------------------
{
  const clients = [
    // Paying monthly, setup fee still outstanding. Belk / Comfort / Luccia.
    client({ name: 'owes-setup', stripe_customer_id: 'cus_1' }),
    // Setup paid, schedule ready, never collected a month. Pillar HVAC.
    client({ name: 'never-started' }),
    // Everything in order.
    client({ name: 'fine', stripe_customer_id: 'cus_2' }),
    // Archived, and owes both — still nobody to chase.
    client({ name: 'gone', archived: true }),
  ]
  const payments = [
    pay('owes-setup', 'setup', 'pending'),
    pay('owes-setup', 'monthly', 'paid'),
    pay('never-started', 'setup', 'paid'),
    pay('never-started', 'monthly', 'pending'),
    pay('fine', 'setup', 'paid'),
    pay('fine', 'monthly', 'paid'),
    pay('gone', 'setup', 'pending'),
    pay('gone', 'monthly', 'pending'),
  ]

  const { setupUnpaid, notSubscribed } = onboardingGaps(clients, payments, TODAY)
  check('setup unpaid names', setupUnpaid.map((r) => r.client.name), ['owes-setup'])
  check('setup unpaid amount', setupUnpaid[0].amount, 2500)
  check('a due date in the past reads as overdue', setupUnpaid[0].overdue, true)
  check('not subscribed names', notSubscribed.map((r) => r.client.name), ['never-started'])
  check('...and its schedule is known to exist', notSubscribed[0].scheduled, true)
  check('archived clients are in neither list',
    [...setupUnpaid, ...notSubscribed].some((r) => r.client.name === 'gone'), false)
}

// --- a paying client is never "not subscribed" ----------------------------
// Any recurring charge counts, including one that is only part of a client's
// monthly total.
{
  const clients = [client({ name: 'part-paid' })]
  const payments = [
    pay('part-paid', 'setup', 'paid'),
    pay('part-paid', 'monthly', 'paid', { amount: 399 }),
  ]
  check('a partial monthly charge still counts as subscribed',
    onboardingGaps(clients, payments, TODAY).notSubscribed.length, 0)
}

// --- a setup fee nobody ever scheduled ------------------------------------
// It carries no due date, so nothing will ever mark it overdue and no view
// would otherwise mention it.
{
  const clients = [client({ name: 'unscheduled' })]
  const payments = [pay('unscheduled', 'monthly', 'paid')]
  const [row] = onboardingGaps(clients, payments, TODAY).setupUnpaid
  check('a setup fee with no schedule is still surfaced', row?.reason, 'unscheduled')
  check('...at the amount on the client', row?.amount, 2500)
  check('...and is not called overdue, having no due date', row?.overdue, false)
}

// --- no setup fee agreed means nothing is owed ----------------------------
{
  const clients = [client({ name: 'no-fee', setup_fee: 0 })]
  const payments = [pay('no-fee', 'monthly', 'paid')]
  check('a client with no setup fee is not chased for one',
    onboardingGaps(clients, payments, TODAY).setupUnpaid.length, 0)
}

// --- a split setup fee, half collected ------------------------------------
{
  const clients = [client({ name: 'split', setup_fee: 2500 })]
  const payments = [
    pay('split', 'setup', 'paid', { amount: 1250 }),
    pay('split', 'setup', 'pending', { amount: 1250, due_date: '2026-09-15' }),
    pay('split', 'monthly', 'paid'),
  ]
  const [row] = onboardingGaps(clients, payments, TODAY).setupUnpaid
  check('a split setup fee shows only the unpaid half', row.amount, 1250)
  check('...and a future date is not overdue', row.overdue, false)
}

// --- a client with no billing set up at all -------------------------------
{
  const clients = [client({ name: 'nothing' })]
  const { setupUnpaid, notSubscribed } = onboardingGaps(clients, [], TODAY)
  check('no billing at all: the setup fee is flagged', setupUnpaid[0]?.reason, 'unscheduled')
  check('no billing at all: flagged as not subscribed', notSubscribed[0]?.client.name, 'nothing')
  check('...and is known to have no schedule', notSubscribed[0]?.scheduled, false)
}

// --- ordering -------------------------------------------------------------
{
  const clients = [
    client({ name: 'future-small', setup_fee: 500 }),
    client({ name: 'overdue-small', setup_fee: 500 }),
    client({ name: 'future-big', setup_fee: 5000 }),
  ]
  const payments = [
    pay('future-small', 'setup', 'pending', { amount: 500, due_date: '2026-12-01' }),
    pay('overdue-small', 'setup', 'pending', { amount: 500, due_date: '2026-01-01' }),
    pay('future-big', 'setup', 'pending', { amount: 5000, due_date: '2026-12-01' }),
  ]
  check('overdue first, then biggest',
    onboardingGaps(clients, payments, TODAY).setupUnpaid.map((r) => r.client.name),
    ['overdue-small', 'future-big', 'future-small'])
}

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
