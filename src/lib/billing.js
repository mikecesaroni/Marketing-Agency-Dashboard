
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
 * calcMRR and the Stripe reconciliation both read the monthly fee and the
 * archived flag, and both degrade silently when handed a row that lacks them —
 * a missing archived flag counts churned clients in MRR, and the numbers stay
 * plausible while being wrong. Selecting this list rather than hand-writing a
 * projection is what stops that happening again.
 */
export const CLIENT_BILLING_COLUMNS =
  'id, name, status, setup_fee, monthly_fee, stripe_customer_id, ghl_plan, archived'

// Dev-only backstop for any caller that builds its own projection anyway.
// Silent wrong money is worse than a noisy console.
function warnIfPartial(clients) {
  if (!import.meta.env?.DEV) return
  const row = (clients || [])[0]
  if (!row) return
  const missing = ['monthly_fee', 'archived'].filter((k) => !(k in row))
  if (missing.length > 0) {
    console.warn(
      `calcMRR was given client rows without ${missing.join(', ')} — ` +
        'the figures will be wrong. Select CLIENT_BILLING_COLUMNS.'
    )
  }
}

// Clients start paying before onboarding finishes, so MRR can't wait on the
// status reaching 'active'. It counts anyone who has a monthly schedule and
// hasn't churned — the schedule existing is what proves they're billing, since
// monthly_fee carries a column default and is set on every client row.
//
// monthly_fee is the whole monthly total, whatever the package includes. There
// was briefly a GHL slice reported alongside this, carved out of the fee at a
// notional $399. It was removed because the premise was false: GHL comes inside
// certain packages, and a package price is just the package price. Splitting it
// invented a number nobody was billed. Whether a client is on GHL is a delivery
// fact and lives on ghl_plan.
export function calcMRR(clients, payments) {
  warnIfPartial(clients)
  const scheduled = new Set(
    payments.filter((p) => p.payment_type === 'monthly').map((p) => p.client_id)
  )
  const billing = clients.filter(
    (c) => scheduled.has(c.id) && !c.archived && !c.is_internal
  )
  return {
    mrr: billing.reduce((sum, c) => sum + (Number(c.monthly_fee) || 0), 0),
    count: billing.length,
    // The clients behind the figure, so it can be opened rather than trusted.
    // Biggest first, which is the order you want when asking who this is.
    clients: [...billing].sort(
      (a, b) =>
        (Number(b.monthly_fee) || 0) - (Number(a.monthly_fee) || 0) ||
        String(a.name).localeCompare(String(b.name))
    ),
  }
}

/**
 * Everyone the MRR figure leaves out, and why.
 *
 * "15 clients pay us monthly" and "MRR says 12" is a question the card cannot
 * answer on its own, and the answer is never interesting enough to go digging
 * for: two of ours are internal, one churned, one never had a schedule. So the
 * exclusions are listed alongside the total rather than left to be rediscovered
 * every time somebody counts.
 */
export function mrrExclusions(clients, payments) {
  const scheduled = new Set(
    payments.filter((p) => p.payment_type === 'monthly').map((p) => p.client_id)
  )

  const reasonFor = (c) => {
    // Ordered by which fact settles it: an archived client is out whatever
    // else is true of them.
    if (c.archived) return 'archived'
    if (c.is_internal) return 'one of ours, not a client'
    if (!scheduled.has(c.id)) return 'no monthly schedule yet'
    return null
  }

  return clients
    .map((c) => ({ ...c, reason: reasonFor(c) }))
    .filter((c) => c.reason)
    .sort((a, b) => a.reason.localeCompare(b.reason) || String(a.name).localeCompare(String(b.name)))
}


const RECURRING = new Set(['monthly'])

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
