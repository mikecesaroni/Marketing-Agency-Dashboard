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
 * genuine identical charges on one day are possible. Luccia Brother Mechanicle
 * really was charged $500 twice on 2026-09-03.
 *
 * WHAT THE STRIPE IDS DO AND DO NOT PROVE. The webhook writes one row per
 * Stripe event, so a row carrying an event or invoice id has provenance and a
 * row carrying none came from the CSV import. That means:
 *
 * - Exactly one row has an id: the classic double-import. The unidentified row
 *   is the extra, and this is the only shape confident enough to offer a
 *   delete.
 * - Every row has its own DISTINCT id: each was written from a different
 *   Stripe event. Usually two real payments — but not provably, because a
 *   subscription's checkout.session.completed and its first invoice.paid are
 *   the same money seen twice, and the webhook handles both. So it is shown
 *   and explained, with no guess about which to remove.
 * - No row has an id: nothing to go on at all.
 *
 * This used to call any group with at least one identified row "confident",
 * which put a red "Remove the extra" button next to two rows that each had
 * their own Stripe event, under a sentence claiming one of them had no Stripe
 * ID. Clicking it would have deleted a real $500.
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
      // Rows a person has already confirmed are real payments.
      const reviewed = rows.filter((r) => r.duplicate_reviewed_at)
      const identified = rows.filter((r) => r.stripe_invoice_id || r.stripe_event_id)
      const ids = new Set(identified.map((r) => r.stripe_invoice_id || r.stripe_event_id))

      // Every row traces to its own Stripe record, so the CRM cannot name an
      // extra and there may not be one.
      const separatelyEvidenced = identified.length === rows.length && ids.size === rows.length
      // The double-import shape: one row with provenance, the rest without.
      const confident = identified.length === 1 && rows.length > 1

      const keep = reviewed[0] || identified[0] || rows[0]
      // Never propose deleting a row somebody has already vouched for.
      const extras = reviewed.length
        ? rows.filter((r) => !r.duplicate_reviewed_at)
        : rows.filter((r) => r.id !== keep.id)

      return {
        clientName: byName[rows[0].client_id] || 'Unknown client',
        clientId: rows[0].client_id,
        amount: Number(rows[0].amount) || 0,
        paidDate: rows[0].paid_date,
        rows,
        keep,
        extras,
        reviewedCount: reviewed.length,
        separatelyEvidenced,
        confident,
        reason: duplicateReason({ rows, separatelyEvidenced, confident, reviewed }),
      }
    })
    // A group whose every row has been vouched for is settled. Suppressed here
    // rather than before grouping so that a genuine third charge arriving in
    // the same group still raises the warning: that row is not reviewed, so
    // the group is not either.
    .filter((group) => group.reviewedCount < group.rows.length)
    .sort((a, b) => (b.paidDate || '').localeCompare(a.paidDate || ''))
}

/**
 * The sentence shown under a suspected duplicate.
 *
 * Here rather than in the panel because it is an assertion about money and it
 * has to follow from the rows. The panel used to hold two hardcoded sentences
 * and pick between them on a flag, which is how it came to tell someone that
 * one of two rows carried no Stripe ID when both of them did.
 */
export function duplicateReason({ rows, separatelyEvidenced, confident, reviewed }) {
  if (reviewed?.length) {
    return `${reviewed.length} of these ${rows.length} rows is already confirmed as real. This one arrived afterwards, so it is worth a look.`
  }
  if (confident) {
    const plural = rows.length > 2 ? 'the others do' : 'the other does'
    return `One of these carries a Stripe ID and ${plural} not — the unidentified row looks like the same payment recorded a second time by the CSV import.`
  }
  if (separatelyEvidenced) {
    return `Each of these rows carries its own separate Stripe ID, so both were recorded from their own Stripe event. That usually means two real charges. Confirm it and this stops asking.`
  }
  return 'No row here carries a Stripe ID, so there is nothing to say which is real. Check Stripe before removing either.'
}
