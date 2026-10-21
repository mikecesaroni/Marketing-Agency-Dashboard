import { supabase } from './supabaseClient'
import { hasInternalColumn } from './queries'
import { fetchStatusRows, statusFromRows } from './statusRows'

/**
 * Everything the Client status board shows, for every active client. The
 * queries and the pure composition are in statusRows.js, shared with the
 * team-digest Edge Function; this is the browser's call to them.
 */
export async function fetchClientStatus() {
  const raw = await fetchStatusRows(supabase, { internalColumn: await hasInternalColumn() })
  return statusFromRows(raw)
}

/** Sets a client's package. null clears it (back to the guess from the fee). */
export async function setClientTier(clientId, tier) {
  const { error } = await supabase.from('clients').update({ tier: tier || null }).eq('id', clientId)
  if (error) throw error
}
