// AI ad concepts for the Studio: a brief in, finished ads out.
//
// The Studio's own compositor paints the words over a photo in a handful of
// looks. This is the other route: Higgsfield's Ads Studio takes the same
// words, the brand colours, the logo and the client's real photos, and
// renders whole ad concepts (GPT Image 2.5 Flare behind it), each a
// different scene and arrangement. The team picks the ones that land; the
// Studio uses a pick as a finished image (the "AI concept" look), and from
// there it is saved, approved and published like any other ad.
//
// Asynchronous like everything Higgsfield does: `create` submits a batch and
// returns a row; the Studio polls `status` until the images are in, at
// which point they are copied into the client-files bucket (vendor links
// expire after a week) under concepts/<client>/, which fetchSavedAds ignores.
//
// What the brief does about the usual failures of generated ads is in
// brief.js: the words are quoted and nothing else is allowed on the image
// (no invented phone numbers), the business name is spelled out, and the
// real owner and van come from the reference photos.
//
// Secrets: HIGGSFIELD_API_KEY_ID and HIGGSFIELD_API_KEY_SECRET (the same
// pair the ai-video function uses for B-roll). Cost is roughly $0.08 to
// $0.10 an image at list prices.
//
// Deployed with verify_jwt = true; the browser calls it with the anon key.
// Actions: create, status.

import { buildBrief, conceptPath } from './brief.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

const BUCKET = 'client-files'
const HF = 'https://api.higgsfield.ai'
const ADS_STUDIO = 'higgsfield/ads-studio/v1.0'
const ASPECTS = ['1:1', '4:5', '9:16']
const MAX_BATCH = 8

type Row = Record<string, any>

class Fail extends Error {
  status: number
  notConfigured: boolean
  constructor(message: string, status = 500, notConfigured = false) {
    super(message)
    this.status = status
    this.notConfigured = notConfigured
  }
}
const bad = (m: string) => new Fail(m, 400)
const str = (v: unknown) => String(v ?? '').trim()
const enc = encodeURIComponent
const nowIso = () => new Date().toISOString()
const secret = (name: string) => (Deno.env.get(name) || '').trim()

function requireHiggsfield() {
  if (secret('HIGGSFIELD_API_KEY_ID') && secret('HIGGSFIELD_API_KEY_SECRET')) return
  throw new Fail(
    'AI concepts are not switched on yet: HIGGSFIELD_API_KEY_ID and HIGGSFIELD_API_KEY_SECRET are not set on this project. Make a key at console.higgsfield.ai, add both under Project Settings > Edge Functions > Secrets, then try again.',
    500,
    true
  )
}

const hfHeaders = () => ({
  Authorization: `Key ${secret('HIGGSFIELD_API_KEY_ID')}:${secret('HIGGSFIELD_API_KEY_SECRET')}`,
  'Content-Type': 'application/json',
})

const vendorText = async (r: Response) => {
  const text = await r.text()
  try {
    const j = JSON.parse(text)
    const d = j?.detail
    return String((typeof d === 'string' ? d : d?.message) || j?.message || j?.error || (Array.isArray(d) ? JSON.stringify(d) : '') || text).slice(0, 300)
  } catch {
    return text.slice(0, 300)
  }
}

// ---------------------------------------------------------------------------
// Database and storage, over PostgREST with the service role.
// ---------------------------------------------------------------------------

function makeCtx(supabaseUrl: string, serviceKey: string) {
  const dbHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }
  const rest = (path: string) => `${supabaseUrl}/rest/v1/${path}`

  // One retry on a 401 or a 5xx: a cold start has answered a read with
  // "JWT issued at future" once and been fine on the next identical read.
  async function fetchDb(url: string, init?: RequestInit): Promise<Response> {
    const r = await fetch(url, init)
    if (r.status !== 401 && r.status < 500) return r
    await new Promise((resolve) => setTimeout(resolve, 600))
    return fetch(url, init)
  }

  async function readRows(r: Response, what: string): Promise<Row[]> {
    const text = await r.text()
    if (!r.ok) throw new Fail(`${what} failed (${r.status}): ${text.slice(0, 300)}`)
    try {
      const out = JSON.parse(text)
      return Array.isArray(out) ? out : []
    } catch {
      return []
    }
  }

  const ctx = {
    async one(table: string, query: string): Promise<Row | null> {
      return (await readRows(await fetchDb(rest(`${table}?${query}&limit=1`), { headers: dbHeaders }), `Reading ${table}`))[0] || null
    },
    async insert(table: string, row: Row): Promise<Row> {
      const r = await fetchDb(rest(table), { method: 'POST', headers: { ...dbHeaders, Prefer: 'return=representation' }, body: JSON.stringify(row) })
      return (await readRows(r, `Writing ${table}`))[0]
    },
    async patch(table: string, query: string, fields: Row): Promise<Row[]> {
      const r = await fetchDb(rest(`${table}?${query}`), { method: 'PATCH', headers: { ...dbHeaders, Prefer: 'return=representation' }, body: JSON.stringify(fields) })
      return readRows(r, `Updating ${table}`)
    },
    publicUrl(path: string) {
      return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${String(path).split('/').map(enc).join('/')}`
    },
    async upload(path: string, bytes: Uint8Array, contentType: string) {
      const encoded = String(path).split('/').map(enc).join('/')
      const r = await fetchDb(`${supabaseUrl}/storage/v1/object/${BUCKET}/${encoded}`, {
        method: 'POST',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': contentType, 'x-upsert': 'true' },
        body: bytes,
      })
      if (!r.ok) throw new Fail(`Could not store ${path} (${r.status}): ${(await r.text()).slice(0, 200)}`)
    },
  }
  return ctx
}
type Ctx = ReturnType<typeof makeCtx>

async function fetchBytes(url: string, maxBytes: number, what = 'file'): Promise<Uint8Array> {
  const r = await fetch(url)
  if (!r.ok) throw new Fail(`Could not download the ${what} (${r.status}).`)
  const buf = new Uint8Array(await r.arrayBuffer())
  if (buf.byteLength > maxBytes) throw new Fail(`The ${what} is ${Math.round(buf.byteLength / 1048576)}MB, more than this step can carry.`)
  if (buf.byteLength === 0) throw new Fail(`The ${what} came back empty.`)
  return buf
}

// ---------------------------------------------------------------------------

async function createBatch(ctx: Ctx, body: Row) {
  const clientId = str(body.client_id)
  if (!clientId) throw bad('client_id is required.')
  requireHiggsfield()

  const client = await ctx.one('clients', `select=id,name,industry,market&id=eq.${enc(clientId)}`)
  if (!client) throw bad('That client does not exist.')

  const brief = (body.brief && typeof body.brief === 'object' ? body.brief : {}) as Row
  if (!str(brief.hook) && !str(brief.offerAmount) && !str(brief.offerDetail)) {
    throw bad('Give the concepts a headline or an offer first; an empty brief makes an empty ad.')
  }
  const refPaths: string[] = Array.isArray(body.ref_paths)
    ? body.ref_paths.filter((p: unknown) => typeof p === 'string' && p.trim() && !p.startsWith('drive:')).slice(0, 6)
    : []
  const hasLogo = Boolean(body.has_logo) && refPaths.length > 0
  const aspect = ASPECTS.includes(str(body.aspect)) ? str(body.aspect) : '4:5'
  const batch = Math.max(1, Math.min(MAX_BATCH, Number(body.batch) || 4))

  const built = buildBrief(
    {
      ...brief,
      business: client.name,
      industry: brief.industry || client.industry,
      market: brief.market || client.market,
      hasLogo,
      photoCount: refPaths.length - (hasLogo ? 1 : 0),
    },
    { count: batch }
  )

  const row = await ctx.insert('ad_concepts', {
    client_id: clientId,
    status: 'queued',
    aspect,
    batch,
    brief,
    prompt: built.prompt,
    ref_paths: refPaths,
  })

  try {
    const r = await fetch(`${HF}/${ADS_STUDIO}`, {
      method: 'POST',
      headers: { ...hfHeaders(), 'Idempotency-Key': `wc-concepts-${row.id}` },
      body: JSON.stringify({
        prompt: built.prompt,
        niche: built.niche,
        target_audience: built.target_audience,
        language: built.language,
        aspect_ratio: aspect,
        batch_size: batch,
        image_urls: refPaths.map((p) => ctx.publicUrl(p)),
      }),
    })
    if (!r.ok) throw new Fail(`Higgsfield would not take the brief (${r.status}): ${await vendorText(r)}`)
    const out: any = await r.json().catch(() => ({}))
    if (!out?.request_id) throw new Fail('Higgsfield returned no request id.')
    const [patched] = await ctx.patch('ad_concepts', `id=eq.${enc(row.id)}`, {
      request_id: String(out.request_id),
      status: 'working',
      updated_at: nowIso(),
    })
    return { concept: patched || row }
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err).slice(0, 600)
    const [patched] = await ctx.patch('ad_concepts', `id=eq.${enc(row.id)}`, { status: 'failed', error: message, updated_at: nowIso() })
    return { concept: patched || { ...row, status: 'failed', error: message } }
  }
}

async function batchStatus(ctx: Ctx, body: Row) {
  const id = str(body.id)
  if (!id) throw bad('id is required.')
  const row = await ctx.one('ad_concepts', `select=*&id=eq.${enc(id)}`)
  if (!row) throw bad('That batch does not exist.')
  if (row.status !== 'working' || !row.request_id) return { concept: row }
  requireHiggsfield()

  const where = `id=eq.${enc(row.id)}`
  try {
    const r = await fetch(`${HF}/requests/${enc(row.request_id)}/status`, { headers: hfHeaders() })
    if (!r.ok) throw new Fail(`Higgsfield status check failed (${r.status}): ${await vendorText(r)}`)
    const out: any = await r.json().catch(() => ({}))
    const status = String(out?.status || '')
    if (status === 'queued' || status === 'in_progress' || !status) return { concept: row }
    if (status !== 'completed') {
      throw new Fail(status === 'nsfw' ? 'Higgsfield refused the brief as unsafe. Change the wording or the photos and try again.' : `Higgsfield could not make the concepts: ${out?.error || status}.`)
    }
    const images: Row[] = Array.isArray(out?.images) ? out.images : []
    if (images.length === 0) throw new Fail('Higgsfield finished but returned no images.')

    // Into our bucket: the vendor's links expire, and the Studio draws from
    // the public bucket with CORS exactly as it does for an uploaded photo.
    const paths: string[] = []
    for (const [i, img] of images.entries()) {
      if (!img?.url) continue
      const bytes = await fetchBytes(String(img.url), 25 * 1024 * 1024, 'concept image')
      const path = conceptPath(row.client_id, row.id, i)
      await ctx.upload(path, bytes, 'image/png')
      paths.push(path)
    }
    if (paths.length === 0) throw new Fail('None of the concept images could be saved.')
    const [patched] = await ctx.patch('ad_concepts', where, { status: 'done', paths, error: null, updated_at: nowIso() })
    return { concept: patched || row }
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err).slice(0, 600)
    const [patched] = await ctx.patch('ad_concepts', where, { status: 'failed', error: message, updated_at: nowIso() })
    return { concept: patched || row }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)
  const ctx = makeCtx(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  let body: Row
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }

  try {
    switch (str(body.action)) {
      case 'create':
        return json(await createBatch(ctx, body))
      case 'status':
        return json(await batchStatus(ctx, body))
      default:
        return json({ error: `Unknown action "${str(body.action)}". Use create or status.` }, 400)
    }
  } catch (err) {
    const e = err as Fail
    return json({ error: String(e?.message || err), ...(e?.notConfigured ? { not_configured: true } : {}) }, e?.status || 500)
  }
})
