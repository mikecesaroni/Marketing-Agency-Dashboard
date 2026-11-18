// Self-check for the client billing sheet. Run: node scripts/check-billing-sheet.mjs
//
// 2026-11-18: "an excel sheet built with client name, business name, date
// first paid, date paused, active status, monthly subscription, set up fee
// amount paid, match everything with Stripe because that is real data ...
// also add in what tier they are on."

import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { BILLING_COLUMNS, billingTotals, billingWorkbook, buildBillingSheet, cancellationsByCustomer, fromStripe, nextMonth, stripeSubscriptions, tierName } from '../src/lib/billingSheet.js'
import { colName, esc, excelDate, makeXlsx, sheetName, xlsxParts } from '../src/lib/xlsxWriter.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

// --- the data: Stripe's payments, the CRM's expectations, a hand entry ---------------------
const stripe = (client_id, payment_type, amount, paid_date, extra = {}) => ({ client_id, payment_type, amount, paid_date, status: 'paid', stripe_event_id: `evt_${client_id}_${paid_date}_${amount}`, stripe_customer_id: `cus_${client_id}`, ...extra })
const clients = [
  { id: 'a', name: 'Acme Heating', tier: 2, monthly_fee: 2500, stripe_customer_id: 'cus_a' },
  { id: 'b', name: 'Belk Cooling', tier: 1, monthly_fee: 1500, paused_at: '2026-10-20T15:00:00Z' },
  { id: 'c', name: 'Cedar Roofing', monthly_fee: 1500 },
  { id: 'd', name: 'Dunn Plumbing', tier: 1, monthly_fee: 1500, archived: true },
  { id: 'e', name: 'Eagle Air', tier: 3, monthly_fee: 3500 },
  { id: 'h', name: 'Horizon HVAC', is_internal: true, monthly_fee: 0 },
]
const payments = [
  // Acme: setup, then two subscriptions a month ($2,000 + $500), three months.
  stripe('a', 'setup', 1500, '2026-08-01'),
  stripe('a', 'monthly', 2000, '2026-09-01'),
  stripe('a', 'monthly', 500, '2026-09-10'),
  stripe('a', 'monthly', 2000, '2026-10-01'),
  stripe('a', 'monthly', 500, '2026-10-10'),
  stripe('a', 'monthly', 2000, '2026-11-01'),
  stripe('a', 'monthly', 500, '2026-11-10'),
  // What the CRM expects next month: not money, never counted.
  { client_id: 'a', payment_type: 'monthly', amount: 2500, due_date: '2026-12-01', status: 'pending' },
  // Belk: paid, paused Oct 20, and Stripe charged again on Nov 5.
  stripe('b', 'setup', 1000, '2026-09-05'),
  stripe('b', 'monthly', 1500, '2026-10-05'),
  stripe('b', 'monthly', 1500, '2026-11-05'),
  // Cedar: nothing from Stripe, a setup typed in by hand.
  { client_id: 'c', payment_type: 'setup', amount: 2000, paid_date: '2026-10-01', status: 'paid' },
  // Dunn: archived, subscription cancelled after the last charge.
  stripe('d', 'monthly', 1500, '2026-08-15'),
  // Eagle: active in the CRM, Stripe charges $3,000 not $3,500, one charge failing.
  stripe('e', 'monthly', 3000, '2026-11-02'),
  { client_id: 'e', payment_type: 'monthly', amount: 3000, due_date: '2026-11-12', status: 'overdue', stripe_invoice_id: 'in_1', stripe_customer_id: 'cus_e', failure_count: 2 },
]
const events = [
  { type: 'customer.subscription.deleted', payload: { created: 1787000000, data: { object: { customer: 'cus_d', ended_at: Date.parse('2026-09-01T00:00:00Z') / 1000 } } } },
  { type: 'invoice.paid', payload: { data: { object: { customer: 'cus_a' } } } },
]
const intakes = [{ client_id: 'a', owner_name: 'Ann Acme' }, { client_id: 'b', owner_name: '' }]
const ghl = [{ client_id: 'b', authorized_rep_name: 'Bob Belk' }]

const rows = buildBillingSheet({ clients, payments, intakes, ghl, events, today: '2026-11-18' })
const by = Object.fromEntries(rows.map((r) => [r.business, r]))

check('a Stripe payment carries a Stripe id; what the CRM expects or a hand entry does not', [fromStripe(payments[0]), fromStripe(payments[7]), fromStripe(payments[11]), fromStripe({ stripe_invoice_id: 'in_1' })], [true, false, false, true])
check('one row per client, our own businesses left out, active first then paused then archived, by business name', rows.map((r) => `${r.status}:${r.business}`), ['Active:Acme Heating', 'Active:Cedar Roofing', 'Active:Eagle Air', 'Paused:Belk Cooling', 'Archived:Dunn Plumbing'])
check('client name is the owner on the onboarding form, else the authorised rep; business name is the CRM client', [by['Acme Heating'].client, by['Belk Cooling'].client, by['Cedar Roofing'].client], ['Ann Acme', 'Bob Belk', ''])
check('the tier is the one set on the client, else the one the fee says', [by['Acme Heating'].tier, by['Cedar Roofing'].tier, tierName({}), tierName({ tier: 3 })], ['The Whole Chain Marketing ($2,500/mo)', 'CRM / Marketing Maintenance ($1,500/mo)', 'No tier yet', 'Runs Without You Marketing ($3,500/mo)'])
check('date first paid is the first Stripe payment, setup or monthly', [by['Acme Heating'].firstPaid, by['Belk Cooling'].firstPaid, by['Cedar Roofing'].firstPaid], ['2026-08-01', '2026-09-05', ''])
check('the monthly subscription is the latest month Stripe charged, two subscriptions added, earlier months not', by['Acme Heating'].monthly, 2500)
check('setup fee paid and total paid are Stripe only; the pending month is never counted', [by['Acme Heating'].setupPaid, by['Acme Heating'].totalPaid, by['Acme Heating'].lastPaid, by['Acme Heating'].lastAmount], [1500, 9000, '2026-11-10', 500])
check('a hand-typed setup is not money: no dates, no dollars, named in the notes', [by['Cedar Roofing'].setupPaid, by['Cedar Roofing'].totalPaid, by['Cedar Roofing'].stripeStatus, by['Cedar Roofing'].notes], [null, null, 'No Stripe payment yet', 'Not matched to any Stripe payment. Setup $2,000 recorded by hand, not in Stripe'])
check('paused: the date, the note when Stripe charged after it, and that Stripe has no cancellation', [by['Belk Cooling'].pausedOn, by['Belk Cooling'].stripeStatus, by['Belk Cooling'].notes], ['2026-10-20', 'Charging monthly', 'Stripe charged on Nov 5, 2026, after the pause on Oct 20, 2026. Paused in the CRM but Stripe shows no cancellation: next charge due about Dec 5, 2026'])
check('a cancelled subscription is read from Stripe by the customer; the row keeps what it was charging', [[...cancellationsByCustomer(events)], by['Dunn Plumbing'].stripeStatus, by['Dunn Plumbing'].monthly, by['Dunn Plumbing'].notes], [[['cus_d', '2026-09-01']], 'Subscription cancelled Sep 1, 2026', 1500, ''])
check('the CRM fee beside Stripe, the difference and a failed charge named', [by['Eagle Air'].monthly, by['Eagle Air'].crmFee, by['Eagle Air'].stripeStatus, by['Eagle Air'].notes], [3000, 3500, 'Charging monthly, latest payment failing', 'CRM fee $3,500/mo, Stripe charges $3,000. 1 Stripe charge failed and still unpaid ($3,000)'])
check('the totals: counts, monthly Stripe revenue of active clients, setup and total collected, rows to check', billingTotals(rows), { active: 3, paused: 1, archived: 1, stripeMonthly: 5500, setupCollected: 2500, totalCollected: 17500, flagged: 3 })
check('nothing at all is no rows', buildBillingSheet(), [])
// --- more than one Stripe customer per client -----------------------------------------------
check('next month the way Stripe bills', [nextMonth('2026-10-27'), nextMonth('2026-01-31'), nextMonth('2026-12-15'), nextMonth('2026-08-31')], ['2026-11-27', '2026-02-28', '2027-01-15', '2026-09-30'])
const more = buildBillingSheet({
  today: '2026-11-18',
  clients: [
    { id: 'r', name: 'Replaced Air', monthly_fee: 1750 },
    { id: 's', name: 'Side By Side', monthly_fee: 1397, paused_at: '2026-11-11T00:00:00Z' },
    { id: 'l', name: 'Lapsed Co', monthly_fee: 998 },
    { id: 'x', name: 'Double Entry', monthly_fee: 1500 },
    { id: 'n', name: 'New Setup', monthly_fee: 2500 },
  ],
  payments: [
    // Two old subscriptions at $998, then a new one at $1,750 on a new customer.
    stripe('r', 'monthly', 998, '2026-09-16', { stripe_customer_id: 'cus_r1' }),
    stripe('r', 'monthly', 998, '2026-09-17', { stripe_customer_id: 'cus_r2' }),
    stripe('r', 'monthly', 998, '2026-10-16', { stripe_customer_id: 'cus_r1' }),
    stripe('r', 'monthly', 998, '2026-10-17', { stripe_customer_id: 'cus_r2' }),
    stripe('r', 'monthly', 1750, '2026-10-27', { stripe_customer_id: 'cus_r3' }),
    // Two subscriptions side by side, the same day each month.
    stripe('s', 'monthly', 998, '2026-09-28', { stripe_customer_id: 'cus_s1' }),
    stripe('s', 'monthly', 399, '2026-09-28', { stripe_customer_id: 'cus_s2' }),
    stripe('s', 'monthly', 998, '2026-10-28', { stripe_customer_id: 'cus_s1' }),
    stripe('s', 'monthly', 399, '2026-10-28', { stripe_customer_id: 'cus_s2' }),
    // Charged once in September, nothing since, no cancellation on record.
    stripe('l', 'monthly', 998, '2026-09-10'),
    // The checkout and the invoice it raised, both written down.
    stripe('x', 'monthly', 1500, '2026-11-08', { stripe_invoice_id: null }),
    stripe('x', 'monthly', 1500, '2026-11-08', { stripe_event_id: 'evt_x_inv', stripe_invoice_id: 'in_x' }),
    // Setup paid, the first month not charged yet.
    stripe('n', 'setup', 2000, '2026-10-29'),
  ],
})
const mb = Object.fromEntries(more.map((r) => [r.business, r]))
check('a replaced subscription is not added to the new one: $998 + $998 then $1,750 is $1,750 a month', [mb['Replaced Air'].monthly, mb['Replaced Air'].stripeStatus, mb['Replaced Air'].notes], [1750, 'Charging monthly', ''])
check('...each Stripe customer is its own subscription, and says why it stopped', stripeSubscriptions([{ stripe_customer_id: 'a', amount: 998, paid_date: '2026-10-16' }, { stripe_customer_id: 'b', amount: 1750, paid_date: '2026-10-27' }, { stripe_customer_id: 'c', amount: 500, paid_date: '2026-08-01' }], [], new Map([['c', '2026-08-20']]), '2026-11-18').map((x) => [x.customer, x.amount, x.due, x.why]), [['c', 500, '2026-09-01', 'cancelled'], ['a', 998, '2026-11-16', 'replaced'], ['b', 1750, '2026-11-27', '']])
check('two subscriptions side by side are added, and a paused client Stripe still bills is named', [mb['Side By Side'].monthly, mb['Side By Side'].notes], [1397, 'Paused in the CRM but Stripe shows no cancellation: next charge due about Nov 28, 2026'])
check('a subscription that just stopped being charged: the last amount, and the status and note say so', [mb['Lapsed Co'].monthly, mb['Lapsed Co'].stripeStatus, mb['Lapsed Co'].notes], [998, 'No charge since Sep 10, 2026', 'Active in the CRM but Stripe has not charged since Sep 10, 2026'])
check('a failed invoice Stripe is still retrying keeps the subscription running; with none it lapses after three days', [stripeSubscriptions([{ stripe_customer_id: 'a', amount: 100, paid_date: '2026-10-01' }], [{ stripe_customer_id: 'a', due_date: '2026-11-01' }], new Map(), '2026-11-18')[0].why, stripeSubscriptions([{ stripe_customer_id: 'a', amount: 100, paid_date: '2026-10-01' }], [], new Map(), '2026-11-04')[0].why, stripeSubscriptions([{ stripe_customer_id: 'a', amount: 100, paid_date: '2026-10-01' }], [], new Map(), '2026-11-05')[0].why], ['', '', 'lapsed'])
check('a checkout and its first invoice are one month, not two, and the row says to check', [mb['Double Entry'].monthly, mb['Double Entry'].totalPaid, mb['Double Entry'].notes], [1500, 3000, '2 monthly payments of $1,500 on Nov 8, 2026: possibly one payment recorded twice, check on the Payments page'])
{
  const confirmed = buildBillingSheet({ today: '2026-11-18', clients: [{ id: 'k', name: 'K', monthly_fee: 1500 }], payments: [stripe('k', 'monthly', 1500, '2026-11-08', { stripe_invoice_id: null, duplicate_reviewed_at: '2026-11-09' }), stripe('k', 'monthly', 1500, '2026-11-08', { stripe_event_id: 'evt_k_inv', stripe_invoice_id: 'in_k', duplicate_reviewed_at: '2026-11-09' })] })[0]
  check('...and two same-day payments a person confirmed are both real money, still one subscription, with nothing to check', [confirmed.monthly, confirmed.totalPaid, confirmed.notes], [1500, 3000, ''])
}
check('setup paid and no monthly charge yet is said', [mb['New Setup'].monthly, mb['New Setup'].setupPaid, mb['New Setup'].stripeStatus, mb['New Setup'].notes], [null, 2000, 'Setup paid, no monthly charge yet', 'No monthly charge from Stripe yet'])
check('monthly revenue counts only active clients Stripe is still charging', billingTotals(more).stripeMonthly, 1750 + 1500)

check('the columns asked for, in order, then the extras', BILLING_COLUMNS.map((c) => c.header), ['Client name', 'Business name', 'Tier', 'Status', 'Date first paid (Stripe)', 'Date paused', 'Monthly subscription (Stripe)', 'Setup fee paid (Stripe)', 'Monthly fee in CRM', 'Last payment', 'Last payment amount', 'Total paid (Stripe)', 'Stripe status', 'Notes'])

// --- the Excel file -----------------------------------------------------------------------------
check('column letters and Excel dates', [colName(0), colName(25), colName(26), colName(701), excelDate('2026-11-18'), excelDate('1900-03-01'), excelDate('nope')], ['A', 'Z', 'AA', 'ZZ', 46344, 61, null])
check('text is escaped and sheet names made legal', [esc('A & B <c> "d"'), sheetName('Clients: paid/unpaid [all]*?'), sheetName('x'.repeat(40)).length], ['A &amp; B &lt;c&gt; &quot;d&quot;', 'Clients  paid unpaid  all', 31])
const book = billingWorkbook(rows, { today: '2026-11-18' })
const parts = xlsxParts(book)
check('a workbook of two sheets with every part Excel needs', Object.keys(parts).sort(), ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'])
const sheet1 = parts['xl/worksheets/sheet1.xml']
check('the header row is frozen, every column filters, money is a number in dollars and a date is a real date', [sheet1.includes('state="frozen"'), sheet1.includes('<autoFilter ref="A1:N6"/>'), sheet1.includes('<c r="G2" s="2"><v>2500</v></c>'), sheet1.includes('<c r="E2" s="3"><v>46235</v></c>'), sheet1.includes('Acme Heating'), parts['xl/styles.xml'].includes('&quot;$&quot;#,##0.00')], [true, true, true, true, true, true])
check('an empty cell is left out, never written as zero', [sheet1.includes('<c r="F2"'), /<c r="H3"[^>]*><v>0<\/v>/.test(sheet1)], [false, false])
const bytes = await makeXlsx(book, { type: 'uint8array' })
const back = await JSZip.loadAsync(bytes)
check('the file is a zip that opens, starting PK, with the same parts', [bytes[0], bytes[1], Object.keys(back.files).filter((f) => !f.endsWith('/')).sort().length, (await back.file('xl/workbook.xml').async('string')).includes('<sheet name="Clients" sheetId="1" r:id="rId1"/>')], [0x50, 0x4b, 7, true])

// --- the page -------------------------------------------------------------------------------------
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const panel = read('src/components/BillingSheetPanel.jsx')
check('the Payments page builds the sheet live and downloads it as Excel', [read('src/pages/PaymentsPage.jsx').includes('<BillingSheetPanel'), panel.includes('buildBillingSheet('), panel.includes('makeXlsx(billingWorkbook('), panel.includes("eq('type', 'customer.subscription.deleted')"), panel.includes('.xlsx')], [true, true, true, true, true])

if (failures) {
  console.log(`\n${failures} FAILED`)
  process.exit(1)
}
console.log('\nAll billing sheet checks passed.')
