// The 50/50, taken after costs, as one running balance.
//
// Not monthly. There is no period, no statement to close, no month to pick.
// Lifetime totals: everything ever collected, minus everything ever spent,
// split by the agreed percent, minus everything ever sent. What is left is
// what is owed.
//
// That choice removes a whole class of problem rather than just some screens.
// A monthly model has to defend settled months from change: log an expense
// three weeks late and it silently restates a number two people already
// agreed, so the old version stored a snapshot of the arithmetic on every
// payout and showed the drift. A running balance needs none of that. A
// back-dated expense simply moves the balance, which is the correct answer
// rather than a problem to detect -- the money either has been sent or has
// not, and the total is always the total.
//
// CASH BASIS still. Payments count when they were paid, expenses when they
// were spent. Nothing counts because it was invoiced or promised.
//
// EVERYTHING IS IN CENTS internally. Half of an odd number of cents is not
// representable in dollars, and float arithmetic on money accumulates error
// that shows up as a balance being a penny off for no visible reason.
//
// Three properties worth knowing before trusting any number out of here, all
// asserted in scripts/check-partner-split.mjs:
//
//   THE SHARES SUM TO THE NET, EXACTLY. One partner's share is rounded and the
//   other is the remainder, rather than both being rounded independently --
//   which leaves a stray cent belonging to nobody.
//
//   THE TOTAL EARNED EQUALS WHAT THE BUSINESS ACCOUNT DID. Including when a
//   partner fronted a cost personally, which is the case that makes the
//   identity non-obvious and the reason `paid_by` exists at all.
//
//   THE PER-PAYMENT CUTS SUM TO THE POOLED CUT. The balance is pooled, but it
//   is still made of individual client payments, and being able to point at
//   which ones is the difference between a number you check and a number you
//   are told. See `counted` below.

export const EXPENSE_CATEGORIES = [
  'employee',
  'contractor',
  'software',
  'ads',
  'fees',
  'other',
]

export const PAID_BY = ['business', 'me', 'ethan']

export const PARTNERS = ['me', 'ethan']

export const DEFAULT_SPLIT_PERCENT = 50

// ---------- money ----------------------------------------------------------
// Postgres numeric arrives as a string often enough that treating it as a
// number without asking is a bug waiting to happen.
export function toCents(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export const toDollars = (cents) => Math.round(cents) / 100

// ---------- months ---------------------------------------------------------
// Nothing in the split groups by month any more. These two are still here
// because the expense list offers a month filter, which is a convenience for
// reading a long list rather than a unit of accounting.

/** 'YYYY-MM' for a date string or Date. */
export function periodOf(date) {
  if (!date) return ''
  const s = typeof date === 'string' ? date : date.toISOString()
  return s.slice(0, 7)
}

export function periodLabel(key) {
  if (!key) return ''
  const [y, m] = key.split('-')
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  return `${names[Number(m) - 1] || m} ${y}`
}

// ---------- the ledger -----------------------------------------------------
/**
 * Everything, all time, fully worked out.
 *
 * Returns the whole derivation rather than just the answer, because the point
 * of this is that the balance is never a number somebody has to take on trust.
 * Every line in the UI comes from a field here.
 *
 * `splitPercent` is ETHAN's share. The other partner gets the remainder, so
 * changing it to 60 means 60/40 without a second setting to keep in step.
 */
export function ledger({
  payments = [],
  expenses = [],
  payouts = [],
  splitPercent = DEFAULT_SPLIT_PERCENT,
} = {}) {
  const isCounted = (p) => p.status === 'paid' && !!p.paid_date
  const collectedRows = payments.filter(isCounted)
  const shared = expenses.filter((e) => e.shared !== false)
  const personal = expenses.filter((e) => e.shared === false)

  const collected = collectedRows.reduce((sum, p) => sum + toCents(p.amount), 0)
  const sharedTotal = shared.reduce((sum, e) => sum + toCents(e.amount), 0)
  const personalTotal = personal.reduce((sum, e) => sum + toCents(e.amount), 0)

  const net = collected - sharedTotal

  // Ethan's share is rounded; the other partner takes the remainder. Rounding
  // both independently would leave a cent belonging to nobody on an odd net,
  // and that cent is exactly the kind of thing that gets noticed.
  const ethanShare = Math.round((net * splitPercent) / 100)
  const meShare = net - ethanShare

  // Who actually laid out the shared money. A partner who paid from their own
  // pocket is owed it back on top of their profit share.
  const fronted = { business: 0, me: 0, ethan: 0 }
  for (const e of shared) fronted[e.paid_by || 'business'] += toCents(e.amount)

  const earned = { ethan: ethanShare + fronted.ethan, me: meShare + fronted.me }

  const paid = { me: 0, ethan: 0 }
  for (const p of payouts) {
    const who = p.partner || 'ethan'
    if (who in paid) paid[who] += toCents(p.amount)
  }

  // Which client payments the balance is actually made of.
  //
  // Costs are pooled -- an employee's wage is not attributable to one client's
  // invoice -- so the honest per-payment figure is the cut BEFORE costs, and
  // the UI says so. It is allocated cumulatively rather than by rounding each
  // row on its own: round every row independently and the column does not add
  // up to the total above it, which reads as a bug even when it is a cent.
  const counted = [...collectedRows]
    .sort((a, b) => String(b.paid_date).localeCompare(String(a.paid_date)))
  // The gross cut is worked out from the pooled total, not by adding up the
  // rows -- so that the rows adding up to it is a real property and not a
  // tautology. The cumulative allocation below is what makes it come out.
  const grossEthan = Math.round((collected * splitPercent) / 100)
  let cum = 0
  let cumEthan = 0
  const countedRows = counted.map((p) => {
    const cents = toCents(p.amount)
    cum += cents
    const nextEthan = Math.round((cum * splitPercent) / 100)
    const rowEthan = nextEthan - cumEthan
    cumEthan = nextEthan
    return {
      id: p.id,
      client: p.clients?.name || p.client_name || 'Unassigned',
      clientId: p.client_id || null,
      paidDate: p.paid_date,
      type: p.payment_type || null,
      amount: toDollars(cents),
      ethanCut: toDollars(rowEthan),
      meCut: toDollars(cents - rowEthan),
    }
  })

  // Payments deliberately not in the total, so their absence is explainable
  // rather than mysterious. A payment with no paid_date has not been collected
  // however its status reads.
  const uncounted = payments.filter((p) => !isCounted(p))
  const uncountedTotal = uncounted.reduce((sum, p) => sum + toCents(p.amount), 0)

  // What the business account actually did. If this disagrees with what the two
  // partners are owed between them, some money is unaccounted for and the
  // balance is not safe to pay from.
  const businessCashChange = collected - fronted.business
  const totalEarned = earned.ethan + earned.me

  return {
    splitPercent,

    collected: toDollars(collected),
    collectedCount: collectedRows.length,
    counted: countedRows,
    uncountedCount: uncounted.length,
    uncounted: toDollars(uncountedTotal),
    // The gross cut, before costs. Only meaningful as the subtotal of the
    // per-payment column, which is why it lives next to it.
    gross: {
      ethan: toDollars(grossEthan),
      me: toDollars(collected - grossEthan),
    },

    sharedExpenses: toDollars(sharedTotal),
    sharedExpenseCount: shared.length,
    // Recorded but deliberately not deducted, and reported separately so
    // nobody wonders why the numbers do not tie to the raw expense list.
    personalExpenses: toDollars(personalTotal),

    net: toDollars(net),

    shares: { ethan: toDollars(ethanShare), me: toDollars(meShare) },
    fronted: {
      business: toDollars(fronted.business),
      me: toDollars(fronted.me),
      ethan: toDollars(fronted.ethan),
    },
    earned: { ethan: toDollars(earned.ethan), me: toDollars(earned.me) },
    paid: { ethan: toDollars(paid.ethan), me: toDollars(paid.me) },
    // Negative means overpaid. Deliberately not clamped: a partner who has had
    // too much is a fact worth seeing, not one to round away.
    owed: {
      ethan: toDollars(earned.ethan - paid.ethan),
      me: toDollars(earned.me - paid.me),
    },
    payoutCount: payouts.length,

    balances: totalEarned === businessCashChange,
    businessCashChange: toDollars(businessCashChange),
  }
}

/** Grouped totals for the expense list -- where the money actually goes. */
export function expensesByPayee(expenses) {
  const byPayee = new Map()
  for (const e of expenses) {
    const key = e.payee || 'Unknown'
    if (!byPayee.has(key)) byPayee.set(key, { payee: key, cents: 0, count: 0 })
    const row = byPayee.get(key)
    row.cents += toCents(e.amount)
    row.count += 1
  }
  return [...byPayee.values()]
    .map((r) => ({ payee: r.payee, total: toDollars(r.cents), count: r.count }))
    .sort((a, b) => b.total - a.total)
}

/** The same roll-up, by client, for the payments that fed the balance. */
export function countedByClient(counted = []) {
  const byClient = new Map()
  for (const row of counted) {
    const key = row.client || 'Unassigned'
    if (!byClient.has(key))
      byClient.set(key, { client: key, clientId: row.clientId, cents: 0, ethanCents: 0, count: 0 })
    const agg = byClient.get(key)
    agg.cents += toCents(row.amount)
    agg.ethanCents += toCents(row.ethanCut)
    agg.count += 1
  }
  return [...byClient.values()]
    .map((r) => ({
      client: r.client,
      clientId: r.clientId,
      total: toDollars(r.cents),
      ethanCut: toDollars(r.ethanCents),
      count: r.count,
    }))
    .sort((a, b) => b.total - a.total)
}
