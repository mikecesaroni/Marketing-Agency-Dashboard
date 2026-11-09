// The client's billing page: the pure half.
//
// A client's one link has a Billing tab (/pay/<token>): what their plan is,
// whether the setup fee is paid, whether the subscription has started, and
// the Stripe link to pay or to subscribe, stamped with their id so the
// webhook books the money to them (docs/stripe-setup.md). This module turns
// the client, their ledger and the saved links into what the page says; the
// read is in clientBillingStore.js. Nothing here charges anyone: Stripe's
// own checkout does, and the webhook tells the books.
//
// Plain JavaScript with no imports but the tiers, so
// scripts/check-client-billing.mjs runs it in Node.

import { TIERS, tierOf } from './clientTiers.js'

/**
 * The app_settings keys the page reads: the one setup link and what it
 * charges, and one subscription link per monthly price. A client whose fee
 * matches none of them has no standard link; the agency pastes a custom one
 * on the client's Payments card (clients.pay_setup_link, pay_monthly_link).
 */
export const BILLING_LINK_KEYS = {
  setup: 'stripe_setup_link',
  setupAmount: 'stripe_setup_link_amount',
  monthly: { 998: 'stripe_monthly_link', 1500: 'stripe_monthly_1500_link', 2500: 'stripe_monthly_2500_link', 3500: 'stripe_monthly_3500_link' },
}

/** The monthly prices a standard link exists for, in order. */
export const STANDARD_MONTHLY_PRICES = Object.keys(BILLING_LINK_KEYS.monthly).map(Number).sort((a, b) => a - b)

/**
 * A Stripe Payment Link stamped for one client: client_reference_id, which
 * is what the webhook reads to book the payment to them, and prefilled_email
 * so the checkout opens with their address already typed. Only an https
 * address is passed through, so a slip in the settings can never send a
 * client to anything but a web page.
 */
export function payLink(base, clientId, email = '') {
  const raw = String(base || '').trim()
  if (!raw || !clientId) return ''
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return ''
    url.searchParams.set('client_reference_id', String(clientId))
    const e = String(email || '').trim().toLowerCase()
    if (e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) url.searchParams.set('prefilled_email', e)
    return url.toString()
  } catch {
    return ''
  }
}

/** The saved subscription link for a monthly fee. The price has to match exactly: a $1,750 client is never offered the $1,500 link. */
export function monthlyLinkFor(fee, links) {
  const key = BILLING_LINK_KEYS.monthly[Number(fee)]
  return key ? String(links?.[key] || '').trim() : ''
}

// What each package includes, said to the client ("your"), where the tiers
// say it to the team ("their").
const CLIENT_INCLUDES = {
  maintenance: ['Your Meta ads planned, built and managed', 'Ad creative made from your own job photos', 'Every lead followed up in your CRM', 'A cost-per-lead report every month'],
  'whole-chain': ['Everything in the $1,500 plan', 'Google Search ads', 'Local Services Ads', 'Your Google Business Profile looked after', 'Your past customers re-engaged'],
  'runs-without-you': ['Everything in the Meta and Google plan', 'An AI assistant built on your business', 'Custom automations for the day to day'],
}

/**
 * The package the client is on, in the client's words: its name, its one
 * line and what it includes. A fee that matches no package is a plain
 * "Monthly plan" with nothing listed, never a guess at what it includes.
 */
export function packageFor(client) {
  const { tier } = tierOf(client)
  const t = TIERS.find((x) => x.tier === tier)
  if (!t) return { name: 'Monthly plan', line: '', includes: [] }
  return { name: t.name, line: t.line.replace(/\btheir\b/g, 'your'), includes: CLIENT_INCLUDES[t.key] || [] }
}

const isPaid = (p) => p?.status === 'paid'
const isOpen = (p) => p?.status === 'pending' || p?.status === 'overdue'
const sum = (rows) => rows.reduce((s, p) => s + (Number(p.amount) || 0), 0)
const newestFirst = (a, b) => String(b.paid_date || b.due_date || '').localeCompare(String(a.paid_date || a.due_date || ''))
const oldestFirst = (a, b) => String(a.due_date || '').localeCompare(String(b.due_date || ''))

/**
 * Everything the Billing tab says, from the client row, their payments
 * (the CRM's own ledger, which the Stripe webhook keeps), the Stripe
 * settings and the client's contact email.
 *
 *   setup.status    paid | due | overdue | none (no fee and nothing owed)
 *   monthly.status  active | failing | paused | not-started
 *   history         every paid row, newest first
 *   missing         the links the page wanted and did not have ('setup',
 *                   'monthly'), for the client page to warn about
 *
 * The standard setup link is offered only when it charges exactly what the
 * client owes (stripe_setup_link_amount); the standard subscription link
 * only when the fee is one of the standard prices. Anything else needs the
 * custom link on the client's card, and until it is pasted the page says a
 * link is coming rather than offering a wrong charge.
 */
export function billingPlan({ client, payments = [], links = {}, email = '', today = '' } = {}) {
  const c = client || {}
  const rows = Array.isArray(payments) ? payments : []
  const custom = { setup: String(c.pay_setup_link || '').trim(), monthly: String(c.pay_monthly_link || '').trim() }
  const missing = []

  // The setup fee: the open setup rows are what is owed; with none, the fee
  // on the client when nothing was ever paid.
  const setupRows = rows.filter((p) => p.payment_type === 'setup')
  const setupPaid = setupRows.filter(isPaid).sort(newestFirst)
  const setupOpen = setupRows.filter(isOpen).sort(oldestFirst)
  const fee = Number(c.setup_fee) || 0
  let setupStatus = 'none'
  let setupAmount = 0
  if (setupOpen.length) {
    setupAmount = sum(setupOpen)
    const due = setupOpen[0].due_date || ''
    setupStatus = due && today && String(due) < String(today) ? 'overdue' : 'due'
  } else if (setupPaid.length) {
    setupStatus = 'paid'
    setupAmount = sum(setupPaid)
  } else if (fee > 0) {
    setupStatus = 'due'
    setupAmount = fee
  }
  let setupLink = ''
  if (setupStatus === 'due' || setupStatus === 'overdue') {
    const standardAmount = Number(links?.[BILLING_LINK_KEYS.setupAmount]) || 0
    const standardFits = standardAmount > 0 && Math.abs(standardAmount - setupAmount) < 0.5
    const base = custom.setup || (standardFits ? String(links?.[BILLING_LINK_KEYS.setup] || '').trim() : '')
    setupLink = payLink(base, c.id, email)
    if (!setupLink) missing.push('setup')
  }
  const setup = {
    status: setupStatus,
    amount: setupAmount,
    paidOn: setupPaid[0]?.paid_date || '',
    dueOn: setupOpen[0]?.due_date || '',
    link: setupLink,
  }

  // The monthly plan: the ledger says whether it has started, whether the
  // last charge bounced (the webhook marks the month overdue with Stripe's
  // retry date and invoice), and when the next month is due.
  const monthlyRows = rows.filter((p) => p.payment_type === 'monthly')
  const monthlyPaid = monthlyRows.filter(isPaid).sort(newestFirst)
  const monthlyOpen = monthlyRows.filter(isOpen).sort(oldestFirst)
  const failing = monthlyOpen.find((p) => Number(p.failure_count) > 0) || null
  const monthlyFee = Number(c.monthly_fee) || 0
  let monthlyStatus = 'not-started'
  if (c.paused_at && !c.archived) monthlyStatus = 'paused'
  else if (failing) monthlyStatus = 'failing'
  else if (monthlyPaid.length) monthlyStatus = 'active'
  // The next month only when it is still ahead: a past open row is the
  // books running behind, not a bill for the client.
  const nextOpen = monthlyOpen.find((p) => !today || String(p.due_date || '') >= String(today)) || null
  let monthlyLink = ''
  if (monthlyStatus === 'not-started') {
    const base = custom.monthly || monthlyLinkFor(monthlyFee, links)
    monthlyLink = monthlyFee > 0 ? payLink(base, c.id, email) : ''
    if (monthlyFee > 0 && !monthlyLink) missing.push('monthly')
  }
  const monthly = {
    status: monthlyStatus,
    amount: monthlyFee,
    package: packageFor(c),
    monthsPaid: monthlyPaid.length,
    since: monthlyPaid[monthlyPaid.length - 1]?.paid_date || '',
    lastPaid: monthlyPaid[0]?.paid_date || '',
    nextDue: monthlyStatus === 'active' && nextOpen ? nextOpen.due_date : '',
    link: monthlyLink,
    failedAmount: failing ? Number(failing.amount) || monthlyFee : 0,
    retryOn: failing?.next_attempt_at || '',
    updateCardUrl: /^https:\/\//i.test(String(failing?.stripe_hosted_invoice_url || '')) ? failing.stripe_hosted_invoice_url : '',
  }

  const history = rows
    .filter(isPaid)
    .sort(newestFirst)
    .map((p) => ({ date: p.paid_date || p.due_date || '', amount: Number(p.amount) || 0, type: p.payment_type === 'setup' ? 'Setup fee' : 'Monthly plan' }))

  return { setup, monthly, history, missing }
}

/** The one Billing tab address for a token. */
export const billingPath = (token) => `/pay/${token}`
