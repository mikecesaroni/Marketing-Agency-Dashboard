// The Billing tab's reads and the agency's writes for it.
//
// The client page reads through client_billing_load, a token-gated function
// (supabase/client-billing.sql) that returns the client's plan, their
// payments and the Stripe settings, and nothing else; the anon key can call
// it and reach no table. The agency saves a client's custom Stripe links from
// the client's Payments card.

import { supabase } from './supabaseClient'

/** Everything the Billing tab shows, or null when the token is not a client's. */
export async function loadClientBilling(token) {
  const { data, error } = await supabase.rpc('client_billing_load', { p_token: token })
  if (error) throw error
  return data || null
}

/**
 * A client's own Stripe links, for a fee no standard link charges (a
 * $1,750 plan, a split setup fee). Empty clears one.
 */
export async function saveClientPayLinks(clientId, { setup = '', monthly = '' } = {}) {
  const clean = (v) => {
    const s = String(v || '').trim()
    return s && /^https:\/\//i.test(s) ? s : null
  }
  const { error } = await supabase
    .from('clients')
    .update({ pay_setup_link: clean(setup), pay_monthly_link: clean(monthly) })
    .eq('id', clientId)
  if (error) throw error
}
