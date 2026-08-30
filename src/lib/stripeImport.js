import { supabase } from './supabaseClient'

/**
 * Minimal CSV reader that respects quoting.
 *
 * Stripe descriptions contain commas ("Subscription creation, prorated") and
 * sometimes newlines, so splitting on commas corrupts every row after the first
 * quoted one. Written out rather than pulled in as a dependency because this is
 * the whole of what is needed.
 */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  // Exports opened in Excel and re-saved carry a UTF-8 BOM, which would make
  // the first header "\ufeffid" and stop it matching anything.
  const src = String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
      continue
    }
    if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

// Stripe has renamed these columns more than once, and the payments, invoices
// and subscriptions exports each use slightly different headings, so every
// field is matched against a list rather than one exact name.
const FIELDS = {
  id: ['id', 'charge id', 'payment id', 'invoice id'],
  created: ['created (utc)', 'created', 'date (utc)', 'paid at (utc)', 'finalized at (utc)'],
  amount: ['converted amount', 'amount', 'amount paid', 'total'],
  currency: ['converted currency', 'currency'],
  status: ['status', 'paid'],
  customerId: ['customer id', 'customer'],
  email: ['customer email', 'email', 'billing email', 'receipt email'],
  description: ['description', 'product name', 'lines', 'subscription plan'],
  refunded: ['amount refunded', 'refunded'],
}

// Deliberately a deny-list rather than an allow-list.
//
// The first version allowed paid/succeeded/true and dropped everything else,
// which meant an export format it had not seen rejected every row and reported
// "no settled payments" — the Checkout Sessions export that Payment Links
// produce uses "complete", so it discarded the entire file. Listing what is NOT
// revenue fails safe: an unfamiliar status is surfaced rather than silently
// deleted.
const NOT_REVENUE = new Set([
  'failed',
  'refunded',
  'canceled',
  'cancelled',
  'incomplete',
  'incomplete_expired',
  'uncaptured',
  'blocked',
  'disputed',
  'unpaid',
  'draft',
  'void',
  'open',
  'past_due',
  'expired',
  'pending',
  'false',
  'no',
])

function pick(headers, names) {
  for (const name of names) {
    const i = headers.indexOf(name)
    if (i !== -1) return i
  }
  return -1
}

/** Turns a Stripe export into rows this app can reason about. */
export function normaliseStripeCsv(text) {
  const rows = parseCsv(text)
  if (rows.length < 2) return { rows: [], error: 'That file has no data rows.' }

  const headers = rows[0].map((h) => h.trim().toLowerCase())
  const idx = Object.fromEntries(
    Object.entries(FIELDS).map(([key, names]) => [key, pick(headers, names)])
  )
  if (idx.amount === -1) {
    return { rows: [], error: 'No amount column found. Export payments from Stripe as CSV.' }
  }

  const out = []
  // Counted so an empty result can say which rule emptied it, rather than
  // leaving the file looking unreadable.
  const skipped = { zeroAmount: 0, notRevenue: 0, refunded: 0 }
  const statuses = new Set()

  for (const raw of rows.slice(1)) {
    const at = (i) => (i === -1 ? '' : (raw[i] ?? '').trim())

    const amount = Number(at(idx.amount).replace(/[^0-9.-]/g, ''))
    if (!Number.isFinite(amount) || amount === 0) {
      skipped.zeroAmount++
      continue
    }

    const status = at(idx.status).toLowerCase()
    if (status) statuses.add(status)
    if (NOT_REVENUE.has(status)) {
      skipped.notRevenue++
      continue
    }

    // A full refund is not revenue; a partial one still is.
    const refunded = Number(at(idx.refunded).replace(/[^0-9.-]/g, ''))
    if (Number.isFinite(refunded) && refunded > 0 && refunded >= amount) {
      skipped.refunded++
      continue
    }

    const created = at(idx.created)
    out.push({
      id: at(idx.id) || `${created}-${amount}-${at(idx.email)}`,
      date: created.slice(0, 10),
      amount,
      currency: (at(idx.currency) || 'usd').toLowerCase(),
      customerId: at(idx.customerId) || null,
      email: at(idx.email) || null,
      description: at(idx.description) || '',
    })
  }
  const sorted = out.sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length === 0) {
    const why = []
    if (skipped.notRevenue) why.push(`${skipped.notRevenue} were not settled`)
    if (skipped.refunded) why.push(`${skipped.refunded} were fully refunded`)
    if (skipped.zeroAmount) why.push(`${skipped.zeroAmount} had no amount`)
    return {
      rows: [],
      error:
        `Read ${rows.length - 1} rows but none look like settled payments` +
        (why.length ? ` — ${why.join(', ')}.` : '.') +
        (statuses.size ? ` Statuses seen: ${[...statuses].join(', ')}.` : '') +
        ` Columns found: ${headers.join(', ')}.`,
      diagnostics: { headers, skipped, statuses: [...statuses] },
    }
  }

  return { rows: sorted, error: '', diagnostics: { headers, skipped, statuses: [...statuses] } }
}

/**
 * Suggests which client a payment belongs to.
 *
 * Only ever a suggestion. The export covers the whole Stripe account and some
 * of it is not this business at all, so nothing is assigned without a choice.
 */
export function suggestClient(row, clients, intakes) {
  if (row.customerId) {
    const byCustomer = clients.find((c) => c.stripe_customer_id === row.customerId)
    if (byCustomer) return { id: byCustomer.id, via: 'Stripe customer already linked' }
  }
  if (row.email) {
    const email = row.email.toLowerCase()
    const intake = (intakes || []).find((i) => (i.contact_email || '').toLowerCase() === email)
    if (intake) {
      const c = clients.find((x) => x.id === intake.client_id)
      if (c) return { id: c.id, via: 'matched on the intake email' }
    }
  }
  // A name in the description is weak evidence, but often the only evidence.
  const text = `${row.description}`.toLowerCase()
  if (text) {
    const named = clients.find((c) => c.name && text.includes(c.name.toLowerCase()))
    if (named) return { id: named.id, via: 'client name in the description' }
  }
  return { id: '', via: '' }
}

/** Setup fees and monthly fees are usually told apart by the amount. */
export function guessType(row, client) {
  if (!client) return 'monthly'
  const setup = Number(client.setup_fee) || 0
  const monthly = Number(client.monthly_fee) || 0
  if (setup && Math.abs(row.amount - setup) < 1) return 'setup'
  if (monthly && Math.abs(row.amount - monthly) < 1) return 'monthly'
  if (/setup|set up|onboard/i.test(row.description)) return 'setup'
  return 'monthly'
}

/**
 * Writes one mapped payment in.
 *
 * Satisfies the oldest outstanding scheduled row of that type rather than
 * adding a parallel one, which is what the webhook does for live payments, so
 * an imported month and a webhook month end up looking the same.
 */
export async function applyImportedPayment({ row, clientId, type }) {
  const { data: due } = await supabase
    .from('payments')
    .select('id')
    .eq('client_id', clientId)
    .eq('payment_type', type)
    .in('status', ['pending', 'overdue'])
    .order('due_date', { ascending: true })
    .limit(1)

  const paid = {
    status: 'paid',
    paid_date: row.date,
    payment_method: 'card',
    stripe_charge_id: row.id,
    stripe_customer_id: row.customerId,
  }

  if (due?.[0]) {
    const { error } = await supabase.from('payments').update(paid).eq('id', due[0].id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('payments').insert({
      client_id: clientId,
      payment_type: type,
      amount: row.amount,
      due_date: row.date,
      notes: `Imported from Stripe${row.description ? `: ${row.description}` : ''}`,
      ...paid,
    })
    if (error) throw error
  }

  // The point of mapping once: later invoices for this customer match on their
  // own instead of arriving unmatched every month.
  if (row.customerId) {
    const { data: client } = await supabase
      .from('clients')
      .select('stripe_customer_id')
      .eq('id', clientId)
      .maybeSingle()
    if (client && !client.stripe_customer_id) {
      await supabase.from('clients').update({ stripe_customer_id: row.customerId }).eq('id', clientId)
    }
  }
}

/**
 * Every Stripe identifier already recorded against a payment.
 *
 * Charge ids alone were not enough and it cost real money to find out. The
 * webhook records stripe_invoice_id and never a charge id, so a payment it had
 * already captured was invisible here and the importer wrote it a second time
 * -- $399 of revenue that Stripe only ever collected once. Both columns are
 * collected now, so a row is recognised whichever path recorded it first.
 */
export async function fetchImportedChargeIds() {
  const { data } = await supabase
    .from('payments')
    .select('stripe_charge_id, stripe_invoice_id')

  const ids = new Set()
  for (const row of data || []) {
    if (row.stripe_charge_id) ids.add(row.stripe_charge_id)
    if (row.stripe_invoice_id) ids.add(row.stripe_invoice_id)
  }
  return ids
}

/**
 * Payments already recorded for a client on a given day, by amount.
 *
 * The id check above only works when the export and the webhook happen to
 * share an identifier. A subscriptions export carries sub_... ids, which match
 * nothing, so the same payment can still slip through. Same client, same
 * amount, same day is the fallback signal -- weak enough that it only warns
 * rather than skipping, since two genuine identical charges in one day are
 * possible.
 */
export async function fetchRecordedAmounts() {
  const { data } = await supabase
    .from('payments')
    .select('client_id, amount, paid_date')
    .eq('status', 'paid')
    .not('paid_date', 'is', null)

  const seen = new Set()
  for (const row of data || []) {
    seen.add(recordedKey(row.client_id, row.amount, row.paid_date))
  }
  return seen
}

export function recordedKey(clientId, amount, date) {
  return `${clientId}|${Number(amount) || 0}|${String(date || '').slice(0, 10)}`
}
