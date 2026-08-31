/**
 * Whether a client's ads are actually running.
 *
 * This exists because of Summit Water Pros. Their payment failed, Meta disabled
 * the ad account, the ads stopped — and nothing in the CRM said so. They were
 * still flagged meta_ads_active, the dashboard still counted them as live, and
 * the only evidence was an absence: spend that stopped arriving. No view was
 * looking for an absence, so the client paid for a month of ads that never ran.
 *
 * Two independent signals, because each catches what the other misses:
 *
 *   Meta's account status   says the account itself is blocked, and why. Exact,
 *                           and available the moment it happens.
 *   Spend that stopped      catches everything the account status never
 *                           mentions — every campaign paused, budget spent,
 *                           creative rejected, ad set out of schedule.
 */

// Meta's account_status. 1 is the only value that means ads can run; the rest
// are here so the alert can say which kind of stuck it is rather than printing
// a bare number at somebody.
const ACCOUNT_STATUS = {
  1: { label: 'active', ok: true },
  2: { label: 'disabled by Meta', ok: false },
  3: { label: 'unsettled — unpaid balance', ok: false },
  7: { label: 'pending risk review', ok: false },
  8: { label: 'pending settlement', ok: false },
  9: { label: 'in grace period', ok: false },
  100: { label: 'pending closure', ok: false },
  101: { label: 'closed', ok: false },
}

// Meta's disable_reason. 0 means "not disabled", so it is not listed.
//
// Checking the real accounts showed 0 even on one that was unsettled for an
// unpaid balance, so this is extra detail when present rather than the thing
// the alert relies on. The status carries the explanation.
const DISABLE_REASON = {
  1: 'ads policy violation',
  2: 'IP review',
  3: 'payment risk',
  4: 'account shut down',
  5: 'AFC review',
  6: 'business integrity review',
  7: 'permanently closed',
  8: 'unused reseller account',
  9: 'unused account',
}

// Cents matter here: the whole point of the Summit case is that $3.04 stopped
// a campaign, and rounding it to "$3" makes it look like a placeholder.
function formatMoney(n) {
  return `$${Number(n).toFixed(2)}`
}

export function accountStatusLabel(status) {
  if (status === null || status === undefined) return null
  return ACCOUNT_STATUS[status]?.label || `status ${status}`
}

export function accountStatusOk(status) {
  // An unknown status is treated as fine. Meta adds values, and inventing an
  // alarm for one nobody has seen would cry wolf on every client at once.
  if (status === null || status === undefined) return true
  const known = ACCOUNT_STATUS[status]
  return known ? known.ok : true
}

// How many days of no spend before a live client counts as gone quiet.
//
// Two, not one: the sync runs each morning for the previous day, so a client
// who spent yesterday can legitimately show nothing for today, and alerting on
// that would fire every morning for everybody.
export const QUIET_DAYS = 2

const daysBetween = (from, to) =>
  Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000)

/**
 * Clients whose ads should be running and are not.
 *
 * `delivery` is the client_ad_delivery view keyed by client id: last_spend_date
 * and the recent totals.
 *
 * Only clients marked meta_ads_active are considered. Somebody not launched yet
 * is a different job, already on the dashboard as "Meta not live yet", and
 * mixing the two would bury a real outage among clients who were never on.
 */
export function adDeliveryAlerts(clients, delivery, todayDate) {
  const out = []

  for (const client of clients || []) {
    if (client.archived || client.is_internal) continue
    if (!client.meta_ads_active) continue

    const seen = delivery?.[client.id]
    const lastSpend = seen?.last_spend_date || null

    // Meta's word first: it is exact, and it explains the outage rather than
    // just reporting it.
    if (!accountStatusOk(client.meta_account_status)) {
      const reason = DISABLE_REASON[client.meta_disable_reason]
      const owed = Number(client.meta_account_balance)
      out.push({
        client,
        kind: 'account',
        headline: `Ad account ${accountStatusLabel(client.meta_account_status)}`,
        // The outstanding balance first when there is one, because it is the
        // actual instruction. Summit's ads stopped over $3.04.
        detail: [
          owed > 0 ? `${formatMoney(owed)} outstanding on the account.` : null,
          reason ? `Meta gives the reason as ${reason}.` : null,
          'Ads are not delivering until this clears.',
        ]
          .filter(Boolean)
          .join(' '),
        balance: Number.isFinite(owed) ? owed : null,
        lastSpend,
        quietDays: lastSpend ? daysBetween(lastSpend, todayDate) : null,
        severity: 'critical',
      })
      continue
    }

    // A client who has never spent is not an outage — they may have launched
    // today, or the sync may not have caught up. "Meta not live yet" and the
    // launch checklist are where that belongs.
    if (!lastSpend) continue

    const quiet = daysBetween(lastSpend, todayDate)
    if (quiet >= QUIET_DAYS) {
      out.push({
        client,
        kind: 'quiet',
        headline: `No ad spend for ${quiet} days`,
        detail:
          'The account looks fine to Meta, so this is something inside it — paused campaigns, a spent budget, or a rejected ad.',
        lastSpend,
        quietDays: quiet,
        balance: null,
        severity: quiet >= 4 ? 'critical' : 'warning',
      })
    }
  }

  // Longest outage first. Every day of this is a day the client paid for
  // nothing, so time down is the right way to rank it.
  return out.sort(
    (a, b) =>
      (b.quietDays ?? 999) - (a.quietDays ?? 999) ||
      a.client.name.localeCompare(b.client.name)
  )
}
