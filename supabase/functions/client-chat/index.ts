// Per-client chat, server side.
//
// The browser never sees the Anthropic key. It posts the assembled client brief
// (built from live CRM data by src/lib/clientBrief.js) plus the new message;
// this function loads the conversation so far, calls Claude, stores both turns
// and hands back the reply.
//
// Secrets: ANTHROPIC_API_KEY must be set under Project Settings > Edge Functions.
//
// Optional, for Meta tool use: META_MCP_URL (+ META_MCP_TOKEN if the server
// needs one). With those set, Claude can call the Meta Ads MCP tools directly
// rather than us reimplementing the Graph API. Without them the chat still
// works, it just cannot touch the ad account.

import Anthropic from 'npm:@anthropic-ai/sdk'

const MODEL = 'claude-opus-5'

// Long enough for 5-6 creative sets with copy and design briefs. Streaming is
// used regardless so a slow generation cannot hit the HTTP timeout.
const MAX_TOKENS = 16000

type ChatImage = { url: string; media_type?: string }

type Incoming = {
  chat_id?: string
  client_id: string
  system: string
  message: string
  // Screenshots attached to this turn. URLs into the public client-files
  // bucket, which Anthropic fetches directly; nothing is sent as base64 so the
  // stored history stays cheap to replay on every later turn.
  images?: ChatImage[]
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return json(
      {
        error:
          'ANTHROPIC_API_KEY is not set on this project. Add it under Project Settings > Edge Functions > Secrets.',
      },
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

  const attached = (body.images || []).filter((i) => typeof i?.url === 'string' && i.url)
  const text = body.message?.trim() || ''

  // A screenshot on its own is a real question ("what is wrong here?"), so
  // either half is enough.
  if (!body.client_id || (!text && attached.length === 0)) {
    return json({ error: 'client_id and a message or an image are required' }, 400)
  }

  // One conversation per client unless a specific chat is named.
  let chatId = body.chat_id
  if (!chatId) {
    const existing = await fetch(
      `${supabaseUrl}/rest/v1/client_chats?client_id=eq.${body.client_id}&order=updated_at.desc&limit=1&select=id`,
      { headers }
    )
    const rows = await existing.json()
    chatId = rows?.[0]?.id

    if (!chatId) {
      const created = await fetch(`${supabaseUrl}/rest/v1/client_chats`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ client_id: body.client_id }),
      })
      const madeRows = await created.json()
      if (!created.ok) return json({ error: 'Could not start a chat', detail: madeRows }, 500)
      chatId = madeRows[0].id
    }
  }

  const historyRes = await fetch(
    `${supabaseUrl}/rest/v1/chat_messages?chat_id=eq.${chatId}&order=created_at.asc&select=role,content`,
    { headers }
  )
  const history = await historyRes.json()
  if (!historyRes.ok) return json({ error: 'Could not read history', detail: history }, 500)

  const messages = (history || []).map((m: { role: string; content: unknown }) => ({
    role: m.role,
    content: m.content,
  }))
  // Images go before the text. Claude reads the picture first and then the
  // question about it, which is the order that gets the better answer.
  const userContent: unknown[] = [
    ...attached.map((img) => ({ type: 'image', source: { type: 'url', url: img.url } })),
    ...(text ? [{ type: 'text', text }] : []),
  ]

  messages.push({ role: 'user', content: userContent })

  // Meta tools, only when the MCP server is configured. The connector needs
  // BOTH halves — the server entry and a matching mcp_toolset in tools — or the
  // request is rejected as a validation error.
  const mcpUrl = Deno.env.get('META_MCP_URL')
  const mcpToken = Deno.env.get('META_MCP_TOKEN')
  const useMcp = Boolean(mcpUrl)

  const client = new Anthropic({ apiKey })

  try {
    const request: Record<string, unknown> = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      // The brief is long and identical turn to turn, so cache it rather than
      // paying full input price on every message.
      system: [{ type: 'text', text: body.system, cache_control: { type: 'ephemeral' } }],
      messages,
    }

    if (useMcp) {
      request.betas = ['mcp-client-2025-11-20']
      request.mcp_servers = [
        {
          type: 'url',
          url: mcpUrl,
          name: 'meta_ads',
          ...(mcpToken ? { authorization_token: mcpToken } : {}),
        },
      ]
      request.tools = [{ type: 'mcp_toolset', mcp_server_name: 'meta_ads' }]
    }

    // Streamed server-side purely so a long generation cannot hit the request
    // timeout; the browser still gets one JSON response.
    const stream = useMcp
      ? client.beta.messages.stream(request as never)
      : client.messages.stream(request as never)
    const reply = await stream.finalMessage()

    // Store the full content blocks, not just text. Tool calls and results have
    // to be replayed to the API verbatim on the next turn.
    const rows = [
      { chat_id: chatId, role: 'user', content: userContent },
      { chat_id: chatId, role: 'assistant', content: reply.content },
    ]

    await fetch(`${supabaseUrl}/rest/v1/chat_messages`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify(rows),
    })

    await fetch(`${supabaseUrl}/rest/v1/client_chats?id=eq.${chatId}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ updated_at: new Date().toISOString() }),
    })

    return json({
      chat_id: chatId,
      content: reply.content,
      stop_reason: reply.stop_reason,
      usage: {
        input: reply.usage?.input_tokens,
        output: reply.usage?.output_tokens,
        cache_read: reply.usage?.cache_read_input_tokens,
        cache_write: reply.usage?.cache_creation_input_tokens,
      },
      meta_tools: useMcp,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ error: message }, 500)
  }
})
