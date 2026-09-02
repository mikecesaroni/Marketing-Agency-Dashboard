// The money math.
//
// This decides what one partner actually pays the other, so the things worth
// being certain of are asserted against awkward numbers rather than convenient
// ones:
//
//   THE SHARES SUM TO THE NET. Exactly, on an odd number of cents, where naive
//   rounding of both halves leaves a stray penny belonging to nobody.
//
//   THE TOTAL EARNED EQUALS WHAT THE BUSINESS ACCOUNT DID. Including when a
//   partner fronted a cost personally, which is the case that makes the
//   identity non-obvious and the reason `paid_by` exists at all.
//
//   THE PER-PAYMENT CUTS SUM TO THE POOLED CUT. The screen that shows which
//   client payments the balance is made of has to add up to the balance, or it
//   undermines the number it is meant to justify.
//
//   NOTHING IS PERIODIC. A back-dated expense moves the balance instead of
//   restating a settled month, and the order of the rows never changes a total.
//
// Run with: node scripts/check-partner-split.mjs

import {
  DEFAULT_SPLIT_PERCENT,
  EXPENSE_CATEGORIES,
  PAID_BY,
  PARTNERS,
  countedByClient,
  expensesByPayee,
  ledger,
  payoutPreview,
  periodLabel,
  periodOf,
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

let seq = 0
const pay = (amount, paid_date, over = {}) => ({
  id: `p${++seq}`,
  amount,
  paid_date,
  status: 'paid',
  clients: { name: 'Acme' },
  ...over,
})
const exp = (amount, spent_on, over = {}) => ({
  id: `e${++seq}`,
  amount,
  spent_on,
  payee: 'Sam',
  category: 'employee',
  shared: true,
  paid_by: 'business',
  ...over,
})

// --- cents and month labels ----------------------------------------------
check('numeric strings from Postgres convert cleanly', toCents('1749.00') === 174900)
check('a float that cannot be represented still rounds right', toCents(0.07 * 3) === 21)
check('rubbish becomes zero rather than NaN', toCents(null) === 0 && toCents('abc') === 0)
check('a month key is the year and month', periodOf('2026-08-26') === '2026-08')
check('a month key reads as a month name', periodLabel('2026-08') === 'August 2026')

// --- the basic balance ----------------------------------------------------
const basic = ledger({
  payments: [pay(1000, '2026-08-01'), pay(500, '2026-08-20'), pay(999, '2026-07-31')],
  expenses: [exp(400, '2026-08-05'), exp(100, '2026-07-01')],
  payouts: [],
})
check('everything ever collected is collected', basic.collected === 2499, String(basic.collected))
check('everything ever spent is deducted', basic.sharedExpenses === 500, String(basic.sharedExpenses))
check('net is collected minus shared costs', basic.net === 1999, String(basic.net))
check('the split is even by default', basic.shares.ethan === 999.5 && basic.shares.me === 999.5)
check('nothing sent yet means all of it owed', basic.owed.ethan === 999.5)
check('and it balances', basic.balances === true)
check('the default split is 50', DEFAULT_SPLIT_PERCENT === 50)
check('there are two partners', PARTNERS.join(',') === 'me,ethan')

// --- no periods anywhere --------------------------------------------------
// The whole point of the rewrite: a cost from any date is just a cost.
const july = ledger({ payments: [pay(1000, '2026-07-01')], expenses: [], payouts: [] })
const backDated = ledger({
  payments: [pay(1000, '2026-07-01')],
  expenses: [exp(200, '2020-01-01')],
  payouts: [],
})
check(
  'an expense from years earlier still comes off the balance',
  july.net === 1000 && backDated.net === 800,
  `${july.net} then ${backDated.net}`
)
check(
  'a payment from the future counts the moment it is marked paid',
  ledger({ payments: [pay(500, '2030-01-01')], expenses: [], payouts: [] }).collected === 500
)

// --- what gets counted ----------------------------------------------------
const partial = ledger({
  payments: [
    pay(1000, '2026-08-01'),
    pay(700, null, { status: 'pending' }),
    pay(300, null, { status: 'paid' }), // marked paid with no date: not collected
    pay(50, '2026-08-02', { status: 'refunded' }),
  ],
  expenses: [],
  payouts: [],
})
check('only paid payments with a date count', partial.collected === 1000, String(partial.collected))
check('the rest are counted and totalled separately', partial.uncountedCount === 3 && partial.uncounted === 1050,
  `${partial.uncountedCount} / ${partial.uncounted}`)

// --- the stray cent -------------------------------------------------------
// $0.01 of net: half is half a cent. Rounding both halves gives 1c + 1c = 2c
// out of 1c, which is exactly the bug this guards.
const oddPenny = ledger({ payments: [pay(0.01, '2026-08-01')], expenses: [], payouts: [] })
check(
  'a single cent of net is not duplicated',
  toCents(oddPenny.shares.ethan) + toCents(oddPenny.shares.me) === 1,
  `${oddPenny.shares.ethan} + ${oddPenny.shares.me}`
)

const oddNet = ledger({
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
  const s = ledger({ payments: [pay(cents / 100, '2026-08-01')], expenses: [], payouts: [] })
  if (toCents(s.shares.ethan) + toCents(s.shares.me) !== cents) sumFailures++
}
check('shares sum to net across 1001 values, negatives included', sumFailures === 0, `${sumFailures} failed`)

// --- an uneven split -----------------------------------------------------
const sixtyForty = ledger({
  payments: [pay(1000, '2026-08-01')],
  expenses: [],
  payouts: [],
  splitPercent: 60,
})
check('60 means 60/40 without a second setting', sixtyForty.shares.ethan === 600 && sixtyForty.shares.me === 400)

// --- someone fronted the money ------------------------------------------
// The case that makes the identity non-obvious: Ethan paid the employee out of
// his own pocket, so he is owed his profit share PLUS the money he laid out.
const fronted = ledger({
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
  'the partner who fronted it has earned it back on top',
  fronted.earned.ethan === 1100 && fronted.earned.me === 500,
  `ethan ${fronted.earned.ethan}, me ${fronted.earned.me}`
)
check(
  'and the books balance against the business account',
  fronted.balances === true && fronted.businessCashChange === 1600,
  `earned ${fronted.earned.ethan + fronted.earned.me} vs cash ${fronted.businessCashChange}`
)

// The identity has to hold for arbitrary mixtures, not just the neat one.
let balanceFailures = 0
for (let i = 0; i < 300; i++) {
  const r = (n) => Math.round(Math.random() * n * 100) / 100
  const s = ledger({
    payments: [pay(r(5000), '2026-08-01'), pay(r(5000), '2026-07-15')],
    expenses: [
      exp(r(900), '2026-08-02', { paid_by: 'business' }),
      exp(r(900), '2026-06-03', { paid_by: 'ethan' }),
      exp(r(900), '2026-08-04', { paid_by: 'me' }),
      exp(r(900), '2026-08-05', { shared: false, paid_by: 'me' }),
    ],
    payouts: [{ partner: 'ethan', amount: r(2000) }],
    splitPercent: [40, 50, 55, 60][i % 4],
  })
  if (!s.balances) balanceFailures++
}
check('the identity holds across 300 random mixtures', balanceFailures === 0, `${balanceFailures} failed`)

// --- personal costs stay out of the split -------------------------------
const personal = ledger({
  payments: [pay(1000, '2026-08-01')],
  expenses: [exp(300, '2026-08-02', { shared: false, paid_by: 'me' })],
  payouts: [],
})
check('a personal cost does not reduce the net', personal.net === 1000, String(personal.net))
check('but it is still recorded and shown', personal.personalExpenses === 300)
check(
  'and it is not reimbursed either — it was never the business’s cost',
  personal.earned.me === 500 && personal.earned.ethan === 500
)
check('a personal cost cannot unbalance the books', personal.balances === true)

// --- payouts already made ------------------------------------------------
const settled = ledger({
  payments: [pay(2000, '2026-08-01')],
  expenses: [],
  payouts: [
    { id: 'x1', partner: 'ethan', amount: 600, paid_on: '2026-08-10' },
    { id: 'x2', partner: 'me', amount: 1000, paid_on: '2026-08-11' },
    { id: 'x3', partner: 'ethan', amount: 100, paid_on: '2026-07-01' },
  ],
})
check('payouts are counted per partner', settled.paid.ethan === 700 && settled.paid.me === 1000)
check('a payout from any date counts — there are no periods', settled.paid.ethan === 700)
check('owed is earned minus sent', settled.owed.ethan === 300, String(settled.owed.ethan))
check('and for the other partner too', settled.owed.me === 0, String(settled.owed.me))

const overpaid = ledger({
  payments: [pay(100, '2026-08-01')],
  expenses: [],
  payouts: [{ id: 'x', partner: 'ethan', amount: 80, paid_on: '2026-08-01' }],
})
check('an overpayment reads as negative rather than clamping', overpaid.owed.ethan === -30, String(overpaid.owed.ethan))
check('a payout to an unknown partner is ignored, not misfiled',
  ledger({ payments: [], expenses: [], payouts: [{ partner: 'someone', amount: 999 }] }).paid.ethan === 0)
check('a payout with no partner is assumed to be Ethan, as the table default is',
  ledger({ payments: [], expenses: [], payouts: [{ amount: 500 }] }).paid.ethan === 500)

// --- which payments the balance is made of -------------------------------
const traced = ledger({
  payments: [
    pay(1000, '2026-08-01', { clients: { name: 'Acme' }, client_id: 'c1', payment_type: 'setup' }),
    pay(500, '2026-08-20', { clients: { name: 'Belk' }, client_id: 'c2', payment_type: 'monthly' }),
    pay(250, '2026-07-05', { clients: { name: 'Acme' }, client_id: 'c1' }),
    pay(9999, null, { status: 'pending', clients: { name: 'Belk' } }),
  ],
  expenses: [exp(300, '2026-08-02')],
  payouts: [],
})
check('every counted payment is listed', traced.counted.length === 3)
check('newest first', traced.counted.map((r) => r.paidDate).join(',') === '2026-08-20,2026-08-01,2026-07-05')
check('the client name comes through', traced.counted[0].client === 'Belk')
check('so does the payment type, for the ones that have it', traced.counted[0].type === 'monthly')
check(
  'the listed amounts add up to what was collected',
  traced.counted.reduce((t, r) => t + toCents(r.amount), 0) === toCents(traced.collected),
  String(traced.collected)
)
check(
  'the per-payment cuts add up to the gross cut',
  traced.counted.reduce((t, r) => t + toCents(r.ethanCut), 0) === toCents(traced.gross.ethan),
  `${traced.gross.ethan}`
)
check(
  'each payment is split into two halves that sum back to it',
  traced.counted.every((r) => toCents(r.ethanCut) + toCents(r.meCut) === toCents(r.amount))
)
check(
  'the gross cut is bigger than the real cut, because costs come off the pool',
  traced.gross.ethan === 875 && traced.shares.ethan === 725,
  `${traced.gross.ethan} vs ${traced.shares.ethan}`
)
check('a payment with no client is labelled rather than blank',
  ledger({ payments: [pay(10, '2026-08-01', { clients: null })] }).counted[0].client === 'Unassigned')

// The per-payment column adding up is the property that makes the screen
// trustworthy, so it gets a sweep too -- odd amounts at odd percentages.
let allocFailures = 0
for (let i = 0; i < 300; i++) {
  const r = () => Math.round(Math.random() * 100000) / 100
  const rows = Array.from({ length: 1 + (i % 7) }, (_, k) =>
    pay(r(), `2026-0${1 + (k % 9)}-01`)
  )
  const s = ledger({ payments: rows, expenses: [], payouts: [], splitPercent: [33, 50, 55, 60][i % 4] })
  const summed = s.counted.reduce((t, x) => t + toCents(x.ethanCut), 0)
  if (summed !== toCents(s.gross.ethan)) allocFailures++
  if (toCents(s.gross.ethan) + toCents(s.gross.me) !== toCents(s.collected)) allocFailures++
}
check('per-payment cuts tie to the total across 300 random sets', allocFailures === 0, `${allocFailures} failed`)

// Order must not change any total, since the allocation is cumulative.
const forwards = ledger({
  payments: [pay(333.33, '2026-01-01'), pay(666.67, '2026-02-01'), pay(0.01, '2026-03-01')],
  splitPercent: 55,
})
const backwards = ledger({
  payments: [pay(0.01, '2026-03-01'), pay(666.67, '2026-02-01'), pay(333.33, '2026-01-01')],
  splitPercent: 55,
})
check(
  'the order rows arrive in cannot change a total',
  forwards.collected === backwards.collected &&
    forwards.gross.ethan === backwards.gross.ethan &&
    forwards.shares.ethan === backwards.shares.ethan
)

// --- which payments have been settled ------------------------------------
// "Which of these 24 have been split with Ethan" is a different question from
// "what is owed", and it is the one you ask looking at a list. A payment
// carries the payout that covered it.

const OUT = { id: 'o1', partner: 'ethan', amount: 750, paid_on: '2026-08-26' }

const withSettled = ledger({
  payments: [
    pay(1000, '2026-08-01', { id: 's1', partner_payout_id: 'o1' }),
    pay(500, '2026-08-02', { id: 's2', partner_payout_id: 'o1' }),
    pay(2000, '2026-08-03', { id: 'u1' }),
  ],
  expenses: [],
  payouts: [OUT],
})
check('settled payments are counted', withSettled.settledCount === 2, String(withSettled.settledCount))
check('and so are the ones still to settle', withSettled.unsettledCount === 1)
check(
  'a settled row says when it was sent',
  withSettled.counted.every((r) =>
    r.id === 'u1' ? !r.settled && !r.settledOn : r.settled && r.settledOn === '2026-08-26'
  )
)
const stale = ledger({
  payments: [pay(1000, '2026-08-01', { id: 'x', partner_payout_id: 'gone' })],
  expenses: [exp(100, '2026-08-01', { id: 'e', partner_payout_id: 'gone' })],
  payouts: [],
})
check('a payout id pointing at a deleted payout reads as unsettled', stale.counted[0].settled === false)
check(
  'and it is not counted as settled either — deleting a payout is how you undo one',
  stale.settledCount === 0 && stale.unsettledCount === 1 && stale.attributed === 0,
  `${stale.settledCount} / ${stale.attributed}`
)

// The invariant that keeps the two stories together: what he was sent, versus
// what the rows marked settled actually entitled him to.
check(
  'accepting the suggested amount leaves nothing unattributed',
  withSettled.attributed === 750 && withSettled.unattributed === 0,
  `${withSettled.attributed} / ${withSettled.unattributed}`
)
const typedOver = ledger({
  payments: [pay(1000, '2026-08-01', { id: 's1', partner_payout_id: 'o1' })],
  payouts: [{ ...OUT, amount: 600 }],
})
check(
  'sending a different figure shows up as a gap rather than silently',
  typedOver.attributed === 500 && typedOver.unattributed === 100,
  `${typedOver.attributed} / ${typedOver.unattributed}`
)
check(
  'settling nothing but sending money is the same kind of gap',
  ledger({ payments: [pay(1000, '2026-08-01')], payouts: [OUT] }).unattributed === 750
)

// --- what to send for a selection ----------------------------------------
const sel = (ids, over = {}) =>
  payoutPreview({
    payments: [
      pay(1000, '2026-08-01', { id: 'a' }),
      pay(500, '2026-08-02', { id: 'b' }),
      pay(2000, '2026-08-03', { id: 'c', partner_payout_id: 'o1' }),
    ],
    selectedIds: ids,
    ...over,
  })

check('an empty selection is worth nothing', sel([]).amount === 0 && sel([]).count === 0)
check('one payment is worth half of it', sel(['a']).amount === 500)
check('two are worth half of both', sel(['a', 'b']).amount === 750 && sel(['a', 'b']).count === 2)
check('an id that is not there is ignored', sel(['a', 'nope']).amount === 500)
check('a Set works as well as an array', sel(new Set(['a', 'b'])).amount === 750)
check(
  'an already-settled payment can still be re-selected — undoing is deleting the payout',
  sel(['c']).amount === 1000
)

// THE property: the preview is the ledger, not a second formula.
for (const ids of [[], ['a'], ['b'], ['a', 'b'], ['a', 'b', 'c']]) {
  const preview = payoutPreview({
    payments: [
      pay(1000.01, '2026-08-01', { id: 'a' }),
      pay(333.33, '2026-08-02', { id: 'b' }),
      pay(0.01, '2026-08-03', { id: 'c' }),
    ],
    expenses: [exp(99.99, '2026-08-01', { id: 'e1' })],
    selectedIds: ids,
    splitPercent: 55,
  })
  const direct = ledger({
    payments: [
      pay(1000.01, '2026-08-01', { id: 'a' }),
      pay(333.33, '2026-08-02', { id: 'b' }),
      pay(0.01, '2026-08-03', { id: 'c' }),
    ].filter((p) => ids.includes(p.id)),
    expenses: [exp(99.99, '2026-08-01', { id: 'e1' })],
    payouts: [],
    splitPercent: 55,
  })
  check(
    `the preview matches the ledger for ${ids.length} selected`,
    preview.amount === direct.earned.ethan,
    `${preview.amount} vs ${direct.earned.ethan}`
  )
}

// Pooled costs come off the next distribution, whatever is ticked.
const withCosts = payoutPreview({
  payments: [pay(1000, '2026-08-01', { id: 'a' }), pay(1000, '2026-08-02', { id: 'b' })],
  expenses: [
    exp(400, '2026-08-01', { id: 'e1' }),
    exp(100, '2026-08-02', { id: 'e2', paid_by: 'ethan' }),
    exp(9999, '2026-01-01', { id: 'old', partner_payout_id: 'o1' }),
    exp(50, '2026-08-03', { id: 'p1', shared: false, paid_by: 'me' }),
  ],
  selectedIds: ['a'],
})
check('every unsettled shared cost comes off', withCosts.expensesDeducted === 500, String(withCosts.expensesDeducted))
check('a cost already settled is not deducted twice', withCosts.expensesDeducted !== 10499)
check('a personal cost is not deducted at all', withCosts.expensesDeducted !== 550)
check(
  'the arithmetic is shown line by line',
  withCosts.grossCut === 500 && withCosts.expenseShare === 250 && withCosts.frontedBack === 100,
  JSON.stringify(withCosts)
)
check('and it adds up', withCosts.amount === 350, String(withCosts.amount))
check(
  'the settled cost is not offered up for re-settling',
  !withCosts.expenseIds.includes('old') && withCosts.expenseIds.includes('e1')
)
check('a personal cost is never attached to a payout', !withCosts.expenseIds.includes('p1'))

const swamped = payoutPreview({
  payments: [pay(100, '2026-08-01', { id: 'a' })],
  expenses: [exp(900, '2026-08-01', { id: 'e1' })],
  selectedIds: ['a'],
})
check('costs bigger than the selection read as negative, not zero', swamped.negative === true && swamped.amount === -400)
check('a positive amount is not flagged', withCosts.negative === false)

// Settling everything and sending exactly that leaves nothing owed.
const settleAll = (() => {
  const payments = [pay(1000, '2026-08-01', { id: 'a' }), pay(600, '2026-08-02', { id: 'b' })]
  const expenses = [exp(200, '2026-08-01', { id: 'e1', paid_by: 'ethan' })]
  const preview = payoutPreview({ payments, expenses, selectedIds: ['a', 'b'] })
  const after = ledger({
    payments: payments.map((p) => ({ ...p, partner_payout_id: 'o1' })),
    expenses: expenses.map((e) => ({ ...e, partner_payout_id: 'o1' })),
    payouts: [{ id: 'o1', partner: 'ethan', amount: preview.amount, paid_on: '2026-09-02' }],
  })
  return { preview, after }
})()
check('settling up clears the balance exactly', settleAll.after.owed.ethan === 0, String(settleAll.after.owed.ethan))
check('and leaves nothing unattributed', settleAll.after.unattributed === 0)
check('and nothing left to settle', settleAll.after.unsettledCount === 0)

// --- the roll-ups --------------------------------------------------------
const byClient = countedByClient(traced.counted)
check('payments group by client, biggest first', byClient[0].client === 'Acme' && byClient[0].total === 1250)
check('with a count and the cut', byClient[0].count === 2 && byClient[1].client === 'Belk')
check(
  'the groups add back up to the collected total',
  byClient.reduce((t, g) => t + toCents(g.total), 0) === toCents(traced.collected)
)
check(
  'and their cuts add back up to the gross cut',
  byClient.reduce((t, g) => t + toCents(g.ethanCut), 0) === toCents(traced.gross.ethan)
)
check('the client id is kept so the group can link to the client', byClient[0].clientId === 'c1')

const mixedGroups = countedByClient(
  ledger({
    payments: [
      pay(1000, '2026-08-01', { id: 'g1', clients: { name: 'Acme' }, partner_payout_id: 'o1' }),
      pay(500, '2026-08-02', { id: 'g2', clients: { name: 'Acme' } }),
      pay(300, '2026-08-03', { id: 'g3', clients: { name: 'Belk' } }),
    ],
    payouts: [OUT],
  }).counted
)
check(
  'a group separates what is settled from what is still open',
  mixedGroups[0].client === 'Acme' &&
    mixedGroups[0].count === 2 &&
    mixedGroups[0].settledCount === 1 &&
    mixedGroups[0].openCount === 1,
  JSON.stringify(mixedGroups[0])
)
check(
  'and the open figures exclude the settled payment',
  mixedGroups[0].total === 1500 && mixedGroups[0].openTotal === 500 && mixedGroups[0].openEthanCut === 250,
  `${mixedGroups[0].openTotal} / ${mixedGroups[0].openEthanCut}`
)
check(
  'the open ids are what a tick box acts on',
  mixedGroups[0].openIds.join(',') === 'g2' && !mixedGroups[0].openIds.includes('g1')
)
check(
  'a group with nothing settled offers all of it',
  mixedGroups[1].client === 'Belk' && mixedGroups[1].openIds.join(',') === 'g3' && mixedGroups[1].settledCount === 0
)

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
const empty = ledger()
check(
  'an empty account is zero everywhere and still balances',
  empty.net === 0 && empty.owed.ethan === 0 && empty.balances === true && empty.counted.length === 0
)

// Costs and no revenue is a real loss, and a negative share is the honest
// answer -- each partner is down half of it.
const loss = ledger({ payments: [], expenses: [exp(1000, '2026-08-01')], payouts: [] })
check('a loss is split too', loss.net === -1000 && loss.shares.ethan === -500)
check('and still balances', loss.balances === true)

if (failures > 0) {
  console.error(`\npartner-split checks FAILED (${failures})`)
  process.exit(1)
}
console.log('\nAll partner-split checks passed')
