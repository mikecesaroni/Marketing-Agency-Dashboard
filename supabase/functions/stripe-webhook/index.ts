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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function centsToAmount(cents: unknown) {
  return Math.round(Number(cents || 0)) / 100
}

function isoDate(seconds: unknown) {
  const n = Number(seconds)
  const d = Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date()
  return d.toISOString().slice(0, 10)
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
    const rows = await db.get(`clients?id=eq.${clientRef}&select=id,name,stripe_customer_id`)
    if (rows?.[0]) return { client: rows[0], via: 'client_reference_id' }
  }

  if (customerId) {
    const rows = await db.get(
      `clients?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=id,name,stripe_customer_id`
    )
    if (rows?.[0]) return { client: rows[0], via: 'stripe_customer_id' }
  }

  if (email) {
    const rows = await db.get(
      `onboarding_intake?contact_email=ilike.${encodeURIComponent(email)}&select=client_id`
    )
    const clientId = rows?.[0]?.client_id
    if (clientId) {
      const found = await db.get(`clients?id=eq.${clientId}&select=id,name,stripe_customer_id`)
      if (found?.[0]) return { client: found[0], via: 'contact_email' }
    }
  }

  return { client: null, via: null }
}

/**
 * True when this customer or email was marked "not this business" from the
 * Unmatched payments queue — some Stripe accounts on this connection bill
 * for more than one business. Checked before parking anything, so a
 * recurring subscription that isn't ours stops cluttering the queue after
 * being dismissed once, rather than reappearing on every invoice.
 */
async function isIgnoredCustomer(
  db: Db,
  { customerId, email }: { customerId?: string | null; email?: string | null }
) {
  if (customerId) {
    const rows = await db.get(
      `stripe_ignored_customers?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=id&limit=1`
    )
    if (rows?.[0]) return true
  }
  if (email) {
    const rows = await db.get(
      `stripe_ignored_customers?customer_email=ilike.${encodeURIComponent(email)}&select=id&limit=1`
    )
    if (rows?.[0]) return true
  }
  return false
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
    type: 'setup' | 'monthly'
    amount: number
    paidDate: string
    method: string
    eventId: string
    invoiceId?: string | null
    customerId?: string | null
    description?: string
  }
) {
  const due = await db.get(
    `payments?client_id=eq.${p.clientId}&payment_type=eq.${p.type}` +
      `&status=in.(pending,overdue)&order=due_date.asc&limit=1&select=id,due_date,amount`
  )

  const patch = {
    status: 'paid',
    paid_date: p.paidDate,
    payment_method: p.method,
    stripe_event_id: p.eventId,
    stripe_invoice_id: p.invoiceId || null,
    stripe_customer_id: p.customerId || null,
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
      // A brand-new subscription's checkout.session.completed carries the
      // same dollar amount as the invoice.paid event that always follows for
      // that same first period. Parking both double-counts one payment as
      // two the moment they both land in the unmatched queue. This mirrors
      // the matched-client branch just below, which never records money for
      // a subscription checkout either — only invoice.paid ever does that.
      if (obj.mode === 'subscription') {
        return { status: 'ignored', note: 'unmatched subscription checkout, waiting for the invoice' }
      }

      if (await isIgnoredCustomer(db, { customerId, email })) {
        return { status: 'ignored', note: 'customer marked not this business' }
      }

      await parkUnmatched(db, event, {
        customerId,
        email,
        name: obj.customer_details?.name,
        amount: centsToAmount(obj.amount_total),
        type: 'setup',
        method: methodFrom(obj.payment_method_types),
        description: 'Checkout session with no matching client',
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
      if (await isIgnoredCustomer(db, { customerId, email })) {
        return { status: 'ignored', note: 'customer marked not this business' }
      }

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
    if (!client) return { status: 'unmatched', note: 'no client for failed invoice' }

    const due = await db.get(
      `payments?client_id=eq.${client.id}&payment_type=eq.monthly&status=eq.pending` +
        `&order=due_date.asc&limit=1&select=id,notes`
    )
    if (due?.[0]) {
      await db.patch(`payments?id=eq.${due[0].id}`, {
        status: 'overdue',
        notes: [due[0].notes, `Stripe payment failed ${isoDate(obj.created)}`].filter(Boolean).join(' | '),
      })
    }
    return { status: 'processed', note: `payment failed for ${client.name}` }
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

async function parkUnmatched(
  db: Db,
  event: any,
  d: {
    customerId?: string | null
    email?: string | null
    name?: string | null
    amount: number
    type: 'setup' | 'monthly'
    method: string
    invoiceId?: string | null
    description: string
  }
) {
  await db.post('stripe_unmatched', {
    stripe_event_id: event.id,
    stripe_customer_id: d.customerId || null,
    customer_email: d.email || null,
    customer_name: d.name || null,
    amount: d.amount,
    paid_date: isoDate(event?.data?.object?.created),
    payment_type: d.type,
    payment_method: d.method,
    stripe_invoice_id: d.invoiceId || null,
    description: d.description,
  })
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
      type: row.payment_type === 'setup' ? 'setup' : 'monthly',
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

Deno.serve(async (req) => {
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
})
