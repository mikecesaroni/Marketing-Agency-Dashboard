// Signup links: the pure half.
//
// One link a new client pays through and then fills in the onboarding form,
// after which they are in the CRM without anybody adding them ("get a link
// where the client can pay the setup and monthly subscription based on the
// tier I click, then they fill out the onboarding form, then they show up
// as a new client", 2026-11-27). docs/client-signup.md has the flow.
//
// The link is /join/<token>. Its Stripe buttons are the same saved Payment
// Links the Billing tab uses (clientBilling.js), stamped with the SIGNUP's
// id; the webhook makes the client on the first payment. This module says
// what a link for a plan would charge, what the signup page shows, and where
// a link stands on the CRM's list. The reads and writes are in
// clientSignupStore.js.
//
// Plain JavaScript, so scripts/check-client-signup.mjs runs it in Node.

import { TIER_BY_NUMBER } from './clientTiers.js'
import { BILLING_LINK_KEYS, monthlyLinkFor, packageFor, payLink } from './clientBilling.js'

/** The one address of a signup link. */
export const joinPath = (token) => `/join/${token}`

const money = (n) => `$${(Number(n) || 0).toLocaleString('en-US')}`
const text = (v) => String(v || '').trim()

/** What the saved setup fee link charges, or 0 when there is no link (or no amount) saved. */
export function setupLinkAmount(links) {
  const amount = Number(links?.[BILLING_LINK_KEYS.setupAmount]) || 0
  return amount > 0 && text(links?.[BILLING_LINK_KEYS.setup]) ? amount : 0
}

/**
 * What a signup link for this plan charges, and what stops one being made.
 *
 * The plan IS the monthly price. The setup fee is the amount the saved setup
 * link charges, or nothing when it is waived: a signup page can only send
 * people to links that exist, so it never promises an amount no link charges
 * (the Billing tab's rule). `links` is app_settings as key to value.
 *
 * Returns { tier, monthly, setup, problems }; problems is empty when the
 * link can be made.
 */
export function signupOffer({ tier, withSetup = true, links = {} } = {}) {
  const t = TIER_BY_NUMBER[Number(tier)]
  if (!t) return { tier: 0, monthly: 0, setup: 0, problems: ['Pick the plan they are signing up for.'] }
  const problems = []
  if (!monthlyLinkFor(t.price, links)) problems.push(`There is no Stripe subscription link saved for ${money(t.price)} a month. Add it on Payments, under Stripe, then make this link.`)
  const setup = withSetup ? setupLinkAmount(links) : 0
  if (withSetup && !setup) problems.push('There is no Stripe setup fee link saved (or what it charges is not filled in). Add it on Payments, under Stripe, or choose No setup fee.')
  return { tier: t.tier, monthly: t.price, setup, problems }
}

/** The row a new link is saved as, or the reason it cannot be. */
export function signupRow({ businessName, email = '', tier, withSetup = true, links = {}, by = '' } = {}) {
  const name = text(businessName)
  if (!name) return { error: 'Type the business name, so the link and the new client carry it.' }
  const mail = text(email).toLowerCase()
  if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return { error: 'That email does not look right. Fix it or leave it empty.' }
  const offer = signupOffer({ tier, withSetup, links })
  if (offer.problems.length) return { error: offer.problems[0] }
  return { row: { business_name: name, contact_email: mail || null, tier: offer.tier, monthly_fee: offer.monthly, setup_fee: offer.setup, created_by: text(by) || null } }
}

/**
 * Everything the signup page says, from client_signup_load's answer
 * (supabase/client-signups.sql): { signup, state, onboarding_token, links }.
 *
 *   setup.status    none (no fee) | due | paid
 *   monthly.status  not-started | active
 *   form.status     locked (pay first) | open | done
 *   stage           pay | form | done
 *
 * A button's link is offered only when it charges exactly what the signup
 * owes; otherwise the page says the link is on its way.
 */
export function signupPlan(data) {
  const s = data?.signup || {}
  const st = data?.state || {}
  const links = data?.links || {}
  const email = text(s.contact_email)
  const setupFee = Number(s.setup_fee) || 0
  const monthlyFee = Number(s.monthly_fee) || 0

  const setupPaid = setupFee <= 0 || Boolean(st.setup_paid)
  const standard = setupLinkAmount(links)
  const setupFits = standard > 0 && Math.abs(standard - setupFee) < 0.5
  const setup = {
    status: setupFee <= 0 ? 'none' : setupPaid ? 'paid' : 'due',
    amount: setupFee,
    paidOn: text(st.setup_paid_on),
    link: setupFee > 0 && !setupPaid && setupFits ? payLink(links[BILLING_LINK_KEYS.setup], s.id, email) : '',
  }

  const started = Boolean(st.monthly_started)
  const monthly = {
    status: started ? 'active' : 'not-started',
    amount: monthlyFee,
    startedOn: text(st.monthly_started_on),
    package: packageFor({ tier: s.tier, monthly_fee: monthlyFee }),
    link: started ? '' : payLink(monthlyLinkFor(monthlyFee, links), s.id, email),
  }

  const paid = setupPaid && started
  const token = text(data?.onboarding_token)
  const formDone = Boolean(st.form_submitted_at)
  const form = {
    status: formDone ? 'done' : paid && token ? 'open' : 'locked',
    path: token ? `/onboarding/${token}` : '',
  }

  return {
    name: text(s.business_name),
    setup,
    monthly,
    form,
    paid,
    stage: paid && formDone ? 'done' : paid ? 'form' : 'pay',
  }
}

/**
 * Where a link stands, for the CRM's list. `row` is a client_signups row
 * with its `state` (client_signups_list). Returns { key, label, tone }:
 *
 *   sent       made, never opened
 *   opened     opened, nothing paid
 *   part       one of the two payments is in
 *   form       paid in full, waiting on the onboarding form
 *   done       paid and the form is in: an ordinary client from here
 *   cancelled  the link was cancelled before anything was paid
 */
export function signupStatus(row) {
  const st = row?.state || {}
  const setupFee = Number(row?.setup_fee) || 0
  const hasClient = Boolean(row?.client_id)
  const setupPaid = setupFee <= 0 || Boolean(st.setup_paid)
  const started = Boolean(st.monthly_started)
  if (hasClient && setupPaid && started) {
    return st.form_submitted_at ? { key: 'done', label: 'Signed up', tone: 'success' } : { key: 'form', label: 'Paid, waiting on their form', tone: 'warning' }
  }
  if (hasClient) {
    const label = started ? 'Monthly started, setup fee not paid' : setupFee > 0 && st.setup_paid ? 'Setup fee paid, monthly not started' : 'Started paying'
    return { key: 'part', label, tone: 'warning' }
  }
  if (row?.revoked) return { key: 'cancelled', label: 'Cancelled', tone: 'dim' }
  if (row?.opened_at) return { key: 'opened', label: 'Opened, not paid yet', tone: 'info' }
  return { key: 'sent', label: 'Not opened yet', tone: 'neutral' }
}

/** A link still worth showing as open: not signed up and not cancelled. */
export const signupIsOpen = (row) => !['done', 'cancelled'].includes(signupStatus(row).key)

/** What the link charges, in a few words: "$1,500 plan · $2,500 setup + $1,500/mo". */
export function signupSummary(row) {
  const t = TIER_BY_NUMBER[Number(row?.tier)]
  const setup = Number(row?.setup_fee) || 0
  return `${t ? t.short : 'Plan'} · ${setup > 0 ? `${money(setup)} setup + ` : ''}${money(row?.monthly_fee)}/mo`
}

/** The text to send with the link. Short, plain, no dashes. */
export function signupMessage({ url = '' } = {}) {
  return `Here is your link to get started with The Working Class Marketing:\n${url}\n\nIt takes you through payment first, then a short form about your business so we can start building your ads.`
}

/**
 * The signups the CRM still has to finish: a client was made by a payment
 * and nobody has made their onboarding tasks yet.
 */
export const signupsToFinish = (rows) => (rows || []).filter((r) => r?.client_id && !r.finished_at)
