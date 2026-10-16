// Real photos of the equipment for the ad templates, server side.
//
// One call makes one photo: a photoreal catalogue cutout of a unit (or its
// old, rusty twin for a trade-in ad) on a transparent background, with
// OpenAI's gpt-image-1, and puts it in the shared stock library at
// stock/units/<key>.png in the client-files bucket, where every client's
// templates pick it up in place of the hand drawing. The prompts and the
// keys live in ../_shared/unitPhotos.js, shared with the browser and the
// Node checks. The OpenAI key never leaves the server.
//
// Deployed with verify_jwt = false and its own door check: a call must carry
// the project's anon or service key as its bearer (what the CRM sends), or
// the fill token kept in the database vault (public.stock_fill_token(),
// readable by the service role only), which a one-off fill run from the
// database through pg_net sends in an x-fill-token header, since pg_net has
// no key of its own to hand. Making a photo spends the agency's OpenAI
// money, so nobody else gets in.
//
// Secrets: OPENAI_API_KEY.
//
// Body:  { action: 'make', key, quality? }   -> { key, path, bytes, usage }
// Body:  { action: 'list' }                  -> { photos: [{ key, path }] }
//
// A photo at high quality takes about a minute and costs about a quarter;
// the browser asks for them one at a time so no call runs long.

import { PROMPTS, UNIT_PHOTO_KEYS, UNIT_PHOTO_PREFIX, unitPhotoPath } from '../_shared/unitPhotos.js'

const MODEL = 'gpt-image-1'
const BUCKET = 'client-files'
// Portrait: the templates give the unit a tall box.
const SIZE = '1024x1536'
const QUALITIES = ['low', 'medium', 'high']

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-fill-token',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })
}

/** True when the request comes from the CRM (the project's own keys) or carries the vault's fill token. */
async function allowed(req: Request, supabaseUrl: string, serviceKey: string): Promise<boolean> {
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const keys = [Deno.env.get('SUPABASE_ANON_KEY'), serviceKey].filter(Boolean)
  if (bearer && keys.includes(bearer)) return true
  const given = req.headers.get('x-fill-token') || ''
  if (!given) return false
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/stock_fill_token`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  const token = res.ok ? String((await res.json().catch(() => '')) || '') : ''
  return Boolean(token) && token.length === given.length && token === given
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const storage = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  if (!(await allowed(req, supabaseUrl, serviceKey))) return json({ error: 'Not allowed.' }, 401)

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body' }, 400)
  }
  const action = String(body.action || 'make')

  try {
    if (action === 'list') {
      const res = await fetch(`${supabaseUrl}/storage/v1/object/list/${BUCKET}`, {
        method: 'POST',
        headers: { ...storage, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: UNIT_PHOTO_PREFIX.replace(/\/$/, ''), limit: 100 }),
      })
      const rows = ((await res.json().catch(() => [])) || []) as { name?: string }[]
      const photos = rows
        .map((r) => /^([a-z_]+)\.png$/.exec(String(r.name || ''))?.[1])
        .filter((k): k is string => Boolean(k) && UNIT_PHOTO_KEYS.includes(k as string))
        .map((key) => ({ key, path: unitPhotoPath(key) }))
      return json({ photos })
    }
    if (action !== 'make') return json({ error: `Unknown action ${action}` }, 400)

    const key = String(body.key || '')
    if (!UNIT_PHOTO_KEYS.includes(key)) return json({ error: `No unit called ${key}. Choices: ${UNIT_PHOTO_KEYS.join(', ')}.` }, 400)
    // High by default: the units are the hero of the ad and the difference
    // between medium and high is a few cents a photo, once, for everyone.
    const quality = QUALITIES.includes(String(body.quality)) ? String(body.quality) : 'high'

    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) {
      return json(
        { error: 'OPENAI_API_KEY is not set in the Supabase secrets, so no photos can be made yet. Add it under Edge Functions > Secrets and press the button again; the drawings stand in until then.' },
        500
      )
    }

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        prompt: PROMPTS[key],
        n: 1,
        size: SIZE,
        quality,
        background: 'transparent',
        output_format: 'png',
      }),
    })
    const out = (await res.json().catch(() => null)) as { data?: { b64_json?: string }[]; usage?: unknown; error?: { message?: string } } | null
    if (!res.ok) return json({ error: out?.error?.message || `The image model returned ${res.status}.` }, 502)
    const b64 = out?.data?.[0]?.b64_json
    if (!b64) return json({ error: 'The image model sent nothing back. Try again.' }, 502)
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

    // Into the library, over whatever was there (a redo replaces the photo).
    const path = unitPhotoPath(key)
    const up = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { ...storage, 'Content-Type': 'image/png', 'x-upsert': 'true', 'Cache-Control': '3600' },
      body: bytes,
    })
    if (!up.ok) {
      const text = await up.text().catch(() => '')
      return json({ error: `The photo was made but could not be saved to the library: ${text.slice(0, 200) || up.status}` }, 500)
    }
    return json({ key, path, bytes: bytes.length, usage: out?.usage || null })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
