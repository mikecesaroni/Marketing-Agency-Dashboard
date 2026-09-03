// Stripe -> CRM payment tracking.
//
// Deployed with verify_jwt = false. Stripe sends no Supabase JWT, so with the
// default setting every delivery would 401 and the whole integration would look
// like it simply never fired.
//
// Secrets: STRIPE_WEBHOOK_SECRET (the whsec_... signing secret for THIS
// endpoint). No Stripe API key is needed. Everything used here is in the event
// payload, and the signature is verified against the raw body directly, so
// there is no reason to hold a key that can move money.
//
// Every recurring charge is a 'monthly' payment, whatever package it is for.
// A client can be on more than one Stripe subscription -- their monthly total
// is simply the sum -- and there is deliberately no attempt to attribute part
// of a package price to a particular service.
//
// EVERY PAYMENT, EVERY TIME. NOTHING IS DROPPED AND NOTHING IS REMEMBERED.
//
// Every payment on this Stripe account ends up either against a client or in
// the unmatched queue for a person to assign or dismiss. The queue is the
// answer to "is this ours"; this function never guesses it.
//
// There used to be one exception. Dismissing a payment put its customer and
// email on an ignore list, and this function checked that list before parking
// anything, so a subscription that wasn't ours only had to be dismissed once.
// It cost a real $998 client invoice: Pillar HVAC paid on 2026-08-31 from an
// email dismissed the day before, and the payment was recorded nowhere a
// person could see. A rule inferred from one judgement call and then applied
// silently to every later payment is worth far less than showing the payment
// again and spending two seconds dismissing it. Dismissing is now a decision
// about ONE payment and carries no memory. Do not add the list back.

const TOLERANCE_SECONDS = 300

type Db = {
  get: (path: string) => Promise<any>
  post: (table: string, body: unknown, prefer?: string) => Promise<Response>
  patch: (path: string, body: unknown) => Promise<Response>
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Stripe signs `${timestamp}.${rawBody}` with HMAC-SHA256 and sends it as
// `t=...,v1=...`. Verifying it is the only thing standing between this endpoint
// and anyone who finds the URL writing paid invoices into the books, so it is
// done by hand rather than trusted to a dependency.
export async function verifySignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<{ ok: boolean; reason?: string }> {
  if (!header) return { ok: false, reason: 'missing Stripe-Signature header' }

  const parts = Object.create(null) as Record<string, string[]>
  for (const piece of header.split(',')) {
    const [k, v] = piece.split('=')
    if (!k || !v) continue
    ;(parts[k.trim()] ||= []).push(v.trim())
  }

  const timestamp = parts['t']?.[0]
  const signatures = parts['v1'] || []
  if (!timestamp || signatures.length === 0) return { ok: false, reason: 'malformed signature header' }

  // A replayed delivery from days ago should not be accepted even with a valid
  // signature.
  const age = Math.abs(nowSeconds - Number(timestamp))
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) {
    return { ok: false, reason: `timestamp outside tolerance (${age}s)` }
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`))
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')

  const match = signatures.some((sig) => timingSafeEqual(sig, expected))
  return match ? { ok: true } : { ok: false, reason: 'signature mismatch' }
}

// Compares in constant time. A plain === leaks how much of the prefix matched
// through timing, which is enough to forge a signature given enough attempts.
function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Everything the handlers need off a client row.
const CLIENT_FIELDS = 'id,name,stripe_customer_id,monthly_fee'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function centsToAmount(cents: unknown) {
  return Math.round(Number(cents || 0)) / 100
}

function isoDate(seconds: unknown) {
  const n = Number(seconds)
  const d = Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date()
  return d.toISOString().slice(0, 10)
}

// A full timestamp, for the failure columns. A failed attempt and its retry can
// land on the same calendar day, and "failed today, retrying today" is not a
// sentence anyone can act on.
function isoTimestamp(seconds: unknown) {
  const n = Number(seconds)
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null
}

// The CRM's payment_method list is card / ach / check / paypal / other.
function methodFrom(types: unknown): string {
  const list = Array.isArray(types) ? types.map(String) : []
  if (list.includes('us_bank_account') || list.includes('acss_debit')) return 'ach'
  return 'card'
}

/**
 * Finds the client this money belongs to, best evidence first.
 *
 * client_reference_id is the only signal that is actually authoritative, but it
 * rides on the Checkout Session and nothing else. From month two the customer
 * id is all there is, which is why linking it on the first payment matters so
 * much. Email is a last resort: people pay from whatever address they like.
 */
export async function findClient(
  db: Db,
  { clientRef, customerId, email }: { clientRef?: string | null; customerId?: string | null; email?: string | null }
) {
  if (clientRef && UUID_RE.test(clientRef)) {
    const rows = await db.get(`clients?id=eq.${clientRef}&select=${CLIENT_FIELDS}`)
    if (rows?.[0]) return { client: rows[0], via: 'client_reference_id' }
  }

  if (customerId) {
    const rows = await db.get(
      `clients?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=${CLIENT_FIELDS}`
    )
    if (rows?.[0]) return { client: rows[0], via: 'stripe_customer_id' }
  }

  if (email) {
    const rows = await db.get(
      `onboarding_intake?contact_email=ilike.${encodeURIComponent(email)}&select=client_id`
    )
    const clientId = rows?.[0]?.client_id
    if (clientId) {
      const found = await db.get(`clients?id=eq.${clientId}&select=${CLIENT_FIELDS}`)
      if (found?.[0]) return { client: found[0], via: 'contact_email' }
    }
  }

  return { client: null, via: null }
}

type PaymentType = 'setup' | 'monthly'

const PAYMENT_TYPES = new Set<string>(['setup', 'monthly'])

function asPaymentType(v: unknown): PaymentType {
  return PAYMENT_TYPES.has(String(v)) ? (String(v) as PaymentType) : 'monthly'
}

/**
 * Marks money as received.
 *
 * The CRM already generates a 12-month schedule of pending rows, so the right
 * move is to satisfy the oldest outstanding one rather than pile up a parallel
 * set of Stripe rows. An unscheduled payment still gets recorded, just with a
 * note saying it did not match the schedule.
 */
export async function recordPayment(
  db: Db,
  p: {
    clientId: string
    type: PaymentType
    amount: number
    paidDate: string
    method: string
    eventId: string
    invoiceId?: string | null
    customerId?: string | null
    description?: string
  }
) {
  // The row this invoice already failed on, first. Without this an invoice that
  // fails and then succeeds can settle a DIFFERENT month than the one it was
  // recorded against, leaving one row paid twice over and another still open.
  let due = p.invoiceId
    ? await db.get(
        `payments?stripe_invoice_id=eq.${encodeURIComponent(p.invoiceId)}` +
          `&status=in.(pending,overdue)&order=due_date.asc&limit=1&select=id,due_date,amount`
      )
    : null

  if (!due?.[0]) {
    due = await db.get(
      `payments?client_id=eq.${p.clientId}&payment_type=eq.${p.type}` +
        `&status=in.(pending,overdue)&order=due_date.asc&limit=1&select=id,due_date,amount`
    )
  }

  const patch = {
    status: 'paid',
    paid_date: p.paidDate,
    payment_method: p.method,
    stripe_event_id: p.eventId,
    stripe_invoice_id: p.invoiceId || null,
    stripe_customer_id: p.customerId || null,
    // WHAT STRIPE TOOK, not what the schedule guessed twelve months ago.
    //
    // Missing this was the quietest money bug in the app: a client who moved
    // onto a different price had the OLD figure marked paid. Summit Water Pros
    // went from $998 to $1,500 and the ledger kept saying $998 -- $502 per
    // invoice missing from the books and from the profit split. It was also
    // invisible to the panel built to catch exactly this, because that panel
    // reads "what Stripe collected" off these rows, so both sides of its
    // comparison were the same wrong number and agreed.
    amount: p.amount,
    // The money arrived, so there is no retry pending. last_failed_at is left
    // alone: what happened still happened, and the row shows it as recovered
    // rather than pretending the card never bounced.
    next_attempt_at: null,
  }

  if (due?.[0]) {
    await db.patch(`payments?id=eq.${due[0].id}`, patch)
    return { matchedScheduledRow: due[0].id, inserted: false }
  }

  await db.post('payments', {
    client_id: p.clientId,
    payment_type: p.type,
    amount: p.amount,
    due_date: p.paidDate,
    notes: p.description || 'Stripe payment with no scheduled row',
    ...patch,
  })
  return { matchedScheduledRow: null, inserted: true }
}

/**
 * Handles one Stripe event. Returns the status to record against it.
 *
 * Deliberately narrow: checkout.session.completed for subscriptions records no
 * money at all, it only links the customer. The first invoice.paid already
 * covers that month, and counting both would bill every client twice on signup.
 */
export async function handleEvent(db: Db, event: any) {
  const type = event?.type
  const obj = event?.data?.object || {}

  if (type === 'checkout.session.completed') {
    const customerId = obj.customer || null
    const email = obj.customer_details?.email || obj.customer_email || null
    const { client, via } = await findClient(db, {
      clientRef: obj.client_reference_id,
      customerId,
      email,
    })

    if (!client) {
      // PARKED, INCLUDING SUBSCRIPTIONS.
      //
      // This used to drop an unmatched subscription checkout entirely, on the
      // reasoning that its invoice always follows and parking both would
      // double-count one payment. The invoice does usually follow -- but
      // "usually" meant four checkouts worth $5,498 were recorded nowhere a
      // person could see them. A guess about a future event is not a good
      // enough reason to make money invisible.
      //
      // The double-count it was avoiding is handled properly instead:
      // parkUnmatched merges an invoice into an open row from the same
      // customer for the same amount, so one payment stays one row.
      const subscription = obj.mode === 'subscription'
      await parkUnmatched(db, event, {
        customerId,
        email,
        name: obj.customer_details?.name,
        amount: centsToAmount(obj.amount_total),
        type: subscription ? 'monthly' : 'setup',
        method: methodFrom(obj.payment_method_types),
        description: subscription
          ? 'Subscription started by someone with no matching client'
          : 'Checkout session with no matching client',
      })
      return { status: 'unmatched', note: 'no client for checkout session' }
    }

    // The bridge that keeps every later month attached to this client.
    let linked = false
    if (customerId && client.stripe_customer_id !== customerId) {
      await db.patch(`clients?id=eq.${client.id}`, { stripe_customer_id: customerId })
      linked = true
    }

    if (obj.mode === 'subscription') {
      // Stripe does not guarantee delivery order, so the first invoice.paid can
      // land before this event and get parked. Now that the customer is known,
      // go back for it.
      const rescued = linked ? await resolveUnmatchedForCustomer(db, customerId, client.id) : 0
      return {
        status: 'processed',
        note: `subscription linked to ${client.name} via ${via}${rescued ? `, ${rescued} parked payment(s) resolved` : ''}`,
      }
    }

    const amount = centsToAmount(obj.amount_total)
    if (amount <= 0) return { status: 'ignored', note: 'zero amount checkout session' }

    const result = await recordPayment(db, {
      clientId: client.id,
      type: 'setup',
      amount,
      paidDate: isoDate(obj.created),
      method: methodFrom(obj.payment_method_types),
      eventId: event.id,
      customerId,
      description: 'Stripe setup fee',
    })
    return {
      status: 'processed',
      note: `setup fee ${amount} for ${client.name} via ${via}${result.inserted ? ' (unscheduled)' : ''}`,
    }
  }

  if (type === 'invoice.paid') {
    const amount = centsToAmount(obj.amount_paid)
    // Trials and full credit-note offsets come through as real invoices for
    // zero. Recording those would show a paid month that never earned anything.
    if (amount <= 0) return { status: 'ignored', note: 'zero amount invoice' }

    const customerId = obj.customer || null
    const email = obj.customer_email || null
    const { client, via } = await findClient(db, { customerId, email })

    if (!client) {
      await parkUnmatched(db, event, {
        customerId,
        email,
        name: obj.customer_name,
        amount,
        type: 'monthly',
        method: methodFrom(obj.payment_settings?.payment_method_types),
        invoiceId: obj.id,
        description: 'Invoice with no matching client',
      })
      return { status: 'unmatched', note: 'no client for invoice' }
    }

    const result = await recordPayment(db, {
      clientId: client.id,
      type: 'monthly',
      amount,
      paidDate: isoDate(obj.status_transitions?.paid_at || obj.created),
      method: methodFrom(obj.payment_settings?.payment_method_types),
      eventId: event.id,
      invoiceId: obj.id,
      customerId,
      description: 'Stripe subscription payment',
    })
    return {
      status: 'processed',
      note: `monthly ${amount} for ${client.name} via ${via}${result.inserted ? ' (unscheduled)' : ''}`,
    }
  }

  if (type === 'invoice.payment_failed') {
    const { client } = await findClient(db, { customerId: obj.customer, email: obj.customer_email })

    if (!client) {
      // Parked, where before it was reported as unmatched and then written
      // nowhere -- three of these were sitting in the event log and in no
      // queue. A failed charge from someone we cannot identify is worth
      // seeing: either it is a client whose billing is broken, or it is not
      // ours and belongs dismissed.
      await parkUnmatched(db, event, {
        customerId: obj.customer,
        email: obj.customer_email,
        name: obj.customer_name,
        amount: centsToAmount(obj.amount_due),
        type: 'monthly',
        method: methodFrom(obj.payment_settings?.payment_method_types),
        invoiceId: obj.id,
        description: 'Failed payment from someone with no matching client',
      })
      return { status: 'unmatched', note: 'no client for failed invoice' }
    }

    // Already stamped with this invoice, before falling back to the oldest
    // open month. A card that fails twice has to land on the same row both
    // times, or the second failure marks an innocent future month overdue.
    let due = obj.id
      ? await db.get(
          `payments?stripe_invoice_id=eq.${encodeURIComponent(obj.id)}` +
            `&status=in.(pending,overdue)&order=due_date.asc&limit=1&select=id,failure_count`
        )
      : null

    if (!due?.[0]) {
      due = await db.get(
        `payments?client_id=eq.${client.id}&payment_type=eq.monthly&status=in.(pending,overdue)` +
          `&order=due_date.asc&limit=1&select=id,failure_count`
      )
    }

    if (!due?.[0]) {
      return { status: 'processed', note: `payment failed for ${client.name}, no open month to mark` }
    }

    // Columns, not a sentence in the notes. A note cannot be resolved, so a
    // failure written into one still reads as current after the retry goes
    // through -- which is how a correctly paid row came to sit under the words
    // "Stripe payment failed". See src/lib/paymentFailures.js.
    const attempts = Number(obj.attempt_count) || Number(due[0].failure_count) + 1 || 1
    const retry = isoTimestamp(obj.next_payment_attempt)

    await db.patch(`payments?id=eq.${due[0].id}`, {
      status: 'overdue',
      last_failed_at: isoTimestamp(obj.created) || new Date().toISOString(),
      failure_count: attempts,
      // Absent when Stripe has given up, which is the difference between
      // something to wait out and something that needs a new card.
      next_attempt_at: retry,
      stripe_invoice_id: obj.id || null,
      stripe_customer_id: obj.customer || null,
      // The only real action on a failure is to go and look at it in Stripe.
      stripe_hosted_invoice_url: obj.hosted_invoice_url || null,
    })

    return {
      status: 'processed',
      note:
        `monthly payment failed for ${client.name}` +
        ` (attempt ${attempts}, ${retry ? `retrying ${retry.slice(0, 10)}` : 'no retry scheduled'})`,
    }
  }

  if (type === 'customer.subscription.deleted') {
    const { client } = await findClient(db, { customerId: obj.customer })
    return {
      status: 'processed',
      note: client ? `subscription cancelled for ${client.name}` : 'subscription cancelled, client unknown',
    }
  }

  return { status: 'ignored', note: `unhandled event type ${type}` }
}

/**
 * Puts a payment we cannot attribute somewhere a person will see it.
 *
 * MERGES rather than blindly inserting. A subscription's checkout and its
 * first invoice are the same money seen twice -- same customer, same amount,
 * same day -- so the second one updates the open row instead of creating a
 * second row for one payment. That is what makes it safe to park the checkout
 * at all, which is what stopped $5,498 of subscriptions from disappearing.
 *
 * THROWS if the write fails. It used to fire and forget, so a rejected insert
 * left the event marked "unmatched" and the queue empty -- the payment existed
 * in Stripe, was named in the event log, and appeared nowhere anyone looks.
 * Throwing marks the event as an error and makes Stripe retry, which is loud
 * and recoverable instead of silent and not.
 */
async function parkUnmatched(
  db: Db,
  event: any,
  d: {
    customerId?: string | null
    email?: string | null
    name?: string | null
    amount: number
    type: PaymentType
    method: string
    invoiceId?: string | null
    description: string
  }
) {
  const paidDate = isoDate(event?.data?.object?.created)

  if (d.customerId) {
    const open = await db.get(
      `stripe_unmatched?stripe_customer_id=eq.${encodeURIComponent(d.customerId)}` +
        `&resolved_client_id=is.null&amount=eq.${d.amount}` +
        `&select=id,stripe_invoice_id,description`
    )
    const twin = (open || []).find((r: any) => r.id)
    if (twin) {
      await db.patch(`stripe_unmatched?id=eq.${twin.id}`, {
        // Keep whichever id we have; the invoice is the more useful one.
        stripe_invoice_id: d.invoiceId || twin.stripe_invoice_id || null,
        paid_date: paidDate,
      })
      return
    }
  }

  const res = await db.post('stripe_unmatched', {
    stripe_event_id: event.id,
    stripe_customer_id: d.customerId || null,
    customer_email: d.email || null,
    customer_name: d.name || null,
    amount: d.amount,
    paid_date: paidDate,
    payment_type: d.type,
    payment_method: d.method,
    stripe_invoice_id: d.invoiceId || null,
    description: d.description,
  })

  // 409 is this exact event arriving twice, which is fine and idempotent.
  if (!res.ok && res.status !== 409) {
    throw new Error(`Could not park the unmatched payment: ${await res.text()}`)
  }
}

// Picks up payments that were parked because they arrived before the customer
// was linked to a client.
async function resolveUnmatchedForCustomer(db: Db, customerId: string, clientId: string) {
  const rows = await db.get(
    `stripe_unmatched?stripe_customer_id=eq.${encodeURIComponent(customerId)}` +
      `&resolved_client_id=is.null&select=id,stripe_event_id,amount,payment_type,paid_date,payment_method,stripe_invoice_id`
  )
  for (const row of rows || []) {
    await recordPayment(db, {
      clientId,
      type: asPaymentType(row.payment_type),
      amount: Number(row.amount),
      paidDate: row.paid_date,
      method: row.payment_method || 'card',
      eventId: row.stripe_event_id,
      invoiceId: row.stripe_invoice_id,
      customerId,
      description: 'Stripe payment matched after the customer was linked',
    })
    await db.patch(`stripe_unmatched?id=eq.${row.id}`, {
      resolved_client_id: clientId,
      resolved_at: new Date().toISOString(),
    })
  }
  return (rows || []).length
}

export function makeDb(supabaseUrl: string, serviceKey: string): Db {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }
  return {
    get: async (path) => {
      const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers })
      return res.ok ? await res.json() : []
    },
    post: (table, body, prefer = 'return=minimal') =>
      fetch(`${supabaseUrl}/rest/v1/${table}`, {
        method: 'POST',
        headers: { ...headers, Prefer: prefer },
        body: JSON.stringify(body),
      }),
    patch: (path, body) =>
      fetch(`${supabaseUrl}/rest/v1/${path}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify(body),
      }),
  }
}

export async function serve(req: Request) {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!secret) return json({ error: 'STRIPE_WEBHOOK_SECRET is not set' }, 500)

  // Must be the raw body. Parsing and re-serialising changes the bytes and the
  // signature will never match.
  const rawBody = await req.text()
  const check = await verifySignature(rawBody, req.headers.get('Stripe-Signature'), secret)
  if (!check.ok) return json({ error: `Signature check failed: ${check.reason}` }, 400)

  let event: any
  try {
    event = JSON.parse(rawBody)
  } catch {
    return json({ error: 'Body was not JSON' }, 400)
  }

  const db = makeDb(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Idempotency, before any money is recorded. Stripe retries on every non-2xx
  // and can deliver the same event more than once even on success; the primary
  // key collision here is what stops a retry becoming a second payment.
  const claim = await db.post('stripe_events', {
    id: event.id,
    type: event.type,
    payload: event,
    status: 'processed',
  })
  if (claim.status === 409) {
    return json({ received: true, duplicate: true, event_id: event.id })
  }
  if (!claim.ok) {
    return json({ error: 'Could not record the event', detail: await claim.text() }, 500)
  }

  try {
    const result = await handleEvent(db, event)
    await db.patch(`stripe_events?id=eq.${event.id}`, { status: result.status, note: result.note })
    return json({ received: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db.patch(`stripe_events?id=eq.${event.id}`, { status: 'error', note: message })
    // 500 so Stripe retries. The event row is already claimed, so the retry
    // returns the duplicate branch rather than double-charging; the row is
    // there to be inspected and replayed by hand.
    return json({ error: message }, 500)
  }
}

// Registered only when running under Deno. Guarding it is what lets
// scripts/check-payments.mjs import the booking logic above and run it
// against fake invoices without a Deno runtime.
// deno-lint-ignore no-explicit-any
if (typeof (globalThis as any).Deno?.serve === 'function') {
  Deno.serve(serve)
}
