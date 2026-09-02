// Failed card payments.
//
// The bug this guards against already happened once: a card failed, Stripe
// retried it successfully, the money arrived, and the row still announced
// "Stripe payment failed" underneath a green Paid button. So the property
// worth asserting is not that failures are detected -- it is that a RECOVERED
// FAILURE STOPS BEING A FAILURE, and that an unresolved one says whether
// anybody has to act.
//
// Run with: node scripts/check-payment-failures.mjs

import { failureState, failureSummary, unresolvedFailures } from '../src/lib/paymentFailures.js'

let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`PASS  ${name}`)
  else {
    failures++
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const TODAY = '2026-09-02'

let seq = 0
const row = (over = {}) => ({
  id: `p${++seq}`,
  client_id: 'c1',
  clients: { name: 'MBD Pressure Washing' },
  payment_type: 'monthly',
  amount: 998,
  due_date: '2026-08-30',
  paid_date: null,
  status: 'pending',
  last_failed_at: null,
  failure_count: 0,
  next_attempt_at: null,
  stripe_hosted_invoice_url: null,
  ...over,
})

// --- nothing wrong --------------------------------------------------------
check('a payment that never failed has no failure state', failureState(row()) === null)
check(
  'a paid payment that never failed has none either',
  failureState(row({ status: 'paid', paid_date: '2026-08-31' })) === null
)
check('no failures means no summary at all', failureSummary([row(), row()], TODAY) === null)
check('an empty list is not an alert', failureSummary([], TODAY) === null)

// --- THE REAL CASE: failed, retried, paid ---------------------------------
// Exactly MBD: failed 2026-08-30, Stripe retried, paid 2026-08-31.
const recovered = failureState(
  row({
    status: 'paid',
    paid_date: '2026-08-31',
    last_failed_at: '2026-08-30 19:42:24+00',
    failure_count: 1,
    next_attempt_at: '2026-09-01 21:42:58+00',
  }),
  TODAY
)
check('the failure is still visible on the row', recovered !== null)
check('but it reads as recovered, not as a failure', recovered.recovered === true && recovered.severity === 'resolved')
check(
  'and it says what actually happened',
  recovered.label === 'Card failed 2026-08-30 · Stripe retried and it went through 2026-08-31',
  recovered.label
)
check(
  'a retry that already succeeded is not still pending',
  recovered.nextAttempt === null,
  String(recovered.nextAttempt)
)
check(
  'a recovered failure never reaches the alert',
  unresolvedFailures([
    row({ status: 'paid', paid_date: '2026-08-31', last_failed_at: '2026-08-30 19:42:24+00', failure_count: 1 }),
  ], TODAY).length === 0
)

// --- unresolved, Stripe still trying --------------------------------------
const retrying = failureState(
  row({ status: 'overdue', last_failed_at: '2026-09-01 10:00:00+00', failure_count: 1, next_attempt_at: '2026-09-04 10:00:00+00' }),
  TODAY
)
check('an outstanding failure is unresolved', retrying.recovered === false)
check('it leads with the retry date, because that is the useful fact', retrying.label === 'Card failed 2026-09-01 · Stripe retries 2026-09-04', retrying.label)
check('and it is a warning rather than urgent — Stripe is handling it', retrying.severity === 'warning')
check('it has not been given up on', retrying.givenUp === false && retrying.overdueRetry === false)

// --- unresolved, Stripe has given up --------------------------------------
const givenUp = failureState(
  row({ status: 'overdue', last_failed_at: '2026-08-20 10:00:00+00', failure_count: 4, next_attempt_at: null }),
  TODAY
)
check('no next attempt means Stripe has stopped', givenUp.givenUp === true)
check('which is urgent, because now it needs a human', givenUp.severity === 'critical')
check(
  'and it counts the attempts',
  givenUp.label === 'Card failed 2026-08-20 after 4 attempts · Stripe has stopped retrying',
  givenUp.label
)
check(
  'one attempt is not pluralised',
  failureState(row({ status: 'overdue', last_failed_at: '2026-08-20 10:00:00+00', failure_count: 1 }), TODAY)
    .label.includes('after 1 attempt ·')
)

// --- the retry date came and went ----------------------------------------
// A date in the past shown as if it were still coming is worse than useless:
// it says "handled" about something nobody is handling.
const missed = failureState(
  row({ status: 'overdue', last_failed_at: '2026-08-25 10:00:00+00', failure_count: 2, next_attempt_at: '2026-08-30 10:00:00+00' }),
  TODAY
)
check('a retry date in the past is flagged, not displayed as upcoming', missed.overdueRetry === true)
check('and it is urgent', missed.severity === 'critical')
check(
  'and it says the money never arrived',
  missed.label === 'Card failed 2026-08-25 · Stripe was retrying 2026-08-30 and the money still has not arrived',
  missed.label
)
check(
  'the retry date being today is still upcoming, not missed',
  failureState(row({ status: 'overdue', last_failed_at: '2026-09-01 10:00:00+00', next_attempt_at: `${TODAY} 10:00:00+00` }), TODAY)
    .overdueRetry === false
)

// --- ordering and totals --------------------------------------------------
const summary = failureSummary(
  [
    row({ status: 'overdue', amount: 399, last_failed_at: '2026-09-01 10:00:00+00', next_attempt_at: '2026-09-04 10:00:00+00' }),
    row({ status: 'overdue', amount: 1500, last_failed_at: '2026-08-20 10:00:00+00', failure_count: 4 }),
    row({ status: 'overdue', amount: 998, last_failed_at: '2026-09-01 10:00:00+00', next_attempt_at: '2026-09-05 10:00:00+00' }),
    row({ status: 'paid', paid_date: '2026-08-31', amount: 2500, last_failed_at: '2026-08-30 10:00:00+00' }),
    row(),
  ],
  TODAY
)
check('only the unresolved ones are counted', summary.count === 3, String(summary.count))
check('the total is the money still missing', summary.amount === 2897, String(summary.amount))
check('the recovered $2,500 is not counted as missing', summary.amount !== 5397)
check('the urgent one is counted separately', summary.critical === 1)
check('and it is listed first', summary.rows[0].amount === 1500 && summary.rows[0].severity === 'critical')
check('then the biggest of the rest', summary.rows[1].amount === 998, String(summary.rows[1].amount))

// --- the shape the UI needs ----------------------------------------------
const full = failureState(
  row({
    status: 'overdue',
    last_failed_at: '2026-09-01 10:00:00+00',
    next_attempt_at: '2026-09-04 10:00:00+00',
    stripe_hosted_invoice_url: 'https://invoice.stripe.com/i/acct_x/live_y',
  }),
  TODAY
)
check('the client is named', full.client === 'MBD Pressure Washing' && full.clientId === 'c1')
check('the invoice can be opened in Stripe', full.url === 'https://invoice.stripe.com/i/acct_x/live_y')
check('a missing client name does not render blank', failureState(row({ clients: null, last_failed_at: '2026-09-01' }), TODAY).client === 'Unknown client')
check('a missing failure_count still reads as one attempt', failureState(row({ last_failed_at: '2026-09-01', failure_count: null }), TODAY).attempts === 1)
check('timestamps are shown as plain dates', full.failedOn === '2026-09-01' && full.nextAttempt === '2026-09-04')

if (failures > 0) {
  console.error(`\npayment-failure checks FAILED (${failures})`)
  process.exit(1)
}
console.log('\nAll payment-failure checks passed')
