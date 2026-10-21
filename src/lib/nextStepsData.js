import { supabase } from './supabaseClient'
import { hasInternalColumn } from './queries'
import { fetchPipelineRows, pipelineFromRows } from './pipelineRows'

/**
 * Everything nextSteps() reads, for every active client, in one round of
 * queries. The queries and the pure composition live in pipelineRows.js so
 * the team-digest Edge Function runs the same code with the service key;
 * this is the browser's call to them.
 */
export async function fetchNextStepsForAll() {
  const raw = await fetchPipelineRows(supabase, { internalColumn: await hasInternalColumn() })
  return pipelineFromRows(raw)
}

/** The same, for one client page. */
export async function fetchNextStepsFor(clientId) {
  const all = await fetchNextStepsForAll()
  return all.find((r) => r.client.id === clientId) || null
}
