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

/**
 * Turns the function's per-client results into a line for the UI.
 *
 * Each client produces two independent results: the weekly KPI totals, and the
 * per-ad daily breakdown. They can fail separately, and conflating them was
 * actively misleading — an account whose spend and leads landed perfectly well
 * was still reported as "failed" because its ad-level query came back empty
 * handed. The two are now counted and worded separately.
 *
 * Meta's own error text is included rather than dropped. It names the field or
 * permission it objected to, which is the difference between a fix and a guess.
 */
export function summariseSync(data) {
  const results = data?.results || []
  if (results.length === 0) return 'Nothing to sync — no client has an ad account connected.'

  // The function tags per-ad failures with this prefix; anything else is the
  // account-level totals, which are what the CRM's KPIs actually run on.
  const isAdDetail = (r) => String(r.error || '').startsWith('ad detail:')

  const failed = results.filter((r) => r.error)
  const kpiFailed = failed.filter((r) => !isAdDetail(r))
  const adFailed = failed.filter(isAdDetail)
  const ok = results.filter((r) => !r.error)

  const spend = ok.reduce((sum, r) => sum + (r.spend || 0), 0)
  const leads = ok.reduce((sum, r) => sum + (r.leads || 0), 0)

  const weeks = data.weeks?.length ? ` across ${data.weeks.length} week(s)` : ''
  const parts = [
    `Synced ${data.synced ?? ok.length} row(s)${weeks} — $${spend.toFixed(2)}, ${leads} leads.`,
  ]

  // One message per distinct reason. Ten accounts failing for the same reason
  // is one problem, and listing it ten times buries that.
  const reasons = (list) => [...new Set(list.map((f) => f.error))].join(' | ')

  if (kpiFailed.length > 0) {
    parts.push(
      `${kpiFailed.length} account(s) failed: ${kpiFailed.map((f) => f.client).join(', ')} — ${reasons(kpiFailed)}`
    )
  }

  if (adFailed.length > 0) {
    parts.push(
      `Spend and leads are fine, but the per-ad breakdown failed for ${adFailed
        .map((f) => f.client)
        .join(', ')} — ${reasons(adFailed)}`
    )
  }

  return parts.join(' ')
}

/**
 * Re-reads the list of ad accounts Meta will let us see.
 *
 * The picker cannot ask Meta directly -- the browser holds no Meta credentials
 * -- so it reads a table that a scheduled job refreshes at 08:20. That is fine
 * until somebody grants access to a new account at two in the afternoon, when
 * the account exists, the token can see it, and the dropdown cannot offer it
 * until tomorrow. Plumbquick was exactly that: access granted, ad account
 * live, and nothing in the CRM to point at it.
 *
 * Same function the scheduled job runs, so there is one code path that decides
 * what we can see.
 */
export async function refreshAdAccounts() {
  const { data, error } = await supabase.functions.invoke('meta-account-health', { body: {} })

  if (error) {
    const { status, detail } = await readFunctionError(error)
    if (status === 404) {
      throw new Error(
        'The account-health function is not deployed yet. Deploy meta-account-health in Supabase, then try again.'
      )
    }
    throw new Error(detail || 'Could not reach Meta.')
  }

  if (data?.error) throw new Error(data.error)

  return { found: Number(data?.ad_accounts_cached) || 0 }
}
