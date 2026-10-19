// Ads made by ChatGPT's image model, server side.
//
// One call makes one ad picture: gpt-image-1 is handed the agency's example
// ads (the style), the real unit photo from the stock library (the
// product), and a prompt with the template's art direction and the ad's
// words (../_shared/aiAds.js), and paints a finished poster with a plain
// white band along the bottom. The picture goes to the client's folder,
// ai-ads/<client id>/<template>-<shape>-<stamp>-<words key>.jpg in the
// client-files bucket (the key ties it to the words painted in it); the
// Studio paints the real logo and the Google reviews line on the band.
// The OpenAI key never leaves the server.
//
// Deployed with verify_jwt = false and the same door as stock-images: the
// project's anon or service key, a signed-in person's live session, or the
// fill token in the database vault (public.stock_fill_token()), which a run
// from the database through pg_net sends as x-fill-token.
//
// Secrets: OPENAI_API_KEY.
//
// Body:  { action: 'make', client_id, template, shape, words, unit?, colours?, season?, quality?, sample? }
//          -> { path, key, ms }
// Body:  { action: 'refs' }                      -> { refs: [{ name, path }] }
// Body:  { action: 'prompt', template, words, shape? } -> { key, prompt }  (no model call)
// Body:  { action: 'add_ref', name, b64 | url, type }  -> { path }   (an example ad, as
//          base64 or a raw.githubusercontent.com link into this repository)
//
// A picture at high quality takes about a minute or two and costs about a
// quarter; the Studio asks for them one shape at a time.

import { AI_SHAPES, MAX_STYLE_REFS, STYLE_REF_PREFIX, aiArtPath, buildAiPrompt, isAiTemplate, wordsKey } from '../_shared/aiAds.js'
import { OLD_PREFIX, UNIT_KEYS, unitPhotoPath } from '../_shared/unitPhotos.js'

const MODEL = 'gpt-image-1'
const BUCKET = 'client-files'
const QUALITIES = ['low', 'medium', 'high']
const UNIT_NAMES: Record<string, string> = {
  ac: 'central air conditioner outdoor condenser',
  furnace: 'high-efficiency gas furnace',
  boiler: 'residential gas boiler',
  water_heater: 'gas water heater',
  mini_split: 'ductless mini split wall unit',
  thermostat: 'smart thermostat',
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-fill-token',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })
}

/** True when the request comes from the CRM (the project's own keys, or a signed-in person's live session) or carries the vault's fill token. */
async function allowed(req: Request, supabaseUrl: string, serviceKey: string): Promise<boolean> {
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  if (bearer && [anonKey, serviceKey].filter(Boolean).includes(bearer)) return true
  if (bearer && anonKey) {
    const who = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${bearer}` } }).catch(() => null)
    if (who?.ok) return true
  }
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

const safeName = (s: unknown) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `example-${Date.now()}`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const storage = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  if (!(await allowed(req, supabaseUrl, serviceKey))) return json({ error: 'Not allowed.' }, 401)

  let body: Record<string, any> = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body' }, 400)
  }
  const action = String(body.action || 'make')
  const publicUrl = (path: string) => `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`

  const listRefs = async () => {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { ...storage, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: STYLE_REF_PREFIX.replace(/\/$/, ''), limit: 100, sortBy: { column: 'name', order: 'asc' } }),
    })
    const rows = ((await res.json().catch(() => [])) || []) as { name?: string }[]
    return rows
      .map((r) => String(r.name || ''))
      .filter((n) => /\.(png|jpe?g|webp)$/i.test(n))
      .map((name) => ({ name, path: `${STYLE_REF_PREFIX}${name}` }))
  }

  try {
    if (action === 'refs') return json({ refs: await listRefs() })

    if (action === 'add_ref') {
      const type = ['image/png', 'image/jpeg', 'image/webp'].includes(String(body.type)) ? String(body.type) : 'image/jpeg'
      const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'
      // As base64, or from this repository's raw files (how the first examples were loaded).
      const RAW = 'https://raw.githubusercontent.com/mikecesaroni/Marketing-Agency-Dashboard/'
      let bytes: Uint8Array
      if (String(body.url || '').startsWith(RAW)) {
        const got = await fetch(String(body.url))
        if (!got.ok) return json({ error: `Could not fetch the example (${got.status}).` }, 400)
        bytes = new Uint8Array(await got.arrayBuffer())
      } else bytes = Uint8Array.from(atob(String(body.b64 || '')), (c) => c.charCodeAt(0))
      if (bytes.length < 1000) return json({ error: 'That example is empty.' }, 400)
      const path = `${STYLE_REF_PREFIX}${safeName(body.name)}.${ext}`
      const up = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST',
        headers: { ...storage, 'Content-Type': type, 'x-upsert': 'true' },
        body: bytes,
      })
      if (!up.ok) return json({ error: `Could not save the example: ${(await up.text().catch(() => '')).slice(0, 200)}` }, 500)
      return json({ path })
    }

    if (action === 'prompt') {
      // The prompt a make would send, without calling the model (for checking).
      const template = String(body.template || '')
      if (!isAiTemplate(template)) return json({ error: `The ${template} template has no ChatGPT version.` }, 400)
      const words = Array.isArray(body.words) ? body.words : []
      return json({ key: wordsKey(words), prompt: buildAiPrompt({ template, words, shape: body.shape === 'tall' ? 'tall' : 'square', refCount: MAX_STYLE_REFS }) })
    }

    if (action !== 'make') return json({ error: `Unknown action ${action}` }, 400)

    const template = String(body.template || '')
    if (!isAiTemplate(template)) return json({ error: `The ${template} template has no ChatGPT version.` }, 400)
    const shape = body.shape === 'tall' ? 'tall' : 'square'
    const clientId = String(body.client_id || '').trim()
    const sample = body.sample ? safeName(body.sample) : ''
    if (!sample && !/^[0-9a-f-]{36}$/i.test(clientId)) return json({ error: 'client_id is required.' }, 400)
    const quality = QUALITIES.includes(String(body.quality)) ? String(body.quality) : 'high'
    const unit = UNIT_KEYS.includes(String(body.unit)) ? String(body.unit) : ''

    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) return json({ error: 'OPENAI_API_KEY is not set in the Supabase secrets, so ChatGPT cannot make ads yet.' }, 500)

    // The images, in the order the prompt names them: the examples, then the unit (new, then old for a trade-in).
    const refs = (await listRefs()).slice(0, MAX_STYLE_REFS)
    const old = template === 'clunkers'
    const unitPaths = unit ? [unitPhotoPath(unit), ...(old ? [unitPhotoPath(`${OLD_PREFIX}${unit}`)] : [])] : []
    const fetched = await Promise.all(
      [...refs.map((r) => r.path), ...unitPaths].map(async (path) => {
        const res = await fetch(publicUrl(path))
        if (!res.ok) return null
        const type = res.headers.get('content-type') || 'image/png'
        return { path, blob: new Blob([await res.arrayBuffer()], { type }) }
      })
    )
    const refBlobs = fetched.slice(0, refs.length).filter(Boolean) as { path: string; blob: Blob }[]
    const unitBlobs = fetched.slice(refs.length).filter(Boolean) as { path: string; blob: Blob }[]
    if (!refBlobs.length && !unitBlobs.length) return json({ error: 'No example ads and no unit photo to work from.' }, 400)

    const words = Array.isArray(body.words) ? body.words : []
    const prompt = buildAiPrompt({
      template,
      words,
      unit: unitBlobs.length ? UNIT_NAMES[unit] : '',
      oldUnit: unitBlobs.length > 1,
      shape,
      refCount: refBlobs.length,
      colours: Array.isArray(body.colours) ? body.colours.filter((c: unknown) => /^#[0-9a-f]{6}$/i.test(String(c))) : [],
      season: String(body.season || '').slice(0, 20),
    })

    const form = new FormData()
    form.append('model', MODEL)
    form.append('prompt', prompt)
    form.append('size', AI_SHAPES[shape].size)
    form.append('quality', quality)
    form.append('n', '1')
    form.append('output_format', 'jpeg')
    form.append('output_compression', '92')
    ;[...refBlobs, ...unitBlobs].forEach((f, i) => {
      const ext = f.blob.type.includes('png') ? 'png' : f.blob.type.includes('webp') ? 'webp' : 'jpg'
      form.append('image[]', f.blob, `image-${i}.${ext}`)
    })

    const started = Date.now()
    const res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form })
    const out = (await res.json().catch(() => null)) as { data?: { b64_json?: string }[]; error?: { message?: string } } | null
    if (!res.ok) return json({ error: out?.error?.message || `The image model returned ${res.status}.` }, 502)
    const b64 = out?.data?.[0]?.b64_json
    if (!b64) return json({ error: 'The image model sent nothing back. Try again.' }, 502)
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

    const key = wordsKey(words)
    const path = sample ? `ai-ads/samples/${sample}.jpg` : aiArtPath(clientId, template, shape, Date.now(), key)
    const up = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { ...storage, 'Content-Type': 'image/jpeg', 'x-upsert': 'true', 'Cache-Control': '3600' },
      body: bytes,
    })
    if (!up.ok) return json({ error: `The ad was made but could not be saved: ${(await up.text().catch(() => '')).slice(0, 200)}` }, 500)
    return json({ path, key, ms: Date.now() - started, refs: refBlobs.length, units: unitBlobs.length })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
