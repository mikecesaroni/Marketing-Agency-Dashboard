import { supabase } from './supabaseClient'

export const SETUP_KEY = 'stripe_setup_link'
// The original monthly link — the $998/mo plan. Key kept as-is so existing
// Stripe payment link config in app_settings does not need to move.
export const MONTHLY_KEY = 'stripe_monthly_link'
// The newer, higher-tier plan. A separate Payment Link in Stripe (its own
// price), so it needs its own slot rather than overloading the first one.
export const MONTHLY_1500_KEY = 'stripe_monthly_1500_link'
// The $399/mo GoHighLevel subscription. Billed on its own subscription in
// Stripe, so it gets its own link rather than sharing a monthly slot.
export const GHL_KEY = 'stripe_ghl_link'
// The Stripe price id behind that link (price_...). Optional, but it is the
// only signal that tells the webhook a paid invoice is the GHL subscription
// rather than the marketing retainer when a client is on both.
export const GHL_PRICE_KEY = 'stripe_ghl_price_id'

export async function fetchStripeLinks() {
  const { data } = await supabase.from('app_settings').select('key, value')
  const map = Object.fromEntries((data || []).map((r) => [r.key, r.value || '']))
  return {
    setup: map[SETUP_KEY] || '',
    monthly: map[MONTHLY_KEY] || '',
    monthly1500: map[MONTHLY_1500_KEY] || '',
    ghl: map[GHL_KEY] || '',
    ghlPriceId: map[GHL_PRICE_KEY] || '',
  }
}

export async function saveStripeLinks({ setup, monthly, monthly1500, ghl, ghlPriceId }) {
  const stamp = new Date().toISOString()
  const rows = [
    { key: SETUP_KEY, value: setup || '', updated_at: stamp },
    { key: MONTHLY_KEY, value: monthly || '', updated_at: stamp },
    { key: MONTHLY_1500_KEY, value: monthly1500 || '', updated_at: stamp },
    { key: GHL_KEY, value: ghl || '', updated_at: stamp },
    { key: GHL_PRICE_KEY, value: (ghlPriceId || '').trim(), updated_at: stamp },
  ]
  const { error } = await supabase.from('app_settings').upsert(rows, { onConflict: 'key' })
  if (error) throw error
}

/**
 * Stamps a payment link with the client it belongs to.
 *
 * This is the whole trick: Stripe has no idea who is paying, and
 * client_reference_id is the one field that survives from the link into the
 * webhook. Built with URL so a link that already carries query parameters
 * keeps them instead of being mangled.
 */
export function clientLink(base, clientId) {
  const raw = String(base || '').trim()
  if (!raw || !clientId) return ''
  try {
    const url = new URL(raw)
    url.searchParams.set('client_reference_id', clientId)
    return url.toString()
  } catch {
    return ''
  }
}

// The three kinds of money the CRM tracks. Anything unrecognised is treated as
// a monthly retainer, which is what an unmatched row defaulted to before the
// GHL plan existed.
const PAYMENT_TYPES = new Set(['setup', 'monthly', 'ghl'])

export async function fetchUnmatched() {
  const { data, error } = await supabase
    .from('stripe_unmatched')
    .select('*')
    .is('resolved_client_id', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

/**
 * Attaches a parked payment to a client by hand.
 *
 * Also writes the Stripe customer id onto the client when it is missing, so
 * this is a one-time correction rather than something to repeat every month.
 */
export async function assignUnmatched(row, clientId) {
  const type = PAYMENT_TYPES.has(row.payment_type) ? row.payment_type : 'monthly'

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
    paid_date: row.paid_date,
    payment_method: row.payment_method || 'card',
    stripe_event_id: row.stripe_event_id,
    stripe_invoice_id: row.stripe_invoice_id,
    stripe_customer_id: row.stripe_customer_id,
  }

  if (due?.[0]) {
    const { error } = await supabase.from('payments').update(paid).eq('id', due[0].id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('payments').insert({
      client_id: clientId,
      payment_type: type,
      amount: row.amount,
      due_date: row.paid_date,
      notes: 'Assigned from an unmatched Stripe payment',
      ...paid,
    })
    if (error) throw error
  }

  // The part that stops this recurring: future invoices match on the customer.
  if (row.stripe_customer_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('stripe_customer_id')
      .eq('id', clientId)
      .maybeSingle()
    if (client && !client.stripe_customer_id) {
      await supabase
        .from('clients')
        .update({ stripe_customer_id: row.stripe_customer_id })
        .eq('id', clientId)
    }
  }

  const { error } = await supabase
    .from('stripe_unmatched')
    .update({ resolved_client_id: clientId, resolved_at: new Date().toISOString() })
    .eq('id', row.id)
  if (error) throw error
}

/**
 * Marks a parked payment as belonging to a different business entirely.
 *
 * Some Stripe accounts on this connection bill for more than one business.
 * A payment like that will never match a client here — remembering the
 * customer or email is what stops it from reappearing in the queue on every
 * future invoice, rather than having to dismiss the same subscription again
 * each month.
 */
export async function dismissUnmatched(row) {
  if (row.stripe_customer_id || row.customer_email) {
    const { error: ignoreErr } = await supabase.from('stripe_ignored_customers').insert({
      stripe_customer_id: row.stripe_customer_id || null,
      customer_email: row.customer_email || null,
      reason: 'Marked not this business from the unmatched payments queue',
    })
    // Already on the ignore list is fine — anything else is worth surfacing.
    if (ignoreErr && ignoreErr.code !== '23505') throw ignoreErr
  }

  const { error } = await supabase.from('stripe_unmatched').delete().eq('id', row.id)
  if (error) throw error
}
