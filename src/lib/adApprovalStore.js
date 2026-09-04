import { supabase } from './supabaseClient'
import { approvalUrl } from './adApproval'

/**
 * Reading and writing approval links. Everything that touches the network,
 * kept out of adApproval.js so the rules there stay checkable.
 */

/** Creates a link for the chosen images and returns it, ready to send. */
export async function createApprovalLink({ clientId, paths, note }) {
  if (!paths?.length) throw new Error('Pick at least one ad first.')

  const { data, error } = await supabase
    .from('ad_approvals')
    .insert({ client_id: clientId, paths, note: note?.trim() || null })
    .select('token')
    .single()
  if (error) throw error

  return { token: data.token, url: approvalUrl(window.location.origin, data.token) }
}

/** The links already sent for this client, newest first, with their answers. */
export async function fetchApprovalLinks(clientId) {
  const { data, error } = await supabase
    .from('ad_approvals')
    .select('token, paths, note, created_at, opened_at, view_count')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw error

  const tokens = (data || []).map((r) => r.token)
  if (tokens.length === 0) return []

  const { data: decisions } = await supabase
    .from('ad_approval_decisions')
    .select('token, storage_path, decision, comment')
    .in('token', tokens)

  const byToken = {}
  for (const d of decisions || []) (byToken[d.token] ||= []).push(d)

  return (data || []).map((row) => ({
    ...row,
    url: approvalUrl(window.location.origin, row.token),
    // One entry per image in the link, whether or not it has been answered,
    // so "2 of 4 waiting" is countable.
    items: row.paths.map((path) => {
      const found = (byToken[row.token] || []).find((d) => d.storage_path === path)
      return { storage_path: path, decision: found?.decision || '', comment: found?.comment || '' }
    }),
  }))
}

/**
 * What the owner's browser loads. Goes through the RPC, not the tables, so a
 * token buys exactly one approval and no read access to anything else — the
 * same shape as the onboarding link.
 */
export async function loadApproval(token) {
  const { data, error } = await supabase.rpc('ad_approval_load', { p_token: token })
  if (error) throw error
  return data
}

export async function decideApproval({ token, storagePath, decision, comment }) {
  const { error } = await supabase.rpc('ad_approval_decide', {
    p_token: token,
    p_path: storagePath,
    p_decision: decision,
    p_comment: comment || null,
  })
  if (error) throw error
}
