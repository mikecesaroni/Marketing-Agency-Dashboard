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
// Deployed with verify_jwt = true; the CRM calls it with the anon key.
//
// Secrets: OPENAI_API_KEY.
//
// Body:  { action: 'make', key, quality? }   -> { key, path, bytes, usage }
// Body:  { action: 'list' }                  -> { photos: [{ key, path }] }
//
// A photo at medium quality takes about half a minute and costs a few cents;
// the browser asks for them one at a time so no call runs long.

import { PROMPTS, UNIT_PHOTO_KEYS, UNIT_PHOTO_PREFIX, unitPhotoPath } from '../_shared/unitPhotos.js'

const MODEL = 'gpt-image-1'
const BUCKET = 'client-files'
// Portrait: the templates give the unit a tall box.
const SIZE = '1024x1536'
const QUALITIES = ['low', 'medium', 'high']

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const storage = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }

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
    const quality = QUALITIES.includes(String(body.quality)) ? String(body.quality) : 'medium'

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
