import { supabase } from './supabaseClient'

// Flattens Anthropic content blocks to what the chat bubble should show.
// Thinking blocks are dropped and tool calls are summarised rather than dumped:
// a wall of JSON in the transcript buries the actual answer.
export function renderBlocks(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map((b) => {
      if (b.type === 'text') return b.text
      if (b.type === 'tool_use' || b.type === 'mcp_tool_use') {
        return `→ used ${b.name || 'a tool'}`
      }
      return ''
    })
    .filter(Boolean)
    .join('\n\n')
}

// Pulls the creative_sets JSON the brief asks for out of a reply, so the copy
// can be read structurally later instead of re-keyed. Returns null when the
// reply has no JSON block, which is the normal case for ordinary chat turns.
export function extractCreativeSets(text) {
  const match = text.match(/```json\s*([\s\S]*?)```/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1])
    return Array.isArray(parsed?.creative_sets) ? parsed.creative_sets : null
  } catch {
    // A malformed block is worth ignoring rather than throwing — the prose
    // copy above it is still perfectly usable.
    return null
  }
}

export async function fetchChatHistory(clientId) {
  const { data: chats } = await supabase
    .from('client_chats')
    .select('id')
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false })
    .limit(1)

  const chatId = chats?.[0]?.id
  if (!chatId) return { chatId: null, messages: [] }

  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return { chatId, messages: data || [] }
}

export async function sendChatMessage({ clientId, chatId, system, message }) {
  const { data, error } = await supabase.functions.invoke('client-chat', {
    body: { client_id: clientId, chat_id: chatId, system, message },
  })

  if (error) {
    // A 404 here means the function was never deployed, which is a different
    // problem from the model refusing or the key being missing.
    const detail = data?.error || error.message || ''
    if (/not found|404/i.test(detail)) {
      throw new Error(
        'The client-chat function is not deployed yet. Deploy supabase/functions/client-chat.'
      )
    }
    throw new Error(detail || 'Chat request failed')
  }

  if (data?.error) throw new Error(data.error)
  return data
}

export async function clearChat(clientId) {
  const { data: chats } = await supabase
    .from('client_chats')
    .select('id')
    .eq('client_id', clientId)

  for (const c of chats || []) {
    await supabase.from('client_chats').delete().eq('id', c.id)
  }
}
