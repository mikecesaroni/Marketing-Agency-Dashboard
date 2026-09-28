import { supabase } from './supabaseClient'
import { readFunctionError } from './functionError'

/**
 * Ask the Google sync function what is linked under the manager account and
 * how it pairs with clients. Dry by default: the client page shows the list
 * and a person picks; the nightly run is what saves the sure matches.
 */
export async function discoverGoogleAdsAccounts({ dryRun = true } = {}) {
  const { data, error } = await supabase.functions.invoke('google-daily-sync', {
    body: { discover: true, dry_run: dryRun },
  })
  if (error) {
    const { status, detail } = await readFunctionError(error)
    if (!status) throw new Error('Could not reach the Google sync function. Is google-daily-sync deployed?')
    throw new Error(detail || `The Google sync function answered ${status}.`)
  }
  if (data && data.ok === false) throw new Error(data.error || 'Discovery failed.')
  return data
}
