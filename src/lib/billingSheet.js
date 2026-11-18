// The client billing sheet: one row per client, the money taken from Stripe.
//
// 2026-11-18: "Can we get an excel sheet built with client name, business
// name, date first paid, date paused, active status, monthly subscription,
// set up fee amount paid, match everything with Stripe because that is real
// data. Keep this updated as clients are added, payments come in, and clients
// are paused" and "also add in what tier they are on".
//
// Built live from the CRM's tables every time it is opened or downloaded, so
// it is never out of date: a new client is a new row, a Stripe payment (the
// webhook writes it into payments within seconds) moves the money columns,
// and a pause or a cancellation moves the status.
//
// THE MONEY IS STRIPE'S. Only payments that came from Stripe count (a Stripe
// event, invoice or charge id on the row): the CRM also schedules the months
// it expects (status pending), and a few setups were typed in by hand; those
// are not money Stripe saw, so they never reach a money column. A hand-typed
// setup is named in Notes instead. The CRM's own fee sits beside Stripe's
// charge, and the notes say where the two disagree.
//
// Pure: scripts/check-billing-sheet.mjs pins it.

import { TIER_BY_NUMBER, tierOf } from './clientTiers.js'

const day = (v) => (v ? String(v).slice(0, 10) : '')
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100
const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

/** A payment Stripe made: it carries a Stripe event, invoice or charge id. */
export function fromStripe(p) {
  return Boolean(p && (p.stripe_event_id || p.stripe_invoice_id || p.stripe_charge_id))
}

/** "Meta and Google ($2,500)" style tier name, or "No tier yet". */
export function tierName(client) {
  const { tier } = tierOf(client)
  const t = TIER_BY_NUMBER[tier]
  if (!t) return 'No tier yet'
  return `${t.name} (${money(t.price)}/mo)`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** '2026-10-02' as 'Oct 2, 2026', for the words in Status and Notes. */
export const niceDay = (iso) => {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-').map(Number)
  return y && m && d ? `${MONTHS[m - 1]} ${d}, ${y}` : ''
}
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
/** The same day next month, the way Stripe bills: Jan 31 -> Feb 28. */
export function nextMonth(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10)
}

/**
 * The day Stripe ended each customer's subscription, from
 * customer.subscription.deleted events: Map customer id -> 'YYYY-MM-DD'
 * (the latest, when a customer had more than one).
 *
 * events  [{ type, payload }] (payload = the Stripe event)
 */
export function cancellationsByCustomer(events = []) {
  const out = new Map()
  for (const e of events || []) {
    if (e?.type !== 'customer.subscription.deleted') continue
    const sub = e.payload?.data?.object || {}
    const cust = String(sub.customer || '')
    const at = Number(sub.ended_at || sub.canceled_at || e.payload?.created || 0)
    if (!cust || !at) continue
    const d = new Date(at * 1000).toISOString().slice(0, 10)
    if (!out.has(cust) || out.get(cust) < d) out.set(cust, d)
  }
  return out
}

// How long after its next charge was due a subscription is still taken to be
// running, with no failed invoice to say Stripe is still trying.
const LAPSE_GRACE_DAYS = 3
// Charges this close together on one customer are one month's bill.
const CYCLE_DAYS = 20

/**
 * A client's Stripe subscriptions, one per Stripe customer they pay from,
 * and which of them are still charging.
 *
 * A client can pay from several Stripe customers: two subscriptions side by
 * side, charged the same day each month, or an old one replaced by a new one
 * at a new price. Both shapes are in the live data, and adding every customer
 * up would more than double what the second kind is billed, so each customer
 * is its own subscription, and one has STOPPED when:
 *
 *   cancelled  Stripe sent the cancellation, on or after its last charge
 *   replaced   the client began paying from a newer customer after this
 *              one's last charge, and this one's next charge date has passed
 *   lapsed     its next charge is more than three days late with no failed
 *              invoice (Stripe is not even trying)
 *
 * monthly   the client's paid Stripe monthly charges
 * failing   their Stripe invoices that failed and are still unpaid
 * cancels   cancellationsByCustomer()
 *
 * Returns [{ customer, first, last, amount, due, cancelledOn, stopped, why }]
 * oldest first. amount is the latest month's bill on that customer.
 */
export function stripeSubscriptions(monthly = [], failing = [], cancels = new Map(), today = new Date().toISOString().slice(0, 10)) {
  const by = new Map()
  for (const p of [...monthly].sort((a, b) => day(a.paid_date).localeCompare(day(b.paid_date)))) {
    const key = String(p.stripe_customer_id || '')
    if (!by.has(key)) by.set(key, [])
    by.get(key).push(p)
  }
  const subs = [...by].map(([customer, list]) => {
    const first = day(list[0].paid_date)
    const last = day(list[list.length - 1].paid_date)
    const cycle = list.filter((p) => daysBetween(day(p.paid_date), last) < CYCLE_DAYS)
    // The subscription's price is what its invoice charged. A row with no
    // invoice beside an invoiced row of the same amount on the same day is
    // either the checkout written down a second time (src/lib/reconcile.js)
    // or a second, one-off payment a person has confirmed is real (one client
    // paid the monthly amount twice on their first day). Either way it is not
    // a second subscription: it stays in the totals and out of the monthly
    // price.
    const billed = cycle.filter((p) => p.stripe_invoice_id || !cycle.some((o) => o !== p && o.stripe_invoice_id && Number(o.amount) === Number(p.amount) && day(o.paid_date) === day(p.paid_date)))
    const amount = r2(billed.reduce((s, p) => s + Number(p.amount || 0), 0))
    const due = nextMonth(last)
    const ended = cancels.get(customer) || ''
    const cancelledOn = ended && ended >= last ? ended : ''
    const retrying = failing.some((f) => String(f.stripe_customer_id || '') === customer && day(f.due_date) >= last)
    return { customer, first, last, amount, due, cancelledOn, retrying }
  })
  for (const sub of subs) {
    const replaced = today > sub.due && subs.some((o) => o !== sub && o.first > sub.last)
    const lapsed = !sub.retrying && today > addDays(sub.due, LAPSE_GRACE_DAYS)
    sub.why = sub.cancelledOn ? 'cancelled' : replaced ? 'replaced' : lapsed ? 'lapsed' : ''
    sub.stopped = Boolean(sub.why)
    delete sub.retrying
  }
  return subs.sort((a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first))
}

/** Same-day, same-amount Stripe payments nobody has confirmed: possible doubles. */
function possibleDoubles(paid) {
  const groups = new Map()
  for (const p of paid) {
    const key = `${p.payment_type}|${Number(p.amount) || 0}|${day(p.paid_date)}|${p.stripe_customer_id || ''}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(p)
  }
  return [...groups.values()].filter((g) => g.length > 1 && !g.some((p) => p.duplicate_reviewed_at) && g.some((p) => !p.stripe_invoice_id) && g.some((p) => p.stripe_invoice_id))
}

/**
 * The rows.
 *
 * clients   id, name, archived, is_internal, paused_at, tier, monthly_fee,
 *           setup_fee, stripe_customer_id, date_added
 * payments  client_id, payment_type, status, amount, paid_date, due_date,
 *           stripe_event_id, stripe_invoice_id, stripe_charge_id,
 *           stripe_customer_id, failure_count, duplicate_reviewed_at
 * intakes   client_id, owner_name
 * ghl       client_id, authorized_rep_name
 * events    stripe_events rows of type customer.subscription.deleted
 * today     'YYYY-MM-DD'
 *
 * Our own businesses (is_internal) pay nobody and are left out.
 */
export function buildBillingSheet({ clients = [], payments = [], intakes = [], ghl = [], events = [], today = new Date().toISOString().slice(0, 10) } = {}) {
  const intakeBy = new Map((intakes || []).map((i) => [i.client_id, i]))
  const ghlBy = new Map((ghl || []).map((g) => [g.client_id, g]))
  const payBy = new Map()
  for (const p of payments || []) {
    if (!p?.client_id) continue
    if (!payBy.has(p.client_id)) payBy.set(p.client_id, [])
    payBy.get(p.client_id).push(p)
  }
  const cancels = cancellationsByCustomer(events)

  const rows = []
  for (const c of clients || []) {
    if (!c?.id || c.is_internal) continue
    const all = payBy.get(c.id) || []
    const stripePaid = all.filter((p) => fromStripe(p) && String(p.status) === 'paid' && p.paid_date).sort((a, b) => day(a.paid_date).localeCompare(day(b.paid_date)))
    const monthly = stripePaid.filter((p) => p.payment_type === 'monthly')
    const setups = stripePaid.filter((p) => p.payment_type === 'setup')
    const failing = all.filter((p) => fromStripe(p) && String(p.status) === 'overdue')
    const handSetups = all.filter((p) => !fromStripe(p) && p.payment_type === 'setup' && String(p.status) === 'paid')

    // The monthly subscription: the subscriptions still charging, added up.
    // When none is (paused, cancelled), what the last one was charging, so
    // the row still says what the client was paying.
    const subs = stripeSubscriptions(monthly, failing, cancels, today)
    const live = subs.filter((x) => !x.stopped)
    const newest = subs[subs.length - 1] || null
    const lastOnes = newest ? subs.filter((x) => x.why !== 'replaced' && daysBetween(x.last, newest.last) < CYCLE_DAYS) : []
    const monthlyNow = r2((live.length ? live : lastOnes).reduce((s, x) => s + x.amount, 0))
    const lastMonthly = newest ? newest.last : ''
    const nextDue = live.length ? live.map((x) => x.due).sort()[0] : ''

    const firstPaid = stripePaid.length ? day(stripePaid[0].paid_date) : ''
    const last = stripePaid.length ? stripePaid[stripePaid.length - 1] : null
    const setupPaid = r2(setups.reduce((s, p) => s + Number(p.amount || 0), 0))
    const totalPaid = r2(stripePaid.reduce((s, p) => s + Number(p.amount || 0), 0))
    const crmFee = Number(c.monthly_fee) || 0
    const pausedOn = day(c.paused_at)
    const cancelledOn = !live.length && newest?.cancelledOn ? newest.cancelledOn : ''

    const status = c.archived ? 'Archived' : c.paused_at ? 'Paused' : 'Active'
    const stripeStatus = !stripePaid.length
      ? failing.length
        ? 'Payment failing, nothing paid yet'
        : 'No Stripe payment yet'
      : !monthly.length
        ? 'Setup paid, no monthly charge yet'
        : cancelledOn
          ? `Subscription cancelled ${niceDay(cancelledOn)}`
          : !live.length
            ? `No charge since ${niceDay(lastMonthly)}`
            : failing.some((f) => day(f.due_date) >= lastMonthly)
              ? 'Charging monthly, latest payment failing'
              : 'Charging monthly'

    // Where the CRM and Stripe disagree, in plain words.
    const notes = []
    if (status === 'Active' && stripePaid.length && !monthly.length) notes.push('No monthly charge from Stripe yet')
    if (status === 'Active' && monthly.length && !live.length) notes.push(cancelledOn ? 'Active in the CRM but the Stripe subscription is cancelled' : `Active in the CRM but Stripe has not charged since ${niceDay(lastMonthly)}`)
    if (status !== 'Active' && lastMonthly && pausedOn && lastMonthly > pausedOn) notes.push(`Stripe charged on ${niceDay(lastMonthly)}, after the pause on ${niceDay(pausedOn)}`)
    if (status !== 'Active' && live.length) notes.push(`${status} in the CRM but Stripe shows no cancellation: next charge due about ${niceDay(nextDue)}`)
    if (status === 'Active' && live.length && crmFee && Math.abs(monthlyNow - crmFee) >= 1) notes.push(`CRM fee ${money(crmFee)}/mo, Stripe charges ${money(monthlyNow)}`)
    if (status === 'Active' && !stripePaid.length) notes.push('Not matched to any Stripe payment')
    if (handSetups.length) notes.push(`Setup ${money(handSetups.reduce((s, p) => s + Number(p.amount || 0), 0))} recorded by hand, not in Stripe`)
    if (failing.length) notes.push(`${failing.length} Stripe charge${failing.length === 1 ? '' : 's'} failed and still unpaid (${money(failing.reduce((s, p) => s + Number(p.amount || 0), 0))})`)
    for (const g of possibleDoubles(stripePaid)) notes.push(`${g.length} ${g[0].payment_type} payments of ${money(g[0].amount)} on ${niceDay(g[0].paid_date)}: possibly one payment recorded twice, check on the Payments page`)

    const intake = intakeBy.get(c.id) || {}
    const account = ghlBy.get(c.id) || {}
    rows.push({
      id: c.id,
      // "Client name, business name": the person, then the company. The
      // CRM's client name IS the business; the person is the owner on the
      // onboarding form, else the authorised rep on the account form.
      client: String(intake.owner_name || account.authorized_rep_name || '').trim(),
      business: String(c.name || '').trim(),
      tier: tierName(c),
      status,
      firstPaid,
      pausedOn,
      monthly: monthlyNow || null,
      crmFee: crmFee || null,
      setupPaid: setupPaid || null,
      lastPaid: last ? day(last.paid_date) : '',
      lastAmount: last ? r2(last.amount) : null,
      totalPaid: totalPaid || null,
      stripeStatus,
      notes: notes.join('. '),
    })
  }
  const order = { Active: 0, Paused: 1, Archived: 2 }
  rows.sort((a, b) => order[a.status] - order[b.status] || a.business.localeCompare(b.business))
  return rows
}

/** The totals for the summary sheet, from the rows. */
export function billingTotals(rows = []) {
  const active = rows.filter((r) => r.status === 'Active')
  return {
    active: active.length,
    paused: rows.filter((r) => r.status === 'Paused').length,
    archived: rows.filter((r) => r.status === 'Archived').length,
    // Monthly revenue Stripe is charging now: active clients it still charges.
    stripeMonthly: r2(active.filter((r) => String(r.stripeStatus).startsWith('Charging monthly')).reduce((s, r) => s + Number(r.monthly || 0), 0)),
    setupCollected: r2(rows.reduce((s, r) => s + Number(r.setupPaid || 0), 0)),
    totalCollected: r2(rows.reduce((s, r) => s + Number(r.totalPaid || 0), 0)),
    flagged: rows.filter((r) => r.notes).length,
  }
}

/** The sheet's columns, in order: header, field, kind and width. */
export const BILLING_COLUMNS = [
  { header: 'Client name', key: 'client', kind: 'text', width: 30 },
  { header: 'Business name', key: 'business', kind: 'text', width: 34 },
  { header: 'Tier', key: 'tier', kind: 'text', width: 40 },
  { header: 'Status', key: 'status', kind: 'text', width: 11 },
  { header: 'Date first paid (Stripe)', key: 'firstPaid', kind: 'date', width: 14 },
  { header: 'Date paused', key: 'pausedOn', kind: 'date', width: 13 },
  { header: 'Monthly subscription (Stripe)', key: 'monthly', kind: 'money', width: 16 },
  { header: 'Setup fee paid (Stripe)', key: 'setupPaid', kind: 'money', width: 14 },
  { header: 'Monthly fee in CRM', key: 'crmFee', kind: 'money', width: 13 },
  { header: 'Last payment', key: 'lastPaid', kind: 'date', width: 13 },
  { header: 'Last payment amount', key: 'lastAmount', kind: 'money', width: 13 },
  { header: 'Total paid (Stripe)', key: 'totalPaid', kind: 'money', width: 14 },
  { header: 'Stripe status', key: 'stripeStatus', kind: 'text', width: 30 },
  { header: 'Notes', key: 'notes', kind: 'text', width: 60, wrap: true },
]

/**
 * The workbook for makeXlsx (src/lib/xlsxWriter.js): the clients, one row
 * each, and a summary sheet with the totals and what each column means.
 */
export function billingWorkbook(rows = [], { today = new Date().toISOString().slice(0, 10) } = {}) {
  const t = billingTotals(rows)
  const b = (v) => ({ v, bold: true })
  return [
    {
      name: 'Clients',
      columns: BILLING_COLUMNS.map(({ header, width, kind, wrap }) => ({ header, width, kind, wrap })),
      rows: rows.map((r) => BILLING_COLUMNS.map((c) => r[c.key])),
    },
    {
      name: 'Summary',
      filter: false,
      columns: [
        { header: 'Client billing sheet', width: 40, kind: 'text' },
        { header: `As of ${today}`, width: 70, kind: 'text', wrap: true },
      ],
      rows: [
        [b('Active clients'), { v: t.active, kind: 'number' }],
        [b('Paused clients'), { v: t.paused, kind: 'number' }],
        [b('Archived clients'), { v: t.archived, kind: 'number' }],
        [b('Monthly subscriptions, active clients (Stripe)'), { v: t.stripeMonthly, kind: 'money', bold: true }],
        [b('Setup fees collected (Stripe)'), { v: t.setupCollected, kind: 'money' }],
        [b('Total collected (Stripe)'), { v: t.totalCollected, kind: 'money' }],
        [b('Rows with a note to check'), { v: t.flagged, kind: 'number' }],
        ['', ''],
        [b('Where the numbers come from'), 'Every dollar and payment date is a payment Stripe made, as recorded by the CRM from Stripe. Months the CRM only expects, and anything typed in by hand, are not counted.'],
        [b('Date first paid'), 'The first Stripe payment from the client, setup or monthly.'],
        [b('Monthly subscription'), 'What Stripe charges the client each month now: every subscription still charging, added up. For a client Stripe no longer charges, what the last subscription charged. Stripe status says which.'],
        [b('Setup fee paid'), 'Every setup payment Stripe took from the client, added up.'],
        [b('Monthly fee in CRM'), 'The fee typed on the client in the CRM, for comparison. Notes say when it differs from Stripe.'],
        [b('Status'), 'From the CRM: Active, Paused (with the date) or Archived.'],
        [b('Kept up to date'), 'The CRM builds this sheet live on the Payments page. Download it there for the current version.'],
      ],
    },
  ]
}
