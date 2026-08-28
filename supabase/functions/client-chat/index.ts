// Per-client chat, server side.
//
// The browser never sees the Anthropic key. It posts the assembled client brief
// (built from live CRM data by src/lib/clientBrief.js) plus the new message;
// this function loads the conversation so far, calls Claude, stores both turns
// and hands back the reply.
//
// Secrets: ANTHROPIC_API_KEY must be set under Project Settings > Edge Functions.
//
// Meta tool use: with META_ACCESS_TOKEN set, the chat can read and change a
// client's live ad account through the meta-manage and meta-publish functions.
// Without it the chat still works, it just cannot touch the ad account.
//
// This used to try Meta's hosted MCP server instead, and that never worked:
// the server expects an interactive OAuth browser login and rejects the System
// User token an Edge Function can send (see docs/meta-connection.md). The Graph
// API behind those two functions is the same engine Ads Manager drives and it
// already works, so the tools call those rather than a third party.
//
// client_id is NOT a tool parameter. It is fixed to the client whose chat this
// is and injected server-side, so no amount of conversation can point a tool at
// a different client's ad account.

import Anthropic from 'npm:@anthropic-ai/sdk'

const MODEL = 'claude-opus-5'

// Long enough for 5-6 creative sets with copy and design briefs. Streaming is
// used regardless so a slow generation cannot hit the HTTP timeout.
const MAX_TOKENS = 16000

// How many times Claude may call tools and come back within one message. Six
// covers "look at the account, change three things, confirm" comfortably; a
// model stuck retrying a failing write stops here instead of spending.
const MAX_TOOL_TURNS = 6

// Which Edge Function and action each tool maps to. A table rather than a
// switch so the tool list and the routing cannot drift apart.
const TOOL_ROUTES: Record<string, { fn: string; action: string }> = {
  meta_overview: { fn: 'meta-manage', action: 'overview' },
  meta_insights: { fn: 'meta-manage', action: 'insights' },
  meta_update: { fn: 'meta-manage', action: 'update' },
  meta_create_campaign: { fn: 'meta-manage', action: 'create_campaign' },
  meta_create_adset: { fn: 'meta-manage', action: 'create_adset' },
  meta_duplicate_ad: { fn: 'meta-manage', action: 'duplicate_ad' },
  meta_search_locations: { fn: 'meta-publish', action: 'search_locations' },
}

// Note what is absent: client_id (fixed server-side) and anything that deletes.
// Meta's delete is effectively irreversible, and pausing does everything anyone
// actually means by "turn it off" while staying undoable.
const TOOLS = [
  {
    name: 'meta_overview',
    description:
      'List every campaign, ad set and ad in this client\'s Meta ad account, with status and budget. Call this first when you need IDs — every other tool takes IDs from here.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'meta_insights',
    description:
      'Live performance from Meta (spend, impressions, clicks, actions). Fresher than the CRM, which only syncs daily. Omit object_id for the whole account.',
    input_schema: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['campaign', 'adset', 'ad'] },
        object_id: { type: 'string', description: 'Restrict to one object. Omit for the account.' },
        date_preset: {
          type: 'string',
          description: 'today, yesterday, last_7d, last_14d, last_30d, this_month, last_month',
        },
      },
      required: ['level'],
    },
  },
  {
    name: 'meta_update',
    description:
      'Change something that already exists: pause or activate it, rename it, or change its budget. Budgets are in CENTS. A campaign with its own budget (CBO) rejects budgets on its ad sets, and vice versa.',
    input_schema: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['campaign', 'adset', 'ad'] },
        object_id: { type: 'string' },
        status: { type: 'string', enum: ['ACTIVE', 'PAUSED'] },
        name: { type: 'string' },
        daily_budget_cents: { type: 'integer', description: 'Cents. 5000 = $50/day.' },
        lifetime_budget_cents: { type: 'integer' },
        bid_amount_cents: { type: 'integer' },
        start_time: { type: 'string', description: 'ISO 8601' },
        end_time: { type: 'string', description: 'ISO 8601' },
      },
      required: ['level', 'object_id'],
    },
  },
  {
    name: 'meta_create_campaign',
    description:
      'Create a campaign. Defaults to PAUSED — pass status ACTIVE only if the person explicitly asked for it to go live.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        objective: {
          type: 'string',
          description: 'OUTCOME_LEADS (default), OUTCOME_TRAFFIC, OUTCOME_SALES, OUTCOME_AWARENESS',
        },
        daily_budget_cents: {
          type: 'integer',
          description: 'Sets campaign budget optimisation. Omit to budget at the ad set instead.',
        },
        status: { type: 'string', enum: ['ACTIVE', 'PAUSED'] },
        special_ad_categories: {
          type: 'array',
          items: { type: 'string' },
          description: 'HOUSING, EMPLOYMENT, CREDIT, ISSUES_ELECTIONS_POLITICS. Usually empty.',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'meta_create_adset',
    description:
      'Create an ad set inside a campaign. Locations must be keys from meta_search_locations, not names. Defaults to PAUSED.',
    input_schema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string' },
        name: { type: 'string' },
        daily_budget_cents: { type: 'integer' },
        locations: {
          type: 'array',
          description: 'From meta_search_locations. e.g. [{"type":"city","key":"2418779","radius":25}]',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['city', 'region', 'zip'] },
              key: { type: 'string' },
              radius: { type: 'integer', description: 'Miles, cities only, max 50.' },
            },
            required: ['type', 'key'],
          },
        },
        optimization_goal: { type: 'string', description: 'LEAD_GENERATION (default), OFFSITE_CONVERSIONS, LANDING_PAGE_VIEWS' },
        billing_event: { type: 'string' },
        age_min: { type: 'integer' },
        age_max: { type: 'integer' },
        promoted_page_id: { type: 'string', description: 'Required for instant-form lead ad sets.' },
        status: { type: 'string', enum: ['ACTIVE', 'PAUSED'] },
      },
      required: ['campaign_id', 'name', 'daily_budget_cents', 'locations'],
    },
  },
  {
    name: 'meta_duplicate_ad',
    description:
      'Copy an existing ad into another ad set, reusing its creative. This is the only way to make an ad here — a genuinely new creative needs an image, which is the Ad Studio\'s job.',
    input_schema: {
      type: 'object',
      properties: {
        ad_id: { type: 'string' },
        adset_id: { type: 'string', description: 'Where the copy goes.' },
        name: { type: 'string' },
        status: { type: 'string', enum: ['ACTIVE', 'PAUSED'] },
      },
      required: ['ad_id', 'adset_id'],
    },
  },
  {
    name: 'meta_search_locations',
    description:
      'Turn a place name into the targeting keys Meta will accept. Meta only targets keys it issued, so this is required before creating an ad set.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
]

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

  const metaReady = Boolean(Deno.env.get('META_ACCESS_TOKEN'))
  const client = new Anthropic({ apiKey })

  // Runs one tool by calling the Edge Function that owns it. A failure comes
  // back as a result rather than being thrown: Claude can read "budget must be
  // at least $1.00", fix the argument and retry, which a thrown 500 would not
  // allow it to do.
  const runTool = async (name: string, input: Record<string, unknown>) => {
    const route = TOOL_ROUTES[name]
    if (!route) return { error: `Unknown tool ${name}` }
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/${route.fn}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...input,
          action: route.action,
          // Fixed server-side, never a tool parameter. See the note at the top.
          client_id: body.client_id,
        }),
      })
      return await res.json()
    } catch (err) {
      return { error: String(err instanceof Error ? err.message : err) }
    }
  }

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

    if (metaReady) request.tools = TOOLS

    // The agentic loop. Claude asks for a tool, it runs, the result goes back,
    // and Claude decides what to do next -- which is what makes "pause the
    // losing ad set and move its budget to the winner" one instruction instead
    // of four separate ones.
    //
    // Bounded, because every iteration can be a real Meta write and a model
    // stuck retrying a failing call should give up rather than keep going.
    const newRows: { chat_id: string; role: string; content: unknown }[] = [
      { chat_id: chatId, role: 'user', content: userContent },
    ]
    let reply
    let usedTools = false

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      // Streamed server-side purely so a long generation cannot hit the request
      // timeout; the browser still gets one JSON response.
      request.messages = messages
      const stream = client.messages.stream(request as never)
      reply = await stream.finalMessage()

      messages.push({ role: 'assistant', content: reply.content })
      newRows.push({ chat_id: chatId, role: 'assistant', content: reply.content })

      if (reply.stop_reason !== 'tool_use') break

      const calls = (
        reply.content as { type: string; id: string; name: string; input: unknown }[]
      ).filter((b) => b.type === 'tool_use')

      // Every tool_use block from one assistant turn gets a result, and all of
      // them go back in a SINGLE user message. Splitting them across messages
      // quietly teaches the model to stop asking for tools in parallel.
      const results = await Promise.all(
        calls.map(async (call) => {
          usedTools = true
          const out = await runTool(call.name, (call.input || {}) as Record<string, unknown>)
          const failed = Boolean(out && typeof out === 'object' && 'error' in out)
          return {
            type: 'tool_result',
            tool_use_id: call.id,
            // Capped: an overview of a large account is long, and the history
            // is replayed on every later turn.
            content: JSON.stringify(out).slice(0, 60000),
            ...(failed ? { is_error: true } : {}),
          }
        })
      )

      messages.push({ role: 'user', content: results })
      newRows.push({ chat_id: chatId, role: 'user', content: results })
    }

    // Running out of turns mid-tool-call would otherwise store an assistant
    // message whose tool_use blocks have no answer, and the API rejects that
    // history on the NEXT message ("tool_use ids were found without
    // tool_result blocks") -- breaking the conversation permanently rather
    // than just cutting this answer short. Close them out instead.
    if (reply!.stop_reason === 'tool_use') {
      const unanswered = (reply!.content as { type: string; id: string }[])
        .filter((b) => b.type === 'tool_use')
        .map((call) => ({
          type: 'tool_result',
          tool_use_id: call.id,
          content: `Stopped after ${MAX_TOOL_TURNS} rounds of tool calls without finishing. Nothing further was run. Ask again to continue.`,
          is_error: true,
        }))
      newRows.push({ chat_id: chatId, role: 'user', content: unanswered })
    }

    // Store the full content blocks, not just text. Tool calls and results have
    // to be replayed to the API verbatim on the next turn.
    const rows = newRows

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
      content: reply!.content,
      stop_reason: reply!.stop_reason,
      usage: {
        input: reply!.usage?.input_tokens,
        output: reply!.usage?.output_tokens,
        cache_read: reply!.usage?.cache_read_input_tokens,
        cache_write: reply!.usage?.cache_creation_input_tokens,
      },
      meta_tools: metaReady,
      used_tools: usedTools,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ error: message }, 500)
  }
})
