// Self-check for the client's Billing tab: the plan the page says from the
// client row, their ledger and the Stripe settings, and the links it offers.
// Run: node scripts/check-client-billing.mjs

import { readFileSync } from 'node:fs'
import { BILLING_LINK_KEYS, STANDARD_MONTHLY_PRICES, billingPath, billingPlan, monthlyLinkFor, packageFor, payLink } from '../src/lib/clientBilling.js'
import { PORTAL_TABS } from '../src/lib/clientPortal.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const LINKS = {
  stripe_setup_link: 'https://buy.stripe.com/setup',
  stripe_setup_link_amount: '2500',
  stripe_monthly_link: 'https://buy.stripe.com/m998',
  stripe_monthly_1500_link: 'https://buy.stripe.com/m1500',
  stripe_monthly_2500_link: '',
  stripe_monthly_3500_link: 'https://buy.stripe.com/m3500',
}
const ID = '11111111-2222-4333-8444-555555555555'
const TODAY = '2026-11-09'

// The stamped link.
check('a link carries the client id and the prefilled email', payLink('https://buy.stripe.com/abc', ID, 'Owner@Example.com'), `https://buy.stripe.com/abc?client_reference_id=${ID}&prefilled_email=owner%40example.com`)
check('a link that already has a query keeps it', payLink('https://buy.stripe.com/abc?locale=en', ID), `https://buy.stripe.com/abc?locale=en&client_reference_id=${ID}`)
check('a bad email is left off, not sent', payLink('https://buy.stripe.com/abc', ID, 'not an email').includes('prefilled_email'), false)
check('only https goes to a client', [payLink('http://buy.stripe.com/abc', ID), payLink('javascript:alert(1)', ID), payLink('', ID), payLink('https://buy.stripe.com/abc', '')], ['', '', '', ''])
check('the standard monthly link is by exact price', [monthlyLinkFor(998, LINKS), monthlyLinkFor(1500, LINKS), monthlyLinkFor(1750, LINKS), monthlyLinkFor(2500, LINKS), monthlyLinkFor(3500, LINKS)], ['https://buy.stripe.com/m998', 'https://buy.stripe.com/m1500', '', '', 'https://buy.stripe.com/m3500'])
check('the four standard prices', STANDARD_MONTHLY_PRICES, [998, 1500, 2500, 3500])
check('the keys are the ones the Stripe box saves', [BILLING_LINK_KEYS.setup, BILLING_LINK_KEYS.setupAmount, BILLING_LINK_KEYS.monthly[1500]], ['stripe_setup_link', 'stripe_setup_link_amount', 'stripe_monthly_1500_link'])

// The package in the client's words.
check('a $2,500 client is on the Whole Chain, said to them', [packageFor({ monthly_fee: 2500 }).name, packageFor({ monthly_fee: 2500 }).includes[0], packageFor({ tier: 3, monthly_fee: 3500 }).line], ['The Whole Chain Marketing', 'Everything in the $1,500 plan', 'The whole chain, with AI built around your business.'])
check('a fee that matches no package is a plain monthly plan with nothing promised', packageFor({ monthly_fee: 1750 }), { name: 'Monthly plan', line: '', includes: [] })

// A new client: setup fee owed, nothing paid, standard links fit.
const fresh = billingPlan({ client: { id: ID, setup_fee: 2500, monthly_fee: 1500 }, payments: [], links: LINKS, email: 'o@x.com', today: TODAY })
check('new client: the setup fee is due at the fee on the client, with the standard link', [fresh.setup.status, fresh.setup.amount, fresh.setup.link.startsWith('https://buy.stripe.com/setup?client_reference_id=')], ['due', 2500, true])
check('new client: the plan has not started and offers the $1,500 subscription link', [fresh.monthly.status, fresh.monthly.amount, fresh.monthly.link.startsWith('https://buy.stripe.com/m1500?')], ['not-started', 1500, true])
check('new client: nothing missing, no history', [fresh.missing, fresh.history], [[], []])

// The scheduled setup rows decide what is owed; a past due date reads past due.
const owed = billingPlan({ client: { id: ID, setup_fee: 2500, monthly_fee: 998 }, payments: [{ payment_type: 'setup', amount: 1250, status: 'paid', paid_date: '2026-10-01', due_date: '2026-10-01' }, { payment_type: 'setup', amount: 1250, status: 'pending', due_date: '2026-11-01' }], links: LINKS, today: TODAY })
check('a split setup fee: half paid, the other half past due, and no standard link because the link charges $2,500 (the $998 plan still has its link)', [owed.setup.status, owed.setup.amount, owed.setup.dueOn, owed.setup.link, owed.missing], ['overdue', 1250, '2026-11-01', '', ['setup']])
check('a custom setup link on the client covers the odd amount', billingPlan({ client: { id: ID, setup_fee: 2500, pay_setup_link: 'https://buy.stripe.com/half' }, payments: owed ? [{ payment_type: 'setup', amount: 1250, status: 'pending', due_date: '2026-12-01' }] : [], links: LINKS, today: TODAY }).setup.link, `https://buy.stripe.com/half?client_reference_id=${ID}`)

// Paid and active.
const active = billingPlan({
  client: { id: ID, setup_fee: 2500, monthly_fee: 1500, tier: 1 },
  payments: [
    { payment_type: 'setup', amount: 2500, status: 'paid', paid_date: '2026-08-02', due_date: '2026-08-01' },
    { payment_type: 'monthly', amount: 1500, status: 'paid', paid_date: '2026-08-02', due_date: '2026-08-02' },
    { payment_type: 'monthly', amount: 1500, status: 'paid', paid_date: '2026-09-02', due_date: '2026-09-02' },
    { payment_type: 'monthly', amount: 1500, status: 'paid', paid_date: '2026-10-03', due_date: '2026-10-02' },
    { payment_type: 'monthly', amount: 1500, status: 'pending', due_date: '2026-11-02' },
    { payment_type: 'monthly', amount: 1500, status: 'pending', due_date: '2026-12-02' },
  ],
  links: LINKS,
  today: TODAY,
})
check('paid up: the setup fee reads paid with its date and no link', [active.setup.status, active.setup.amount, active.setup.paidOn, active.setup.link], ['paid', 2500, '2026-08-02', ''])
check('active: three months paid since August, last in October, no link to subscribe again', [active.monthly.status, active.monthly.monthsPaid, active.monthly.since, active.monthly.lastPaid, active.monthly.link], ['active', 3, '2026-08-02', '2026-10-03', ''])
check('the next month shown is the first still ahead; a past open row is the books running behind, not a bill', active.monthly.nextDue, '2026-12-02')
check('the history is every paid row, newest first, in the client\'s words', active.history.map((h) => `${h.date} ${h.type} ${h.amount}`), ['2026-10-03 Monthly plan 1500', '2026-09-02 Monthly plan 1500', '2026-08-02 Setup fee 2500', '2026-08-02 Monthly plan 1500'])

// A declined card: the webhook marked the month overdue with Stripe's retry and invoice.
const declined = billingPlan({
  client: { id: ID, monthly_fee: 998 },
  payments: [
    { payment_type: 'monthly', amount: 998, status: 'paid', paid_date: '2026-09-15' },
    { payment_type: 'monthly', amount: 998, status: 'overdue', due_date: '2026-10-15', failure_count: 3, next_attempt_at: '2026-11-12T10:00:00Z', stripe_hosted_invoice_url: 'https://invoice.stripe.com/i/abc' },
  ],
  links: LINKS,
  today: TODAY,
})
check('a decline reads as a payment problem with the retry date and the invoice to fix the card', [declined.monthly.status, declined.monthly.failedAmount, declined.monthly.retryOn, declined.monthly.updateCardUrl], ['failing', 998, '2026-11-12T10:00:00Z', 'https://invoice.stripe.com/i/abc'])
check('an invoice link that is not https is not shown', billingPlan({ client: { id: ID, monthly_fee: 998 }, payments: [{ payment_type: 'monthly', amount: 998, status: 'overdue', failure_count: 1, stripe_hosted_invoice_url: 'http://x' }], links: LINKS }).monthly.updateCardUrl, '')

// Paused, and a custom fee with no link yet.
check('a paused client is paused, whatever the ledger says', billingPlan({ client: { id: ID, monthly_fee: 1500, paused_at: '2026-10-01T00:00:00Z' }, payments: [], links: LINKS }).monthly.status, 'paused')
const odd = billingPlan({ client: { id: ID, setup_fee: 0, monthly_fee: 1750 }, payments: [], links: LINKS, today: TODAY })
check('a $1,750 plan with no custom link: not started, no link, flagged for the client page', [odd.setup.status, odd.monthly.status, odd.monthly.link, odd.missing], ['none', 'not-started', '', ['monthly']])
check('the custom monthly link on the client covers it', billingPlan({ client: { id: ID, monthly_fee: 1750, pay_monthly_link: 'https://buy.stripe.com/m1750' }, payments: [], links: LINKS }).monthly.link, `https://buy.stripe.com/m1750?client_reference_id=${ID}`)
check('no fee at all: nothing due, nothing offered, nothing missing', billingPlan({ client: { id: ID, setup_fee: 0, monthly_fee: 0 }, payments: [], links: LINKS }).missing, [])
check('junk in is quiet', billingPlan({}).monthly.status, 'not-started')

// The tab and its page.
check('the billing tab is on the portal, last, at /pay/', PORTAL_TABS[PORTAL_TABS.length - 1], { key: 'billing', label: 'Billing', prefix: '/pay/', hint: 'Your plan and payments' })
check('the tab address', billingPath('tok'), '/pay/tok')
const page = read('src/pages/ClientBillingPage.jsx')
check('the page reads through the token function and paints a Stripe button in a new tab', [page.includes('loadClientBilling(token)'), /target="_blank" rel="noreferrer"/.test(page), page.includes('data-pay-button')], [true, true, true])
check('the page never promises a cancellation and never shows a card number', [/cancel/i.test(page), /card number/i.test(page)], [false, false])
check('no em dashes on the client page', /[—–]/.test(page), false)
const sql = read('supabase/client-billing.sql')
check('the function is token-gated, definer, anon-callable, and returns only the Stripe keys the page needs', [sql.includes('dashboard_token = p_token and length(p_token) >= 20 and archived = false'), sql.includes('security definer'), sql.includes('grant execute on function client_billing_load(text) to anon, authenticated'), sql.includes("'stripe_monthly_3500_link'"), /notes/.test(sql)], [true, true, true, true, false])
check('the link-name lookup knows the pay tab', sql.includes("p_kind in ('dashboard', 'scripts', 'videos', 'pay')"), true)

console.log(failures === 0 ? '\nAll client billing checks pass' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
