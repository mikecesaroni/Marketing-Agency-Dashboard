// The 50/50, taken after costs.
//
// The old model split every payment on its own. That breaks the moment there
// are costs, because a cost does not belong to any one payment -- you cannot
// take an employee's wages off "the Belk October invoice". So the unit here is
// a MONTH: everything collected in it, minus everything spent in it, split by
// the agreed percent.
//
// CASH BASIS. A month counts money that actually moved in it. Payments by
// paid_date, expenses by spent_on. Not invoiced, not owed. It matches the bank
// statement and it is how both partners already think, and silently mixing cash
// and accrual is how a split turns into an argument.
//
// EVERYTHING IS IN CENTS internally. Half of an odd number of cents is not
// representable in dollars, and float arithmetic on money accumulates error
// that shows up as a payout being a penny off for no visible reason. Integers
// in, integers out, dollars only at the edges.
//
// The two properties worth knowing before trusting any number out of here, both
// asserted in scripts/check-partner-split.mjs:
//
//   THE SHARES SUM TO THE NET, EXACTLY. One partner's share is rounded and the
//   other is the remainder, rather than both being rounded independently --
//   which would leave a stray cent belonging to nobody.
//
//   THE TOTAL OWED EQUALS THE BUSINESS ACCOUNT'S CHANGE, EXACTLY. If a partner
//   paid a shared cost out of their own pocket they are owed it back on top of
//   their profit share, and the books still have to balance. That identity is
//   the whole reason to track who paid rather than just what was spent.

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

// ---------- periods --------------------------------------------------------
/** 'YYYY-MM' for a date string or Date. The key everything groups by. */
export function periodOf(date) {
  if (!date) return ''
  const s = typeof date === 'string' ? date : date.toISOString()
  return s.slice(0, 7)
}

/** First day of the month, which is how a period is stored. */
export const periodStart = (key) => `${key}-01`

export function periodLabel(key) {
  if (!key) return ''
  const [y, m] = key.split('-')
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  return `${names[Number(m) - 1] || m} ${y}`
}

/**
 * Every month that has anything in it, newest first.
 *
 * Built from the data rather than from a calendar: a month with no payments,
 * no costs and no payouts has no statement to show, and offering it in a
 * picker only invites the question of why it is empty.
 */
export function periodsPresent({ payments = [], expenses = [], payouts = [] }) {
  const keys = new Set()
  for (const p of payments) if (p.status === 'paid' && p.paid_date) keys.add(periodOf(p.paid_date))
  for (const e of expenses) if (e.spent_on) keys.add(periodOf(e.spent_on))
  for (const p of payouts) if (p.period) keys.add(periodOf(p.period))
  return [...keys].filter(Boolean).sort().reverse()
}

// ---------- the statement --------------------------------------------------
/**
 * One month, fully worked out.
 *
 * Returns the whole derivation rather than just the answer, because the point
 * of this is that a payout is never a number somebody has to take on trust.
 * Every line in the UI comes from a field here.
 *
 * `splitPercent` is ETHAN's share. The other partner gets the remainder, so
 * changing it to 60 means 60/40 without needing a second setting to keep in
 * step.
 */
export function statement({
  period,
  payments = [],
  expenses = [],
  payouts = [],
  splitPercent = DEFAULT_SPLIT_PERCENT,
}) {
  const collectedRows = payments.filter(
    (p) => p.status === 'paid' && p.paid_date && periodOf(p.paid_date) === period
  )
  const periodExpenses = expenses.filter((e) => e.spent_on && periodOf(e.spent_on) === period)

  const shared = periodExpenses.filter((e) => e.shared !== false)
  const personal = periodExpenses.filter((e) => e.shared === false)

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
  // pocket is owed it back on top of their share.
  const fronted = { business: 0, me: 0, ethan: 0 }
  for (const e of shared) fronted[e.paid_by || 'business'] += toCents(e.amount)

  const owed = {
    ethan: ethanShare + fronted.ethan,
    me: meShare + fronted.me,
  }

  const paid = { me: 0, ethan: 0 }
  for (const p of payouts) {
    if (periodOf(p.period) !== period) continue
    const who = p.partner || 'ethan'
    if (who in paid) paid[who] += toCents(p.amount)
  }

  // What the business account actually did this month. The identity below is
  // the reason to bother tracking who paid at all: if these two disagree, some
  // money is unaccounted for and the statement is not safe to pay from.
  const businessCashChange = collected - fronted.business
  const totalOwed = owed.ethan + owed.me

  return {
    period,
    label: periodLabel(period),
    splitPercent,

    collected: toDollars(collected),
    collectedCount: collectedRows.length,
    collectedRows,

    sharedExpenses: toDollars(sharedTotal),
    sharedExpenseRows: shared,
    // Recorded but deliberately not deducted, and shown separately so nobody
    // wonders why the numbers do not tie to the raw expense list.
    personalExpenses: toDollars(personalTotal),
    personalExpenseRows: personal,

    net: toDollars(net),

    shares: { ethan: toDollars(ethanShare), me: toDollars(meShare) },
    fronted: {
      business: toDollars(fronted.business),
      me: toDollars(fronted.me),
      ethan: toDollars(fronted.ethan),
    },
    owed: { ethan: toDollars(owed.ethan), me: toDollars(owed.me) },
    paid: { ethan: toDollars(paid.ethan), me: toDollars(paid.me) },
    outstanding: {
      ethan: toDollars(owed.ethan - paid.ethan),
      me: toDollars(owed.me - paid.me),
    },

    balances: totalOwed === businessCashChange,
    businessCashChange: toDollars(businessCashChange),
  }
}

/**
 * Has a settled month moved since it was settled?
 *
 * A payout records the arithmetic it was computed from. If an expense is
 * back-dated into that month afterwards, the honest thing is to show both
 * numbers rather than silently restate what two people already agreed. Returns
 * null for a payout with no basis -- the migrated legacy row genuinely has
 * none, and inventing one would be worse than admitting it.
 */
export function payoutDrift(payout, current) {
  if (!payout || payout.basis_net === null || payout.basis_net === undefined) return null

  const wasNet = toCents(payout.basis_net)
  const nowNet = toCents(current.net)
  if (wasNet === nowNet) return null

  return {
    wasNet: toDollars(wasNet),
    nowNet: toDollars(nowNet),
    difference: toDollars(nowNet - wasNet),
    wasCollected: payout.basis_collected == null ? null : toDollars(toCents(payout.basis_collected)),
    wasExpenses: payout.basis_expenses == null ? null : toDollars(toCents(payout.basis_expenses)),
  }
}

/**
 * The all-time read, for the top of the page.
 *
 * Sums the per-month statements rather than computing over everything at once,
 * so it can never disagree with the months it is made of.
 */
export function overall({ payments, expenses, payouts, splitPercent }) {
  const periods = periodsPresent({ payments, expenses, payouts })
  const months = periods.map((period) =>
    statement({ period, payments, expenses, payouts, splitPercent })
  )

  const sum = (pick) => toDollars(months.reduce((t, m) => t + toCents(pick(m)), 0))

  return {
    months,
    collected: sum((m) => m.collected),
    sharedExpenses: sum((m) => m.sharedExpenses),
    net: sum((m) => m.net),
    owedEthan: sum((m) => m.owed.ethan),
    paidEthan: sum((m) => m.paid.ethan),
    outstandingEthan: sum((m) => m.outstanding.ethan),
    // A month that does not balance is a data problem, not a rounding one.
    unbalanced: months.filter((m) => !m.balances).map((m) => m.period),
  }
}

/** Grouped totals for the expense list — where the money actually goes. */
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
