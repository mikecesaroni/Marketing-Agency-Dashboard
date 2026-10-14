import { supabase } from './supabaseClient'
import { readFunctionError } from './functionError'

const KEY = 'crm-help-chat'

export function rememberedHelpChat() {
  try {
    return localStorage.getItem(KEY) || ''
  } catch {
    return ''
  }
}

export function rememberHelpChat(id) {
  try {
    if (id) localStorage.setItem(KEY, id)
    else localStorage.removeItem(KEY)
  } catch {
    // Private mode: the chat just starts fresh next time.
  }
}

async function call(body) {
  const { data, error } = await supabase.functions.invoke('crm-help', { body })
  if (error) {
    const { status, detail } = await readFunctionError(error)
    if (!status || status === 404) {
      throw new Error('The help chat is not deployed yet. Deploy supabase/functions/crm-help and add ANTHROPIC_API_KEY to the Supabase secrets.')
    }
    throw new Error(detail || 'The help chat did not answer.')
  }
  if (data?.error) throw new Error(data.error)
  return data
}

/** One user turn: the message, where they are, and the tools on offer. */
export function sendHelpMessage({ chatId, system, message, context, tools }) {
  return call({ chat_id: chatId || undefined, system, message, context, tools })
}

/** The results of the tools the last reply asked for, plus fresh context. */
export function sendHelpToolResults({ chatId, system, results, context, tools }) {
  return call({ chat_id: chatId, system, results, context, tools })
}

/** The stored turns of a chat, oldest first, as content blocks. */
export async function fetchHelpHistory(chatId) {
  if (!chatId) return []
  const { data, error } = await supabase
    .from('help_messages')
    .select('role, content, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}
