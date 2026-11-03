/**
 * Where a client's onboarding form stands, for the Clients list ("in the
 * Clients tab, under Channels, also add whether they have submitted the
 * onboarding form yet or not").
 *
 * Three states, the same rule the launch pipeline uses for its "form filled
 * in" step (nextSteps.js): IN when the link row carries a submitted stamp,
 * or enough answers were typed in on the call; SENT when a link was made
 * and nothing has come back; NONE when no link exists yet.
 *
 * Pure: scripts/check-form-status.mjs runs it in Node.
 */

/** Whole days from an ISO date (or date-time) to today's 'YYYY-MM-DD'; null when either is missing. */
function daysSince(when, today) {
  if (!when || !today) return null
  const a = new Date(String(when).slice(0, 10) + 'T00:00:00Z')
  const b = new Date(String(today).slice(0, 10) + 'T00:00:00Z')
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.max(0, Math.round((b - a) / 86400000))
}

const day = (when) => String(when || '').slice(0, 10)

/**
 * submittedAt: onboarding_links.intake_submitted_at (or '')
 * sentAt:      onboarding_links.created_at, the day the link was made (or '')
 * filled:      true when the intake has enough answers without a stamp
 * today:       'YYYY-MM-DD'
 */
export function formStatus({ submittedAt = '', sentAt = '', filled = false, today = '' } = {}) {
  if (submittedAt) return { state: 'in', label: '● Form in', detail: `Onboarding form submitted ${day(submittedAt)}`, days: daysSince(submittedAt, today) }
  if (filled) return { state: 'in', label: '● Form in', detail: 'Onboarding form filled in on the call', days: null }
  if (sentAt) {
    const n = daysSince(sentAt, today)
    return { state: 'sent', label: '◐ Form sent', detail: `Onboarding form sent ${day(sentAt)}${n === null ? '' : `, ${n} day${n === 1 ? '' : 's'} ago`}, not submitted yet`, days: n }
  }
  return { state: 'none', label: '○ No form yet', detail: 'Onboarding form not sent yet: copy the link from their page (Send to client)', days: null }
}

/** The badge tone per state, for the Clients list. */
export const FORM_TONE = { in: 'success', sent: 'info', none: 'dim' }
