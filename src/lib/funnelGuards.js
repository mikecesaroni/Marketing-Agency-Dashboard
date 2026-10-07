// The guards in front of "Build it in Meta", with no network in them, so
// scripts/check-funnel-guards.mjs can pin them.
//
// Why these exist: on 2026-10-07 a one-month-old account that had never
// spent and had no card on file got the whole funnel created twice within
// 30 seconds (a second click while the first build was still running), and
// Meta moved the account to pending closure the same day. Meta's enforcement
// is about the pattern of writes, not the ads, so the pattern is what these
// stop: a burst of writes, a duplicate build, and a build on an account that
// looks like a throwaway.

import { accountStatusLabel, accountStatusOk } from './adHealth.js'

/** Looks like a throwaway to Meta: never spent and no payment method on file. */
export function isFreshAccount(account) {
  if (!account) return false
  const spent = Number(account.amount_spent || 0)
  return spent === 0 && !account.has_funding
}

/**
 * What stops a build, and what only warns.
 *   account: { status, amount_spent, has_funding } from inspect (or null)
 *   builtToday: campaigns the CRM already made today (names)
 *   acknowledged: { fresh, duplicate } the person ticked
 */
export function buildGuards({ account, builtToday = [], acknowledged = {} }) {
  const blockers = []
  const warnings = []

  if (account && !accountStatusOk(account.status)) {
    blockers.push(`Meta reports this ad account as ${accountStatusLabel(account.status)}. Nothing can be built until it is active again.`)
  }

  if (builtToday.length > 0) {
    const msg = `Already built today: ${builtToday.join(', ')}. Building again makes a second copy of every campaign and ad set.`
    if (acknowledged.duplicate) warnings.push(msg)
    else blockers.push(msg)
  }

  if (isFreshAccount(account)) {
    const msg = 'This ad account has never spent and has no payment method on file. Meta closes new accounts that get a burst of activity before any ad has run. Add a card and run one small ad first.'
    if (acknowledged.fresh) warnings.push(msg)
    else blockers.push(msg)
  }

  return { blockers, warnings }
}

/** The CRM's campaigns made today, from an inspect result. */
export function builtTodayFrom(campaigns = [], today = new Date().toISOString().slice(0, 10)) {
  return (campaigns || [])
    .filter((c) => String(c.name || '').startsWith('WC_') && String(c.created || '').slice(0, 10) === today)
    .map((c) => c.name)
}
