// Failed card payments: what happened, whether it is still a problem, and
// whether anybody has to do anything about it.
//
// The rule that makes this simple: A FAILURE IS UNRESOLVED WHEN THE MONEY HAS
// NOT ARRIVED. Nothing to dismiss, no state to keep in step -- a retry that
// succeeds resolves it by definition, and a row marked paid is proof the money
// came in whichever way it came in.
//
// That rule is the fix for how this went wrong. The failure used to be a
// sentence appended to the notes column, and a sentence cannot be resolved:
// MBD Pressure Washing's card failed on 2026-08-30, Stripe retried it
// successfully on the 31st, the money is real and the row is correctly paid --
// and the row still said "Stripe payment failed 2026-08-30" underneath it,
// which reads exactly like a failed payment somebody had wrongly ticked off.
//
// MOST FAILURES NEED NO ACTION. Stripe retries a failed subscription invoice
// up to four times over about two weeks and most go through. So the useful
// question is never "did something fail" but "is Stripe still trying" -- which
// is why next_attempt_at is the field the alert leads with, and why a payment
// Stripe has given up on is the one that reads as urgent.

const dayOf = (ts) => (ts ? String(ts).slice(0, 10) : null)

/**
 * What the failure columns on one payment mean, or null if it never failed.
 *
 * `today` is injectable so "Stripe should have retried by now" is testable
 * without waiting for tomorrow.
 */
export function failureState(payment, today = new Date().toISOString().slice(0, 10)) {
  if (!payment?.last_failed_at) return null

  const recovered = payment.status === 'paid'
  const failedOn = dayOf(payment.last_failed_at)
  const nextAttempt = recovered ? null : dayOf(payment.next_attempt_at)
  const attempts = Number(payment.failure_count) || 1

  // Stripe stops retrying either because it ran out of attempts or because it
  // decided the card is hopeless; both arrive as an absent next_payment_attempt.
  const givenUp = !recovered && !nextAttempt
  // It said it would retry and the date has passed with no money. Either the
  // retry also failed and the webhook did not reach us, or the subscription is
  // no longer collecting. Worth saying out loud rather than showing a date in
  // the past as if it were still coming.
  const overdueRetry = !recovered && !!nextAttempt && nextAttempt < today

  return {
    id: payment.id,
    client: payment.clients?.name || 'Unknown client',
    clientId: payment.client_id || null,
    amount: Number(payment.amount) || 0,
    type: payment.payment_type || 'monthly',
    failedOn,
    attempts,
    nextAttempt,
    paidOn: recovered ? payment.paid_date : null,
    url: payment.stripe_hosted_invoice_url || null,
    recovered,
    givenUp,
    overdueRetry,
    // What the row should say, in one sentence, in every case. Kept here rather
    // than in the component so the wording is asserted in the checks.
    label: recovered
      ? `Card failed ${failedOn} · Stripe retried and it went through${
          payment.paid_date ? ` ${payment.paid_date}` : ''
        }`
      : givenUp
        ? `Card failed ${failedOn} after ${attempts} ${attempts === 1 ? 'attempt' : 'attempts'} · Stripe has stopped retrying`
        : overdueRetry
          ? `Card failed ${failedOn} · Stripe was retrying ${nextAttempt} and the money still has not arrived`
          : `Card failed ${failedOn} · Stripe retries ${nextAttempt}`,
    severity: recovered ? 'resolved' : givenUp || overdueRetry ? 'critical' : 'warning',
  }
}

/**
 * The failures that still need attention, worst first.
 *
 * Recovered ones are deliberately absent: a payment that came in does not
 * belong in an alert, however dramatic its history. The row itself still shows
 * what happened, which is where that belongs.
 */
export function unresolvedFailures(payments = [], today = new Date().toISOString().slice(0, 10)) {
  const rows = payments
    .map((p) => failureState(p, today))
    .filter((f) => f && !f.recovered)

  const rank = { critical: 0, warning: 1 }
  return rows.sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] ||
      b.amount - a.amount ||
      String(a.failedOn).localeCompare(String(b.failedOn))
  )
}

/** One line for the top of the page. Null when there is nothing wrong. */
export function failureSummary(payments = [], today = new Date().toISOString().slice(0, 10)) {
  const rows = unresolvedFailures(payments, today)
  if (rows.length === 0) return null
  const cents = rows.reduce((t, r) => t + Math.round(r.amount * 100), 0)
  return {
    count: rows.length,
    amount: Math.round(cents) / 100,
    critical: rows.filter((r) => r.severity === 'critical').length,
    rows,
  }
}
