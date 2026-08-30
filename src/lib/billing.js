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
  'id, name, status, setup_fee, monthly_fee, stripe_customer_id, ' +
  'ghl_plan, ghl_billing, ghl_monthly_fee, archived'

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

const RECURRING = new Set(['monthly', 'ghl'])

const isPaid = (p) => p.status === 'paid'

/**
 * The two things that hold up a new client's money: the setup fee still
 * outstanding, and the subscription never actually starting.
 *
 * Both are invisible in the payments ledger, which is why they are worth
 * pulling out. An unpaid setup fee is one unremarkable pending row among a
 * client's twelve scheduled months, and a client who never subscribed shows
 * up as nothing at all -- no overdue row, no missing payment, just an absence
 * that no view was asking about.
 *
 * Archived and internal clients are left out: neither is someone to chase.
 */
export function onboardingGaps(clients, payments, todayDate) {
  const byClient = {}
  for (const p of payments || []) {
    ;(byClient[p.client_id] ||= []).push(p)
  }

  const setupUnpaid = []
  const notSubscribed = []

  for (const client of clients || []) {
    if (client.archived || client.is_internal) continue
    const rows = byClient[client.id] || []

    const setupRows = rows.filter((p) => p.payment_type === 'setup')
    const owing = setupRows.filter((p) => !isPaid(p))
    const fee = Number(client.setup_fee) || 0

    if (owing.length > 0) {
      const due = owing.map((p) => p.due_date).filter(Boolean).sort()[0] || ''
      setupUnpaid.push({
        client,
        amount: owing.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
        dueDate: due,
        // Compared against a passed-in date so this stays a pure function and
        // the tests do not drift as the calendar moves.
        overdue: Boolean(due && todayDate && due < todayDate),
        reason: 'unpaid',
      })
    } else if (setupRows.length === 0 && fee > 0) {
      // A fee on the client that no schedule ever picked up. Nothing will ever
      // mark it overdue, so without this it is simply never collected.
      setupUnpaid.push({
        client,
        amount: fee,
        dueDate: '',
        overdue: false,
        reason: 'unscheduled',
      })
    }

    const recurring = rows.filter((p) => RECURRING.has(p.payment_type))
    if (!recurring.some(isPaid)) {
      notSubscribed.push({
        client,
        // A schedule with nothing collected means the plan is set up and the
        // client has not started paying. No schedule at all means billing was
        // never set up for them, which is a different job.
        scheduled: recurring.length > 0,
        stripeLinked: Boolean(client.stripe_customer_id),
      })
    }
  }

  // Overdue first, then the largest amounts: the order you would chase them in.
  setupUnpaid.sort(
    (a, b) => Number(b.overdue) - Number(a.overdue) || b.amount - a.amount
  )
  // Clients with a schedule ready are the ones a payment link would fix today.
  notSubscribed.sort(
    (a, b) => Number(b.scheduled) - Number(a.scheduled) || a.client.name.localeCompare(b.client.name)
  )

  return { setupUnpaid, notSubscribed }
}
