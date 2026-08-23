import { supabase } from './supabaseClient'

export async function fetchUnmappedAccounts() {
  const { data, error } = await supabase
    .from('meta_unmapped_accounts')
    .select('*')
    .eq('status', 'new')
    .order('spend_last_30d', { ascending: false })
  if (error) throw error
  return data || []
}

/**
 * Points a client at a discovered ad account.
 *
 * Writing meta_ad_account_id is what actually pulls the account into the daily
 * sync; the status flip is just bookkeeping so it stops showing up here.
 */
export async function mapAccountToClient(account, clientId) {
  const { error: clientErr } = await supabase
    .from('clients')
    .update({ meta_ad_account_id: account.ad_account_id })
    .eq('id', clientId)
  if (clientErr) throw clientErr

  const { error } = await supabase
    .from('meta_unmapped_accounts')
    .update({ status: 'mapped', mapped_client_id: clientId })
    .eq('ad_account_id', account.ad_account_id)
  if (error) throw error
}

// Ignored accounts stay ignored: the sync's upsert never writes status, so a
// dead account dismissed once does not come back tomorrow.
export async function ignoreAccount(adAccountId) {
  const { error } = await supabase
    .from('meta_unmapped_accounts')
    .update({ status: 'ignored' })
    .eq('ad_account_id', adAccountId)
  if (error) throw error
}

export async function unignoreAll() {
  const { error } = await supabase
    .from('meta_unmapped_accounts')
    .update({ status: 'new' })
    .eq('status', 'ignored')
  if (error) throw error
}
