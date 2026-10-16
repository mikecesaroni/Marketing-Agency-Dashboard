// The Video Script Studio, server side.
//
// A client opens /scripts/<token> (their dashboard token) and the page talks
// to this function and nothing else. The token names the client; everything
// the brief needs is gathered here with the service role (the intake, the
// website fact sheet, the ad results, the hooks already used, the
// transcripts of their own videos, how they say they talk) and the Anthropic
// key never leaves the server. The brief, the ask and the parsing live in
// ../_shared/scriptStudio.js, which the browser and the Node checks share.
//
// Deployed with verify_jwt = true; the browser calls it with the anon key.
// Nothing here can reach another client: every read is by the client id the
// token resolved to, and a script id has to belong to that client.
//
// Secrets: ANTHROPIC_API_KEY.
//
// Body:  { token, action: 'load' }
// Reply: { client, voice, working, has, phase_inputs, scripts, drive_url, limit_left }
//
// Body:  { token, action: 'write', ask, playbook }           -> { script: row }
// Body:  { token, action: 'revise', id, change, extra, playbook } -> { script: row }
// Body:  { token, action: 'status', id, status }             -> { script: row }
// Body:  { token, action: 'voice', voice }                   -> { voice }

import Anthropic from 'npm:@anthropic-ai/sdk'
import {
  CHANGES,
  DAILY_LIMIT,
  STATUSES,
  aggregateAds,
  buildScriptBrief,
  hookFromAdName,
  parseScript,
  reviseAsk,
  scriptAsk,
  workingLines,
} from '../_shared/scriptStudio.js'

const MODEL = 'claude-opus-5'
// One script is a few hundred words of JSON; this leaves room for thinking.
const MAX_TOKENS = 4000

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })
}

const pad = (n: number) => String(n).padStart(2, '0')
function isoDaysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

type Row = Record<string, unknown>

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }
  const get = async (path: string) => {
    const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers })
    const body = await res.json().catch(() => null)
    if (!res.ok) throw new Error(body?.message || body?.error || `The database returned ${res.status}`)
    return body as Row[]
  }

  let body: Record<string, any> = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body' }, 400)
  }
  const token = String(body.token || '').trim()
  if (token.length < 20) return json({ error: 'This link is not valid.' }, 400)
  const action = String(body.action || 'load')

  try {
    const clients = await get(
      `clients?select=id,name,industry,market,website_profile,drive_folder_id,voice_profile&archived=eq.false&dashboard_token=eq.${encodeURIComponent(token)}&limit=1`
    )
    const client = clients[0]
    if (!client) return json({ error: 'This link is not valid.' }, 404)
    const cid = encodeURIComponent(String(client.id))

    // ------------------------------------------------------------- shared
    const intakeRows = await get(
      `onboarding_intake?select=business_name,owner_name,industry_trade,service_area,target_cities,years_in_business,services_offered,most_profitable_service,service_want_more,typical_price_range,jobs_to_avoid,why_people_choose,ideal_customer,most_common_objection,current_offers_guarantees,cta_offering,offer_headline,offer_fine_print,guarantee,financing_available,reviews_star_rating,reviews_count,licensed_insured_certified,phone_for_ads,booking_url,words_to_avoid,busy_season&client_id=eq.${cid}&limit=1`
    )
    const intake = intakeRows[0] || {}
    const industry = String(intake.industry_trade || client.industry || '')
    const market = String(intake.service_area || client.market || '')

    const [adRows, weekRows, scriptRows] = await Promise.all([
      get(`ad_daily?select=ad_id,ad_name,spend,leads&client_id=eq.${cid}&date=gte.${isoDaysAgo(89)}&limit=20000`),
      get(`weekly_reports?select=week_start,jobs_booked,revenue&client_id=eq.${cid}&status=in.(sent,ready)&order=week_start.desc&limit=8`),
      get(`video_scripts?select=id,parent_id,created_at,updated_at,made_by,ask,script,status,filmed_at&client_id=eq.${cid}&order=created_at.desc&limit=60`),
    ])
    const ads = aggregateAds(adRows as never[])
    const working = workingLines({ ads, weeks: weekRows as never[] })
    const reviews = intake.reviews_star_rating ? `${intake.reviews_star_rating} stars from ${intake.reviews_count || 'your'} reviews` : ''
    const has = {
      reviews,
      offer: Boolean(intake.cta_offering || intake.current_offers_guarantees || intake.offer_headline),
      phone: Boolean(intake.phone_for_ads),
      drive: Boolean(client.drive_folder_id),
    }
    const today = isoDaysAgo(0)
    const writtenToday = (scriptRows as Row[]).filter((r) => String(r.created_at || '').slice(0, 10) === today && r.made_by === 'client').length
    const limitLeft = Math.max(0, DAILY_LIMIT - writtenToday)
    const driveUrl = client.drive_folder_id ? `https://drive.google.com/drive/folders/${client.drive_folder_id}` : ''

    const voiceOf = (v: unknown) => (v && typeof v === 'object' ? (v as Row) : {})

    if (action === 'load') {
      return json({
        client: {
          name: String(intake.business_name || client.name || ''),
          owner: String(intake.owner_name || voiceOf(client.voice_profile).goes_by || ''),
          industry,
          market,
          towns: String(intake.target_cities || ''),
          phone: String(intake.phone_for_ads || ''),
        },
        voice: voiceOf(client.voice_profile),
        working,
        has,
        scripts: scriptRows,
        drive_url: driveUrl,
        limit_left: limitLeft,
      })
    }

    // ------------------------------------------------------------- status
    if (action === 'status') {
      const id = String(body.id || '')
      const status = String(body.status || '')
      if (!/^[0-9a-f-]{36}$/i.test(id) || !STATUSES.includes(status)) return json({ error: 'id and a status are required.' }, 400)
      const patch: Row = { status, updated_at: new Date().toISOString() }
      if (status === 'filmed') patch.filmed_at = new Date().toISOString()
      const res = await fetch(`${supabaseUrl}/rest/v1/video_scripts?id=eq.${id}&client_id=eq.${cid}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify(patch),
      })
      const rows = await res.json()
      if (!res.ok || !rows?.[0]) return json({ error: 'That script is not on this page.' }, 404)
      return json({ script: rows[0] })
    }

    // -------------------------------------------------------------- voice
    if (action === 'voice') {
      const v = body.voice && typeof body.voice === 'object' ? body.voice : {}
      const clean = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n)
      const voice = {
        goes_by: clean(v.goes_by, 60),
        person: ['i', 'we'].includes(String(v.person)) ? String(v.person) : '',
        tone: ['straight', 'friendly', 'funny'].includes(String(v.tone)) ? String(v.tone) : '',
        avoid: clean(v.avoid, 300),
        sign_off: clean(v.sign_off, 120),
        notes: clean(v.notes, 600),
      }
      const res = await fetch(`${supabaseUrl}/rest/v1/clients?id=eq.${cid}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ voice_profile: voice }),
      })
      if (!res.ok) return json({ error: 'Could not save how you talk. Try again.' }, 500)
      return json({ voice })
    }

    // -------------------------------------------------------- write / revise
    if (action !== 'write' && action !== 'revise') return json({ error: `Unknown action ${action}` }, 400)

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return json({ error: 'The script writer is not switched on yet. Your agency will sort it.' }, 500)
    if (limitLeft <= 0) return json({ error: `That is ${DAILY_LIMIT} scripts today, which is plenty. Come back tomorrow, or film one of these.` }, 429)

    // The facts the brief needs, beyond the intake.
    const [savedRows, videoRows] = await Promise.all([
      get(`saved_ads?select=hook&client_id=eq.${cid}&order=created_at.desc&limit=20`),
      get(`ad_videos?select=transcript&client_id=eq.${cid}&transcript=not.is.null&order=created_at.desc&limit=4`),
    ])
    const usedHooks = [
      ...(savedRows as Row[]).map((r) => String(r.hook || '').trim()),
      ...ads.slice(0, 8).map((a: { name: string }) => hookFromAdName(a.name)),
    ].filter(Boolean)
    const recentScripts = (scriptRows as Row[]).slice(0, 12).map((r) => String((r.script as Row)?.hook || (r.script as Row)?.title || '')).filter(Boolean)
    const facts = {
      name: client.name,
      industry,
      market,
      intake,
      website: client.website_profile ? String(client.website_profile) : '',
      working,
      usedHooks,
      recentScripts,
      transcripts: (videoRows as Row[]).map((r) => String(r.transcript || '')),
      voice: voiceOf(client.voice_profile),
    }
    const playbook = String(body.playbook || '').slice(0, 4000)
    const system = buildScriptBrief(facts, { playbook })

    let message = ''
    let ask: Row = {}
    let parentId: string | null = null
    if (action === 'write') {
      const a = body.ask && typeof body.ask === 'object' ? body.ask : {}
      ask = {
        topic: String(a.topic || 'season').slice(0, 40),
        length: String(a.length || '30').slice(0, 4),
        speaker: String(a.speaker || 'owner').slice(0, 20),
        setting: String(a.setting || '').slice(0, 20),
        tone: String(a.tone || '').slice(0, 20),
        extra: String(a.extra || '').slice(0, 600),
        idea: a.idea && typeof a.idea === 'object' ? { key: String(a.idea.key || ''), title: String(a.idea.title || '').slice(0, 200), why: String(a.idea.why || '').slice(0, 400) } : undefined,
      }
      message = scriptAsk(ask)
    } else {
      const id = String(body.id || '')
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'id is required.' }, 400)
      const parent = (scriptRows as Row[]).find((r) => r.id === id)
      if (!parent) return json({ error: 'That script is not on this page.' }, 404)
      const change = String(body.change || '')
      if (!CHANGES.some((c) => c.key === change) && !String(body.extra || '').trim()) return json({ error: 'Say what to change.' }, 400)
      parentId = id
      ask = { ...(parent.ask as Row), change, extra: String(body.extra || '').slice(0, 600) }
      message = reviseAsk(parent.script, change, String(body.extra || ''))
    }

    const anthropic = new Anthropic({ apiKey })
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      // The brief is the same for every script a client writes today, so
      // cache it rather than paying for it each time.
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: message }],
    } as never)
    const reply = await stream.finalMessage()
    const text = (reply.content as { type: string; text?: string }[])
      .filter((b) => b.type === 'text')
      .map((b) => b.text || '')
      .join('\n')
    const script = parseScript(text)
    if (!script) return json({ error: 'The script did not come back whole. Tap again and it usually does.' }, 502)

    const row = {
      client_id: client.id,
      parent_id: parentId,
      made_by: 'client',
      ask,
      script,
      status: 'new',
      usage: {
        input: reply.usage?.input_tokens,
        output: reply.usage?.output_tokens,
        cache_read: reply.usage?.cache_read_input_tokens,
        cache_write: reply.usage?.cache_creation_input_tokens,
      },
    }
    const ins = await fetch(`${supabaseUrl}/rest/v1/video_scripts`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(row),
    })
    const made = await ins.json()
    if (!ins.ok || !made?.[0]) return json({ error: 'The script was written but not kept. Tap again.', detail: made }, 500)
    return json({ script: made[0], limit_left: limitLeft - 1 })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
