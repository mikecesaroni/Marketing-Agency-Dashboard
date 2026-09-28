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

/** Google's refusal, in the words someone can act on. */
export function explainSyncError(error) {
  const e = String(error || '')
  if (!e) return ''
  if (/refused|permission|not found under the manager|PERMISSION_DENIED|USER_PERMISSION|does not have permission/i.test(e)) {
    return `Google has not let us in yet. The client still needs to add ${AGENCY_EMAIL} as a user (send them the step-by-step), and we need to accept the invite. It connects on the next sync after that.`
  }
  if (/CUSTOMER_NOT_ENABLED|not enabled|cancel/i.test(e)) {
    return 'That Google Ads account is cancelled or not set up yet, so there is nothing to read.'
  }
  if (/CUSTOMER_NOT_FOUND|not found/i.test(e)) {
    return 'Google has no account with that ID. Check the number with the client.'
  }
  return `The sync hit a problem: ${e.slice(0, 220)}`
}
