import { supabase } from './supabaseClient'

// The agency's memory: things worth remembering that no nightly query would
// recompute. "Paused this hook after a week, it fatigued"; "this $500-off
// static won for an HVAC client, replicate it"; a note typed by a teammate.
//
// Stored as ad_learnings rows of kind 'memory', which is the table the client
// chat and the Ad Studio copy assistant already read in full, so a note
// written here shapes the next ad brief with no other plumbing. The nightly
// rewrite of that table skips this kind (migration agency_memory).

export const MEMORY_KIND = 'memory'

/**
 * Remember one thing. scope 'client' pins it to a client (and the chat for
 * that client reads it); 'account' is agency-wide (every client's chat and
 * every Studio brief reads it). `headline` is the sentence the model will
 * see, so write it as a fact with the numbers in it.
 */
export async function rememberNote({ clientId = null, scope = clientId ? 'client' : 'account', headline, evidence = {}, source = 'team' }) {
  const text = String(headline || '').trim()
  if (!text) throw new Error('Nothing to remember.')
  const { data, error } = await supabase
    .from('ad_learnings')
    .insert({
      scope,
      client_id: scope === 'client' ? clientId : null,
      kind: MEMORY_KIND,
      sort_order: 90,
      headline: text.slice(0, 1200),
      evidence: { ...evidence, source, at: new Date().toISOString() },
      computed_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error) throw error
  return data
}

/** Best effort: a memory write must never fail the action it rides on. */
export function rememberQuietly(args) {
  return rememberNote(args).catch((err) => console.warn('memory not saved', err?.message || err))
}

/** Agency-wide memory plus this client's, newest first. */
export async function fetchMemory(clientId) {
  let q = supabase.from('ad_learnings').select('id, scope, client_id, headline, evidence, computed_at').eq('kind', MEMORY_KIND)
  q = clientId ? q.or(`scope.eq.account,client_id.eq.${clientId}`) : q.eq('scope', 'account')
  const { data, error } = await q.order('computed_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function forgetNote(id) {
  const { error } = await supabase.from('ad_learnings').delete().eq('id', id).eq('kind', MEMORY_KIND)
  if (error) throw error
}

/** The sentence written when an ad is paused from a Kill verdict. */
export function pausedNote({ clientName, industry, adName, reason, spend, leads, cpl }) {
  const money = (n) => (n == null ? null : `$${Math.round(n)}`)
  const numbers = [spend != null && `${money(spend)} spent`, leads != null && `${leads} lead${leads === 1 ? '' : 's'}`, cpl != null && `${money(cpl)}/lead`].filter(Boolean).join(', ')
  return `PAUSED for ${clientName}${industry ? ` (${industry})` : ''}: "${adName}"${numbers ? ` after ${numbers}` : ''}. Why: ${reason || 'Ad Doctor kill verdict'}. Do not rebuild this hook as-is; change the angle or the offer before it runs again.`
}

/** The sentence written when a Scale verdict is kept. */
export function winnerNote({ clientName, industry, adName, hook, spend, leads, cpl, medianCpl }) {
  const money = (n) => `$${Math.round(n)}`
  return `WINNER for ${clientName}${industry ? ` (${industry})` : ''}: "${adName}"${hook && hook !== adName ? `, hook "${hook}"` : ''}: ${money(cpl)}/lead on ${leads} leads (${money(spend)} spent, account median ${money(medianCpl)}). Replicate this angle for the same trade before inventing a new one.`
}

/** The sentence written when ads are published. */
export function publishedNote({ clientName, industry, hooks }) {
  const list = hooks.filter(Boolean).slice(0, 6)
  return `PUBLISHED for ${clientName}${industry ? ` (${industry})` : ''}: ${list.length} ad${list.length === 1 ? '' : 's'} on ${new Date().toISOString().slice(0, 10)}: ${list.map((h) => `"${h}"`).join('; ')}. Judge them after 1.5x the account CPL in spend, not before.`
}
