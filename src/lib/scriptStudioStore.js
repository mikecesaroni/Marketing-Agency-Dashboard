import { supabase } from './supabaseClient'
import { readFunctionError } from './functionError'
import { publicLink } from './publicSite'

/**
 * The Video Script Studio, the network half. The client's page talks to
 * the script-studio Edge Function and nothing else: the token in the link
 * names the client, the function gathers the facts and holds the key. The
 * pure half (menus, picks, the brief, the parser) is shared with the
 * function in supabase/functions/_shared/scriptStudio.js.
 */
async function call(body) {
  const { data, error } = await supabase.functions.invoke('script-studio', { body })
  if (error) {
    const { status, detail } = await readFunctionError(error)
    if (status === 404 || /not found|404/i.test(detail)) {
      throw new Error('The script studio is not switched on yet. Your agency will sort it out.')
    }
    throw new Error(detail || 'Something went wrong. Try again in a moment.')
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export const loadStudio = (token) => call({ token, action: 'load' })
export const writeScript = (token, ask, playbook) => call({ token, action: 'write', ask, playbook })
export const reviseScript = (token, id, change, playbook, extra = '') => call({ token, action: 'revise', id, change, extra, playbook })
export const setScriptStatus = (token, id, status) => call({ token, action: 'status', id, status })
export const saveVoice = (token, voice) => call({ token, action: 'voice', voice })

/** The client's link, on the client-facing address when there is one. */
export const scriptsLink = (token) => publicLink(`/scripts/${token}`)

/** The topics written in the last `days`, so the picks move on. */
export function topicsUsedRecently(rows = [], days = 7, now = Date.now()) {
  const since = now - days * 86400000
  return [...new Set((rows || []).filter((r) => new Date(r.created_at).getTime() >= since).map((r) => r.ask?.topic).filter(Boolean))]
}

/** The client's scripts for the CRM card, newest first. */
export async function fetchClientScripts(clientId, limit = 30) {
  const { data, error } = await supabase
    .from('video_scripts')
    .select('id, created_at, made_by, ask, script, status, filmed_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}
