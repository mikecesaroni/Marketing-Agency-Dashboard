// Google Ads customer IDs, and what Google's refusals mean in plain words.
// Kept apart from the input component so the rules can be checked by a
// plain node script and the component file exports only a component.

import { AGENCY_EMAIL } from './agencyEmail.js'

/** Digits only, ten of them, or null. What the API wants and the column holds. */
export function cleanCustomerId(value) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length === 10 ? digits : null
}

/** As Google shows it: 123-456-7890. */
export const dashedId = (id) => String(id || '').replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')

/**
 * A client's OTHER Google Ads accounts (clients.google_ads_extra_customer_ids):
 * ten digits each, no repeats, and never the main account again. The same
 * rule as extraIdsOf() in the google-daily-sync function, which reads every
 * one of them like the main account and files the rows under the client.
 */
export function extraCustomerIds(client) {
  const main = cleanCustomerId(client?.google_ads_customer_id)
  const list = Array.isArray(client?.google_ads_extra_customer_ids) ? client.google_ads_extra_customer_ids : []
  return [...new Set(list.map(cleanCustomerId).filter((id) => id && id !== main))]
}

/** Every Google Ads account a client has, main one first. */
export function allCustomerIds(client) {
  const main = cleanCustomerId(client?.google_ads_customer_id)
  return [...(main ? [main] : []), ...extraCustomerIds(client)]
}

/**
 * Why this ID cannot be added as another account on this client, or '' when
 * it can. `clients` is every client row, because ONE ACCOUNT BELONGS TO ONE
 * CLIENT: the same account on two clients counts its spend twice, once on
 * each (it has happened, and it took a week to notice).
 */
export function extraIdProblem(value, client, clients = []) {
  const id = cleanCustomerId(value)
  if (!id) return 'A Google Ads customer ID is ten digits, like 123-456-7890.'
  if (!cleanCustomerId(client?.google_ads_customer_id)) return 'Save this client’s main Google Ads account first.'
  if (id === cleanCustomerId(client.google_ads_customer_id)) return 'That is this client’s main account already.'
  if (extraCustomerIds(client).includes(id)) return 'That account is already on this client.'
  const other = (clients || []).find(
    (c) => c.id !== client.id && (cleanCustomerId(c.google_ads_customer_id) === id || extraCustomerIds(c).includes(id) || cleanCustomerId(c.lsa_customer_id) === id)
  )
  if (other) return `That account is already on ${other.name}. One account on two clients counts its spend twice.`
  return ''
}

const REFUSED = /refused|permission|not found under the manager|PERMISSION_DENIED|USER_PERMISSION|does not have permission/i
const NOT_ENABLED = /CUSTOMER_NOT_ENABLED|not enabled|cancel/i
const NOT_FOUND = /CUSTOMER_NOT_FOUND|not found/i

/**
 * Is this error Google keeping us out (the client's side to fix), rather than
 * something that broke after Google let us in (ours to fix)? Only the first
 * kind means "no access". A failed save of the numbers, like the weekly
 * roll-up being refused by our own table, still means we are connected.
 */
export function isAccessError(error) {
  const e = String(error || '')
  if (!e) return false
  // Our own database answering, not Google.
  if (/^(weekly_kpis|google_\w+_daily):/.test(e)) return false
  return REFUSED.test(e) || NOT_ENABLED.test(e) || NOT_FOUND.test(e)
}

/** Google's refusal, in the words someone can act on. */
export function explainSyncError(error) {
  const e = String(error || '')
  if (!e) return ''
  if (!isAccessError(e)) {
    return `Google let us in, but saving the numbers hit a problem on our side: ${e.slice(0, 200)}`
  }
  if (REFUSED.test(e)) {
    return `Google has not let us in yet. The client still needs to allow our domain on their Security tab and add ${AGENCY_EMAIL} as a user (send them the step-by-step), and we need to accept the invite. It connects on the next sync after that.`
  }
  if (NOT_ENABLED.test(e)) {
    return 'That Google Ads account is cancelled or not set up yet, so there is nothing to read.'
  }
  if (NOT_FOUND.test(e)) {
    return 'Google has no account with that ID. Check the number with the client.'
  }
  return `The sync hit a problem: ${e.slice(0, 220)}`
}
