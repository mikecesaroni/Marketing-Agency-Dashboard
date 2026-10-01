import { supabase } from './supabaseClient'
import { readFunctionError } from './functionError'

/**
 * The people who filled in one ad's instant form, from Meta, on demand.
 * Never stored here: every open asks Meta again. A refusal comes back as
 * { needsAccess: true, fix } so the panel can say what to do instead of
 * failing.
 */
export async function fetchAdLeads(clientId, adId, { limit = 50 } = {}) {
  const { data, error } = await supabase.functions.invoke('meta-ad-leads', {
    body: { client_id: clientId, ad_id: adId, limit },
  })
  if (error) {
    // Read a copy first: readFunctionError consumes the body.
    const parsed = await error?.context?.clone?.().json?.().catch(() => null)
    const { status, detail } = await readFunctionError(error)
    if (parsed?.code === 'needs_leads_access') return { leads: [], count: 0, needsAccess: true, fix: parsed.error, detail: parsed.detail }
    if (!status) throw new Error('Could not reach the lead reader. Is meta-ad-leads deployed?')
    throw new Error(detail || `The lead reader answered ${status}.`)
  }
  if (data?.code === 'needs_leads_access') return { leads: [], count: 0, needsAccess: true, fix: data.error, detail: data.detail }
  if (data?.error) throw new Error(data.error)
  return { leads: data.leads || [], count: data.count || 0, more: Boolean(data.more), needsAccess: false }
}
