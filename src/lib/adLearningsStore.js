import { supabase } from './supabaseClient'

/**
 * Every account-wide finding plus this client's. One query; the table is a few
 * dozen rows and is rewritten nightly.
 */
export async function fetchLearnings(clientId) {
  let q = supabase.from('ad_learnings').select('scope, client_id, kind, sort_order, headline, evidence, computed_at')
  q = clientId ? q.or(`scope.eq.account,client_id.eq.${clientId}`) : q.eq('scope', 'account')
  const { data, error } = await q
  if (error) throw error
  return data || []
}

/** Every row, account-wide and per-client, for the dashboard digest. */
export async function fetchAllLearnings() {
  const { data, error } = await supabase.from('ad_learnings').select('scope, client_id, kind, sort_order, headline, evidence, computed_at')
  if (error) throw error
  return data || []
}
