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
 * One payment, one row on the page. A subscription's checkout and its first
 * invoice are the same money, and Stripe delivers them together; the
 * webhook merges them, but when the two land in the same instant each is
 * parked before it can see the other (Justin Veda's $2,500, 2026-10-30:
 * "aren't they the same payment but they show as 2"). The webhook sweeps
 * that up now, and the page folds any that slipped through: open rows from
 * the same customer for the same amount, the same day and the same kind of
 * money, where one carries the invoice id and the others do not, show as
 * the invoice row, which carries the others' ids as `twins` so assigning or
 * dismissing it takes them along.
 */
export function collapseTwins(rows = []) {
  const key = (r) => [r.stripe_customer_id || '', Number(r.amount) || 0, r.paid_date || '', r.payment_type || '', Boolean(r.failed)].join('|')
  const groups = new Map()
  for (const r of rows) {
    if (!r?.stripe_customer_id) continue
    const k = key(r)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(r)
  }
  const hidden = new Set()
  const twinsOf = new Map()
  for (const group of groups.values()) {
    const withInvoice = group.filter((r) => r.stripe_invoice_id)
    const without = group.filter((r) => !r.stripe_invoice_id)
    if (!withInvoice.length || !without.length) continue
    for (const r of without) hidden.add(r.id)
    twinsOf.set(withInvoice[0].id, without.map((r) => r.id))
  }
  return rows.filter((r) => !hidden.has(r.id)).map((r) => (twinsOf.has(r.id) ? { ...r, twins: twinsOf.get(r.id) } : r))
}

/** The row and its folded twins, for the writes that resolve or dismiss it. */
export function unmatchedIds(row = {}) {
  return [row.id, ...(Array.isArray(row.twins) ? row.twins : [])].filter(Boolean)
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
