// The money math.
//
// This decides what one partner actually pays the other, so the two things
// worth being certain of are asserted against awkward numbers rather than
// convenient ones:
//
//   THE SHARES SUM TO THE NET. Exactly, on an odd number of cents, where naive
//   rounding of both halves leaves a stray penny belonging to nobody.
//
//   THE TOTAL OWED EQUALS WHAT THE BUSINESS ACCOUNT DID. Including when a
//   partner fronted a cost personally, which is the case that makes the
//   identity non-obvious and the reason `paid_by` exists at all.
//
// Run with: node scripts/check-partner-split.mjs

import {
  DEFAULT_SPLIT_PERCENT,
  EXPENSE_CATEGORIES,
  PAID_BY,
  expensesByPayee,
  overall,
  payoutDrift,
  periodLabel,
  periodOf,
  periodsPresent,
  statement,
  toCents,
} from '../src/lib/partnerSplit.js'

let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`PASS  ${name}`)
  else {
    failures++
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const pay = (amount, paid_date, over = {}) => ({
  id: Math.random().toString(36).slice(2),
  amount,
  paid_date,
  status: 'paid',
  ...over,
})
const exp = (amount, spent_on, over = {}) => ({
  id: Math.random().toString(36).slice(2),
  amount,
  spent_on,
  payee: 'Sam',
  category: 'employee',
  shared: true,
  paid_by: 'business',
  ...over,
})

// --- cents and periods ----------------------------------------------------
check('numeric strings from Postgres convert cleanly', toCents('1749.00') === 174900)
check('a float that cannot be represented still rounds right', toCents(0.07 * 3) === 21)
check('rubbish becomes zero rather than NaN', toCents(null) === 0 && toCents('abc') === 0)
check('a period is the year and month', periodOf('2026-08-26') === '2026-08')
check('a period reads as a month name', periodLabel('2026-08') === 'August 2026')

check(
  'only months with something in them get a statement, newest first',
  periodsPresent({
    payments: [pay(100, '2026-07-04'), pay(100, '2026-09-01', { status: 'pending' })],
    expenses: [exp(50, '2026-08-10')],
    payouts: [{ period: '2026-06-01' }],
  }).join(',') === '2026-08,2026-07,2026-06'
)

// --- the basic month ------------------------------------------------------
const basic = statement({
  period: '2026-08',
  payments: [pay(1000, '2026-08-01'), pay(500, '2026-08-20'), pay(999, '2026-07-31')],
  expenses: [exp(400, '2026-08-05'), exp(100, '2026-07-01')],
  payouts: [],
})
check('only this month is collected', basic.collected === 1500, String(basic.collected))
check('only this month is spent', basic.sharedExpenses === 400, String(basic.sharedExpenses))
check('net is collected minus shared costs', basic.net === 1100, String(basic.net))
check('the split is even by default', basic.shares.ethan === 550 && basic.shares.me === 550)
check('nothing paid yet means all of it outstanding', basic.outstanding.ethan === 550)
check('the month balances', basic.balances === true)
check('the default split is 50', DEFAULT_SPLIT_PERCENT === 50)

// --- the stray cent -------------------------------------------------------
// $0.01 of net: half is half a cent. Rounding both halves gives 1c + 1c = 2c
// out of 1c, which is exactly the bug this guards.
const oddPenny = statement({
  period: '2026-08',
  payments: [pay(0.01, '2026-08-01')],
  expenses: [],
  payouts: [],
})
check(
  'a single cent of net is not duplicated',
  toCents(oddPenny.shares.ethan) + toCents(oddPenny.shares.me) === 1,
  `${oddPenny.shares.ethan} + ${oddPenny.shares.me}`
)

const oddNet = statement({
  period: '2026-08',
  payments: [pay(1000.01, '2026-08-01')],
  expenses: [exp(0.02, '2026-08-01')],
  payouts: [],
})
check(
  'shares always sum back to the net exactly',
  toCents(oddNet.shares.ethan) + toCents(oddNet.shares.me) === toCents(oddNet.net),
  `${oddNet.shares.ethan} + ${oddNet.shares.me} vs ${oddNet.net}`
)

// A sweep, because one example proves nothing about rounding.
let sumFailures = 0
for (let cents = -500; cents <= 500; cents++) {
  const s = statement({
    period: '2026-08',
    payments: [pay(cents / 100, '2026-08-01')],
    expenses: [],
    payouts: [],
  })
  if (toCents(s.shares.ethan) + toCents(s.shares.me) !== cents) sumFailures++
}
check('shares sum to net across 1001 values, negatives included', sumFailures === 0, `${sumFailures} failed`)

// --- an uneven split -----------------------------------------------------
const sixtyForty = statement({
  period: '2026-08',
  payments: [pay(1000, '2026-08-01')],
  expenses: [],
  payouts: [],
  splitPercent: 60,
})
check('60 means 60/40 without a second setting', sixtyForty.shares.ethan === 600 && sixtyForty.shares.me === 400)

// --- someone fronted the money ------------------------------------------
// The case that makes the identity non-obvious: Ethan paid the employee out of
// his own pocket, so he is owed his profit share PLUS the money he laid out.
const fronted = statement({
  period: '2026-08',
  payments: [pay(2000, '2026-08-01')],
  expenses: [
    exp(600, '2026-08-02', { paid_by: 'ethan' }),
    exp(400, '2026-08-03', { paid_by: 'business' }),
  ],
  payouts: [],
})
check('net still deducts everything shared', fronted.net === 1000, String(fronted.net))
check('shares are of the net', fronted.shares.ethan === 500 && fronted.shares.me === 500)
check(
  'the partner who fronted it is owed it back on top',
  fronted.owed.ethan === 1100 && fronted.owed.me === 500,
  `ethan ${fronted.owed.ethan}, me ${fronted.owed.me}`
)
check(
  'and the books balance against the business account',
  fronted.balances === true && fronted.businessCashChange === 1600,
  `owed ${fronted.owed.ethan + fronted.owed.me} vs cash ${fronted.businessCashChange}`
)

// The identity has to hold for arbitrary mixtures, not just the neat one.
let balanceFailures = 0
for (let i = 0; i < 300; i++) {
  const r = (n) => Math.round(Math.random() * n * 100) / 100
  const s = statement({
    period: '2026-08',
    payments: [pay(r(5000), '2026-08-01'), pay(r(5000), '2026-08-15')],
    expenses: [
      exp(r(900), '2026-08-02', { paid_by: 'business' }),
      exp(r(900), '2026-08-03', { paid_by: 'ethan' }),
      exp(r(900), '2026-08-04', { paid_by: 'me' }),
      exp(r(900), '2026-08-05', { shared: false, paid_by: 'me' }),
    ],
    payouts: [],
    splitPercent: [40, 50, 55, 60][i % 4],
  })
  if (!s.balances) balanceFailures++
}
check('the identity holds across 300 random mixtures', balanceFailures === 0, `${balanceFailures} failed`)

// --- personal costs stay out of the split -------------------------------
const personal = statement({
  period: '2026-08',
  payments: [pay(1000, '2026-08-01')],
  expenses: [exp(300, '2026-08-02', { shared: false, paid_by: 'me' })],
  payouts: [],
})
check('a personal cost does not reduce the net', personal.net === 1000, String(personal.net))
check('but it is still recorded and shown', personal.personalExpenses === 300)
check(
  'and it is not reimbursed either — it was never the business’s cost',
  personal.owed.me === 500 && personal.owed.ethan === 500
)
check('a personal cost cannot unbalance the month', personal.balances === true)

// --- payouts already made ------------------------------------------------
const settled = statement({
  period: '2026-08',
  payments: [pay(2000, '2026-08-01')],
  expenses: [],
  payouts: [
    { period: '2026-08-01', partner: 'ethan', amount: 600 },
    { period: '2026-08-01', partner: 'me', amount: 1000 },
    { period: '2026-07-01', partner: 'ethan', amount: 999 },
  ],
})
check('payouts are counted per partner', settled.paid.ethan === 600 && settled.paid.me === 1000)
check('a payout from another month is not counted', settled.paid.ethan !== 1599)
check('outstanding is owed minus paid', settled.outstanding.ethan === 400)
check(
  'overpaying reads as negative rather than clamping to zero',
  settled.outstanding.me === 0,
  String(settled.outstanding.me)
)

const overpaid = statement({
  period: '2026-08',
  payments: [pay(100, '2026-08-01')],
  expenses: [],
  payouts: [{ period: '2026-08-01', partner: 'ethan', amount: 80 }],
})
check('an overpayment is visible as a negative', overpaid.outstanding.ethan === -30, String(overpaid.outstanding.ethan))

// --- drift after settling ------------------------------------------------
const current = statement({
  period: '2026-08',
  payments: [pay(2000, '2026-08-01')],
  expenses: [exp(500, '2026-08-20')],
  payouts: [],
})
const drift = payoutDrift(
  { basis_net: 2000, basis_collected: 2000, basis_expenses: 0 },
  current
)
check('a back-dated cost shows as drift, not a silent restatement', drift !== null)
check(
  'and names both numbers',
  drift.wasNet === 2000 && drift.nowNet === 1500 && drift.difference === -500,
  JSON.stringify(drift)
)
check('an unchanged month reports no drift', payoutDrift({ basis_net: 1500 }, current) === null)
check(
  'the migrated payout has no basis and is not accused of drifting',
  payoutDrift({ basis_net: null }, current) === null
)

// --- the all-time view ---------------------------------------------------
const all = overall({
  payments: [pay(1000, '2026-07-10'), pay(2000, '2026-08-10')],
  expenses: [exp(200, '2026-07-11'), exp(400, '2026-08-11')],
  payouts: [{ period: '2026-07-01', partner: 'ethan', amount: 400 }],
})
check('every month gets a statement', all.months.length === 2)
check('totals are the sum of the months', all.collected === 3000 && all.sharedExpenses === 600)
check('net all time', all.net === 2400, String(all.net))
check('owed all time is half the net', all.owedEthan === 1200, String(all.owedEthan))
check('paid is counted', all.paidEthan === 400)
check('outstanding is the difference', all.outstandingEthan === 800)
check('nothing unbalanced', all.unbalanced.length === 0)

// --- the expense roll-up -------------------------------------------------
const byPayee = expensesByPayee([
  exp(100, '2026-08-01', { payee: 'Sam' }),
  exp(250, '2026-08-02', { payee: 'Sam' }),
  exp(400, '2026-08-03', { payee: 'Dana' }),
  exp(50, '2026-08-04', { payee: null }),
])
check('costs group by who was paid, biggest first', byPayee[0].payee === 'Dana' && byPayee[0].total === 400)
check('and count the payments', byPayee[1].payee === 'Sam' && byPayee[1].count === 2 && byPayee[1].total === 350)
check('a missing payee is not dropped', byPayee.some((r) => r.payee === 'Unknown'))

// --- shapes agree with the database -------------------------------------
check(
  'the category list matches the check constraint',
  EXPENSE_CATEGORIES.join(',') === 'employee,contractor,software,ads,fees,other'
)
check('paid_by matches the check constraint', PAID_BY.join(',') === 'business,me,ethan')

// --- empties -------------------------------------------------------------
const empty = statement({ period: '2026-08', payments: [], expenses: [], payouts: [] })
check(
  'an empty month is zero everywhere and still balances',
  empty.net === 0 && empty.owed.ethan === 0 && empty.balances === true
)
check('an empty account has no months', overall({ payments: [], expenses: [], payouts: [] }).months.length === 0)

// A month that only has costs is a real loss, and a negative share is the
// honest answer -- each partner owes half of it.
const loss = statement({
  period: '2026-08',
  payments: [],
  expenses: [exp(1000, '2026-08-01')],
  payouts: [],
})
check('a losing month splits the loss', loss.net === -1000 && loss.shares.ethan === -500)
check('and still balances', loss.balances === true)

if (failures > 0) {
  console.error(`\npartner-split checks FAILED (${failures})`)
  process.exit(1)
}
console.log('\nAll partner-split checks passed')
