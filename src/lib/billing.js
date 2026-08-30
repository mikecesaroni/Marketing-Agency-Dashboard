// The .js extension is deliberate and the only place in src/ that carries one.
// Vite resolves either form, but node does not, and being importable by a plain
// node script is the entire reason this module is separate from the data layer.
import { ghlBilling, ghlMonthlyPortion } from './ghlSetupFields.js'

// The money calculations, kept clear of the data layer.
//
// These used to live in queries.js, which imports the Supabase client at module
// load and so cannot be imported by a plain node script. Two self-checks were
// reduced to slicing this code out of the file by string offsets, and that
// broke the moment a helper was added above the marker they searched for.
// Pure functions in their own module is what makes them straightforwardly
// testable.

/**
 * The client columns every money calculation here needs.
 *
 * calcMRR and the Stripe reconciliation both read the GHL plan fields and the
 * archived flag, and both degrade silently when handed a row that lacks them:
 * a missing ghl_plan makes totalMonthly return the bare retainer, so a client
 * on $998 + $399 reads as $998 and gets reported as a Stripe mismatch that
 * isn't real. Selecting this list rather than hand-writing a projection is
 * what stops that happening again.
 */
export const CLIENT_BILLING_COLUMNS =
  'id, name, status, monthly_fee, stripe_customer_id, ghl_plan, ghl_billing, ghl_monthly_fee, archived'

// Dev-only backstop for any caller that builds its own projection anyway.
// Silent wrong money is worse than a noisy console.
function warnIfPartial(clients) {
  if (!import.meta.env?.DEV) return
  const row = (clients || [])[0]
  if (!row) return
  const missing = ['ghl_plan', 'ghl_billing', 'ghl_monthly_fee', 'archived'].filter(
    (k) => !(k in row)
  )
  if (missing.length > 0) {
    console.warn(
      `calcMRR was given client rows without ${missing.join(', ')} — ` +
        'GHL revenue and archived clients will be wrong. Select CLIENT_BILLING_COLUMNS.'
    )
  }
}

// Clients start paying before onboarding finishes, so MRR can't wait on the
// status reaching 'active'. It counts anyone who has a monthly schedule and
// hasn't churned — the schedule existing is what proves they're billing, since
// monthly_fee carries a column default and is set on every client row.
//
// GHL is counted through totalMonthly, which is where the two arrangements
// differ and the one place that difference is allowed to live:
//
//   separate  $998 retainer + $399 GHL, two invoices, so $1,397 of MRR.
//   bundled   one $1,500 invoice that already contains GHL. Adding the GHL
//             share on top would invent $399 a month that nobody is billed.
//
// `ghl` is the slice of that MRR attributable to GHL either way, so the
// revenue can be tracked whichever way it happens to be invoiced. `count`
// stays a headcount of billing clients — a client on both plans is one client.
export function calcMRR(clients, payments) {
  warnIfPartial(clients)
  const scheduled = new Set(
    payments.filter((p) => p.payment_type === 'monthly').map((p) => p.client_id)
  )
  const ghlScheduled = new Set(
    payments.filter((p) => p.payment_type === 'ghl').map((p) => p.client_id)
  )
  const live = (c) => !c.archived && !c.is_internal
  const billing = clients.filter((c) => (scheduled.has(c.id) || ghlScheduled.has(c.id)) && live(c))

  let mrr = 0
  let ghl = 0
  let ghlCount = 0
  for (const c of billing) {
    const separate = ghlBilling(c)?.key === 'separate'
    // A separate client's GHL money rides on its own schedule, so it counts
    // only once that schedule exists. A bundled client's is already inside
    // the retainer they are scheduled for.
    const retainer = scheduled.has(c.id) ? Number(c.monthly_fee) || 0 : 0
    const ghlPart = separate
      ? ghlScheduled.has(c.id)
        ? ghlMonthlyPortion(c)
        : 0
      : scheduled.has(c.id)
        ? ghlMonthlyPortion(c)
        : 0
    // Only a separate client's GHL money is additional revenue. A bundled
    // client's retainer already contains it, so it is counted in the ghl
    // slice but never added to the total again.
    mrr += retainer + (separate ? ghlPart : 0)
    ghl += ghlPart
    if (ghlPart > 0) ghlCount++
  }

  return { mrr, count: billing.length, ghl, ghlCount }
}
