// The help chat, server side.
//
// The sticky button at the bottom right of every CRM page. The browser posts
// the system prompt (the role plus the in-app guide, built by
// src/lib/helpBrief.js), where the person is (a context block), the tools the
// page in front of them offers, and either a message or the results of the
// tools the last reply asked for. This function keeps the conversation, calls
// Claude once per request, stores both turns and hands the reply back.
//
// The tools are CLIENT-SIDE: they run in the browser (open a page, tick a
// creative, set a budget, press Publish), so this function never runs one.
// It returns the tool_use blocks, the browser runs them and posts the results
// as the next turn. A tool call that never got its result (the tab was
// closed) is closed out here with an error result before the next message,
// because the API rejects a history with an unanswered tool_use.
//
// Secrets: ANTHROPIC_API_KEY, the same one client-chat uses.

import Anthropic from 'npm:@anthropic-ai/sdk'

const MODEL = 'claude-opus-5'
// Help answers are short and tool inputs are small.
const MAX_TOKENS = 4000
const MAX_TOOLS = 40

type Tool = { name: string; description: string; input_schema: Record<string, unknown> }
type Block = { type: string; id?: string; name?: string; input?: unknown; text?: string; tool_use_id?: string }

type Incoming = {
  chat_id?: string
  system: string
  tools?: Tool[]
  message?: string
  context?: string
  results?: { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }[]
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  })
}

const NAME = /^[a-z][a-z0-9_]{0,63}$/

function cleanTools(raw: unknown): Tool[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: Tool[] = []
  for (const t of raw.slice(0, MAX_TOOLS)) {
    if (!t || typeof t !== 'object') continue
    const name = String((t as Tool).name || '')
    if (!NAME.test(name) || seen.has(name)) continue
    seen.add(name)
    const schema = (t as Tool).input_schema
    out.push({
      name,
      description: String((t as Tool).description || '').slice(0, 1500),
      input_schema: schema && typeof schema === 'object' ? schema : { type: 'object', properties: {} },
    })
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return json({ error: 'ANTHROPIC_API_KEY is not set on this project. Add it under Project Settings > Edge Functions > Secrets.' }, 500)
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }

  let body: Incoming
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body' }, 400)
  }

  const text = String(body.message || '').trim()
  const results = Array.isArray(body.results) ? body.results.filter((r) => r && r.type === 'tool_result' && r.tool_use_id) : []
  if (!text && results.length === 0) return json({ error: 'A message or tool results are required' }, 400)
  if (!body.system) return json({ error: 'system is required' }, 400)

  // The chat: the one named, if it still exists, else a new one.
  let chatId = body.chat_id || ''
  if (chatId) {
    const check = await fetch(`${supabaseUrl}/rest/v1/help_chats?id=eq.${chatId}&select=id`, { headers })
    const rows = await check.json()
    if (!Array.isArray(rows) || rows.length === 0) chatId = ''
  }
  if (!chatId) {
    const created = await fetch(`${supabaseUrl}/rest/v1/help_chats`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ title: text.slice(0, 80) || 'Help' }),
    })
    const made = await created.json()
    if (!created.ok) return json({ error: 'Could not start a chat', detail: made }, 500)
    chatId = made[0].id
  }

  const historyRes = await fetch(`${supabaseUrl}/rest/v1/help_messages?chat_id=eq.${chatId}&order=created_at.asc&select=role,content`, { headers })
  const history = await historyRes.json()
  if (!historyRes.ok) return json({ error: 'Could not read history', detail: history }, 500)

  const messages: { role: string; content: unknown }[] = (history || []).map((m: { role: string; content: unknown }) => ({ role: m.role, content: m.content }))
  const newRows: { chat_id: string; role: string; content: unknown }[] = []

  // The last reply's tool calls, if any, must be answered before anything
  // else is said. Results that arrived answer them; a plain message means the
  // page was left before they ran, and they are closed out as errors.
  const last = messages[messages.length - 1]
  const open = last && last.role === 'assistant' && Array.isArray(last.content) ? (last.content as Block[]).filter((b) => b.type === 'tool_use') : []
  const answered = new Set(results.map((r) => r.tool_use_id))
  const closing = open
    .filter((b) => !answered.has(b.id!))
    .map((b) => ({ type: 'tool_result', tool_use_id: b.id, content: 'Not run: the page was left before this could run.', is_error: true }))
  // Results for calls that are not open are dropped: the API would reject them.
  const openIds = new Set(open.map((b) => b.id))
  const kept = results.filter((r) => openIds.has(r.tool_use_id)).map((r) => ({ type: 'tool_result', tool_use_id: r.tool_use_id, content: String(r.content || '').slice(0, 30000), ...(r.is_error ? { is_error: true } : {}) }))

  const userContent: unknown[] = []
  if (kept.length || closing.length) {
    // Tool results must be the first blocks of the user turn.
    userContent.push(...kept, ...closing)
  }
  if (text) {
    if (body.context) userContent.push({ type: 'text', text: String(body.context).slice(0, 12000) })
    userContent.push({ type: 'text', text })
  } else if (body.context && kept.length) {
    // Fresh page context after the tools ran, so the next step sees it.
    userContent.push({ type: 'text', text: String(body.context).slice(0, 12000) })
  }
  messages.push({ role: 'user', content: userContent })
  newRows.push({ chat_id: chatId, role: 'user', content: userContent })

  const tools = cleanTools(body.tools)
  const client = new Anthropic({ apiKey })
  try {
    const request: Record<string, unknown> = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: String(body.system), cache_control: { type: 'ephemeral' } }],
      messages,
    }
    if (tools.length) request.tools = tools
    const stream = client.messages.stream(request as never)
    const reply = await stream.finalMessage()
    newRows.push({ chat_id: chatId, role: 'assistant', content: reply.content })

    await fetch(`${supabaseUrl}/rest/v1/help_messages`, { method: 'POST', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(newRows) })
    await fetch(`${supabaseUrl}/rest/v1/help_chats?id=eq.${chatId}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify({ updated_at: new Date().toISOString() }) })

    return json({
      chat_id: chatId,
      content: reply.content,
      stop_reason: reply.stop_reason,
      usage: { input: reply.usage?.input_tokens, output: reply.usage?.output_tokens, cache_read: reply.usage?.cache_read_input_tokens },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ error: message }, 500)
  }
})
