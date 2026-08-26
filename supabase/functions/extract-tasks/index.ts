// Pulls to-do items out of a client's chat history.
//
// This is where Fireflies meeting summaries get pasted in and "remember
// this" asides get typed — the chat's message history is the closest thing
// this CRM has to a record of what was actually discussed. Nothing here
// changes that history; it only reads it and writes new rows to
// client_tasks, tagged source = 'chat' so an extracted task is never
// confused for one someone typed in by hand.
//
// Secrets: ANTHROPIC_API_KEY, same as client-chat.

import Anthropic from 'npm:@anthropic-ai/sdk'

const MODEL = 'claude-opus-5'
const MAX_TOKENS = 4000

type Incoming = { client_id: string }

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

// Same flattening client-chat's Bubble does — text and a one-line summary of
// any tool call, thinking and raw images dropped. A wall of tool-call JSON or
// a bare image URL would only waste context an extraction pass never needs.
function flatten(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((b: any) => {
      if (b?.type === 'text') return b.text
      if (b?.type === 'image') return '[screenshot attached]'
      if (b?.type === 'tool_use' || b?.type === 'mcp_tool_use') return `[used ${b.name || 'a tool'}]`
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return json(
      { error: 'ANTHROPIC_API_KEY is not set on this project. Add it under Project Settings > Edge Functions > Secrets.' },
      500
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  let body: Incoming
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body' }, 400)
  }
  if (!body.client_id) return json({ error: 'client_id is required' }, 400)

  const chatsRes = await fetch(
    `${supabaseUrl}/rest/v1/client_chats?client_id=eq.${body.client_id}&order=updated_at.desc&limit=1&select=id`,
    { headers }
  )
  const chats = await chatsRes.json()
  const chatId = chats?.[0]?.id
  if (!chatId) return json({ inserted: 0, tasks: [], note: 'No chat history yet for this client' })

  const [historyRes, existingRes] = await Promise.all([
    fetch(`${supabaseUrl}/rest/v1/chat_messages?chat_id=eq.${chatId}&order=created_at.asc&select=role,content`, {
      headers,
    }),
    fetch(`${supabaseUrl}/rest/v1/client_tasks?client_id=eq.${body.client_id}&select=task_name`, { headers }),
  ])
  const history = await historyRes.json()
  const existing = await existingRes.json()
  if (!historyRes.ok) return json({ error: 'Could not read chat history', detail: history }, 500)

  const transcript = (history || [])
    .map((m: { role: string; content: unknown }) => `${m.role === 'user' ? 'AGENCY' : 'ASSISTANT'}: ${flatten(m.content)}`)
    .filter((line: string) => line.split(': ')[1]?.trim())
    .join('\n\n')

  if (!transcript.trim()) return json({ inserted: 0, tasks: [], note: 'Chat history is empty' })

  const existingNames = (existing || []).map((t: { task_name: string }) => t.task_name)

  const system = `You read a marketing agency's chat log for one client. Mixed into it are pasted Fireflies meeting summaries and asides where the agency typed something like "remember this" — both are the source material.

Pull out concrete action items only: things that still need doing. Not things already finished, not general discussion, not background facts with no action attached.

Return ONLY a JSON array, nothing before or after it. Each item:
{"task": "short imperative sentence, under 80 characters", "notes": "one line of context - which meeting, who asked, or the line it came from", "due_date": "YYYY-MM-DD" or null}

Do not repeat any of these, they are already tracked:
${existingNames.length ? existingNames.map((n: string) => `- ${n}`).join('\n') : '(none yet)'}

If there is nothing new to extract, return [].`

  const client = new Anthropic({ apiKey })

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system,
      messages: [{ role: 'user', content: transcript }],
    })
    const reply = await stream.finalMessage()

    const text = reply.content.find((b) => b.type === 'text')?.text || ''
    const match = text.match(/\[[\s\S]*\]/)
    let items: Array<{ task: string; notes?: string; due_date?: string | null }> = []
    if (match) {
      try {
        items = JSON.parse(match[0])
      } catch {
        return json({ error: 'The model did not return valid JSON', raw: text }, 500)
      }
    }

    // Belt and suspenders on top of the prompt: an exact repeat of something
    // already tracked is dropped rather than trusted to the model every time.
    const existingLower = new Set(existingNames.map((n: string) => n.toLowerCase().trim()))
    const fresh = items.filter(
      (it) => it?.task && !existingLower.has(String(it.task).toLowerCase().trim())
    )

    if (fresh.length === 0) return json({ inserted: 0, tasks: [] })

    const rows = fresh.map((it) => ({
      client_id: body.client_id,
      task_name: String(it.task).slice(0, 200),
      source: 'chat',
      notes: it.notes ? String(it.notes).slice(0, 500) : null,
      date_completed: null,
    }))

    const insertRes = await fetch(`${supabaseUrl}/rest/v1/client_tasks`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(rows),
    })
    const inserted = await insertRes.json()
    if (!insertRes.ok) return json({ error: 'Could not save the extracted tasks', detail: inserted }, 500)

    return json({ inserted: inserted.length, tasks: inserted })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ error: message }, 500)
  }
})
