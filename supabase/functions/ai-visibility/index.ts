// AI search visibility scan.
//
// Answers one question: when somebody asks an AI assistant who to call, does
// this business get named — and if not, who does instead?
//
// The method is the one the AEO/GEO tools converged on. Write the prompts a
// real buyer would type, ask them cleanly, then record who got named and which
// sources got cited. Two details matter and are easy to get wrong:
//
//   * The buyer prompt never mentions the business. Asking "is Horizon HVAC
//     good?" guarantees a mention and measures nothing. The prompt has to be
//     the question a stranger would ask.
//   * Whether the business was named is decided in code, not by a model.
//     A model asked "were they mentioned?" will call a near-miss a hit, and
//     every number in the report rests on that boolean.
//
// SCOPE, STATED PLAINLY: this queries Claude with web search. That is one
// engine. Tools that quote ChatGPT and Perplexity numbers are querying those
// separately, and the overlap between engines is low — one 2026 audit found
// only ~11% of the domains ChatGPT cites are also cited by Perplexity. So this
// is a real, directional read of AI visibility, not a claim about every
// assistant. Adding OpenAI or Perplexity keys would make it a true multi-engine
// scan; the runPrompt() seam below is where they would slot in.
//
// Secrets: ANTHROPIC_API_KEY.
//
// Actions:
//   start  {business_name, website_url, location, industry, client_id?,
//           baseline_scan_id?}
//            -> creates the scan, audits the site, writes the prompt set
//   run    {scan_id}   -> works through a batch of pending prompts
//   finish {scan_id}   -> scores the scan and writes the findings
//
// RE-SCANS REUSE THE BASELINE'S PROMPTS. A second scan only proves a fix
// worked if it asks the same questions, and the prompt set is model-written —
// so left alone every scan asks something different and a score moving 30 -> 45
// could just mean the second set was easier. When an earlier complete scan of
// the same client and domain exists, `start` copies its prompts verbatim and
// records it as baseline_scan_id, which is what makes the before/after report
// a measurement. A first scan, a prospect, or a changed website writes a fresh
// set as before.

import Anthropic from 'npm:@anthropic-ai/sdk'

const MODEL = 'claude-opus-5'

// How many prompts one `run` call handles. Each is a live web search taking
// ten to twenty seconds, so a whole scan cannot fit in one invocation — the
// UI calls `run` repeatedly and shows progress. Five at a time keeps a batch
// comfortably inside the timeout while still finishing a scan in ~3 rounds.
const BATCH_SIZE = 5
const PROMPT_COUNT = 15

// The crawlers worth checking. A site can be perfectly optimised and still be
// invisible because its robots.txt quietly disallows these — which is the
// single most common finding, and the easiest fix in the whole report.
const AI_CRAWLERS = [
  { agent: 'GPTBot', who: 'ChatGPT' },
  { agent: 'OAI-SearchBot', who: 'ChatGPT search' },
  { agent: 'ClaudeBot', who: 'Claude' },
  { agent: 'PerplexityBot', who: 'Perplexity' },
  { agent: 'Google-Extended', who: 'Gemini / AI Overviews' },
]

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

// Citation matching is a host comparison. Comparing full URLs never matches,
// and comparing with the www intact matches half the time.
function hostOf(url: string): string {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname
      .toLowerCase()
      .replace(/^www\./, '')
  } catch {
    return ''
  }
}

/**
 * Name variants to look for in an answer.
 *
 * An assistant writes "Horizon", "Horizon HVAC" or "Horizon Heating & Cooling"
 * for the same business, so matching the full legal name only would score a
 * clear mention as a miss. The trade is the other way too — a one-word variant
 * like "Summit" is a common word, so single tokens are only used when they are
 * distinctive enough to be worth the false-positive risk.
 */
function nameVariants(businessName: string): string[] {
  const clean = businessName.trim()
  const variants = new Set<string>([clean.toLowerCase()])

  // Drop the trade suffix: "Horizon HVAC Inc" also appears as "Horizon HVAC".
  const withoutSuffix = clean.replace(/\b(inc|llc|ltd|co|corp|company)\.?$/i, '').trim()
  if (withoutSuffix) variants.add(withoutSuffix.toLowerCase())

  // The leading proper noun, when it is long enough not to be a stray word.
  // "Horizon" qualifies; "A1" does not.
  const first = withoutSuffix.split(/\s+/)[0]
  if (first && first.length >= 5 && !/^(the|a|an)$/i.test(first)) {
    variants.add(first.toLowerCase())
  }

  return [...variants]
}

function mentions(answer: string, variants: string[]): { hit: boolean; at: number } {
  const haystack = answer.toLowerCase()
  let earliest = -1
  for (const v of variants) {
    const at = haystack.indexOf(v)
    if (at !== -1 && (earliest === -1 || at < earliest)) earliest = at
  }
  return { hit: earliest !== -1, at: earliest }
}

/**
 * The earlier scan a new one should be measured against.
 *
 * An explicit id wins, so a report can be re-run against a specific point in
 * time. Otherwise it is the most recent COMPLETE scan for the same client and
 * the same domain — complete because a failed or half-finished scan has no
 * prompt set worth copying, and same-domain because a client who changed
 * website is a different business as far as these questions go.
 *
 * Returns null for a first scan, a prospect, or a changed website, and the
 * caller then writes a fresh prompt set as before.
 */
async function findBaseline(
  db: { select: (path: string) => Promise<any[]> },
  { explicitId, clientId, domain }: { explicitId?: string; clientId?: string; domain: string }
) {
  if (explicitId) {
    const [row] = await db.select(
      `ai_scans?id=eq.${encodeURIComponent(String(explicitId))}&select=id,domain,status&limit=1`
    )
    return row && row.status === 'complete' ? row : null
  }

  if (!clientId) return null

  const rows = await db.select(
    `ai_scans?client_id=eq.${encodeURIComponent(String(clientId))}` +
      `&domain=eq.${encodeURIComponent(domain)}` +
      `&status=eq.complete&select=id,domain,created_at&order=created_at.desc&limit=1`
  )
  return rows[0] || null
}

/**
 * Reads robots.txt and the homepage to see what an AI crawler would find.
 *
 * Deliberately separate from the prompt runs: this half of the report is
 * concrete and fixable today, while visibility itself takes weeks to move.
 * It is also the half that survives a scan where every prompt misses.
 */
async function auditSite(url: string) {
  const base = url.startsWith('http') ? url : `https://${url}`
  const audit: Record<string, unknown> = {}

  // robots.txt — who is allowed in.
  try {
    const res = await fetch(new URL('/robots.txt', base).toString(), {
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) {
      const text = await res.text()
      audit.robots_found = true

      const blocked: string[] = []
      for (const { agent, who } of AI_CRAWLERS) {
        // Find this agent's block and look for a bare "Disallow: /" inside it.
        const section = new RegExp(
          `user-agent:\\s*${agent}\\b([\\s\\S]*?)(?=\\nuser-agent:|$)`,
          'i'
        ).exec(text)
        if (section && /disallow:\s*\/\s*$/im.test(section[1])) blocked.push(who)
      }

      // A blanket "User-agent: *  Disallow: /" locks everyone out, including
      // crawlers that were never named.
      const wildcard = /user-agent:\s*\*([\s\S]*?)(?=\nuser-agent:|$)/i.exec(text)
      audit.blocks_everything = Boolean(wildcard && /disallow:\s*\/\s*$/im.test(wildcard[1]))
      audit.blocked_crawlers = blocked
    } else {
      // No robots.txt is permissive, not broken — everything is allowed.
      audit.robots_found = false
      audit.blocked_crawlers = []
    }
  } catch {
    audit.robots_error = true
  }

  // llms.txt — the emerging convention for telling an assistant what a site is
  // about. Absence is normal and not a fault; presence is a real edge.
  try {
    const res = await fetch(new URL('/llms.txt', base).toString(), {
      signal: AbortSignal.timeout(8000),
    })
    audit.llms_txt = res.ok
  } catch {
    audit.llms_txt = false
  }

  // The homepage itself: does it say what the business does, where, and is any
  // of it machine-readable?
  try {
    const res = await fetch(base, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AgencyCRM-AI-Audit/1.0)' },
      signal: AbortSignal.timeout(15000),
    })
    audit.reachable = res.ok
    if (res.ok) {
      const html = await res.text()

      audit.title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim().slice(0, 200) || ''
      audit.meta_description =
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i
          .exec(html)?.[1]
          ?.trim()
          .slice(0, 300) || ''
      audit.h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]?.replace(/<[^>]+>/g, '').trim().slice(0, 200) || ''

      // Structured data is how an assistant learns the phone number and service
      // area without guessing from prose.
      const schemaBlocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
      const types = new Set<string>()
      for (const block of schemaBlocks) {
        try {
          const parsed = JSON.parse(block[1])
          for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
            const t = node?.['@type']
            for (const one of Array.isArray(t) ? t : [t]) if (one) types.add(String(one))
          }
        } catch {
          // Malformed JSON-LD is itself worth knowing about, but it is not
          // worth failing the audit over.
        }
      }
      audit.schema_types = [...types]
      audit.has_local_business = [...types].some((t) => /LocalBusiness|Organization|.*Business/i.test(t))
      audit.has_faq = [...types].some((t) => /FAQPage|Question/i.test(t))
    }
  } catch {
    audit.reachable = false
  }

  return audit
}

// ---------------------------------------------------------------------------

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
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  const db = {
    async select(path: string) {
      const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: dbHeaders })
      return res.ok ? await res.json() : []
    },
    async insert(table: string, rows: unknown, returning = true) {
      const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
        method: 'POST',
        headers: { ...dbHeaders, Prefer: returning ? 'return=representation' : 'return=minimal' },
        body: JSON.stringify(rows),
      })
      if (!res.ok) throw new Error(`Insert into ${table} failed: ${await res.text()}`)
      return returning ? await res.json() : null
    },
    async patch(path: string, body: unknown) {
      await fetch(`${supabaseUrl}/rest/v1/${path}`, {
        method: 'PATCH',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(body),
      })
    },
  }

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }

  const client = new Anthropic({ apiKey })
  const action = body.action || 'start'

  try {
    // -----------------------------------------------------------------------
    // START — audit the site and write the prompt set.
    // -----------------------------------------------------------------------
    if (action === 'start') {
      const websiteUrl = String(body.website_url || '').trim()
      if (!websiteUrl) return json({ error: 'A website URL is required.' }, 400)

      const domain = hostOf(websiteUrl)
      if (!domain) return json({ error: `"${websiteUrl}" is not a URL I can read.` }, 400)

      const businessName = String(body.business_name || '').trim() || domain
      const location = String(body.location || '').trim()
      const industry = String(body.industry || '').trim()

      // A re-scan is only evidence if it asks the same questions. Left to
      // itself the model writes a fresh prompt set every time, so a score
      // moving 30 -> 45 could just mean the second set was easier. When an
      // earlier complete scan of this same business exists, its prompts are
      // reused verbatim and the two become genuinely comparable.
      //
      // Matched on the domain rather than the client alone: a client whose
      // website changed is, for these purposes, a different business, and the
      // old questions were written about the old site.
      const baseline = await findBaseline(db, {
        explicitId: body.baseline_scan_id,
        clientId: body.client_id,
        domain,
      })

      const [scan] = await db.insert('ai_scans', {
        client_id: body.client_id || null,
        business_name: businessName,
        website_url: websiteUrl,
        domain,
        location: location || null,
        industry: industry || null,
        status: 'building',
        baseline_scan_id: baseline?.id || null,
      })

      // The site audit doubles as context for prompt writing: the homepage
      // title and H1 say what this business actually sells, which beats
      // guessing from the domain.
      const crawlerAudit = await auditSite(websiteUrl)

      // The whole point of a baseline: same questions, so the difference is
      // the business changing rather than the questions changing. It also
      // skips the prompt-writing model call entirely.
      if (baseline) {
        const previous = await db.select(
          `ai_scan_prompts?scan_id=eq.${encodeURIComponent(baseline.id)}` +
            `&select=prompt,category&order=created_at.asc`
        )

        if (previous.length > 0) {
          await db.insert(
            'ai_scan_prompts',
            previous.map((p: any) => ({
              scan_id: scan.id,
              prompt: p.prompt,
              category: p.category,
            })),
            false
          )
          await db.patch(`ai_scans?id=eq.${scan.id}`, {
            status: 'running',
            crawler_audit: crawlerAudit,
          })
          return json({
            scan_id: scan.id,
            total: previous.length,
            crawler_audit: crawlerAudit,
            baseline_scan_id: baseline.id,
            reused_prompts: true,
          })
        }
        // A baseline with no prompts is not a baseline. Fall through and write
        // a fresh set rather than running a scan with nothing to ask.
        await db.patch(`ai_scans?id=eq.${scan.id}`, { baseline_scan_id: null })
      }

      // Prompts a real buyer would type. The business is never named — a
      // prompt that names them measures nothing.
      const promptGen = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        thinking: { type: 'adaptive' },
        output_config: {
          effort: 'medium',
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                prompts: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      prompt: { type: 'string' },
                      category: { type: 'string', enum: ['unbranded', 'solution', 'comparison'] },
                    },
                    required: ['prompt', 'category'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['prompts'],
              additionalProperties: false,
            },
          },
        },
        system: `You write the questions real people type into AI assistants when they are about to hire a local service business.

Rules that matter:
- NEVER name the business being measured. These prompts test whether an assistant volunteers them unprompted. A prompt containing their name measures nothing.
- Write how people actually type: "who should I call", "is it worth repairing or replacing", "how much should", not marketing phrasing.
- Anchor to the location given. Local intent is the whole game for a service business.
- Mix three kinds:
  * unbranded — "best X in CITY", "who should I call for Y in CITY". These are the ones that cost real money when missed.
  * solution — someone describing a problem, not shopping yet: "my furnace is making a banging noise", "how much does X cost in CITY".
  * comparison — how a buyer narrows down: "cheapest vs most reliable X in CITY", "what should I look for when hiring X".

Return exactly ${PROMPT_COUNT} prompts, weighted toward unbranded.`,
        messages: [
          {
            role: 'user',
            content: `Business: ${businessName}
Website: ${websiteUrl}
Location: ${location || 'not given — infer from the site if you can, otherwise keep prompts national'}
Industry: ${industry || 'not given — infer from the site details below'}

What the homepage says:
Title: ${crawlerAudit.title || '(none)'}
H1: ${crawlerAudit.h1 || '(none)'}
Description: ${crawlerAudit.meta_description || '(none)'}

Write the ${PROMPT_COUNT} prompts.`,
          },
        ],
      })

      const parsed = JSON.parse(
        promptGen.content.find((b: any) => b.type === 'text')?.text || '{"prompts":[]}'
      )
      const prompts = (parsed.prompts || []).slice(0, PROMPT_COUNT)
      if (prompts.length === 0) {
        await db.patch(`ai_scans?id=eq.${scan.id}`, {
          status: 'failed',
          error: 'Could not write a prompt set for this business.',
        })
        return json({ error: 'Could not write a prompt set for this business.' }, 502)
      }

      await db.insert(
        'ai_scan_prompts',
        prompts.map((p: any) => ({
          scan_id: scan.id,
          prompt: String(p.prompt),
          category: ['unbranded', 'solution', 'comparison'].includes(p.category)
            ? p.category
            : 'unbranded',
        })),
        false
      )

      await db.patch(`ai_scans?id=eq.${scan.id}`, {
        status: 'running',
        crawler_audit: crawlerAudit,
      })

      return json({ scan_id: scan.id, total: prompts.length, crawler_audit: crawlerAudit })
    }

    const scanId = body.scan_id
    if (!scanId) return json({ error: 'scan_id is required.' }, 400)

    const [scan] = await db.select(`ai_scans?id=eq.${encodeURIComponent(scanId)}&select=*`)
    if (!scan) return json({ error: 'That scan was not found.' }, 404)

    // -----------------------------------------------------------------------
    // RUN — work through a batch of pending prompts.
    // -----------------------------------------------------------------------
    if (action === 'run') {
      const pending = await db.select(
        `ai_scan_prompts?scan_id=eq.${scanId}&status=eq.pending&select=id,prompt&limit=${BATCH_SIZE}`
      )

      const variants = nameVariants(scan.business_name)

      await Promise.all(
        pending.map(async (row: { id: string; prompt: string }) => {
          try {
            // The buyer's question, asked clean. Web search on, so this is
            // what an assistant would actually answer today rather than what
            // it remembers from training.
            const answer = await client.messages.create({
              model: MODEL,
              max_tokens: 4000,
              thinking: { type: 'adaptive' },
              output_config: { effort: 'low' },
              tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }],
              messages: [{ role: 'user', content: row.prompt }],
            })

            const text = answer.content
              .filter((b: any) => b.type === 'text')
              .map((b: any) => b.text)
              .join('\n')

            // Citations, so the report can say which sources the assistant
            // trusted — that list is the outreach plan.
            const sources: { url: string; title: string }[] = []
            for (const block of answer.content as any[]) {
              if (block.type !== 'web_search_tool_result') continue
              // An error comes back as a single object rather than a list, so
              // this has to be checked before iterating.
              if (!Array.isArray(block.content)) continue
              for (const r of block.content) {
                if (r?.url) sources.push({ url: r.url, title: r.title || '' })
              }
            }

            const { hit, at } = mentions(text, variants)
            const cited = sources.some((s) => hostOf(s.url) === scan.domain)

            await db.patch(`ai_scan_prompts?id=eq.${row.id}`, {
              status: 'done',
              mentioned: hit,
              cited,
              position_pct: hit && text.length ? Math.round((at / text.length) * 100) : null,
              answer: text.slice(0, 8000),
              sources,
            })
          } catch (err) {
            await db.patch(`ai_scan_prompts?id=eq.${row.id}`, {
              status: 'failed',
              error: String(err instanceof Error ? err.message : err),
            })
          }
        })
      )

      // Counted by fetching ids rather than a PostgREST aggregate: the
      // aggregate syntax differs between PostgREST versions, and a prompt set
      // is fifteen rows, so there is nothing to optimise here.
      const stillPending = await db.select(
        `ai_scan_prompts?scan_id=eq.${scanId}&status=eq.pending&select=id`
      )

      return json({ processed: pending.length, remaining: stillPending.length })
    }

    // -----------------------------------------------------------------------
    // FINISH — score it, and work out what to actually do about it.
    // -----------------------------------------------------------------------
    if (action === 'finish') {
      const rows = await db.select(
        `ai_scan_prompts?scan_id=eq.${scanId}&status=eq.done&select=prompt,category,mentioned,cited,position_pct,answer,sources`
      )

      if (rows.length === 0) {
        await db.patch(`ai_scans?id=eq.${scanId}`, {
          status: 'failed',
          error: 'Every prompt failed — nothing to score.',
        })
        return json({ error: 'Every prompt failed, so there is nothing to score.' }, 502)
      }

      const mentionRate = rows.filter((r: any) => r.mentioned).length / rows.length
      const citationRate = rows.filter((r: any) => r.cited).length / rows.length

      // Being named is worth more than being cited, and being named early is
      // worth more than being named at all. A business named in half the
      // answers, usually near the top, should not score the same as one
      // scraped into the last line of a list.
      const positioned = rows.filter((r: any) => r.mentioned && r.position_pct !== null)
      const positionBonus =
        positioned.length > 0
          ? positioned.reduce((s: number, r: any) => s + (100 - r.position_pct), 0) /
            positioned.length /
            100
          : 0
      const score = Math.round(
        Math.min(100, mentionRate * 65 + citationRate * 20 + positionBonus * mentionRate * 15)
      )

      // One model pass over the whole answer set. The booleans above are
      // already decided in code; this reads the prose for the things code
      // cannot see — who keeps winning, and why.
      const digest = rows
        .map(
          (r: any, i: number) =>
            `[${i + 1}] (${r.category}${r.mentioned ? ', CLIENT NAMED' : ', client absent'}) ${r.prompt}\n${String(r.answer || '').slice(0, 1200)}`
        )
        .join('\n\n---\n\n')

      const analysis = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        thinking: { type: 'adaptive' },
        output_config: {
          effort: 'high',
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                competitors: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      appearances: { type: 'integer' },
                      why: { type: 'string' },
                    },
                    required: ['name', 'appearances', 'why'],
                    additionalProperties: false,
                  },
                },
                sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative', 'absent'] },
                sentiment_note: { type: 'string' },
                top_sources: { type: 'array', items: { type: 'string' } },
                recommendations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      detail: { type: 'string' },
                      effort: { type: 'string', enum: ['quick', 'medium', 'ongoing'] },
                      impact: { type: 'string', enum: ['high', 'medium', 'low'] },
                    },
                    required: ['title', 'detail', 'effort', 'impact'],
                    additionalProperties: false,
                  },
                },
                headline: { type: 'string' },
              },
              required: [
                'competitors',
                'sentiment',
                'sentiment_note',
                'top_sources',
                'recommendations',
                'headline',
              ],
              additionalProperties: false,
            },
          },
        },
        system: `You are reading the results of an AI visibility scan and writing the part a business owner will actually read.

Ground every claim in the answers given. Do not invent competitors or numbers.

- competitors: businesses named INSTEAD of the client, most frequent first, with a short why they keep winning. Only real names from the answers.
- sentiment: how the client is described where they appear. "absent" if they never appear.
- top_sources: the domains the assistant leaned on. These are where to get listed — the outreach plan.
- recommendations: concrete and specific to what the scan found. "Get more reviews" is useless; "the assistant cited Yelp in 8 of 15 answers and you have 3 reviews there" is a job. Order by impact.
- headline: one sentence an owner would feel. Direct, no hype, no exclamation marks.

Write plainly. This gets read by someone who runs a trade business, not a marketer.`,
        messages: [
          {
            role: 'user',
            content: `Business: ${scan.business_name} (${scan.domain})
Location: ${scan.location || 'not given'}
Named in ${Math.round(mentionRate * 100)}% of answers; site cited in ${Math.round(citationRate * 100)}%.

Site audit: ${JSON.stringify(scan.crawler_audit)}

The answers:

${digest}`,
          },
        ],
      })

      const findings = JSON.parse(
        analysis.content.find((b: any) => b.type === 'text')?.text || '{}'
      )

      await db.patch(`ai_scans?id=eq.${scanId}`, {
        status: 'complete',
        visibility_score: score,
        mention_rate: mentionRate,
        citation_rate: citationRate,
        findings,
        completed_at: new Date().toISOString(),
      })

      return json({ ok: true, visibility_score: score, findings })
    }

    return json({ error: `Unknown action "${action}".` }, 400)
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err)
    if (body.scan_id) {
      await db.patch(`ai_scans?id=eq.${body.scan_id}`, { status: 'failed', error: message })
    }
    return json({ error: message }, 500)
  }
})
