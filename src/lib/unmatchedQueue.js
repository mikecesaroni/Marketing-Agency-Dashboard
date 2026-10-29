// The unmatched Stripe queue, the pure part: what a parked row IS, in the
// words the Payments page uses. The reads and writes are in stripeLinks.js.
//
// Stripe says how money arrived and the CRM does not guess: a Checkout
// Session carries its mode ("subscription" starts one, "payment" is a
// one-off), and a subscription's later charges arrive as invoices. The
// webhook keeps that as payment_type ('monthly' for a subscription or an
// invoice, 'setup' for a one-off) because a setup fee is the one one-off
// the CRM expects. The queue showed the type word, so a $2,500 first month
// paid through a one-time link read as "setup" ("when it says setup, what
// does that mean? This is supposed to be monthly"). It now says how Stripe
// sent it, and the person assigning it says what it is.

/** How Stripe sent the parked row, for the queue. */
export function unmatchedKind(row = {}) {
  if (row.failed) return 'card declined'
  if (row.payment_type === 'monthly') return row.stripe_invoice_id ? 'subscription invoice' : 'subscription started'
  return 'one-time payment'
}

/**
 * The type the assigned row is booked as: what the person picked, else what
 * Stripe's shape says. A one-time payment can be a month's fee paid through
 * a one-time link, and only a person knows.
 */
export function bookAs(row = {}, choice = '') {
  if (choice === 'setup' || choice === 'monthly') return choice
  return row.payment_type === 'setup' ? 'setup' : 'monthly'
}

/**
 * One line of help under a one-time payment: a one-off creates no
 * subscription, so nothing recurs. Empty for anything else.
 */
export function unmatchedNote(row = {}) {
  if (row.failed || row.payment_type === 'monthly') return ''
  return 'A one-time payment: Stripe made no subscription, so nothing is charged next month unless they use a subscription link.'
}
