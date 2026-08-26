import { supabase } from './supabaseClient'
import { readFunctionError } from './functionError'

// Triggers the sync-meta-kpis Edge Function. The browser holds no Meta
// credentials, so the pull happens server-side and the app only asks for it.
//
// Pass a clientId to refresh one client, or omit it for everyone.
export async function runMetaSync(clientId) {
  const { data, error } = await supabase.functions.invoke('sync-meta-kpis', {
    body: clientId ? { client_id: clientId } : {},
  })

  if (error) {
    const { status, detail } = await readFunctionError(error)
    // The most common failure by far is the function simply not being deployed
    // yet, which surfaces as a 404 and tells the user nothing useful.
    if (status === 404) {
      throw new Error(
        'The sync function is not deployed yet. Deploy sync-meta-kpis in Supabase, then try again.'
      )
    }
    if (status === 401 || status === 403) {
      throw new Error('Supabase rejected the request. Check the function is set to allow this key.')
    }
    throw new Error(detail || 'Sync failed.')
  }

  if (data?.error) throw new Error(data.error)

  return data
}

// Turns the function's per-client results into one line for the UI.
export function summariseSync(data) {
  const results = data?.results || []
  if (results.length === 0) return 'Nothing to sync — no client has an ad account connected.'

  const failed = results.filter((r) => r.error)
  const ok = results.filter((r) => !r.error)
  const spend = ok.reduce((sum, r) => sum + (r.spend || 0), 0)
  const leads = ok.reduce((sum, r) => sum + (r.leads || 0), 0)

  const weeks = data.weeks?.length ? ` across ${data.weeks.length} week(s)` : ''
  let line = `Synced ${data.synced ?? ok.length} row(s)${weeks} — $${spend.toFixed(2)}, ${leads} leads.`
  if (failed.length > 0) line += ` ${failed.length} account(s) failed: ${failed.map((f) => f.client).join(', ')}.`
  return line
}
