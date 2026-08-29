// Pulls to-do items out of a client's chat history.
//
// This is where Fireflies meeting summaries get pasted in and "remember
// this" asides get typed — the chat's message history is the closest thing
// this CRM has to a record of what was actually discussed. Nothing here
// changes that history; it only reads it and writes new rows to
// client_tasks, tagged source = 'chat' so an extracted task is never
// confused for one someone typed in by hand.
//
// Two ways in, and the difference matters:
//
//   focus given   — one message triggered this: a call summary pasted in, or
//                   somebody asking outright for a task. Only that message is
//                   read. This is the common case and the cheap one.
//   no focus      — the button on the client page. Sweeps the whole history,
//                   because a person asked for a sweep.
//
// It used to run after every chat turn over the entire transcript, which is
// how the task list filled with things nobody committed to: asking the chat to
// rewrite a hook is not an action item, but read as one it looks exactly like
// one. The trigger now lives in the UI (see taskTrigger in clientTasks.js) and
// the prompt below is deliberately hard to please.
//
// Secrets: ANTHROPIC_API_KEY, same as client-chat.

import Anthropic from 'npm:@anthropic-ai/sdk'

const MODEL = 'claude-opus-5'
const MAX_TOKENS = 4000

// Nothing useful comes from a pass that returns nine tasks. Past about four,
// what is being returned is a breakdown of one job into steps, and steps
// belong in the notes rather than as rows somebody has to tick off one by one.
const MAX_PER_PASS = 4

type Incoming = { client_id: string; focus?: string; reason?: string }

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

// Reduces a task name to the words that carry its meaning, so two phrasings of
// the same job compare equal. Exact-string matching let "Send the new creative"
// and "Send new creatives to the client" both through, which is a large part of
// why the list grew the way it did.
const FILLER = new Set([
  'a', 'an', 'the', 'to', 'for', 'of', 'and', 'or', 'with', 'on', 'in', 'at', 'by',
  'from', 'this', 'that', 'their', 'them', 'they', 'it', 'its', 'we', 'our', 'us',
  'client', 'clients', 'please', 'need', 'needs', 'make', 'sure', 'get', 'do',
])

// Enough stemming to survive a plural, and no more. "Send the new creative"
// and "Send new creatives to the client" are one job, and without this they
// agreed on only two words out of three and both got written.
function singular(word: string): string {
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`
  if (word.endsWith('ss')) return word
  if (word.endsWith('s') && word.length > 3) return word.slice(0, -1)
  return word
}

function meaningWords(name: string): Set<string> {
  return new Set(
    String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !FILLER.has(w))
      .map(singular)
  )
}

// Two tasks are the same job if most of their meaningful words agree.
function sameJob(a: string, b: string): boolean {
  const left = meaningWords(a)
  const right = meaningWords(b)
  if (left.size === 0 || right.size === 0) return false

  let shared = 0
  for (const w of left) if (right.has(w)) shared++

  // Against the SMALLER set, so "Send creative" is caught by "Send the new
  // creative to Summit on Friday" rather than slipping through on length.
  return shared / Math.min(left.size, right.size) >= 0.7
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

  const focus = String(body.focus || '').trim()
  const reason = String(body.reason || '').trim()

  const existingRes = await fetch(
    `${supabaseUrl}/rest/v1/client_tasks?client_id=eq.${body.client_id}&select=task_name`,
    { headers }
  )
  const existing = await existingRes.json()
  const existingNames = (existing || []).map((t: { task_name: string }) => t.task_name)

  // What the model reads. One message when something triggered this, the whole
  // history when a person pressed the button.
  let source = focus
  if (!source) {
    const chatsRes = await fetch(
      `${supabaseUrl}/rest/v1/client_chats?client_id=eq.${body.client_id}&order=updated_at.desc&limit=1&select=id`,
      { headers }
    )
    const chats = await chatsRes.json()
    const chatId = chats?.[0]?.id
    if (!chatId) return json({ inserted: 0, tasks: [], note: 'No chat history yet for this client' })

    const historyRes = await fetch(
      `${supabaseUrl}/rest/v1/chat_messages?chat_id=eq.${chatId}&order=created_at.asc&select=role,content`,
      { headers }
    )
    const history = await historyRes.json()
    if (!historyRes.ok) return json({ error: 'Could not read chat history', detail: history }, 500)

    source = (history || [])
      .map(
        (m: { role: string; content: unknown }) =>
          `${m.role === 'user' ? 'AGENCY' : 'ASSISTANT'}: ${flatten(m.content)}`
      )
      .filter((line: string) => line.split(': ')[1]?.trim())
      .join('\n\n')
  }

  if (!source.trim()) return json({ inserted: 0, tasks: [], note: 'Nothing to read' })

  const framing =
    reason === 'request'
      ? 'The agency asked outright for a task to be made from this message. Take them at their word: usually that is exactly ONE task, the thing they named. Do not go looking for others around it.'
      : reason === 'summary'
        ? 'This is a call or meeting summary that was just pasted in. Pull the commitments out of it.'
        : 'This is the whole chat history for one client, swept because somebody pressed the button. Most of it is questions and thinking out loud, and none of that is a task.'

  const system = `You keep the task list for a marketing agency, for one client.

${framing}

The list is for things a person has to DO and would otherwise forget. It is not a record of what was discussed. It gets read every morning, so a list of nine small things is worse than useless — it stops being read at all.

Count as a task ONLY:
- a commitment somebody made, to the client or to each other
- something the client asked for that is not done yet
- a deadline or a promised deliverable

Never a task:
- a question the agency asked the assistant, however it was phrased. "Give me better hooks", "what budget should we use", "why did this fail" are somebody thinking, not committing.
- anything the assistant itself suggested or offered. A suggestion nobody accepted is not work.
- anything already done, or done during the conversation
- background about the business: what they sell, who their customers are, what they charge. That is context, not action.
- routine work that happens anyway and nobody needs reminding of

GROUP aggressively. Several steps toward one outcome are ONE task, with the steps in the notes. "Send the new creative", "get it approved" and "schedule it" are one task called "Get the new creative approved and scheduled". Prefer one real task over three fragments of it.

Return at most ${MAX_PER_PASS}. If more than that seems to be in there, you are splitting things too finely — group them, and keep only what genuinely matters. Returning nothing is a good and common answer.

Return ONLY a JSON array, nothing before or after it. Each item:
{"task": "short imperative sentence, under 80 characters", "notes": "the context: who asked, which call, and any sub-steps folded in", "due_date": "YYYY-MM-DD" or null}

Already on the list — do not return these again, and do not return a reworded version of one:
${existingNames.length ? existingNames.map((n: string) => `- ${n}`).join('\n') : '(none yet)'}

If there is nothing new that clears the bar above, return [].`

  const client = new Anthropic({ apiKey })

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system,
      messages: [{ role: 'user', content: source }],
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

    // Belt and suspenders on top of the prompt. The prompt asks for grouping
    // and no repeats; this enforces both, because a pass that ignores the
    // instruction is exactly the pass that floods the list.
    const kept: Array<{ task: string; notes?: string; due_date?: string | null }> = []
    for (const it of items) {
      if (!it?.task || typeof it.task !== 'string') continue
      if (existingNames.some((n: string) => sameJob(n, it.task))) continue
      if (kept.some((k) => sameJob(k.task, it.task))) continue
      kept.push(it)
      if (kept.length >= MAX_PER_PASS) break
    }

    if (kept.length === 0) return json({ inserted: 0, tasks: [] })

    const rows = kept.map((it) => ({
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
