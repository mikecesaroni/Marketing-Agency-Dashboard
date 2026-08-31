/**
 * Checks the CRM's billing config against what Stripe has actually collected.
 *
 * Stripe is the record of what people really pay. The fee on a client row is
 * only what somebody typed, and it drifts: a client moves onto a different
 * package and nobody updates the CRM, so MRR quietly reports a number nobody
 * is billed. This is what makes that drift visible instead of leaving it to be
 * noticed a year later.
 */

// Recurring money only. A setup fee is a one-off and would swamp the month it
// landed in, making every client with one look like a mismatch.
const RECURRING = new Set(['monthly'])

const monthOf = (date) => String(date || '').slice(0, 7)

/**
 * What Stripe actually collected from each client in their most recent billing
 * month, which is the fair thing to compare a monthly fee against.
 *
 * The latest month is used rather than an average because a fee change should
 * show up as a mismatch immediately, not be diluted by however many months came
 * before it at the old price.
 */
export function latestBillingMonth(payments) {
  const byClient = {}
  for (const p of payments || []) {
    if (p.status !== 'paid' || !RECURRING.has(p.payment_type) || !p.paid_date) continue
    const month = monthOf(p.paid_date)
    const entry = (byClient[p.client_id] ||= { month: '', rows: [] })
    if (month > entry.month) {
      entry.month = month
      entry.rows = []
    }
    if (month === entry.month) entry.rows.push(p)
  }

  for (const entry of Object.values(byClient)) {
    entry.collected = entry.rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
    entry.amounts = entry.rows.map((r) => Number(r.amount) || 0).sort((a, b) => b - a)
  }
  return byClient
}

// Cents of rounding are not a discrepancy worth anyone's attention.
const TOLERANCE = 1

/**
 * Clients whose configured monthly billing does not match what Stripe charged
 * them last month.
 *
 * Clients Stripe has never charged are left out entirely: a client who has not
 * paid yet is not evidence of anything, and listing them would bury the real
 * mismatches under everyone who is simply new.
 */
export function feeMismatches(clients, payments) {
  const actual = latestBillingMonth(payments)
  const out = []

  for (const client of clients || []) {
    if (client.archived || client.is_internal) continue
    const seen = actual[client.id]
    if (!seen || seen.rows.length === 0) continue

    // The monthly fee is the whole monthly total, however many Stripe
    // subscriptions add up to it. Only the amount can be wrong, so the number
    // of charges is not checked: a client paying one $1,397 subscription and a
    // client paying $998 + $399 are the same client as far as revenue goes.
    const expected = Number(client.monthly_fee) || 0
    const collected = seen.collected
    if (Math.abs(expected - collected) < TOLERANCE) continue

    out.push({
      client,
      expected,
      collected,
      month: seen.month,
      amounts: seen.amounts,
      difference: collected - expected,
      // What the client row would have to say for the CRM to agree with
      // Stripe: the total collected, whatever it arrived as.
      suggestion: { monthly_fee: collected },
    })
  }

  return out.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
}

/**
 * Payments that look like the same money recorded twice.
 *
 * This happens because the CSV importer and the Stripe webhook record
 * different identifiers for the same payment, so neither can see the other's
 * rows. Same client, same amount, same day is a strong enough signal to
 * surface — and never strong enough to act on automatically, because two
 * genuine identical charges on one day are possible.
 */
export function duplicateSuspects(payments, clients) {
  const byName = Object.fromEntries((clients || []).map((c) => [c.id, c.name]))
  const groups = {}

  for (const p of payments || []) {
    if (p.status !== 'paid' || !p.paid_date) continue
    const key = `${p.client_id}|${Number(p.amount) || 0}|${p.paid_date}`
    ;(groups[key] ||= []).push(p)
  }

  return Object.values(groups)
    .filter((rows) => rows.length > 1)
    .map((rows) => {
      // The row carrying a Stripe invoice or event id came from the webhook and
      // is the one with real provenance, so it is the keeper. Anything else in
      // the group is the likely extra.
      const confirmed = rows.filter((r) => r.stripe_invoice_id || r.stripe_event_id)
      const keep = confirmed[0] || rows[0]
      return {
        clientName: byName[rows[0].client_id] || 'Unknown client',
        clientId: rows[0].client_id,
        amount: Number(rows[0].amount) || 0,
        paidDate: rows[0].paid_date,
        rows,
        keep,
        extras: rows.filter((r) => r.id !== keep.id),
        // Without a Stripe id on any row there is nothing to say which is real.
        confident: confirmed.length > 0,
      }
    })
    .sort((a, b) => (b.paidDate || '').localeCompare(a.paidDate || ''))
}
