import { supabase } from './supabaseClient'

export const SETUP_KEY = 'stripe_setup_link'
// The original monthly link — the $998/mo plan. Key kept as-is so existing
// Stripe payment link config in app_settings does not need to move.
export const MONTHLY_KEY = 'stripe_monthly_link'
// The newer, higher-tier plan. A separate Payment Link in Stripe (its own
// price), so it needs its own slot rather than overloading the first one.
export const MONTHLY_1500_KEY = 'stripe_monthly_1500_link'

export async function fetchStripeLinks() {
  const { data } = await supabase.from('app_settings').select('key, value')
  const map = Object.fromEntries((data || []).map((r) => [r.key, r.value || '']))
  return {
    setup: map[SETUP_KEY] || '',
    monthly: map[MONTHLY_KEY] || '',
    monthly1500: map[MONTHLY_1500_KEY] || '',
  }
}

export async function saveStripeLinks({ setup, monthly, monthly1500 }) {
  const stamp = new Date().toISOString()
  const rows = [
    { key: SETUP_KEY, value: setup || '', updated_at: stamp },
    { key: MONTHLY_KEY, value: monthly || '', updated_at: stamp },
    { key: MONTHLY_1500_KEY, value: monthly1500 || '', updated_at: stamp },
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

// The two kinds of money the CRM tracks. Anything unrecognised is treated as a
// monthly payment, which is what an unmatched row has always defaulted to.
const PAYMENT_TYPES = new Set(['setup', 'monthly'])

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
 * Also relinks the client's Stripe customer, so this is a one-time correction
 * rather than something to repeat every month. `replaceCustomerId` is the
 * caller's decision about the awkward case: the client already points at a
 * DIFFERENT customer. Summit Water Pros is why that case matters -- their old
 * subscription was cancelled, a new one started under a new customer, and
 * because the old id was merely stale rather than missing the relink was
 * skipped and every future invoice would have arrived unmatched again.
 */
export async function assignUnmatched(row, clientId, { replaceCustomerId = false } = {}) {
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
    // WHAT STRIPE TOOK, not what the schedule guessed. Settling a scheduled
    // row without this records the CRM's own figure as though it were
    // collected: Summit Water Pros moved from $998 to $1,500 and the ledger
    // went on saying $998, so $502 of real money was missing from the books
    // and from the profit split, and the reconcile panel could not see it
    // because both sides of its comparison were the same wrong number.
    amount: row.amount,
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
  let relinked = 'none'
  if (row.stripe_customer_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('stripe_customer_id')
      .eq('id', clientId)
      .maybeSingle()
    const current = client?.stripe_customer_id || ''
    const wanted = row.stripe_customer_id

    if (client && current !== wanted && (!current || replaceCustomerId)) {
      await supabase.from('clients').update({ stripe_customer_id: wanted }).eq('id', clientId)
      relinked = current ? 'replaced' : 'set'
    }
  }

  const { error } = await supabase
    .from('stripe_unmatched')
    .update({ resolved_client_id: clientId, resolved_at: new Date().toISOString() })
    .eq('id', row.id)
  if (error) throw error

  return { relinked }
}

/**
 * Dismisses ONE parked payment. Nothing is remembered.
 *
 * This used to also add the customer and email to stripe_ignored_customers,
 * and the webhook checked that list before parking anything, so a recurring
 * subscription that wasn't ours only had to be dismissed once.
 *
 * That shortcut cost a real payment. Pillar HVAC's $998 invoice arrived on
 * 2026-08-31 from mlopez@lopezprojectgroup.com -- an email dismissed the day
 * before over a different, unrelated $165 charge -- and the webhook dropped
 * it silently. A judgement call about one payment had quietly become a
 * standing rule about a person, and the only trace left was a line in the
 * event log.
 *
 * So a dismissal now applies to the payment in front of you and nothing else.
 * The same customer paying again next month shows up again, and dismissing it
 * costs one click. That is the trade the owner asked for, in their words:
 * every payment shows up, and they match it to a client or dismiss it.
 */
export async function dismissUnmatched(row) {
  const { error } = await supabase.from('stripe_unmatched').delete().eq('id', row.id)
  if (error) throw error
}
