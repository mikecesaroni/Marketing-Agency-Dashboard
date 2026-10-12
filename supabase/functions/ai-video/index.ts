// AI videos: the owner records once, the CRM makes the weekly ads.
//
// WHAT HAPPENS, per video, from a script card in the client chat:
//   1. the spoken lines are read in the owner's cloned voice (ElevenLabs,
//      with character timestamps, so we know how long it runs and when the
//      offer lands)
//   2. the owner's base clip is lip-synced to that audio (Sync.so), cut to
//      the audio's length
//   3. B-roll cutaways are filmed from the client's own photos or from the
//      trade (Higgsfield, Kling 3.0; optional, the video is the owner alone
//      without it)
//   4. the cut is rendered: owner full length, muted cutaways over the
//      middle, word captions off the owner's audio, an offer card from the
//      moment the offer is said, the client's logo (Shotstack)
//   5. the MP4 goes into the client's files like any uploaded clip, so the
//      approval link and the publish flow that already exist take it from
//      there.
//
// WHY A STEP MACHINE. Every vendor here is asynchronous and slow (a lip-sync
// is a minute or three, so is a Kling shot, so is a render), and an Edge
// Function does not run forever. So a job is a row in ai_videos with a
// status, and each call to this function moves ONE job ONE step and returns:
// submit, or poll and move on when everything is in. The client page polls
// `run` while it is open; a cron `tick` every minute moves jobs along when
// it is not. A lock column stops the two from working the same job at once.
//
// SETUP, once per client: the owner's base clip (a client-files upload or a
// Drive clip, exactly the two places Meta downloads from) and who agreed, in
// writing, to the voice clone. Preparing the voice pulls a 90-second audio
// sample off the clip (an audio-only Shotstack render; no ffmpeg here) and
// clones it. A new clip replaces the old voice.
//
// Secrets (Project Settings > Edge Functions > Secrets):
//   ELEVENLABS_API_KEY            the owner's voice      (required)
//   SYNC_API_KEY                  the lip-sync           (required)
//   SHOTSTACK_API_KEY             the cut                (required)
//   HIGGSFIELD_API_KEY_ID + HIGGSFIELD_API_KEY_SECRET   B-roll (optional)
// Optional knobs: ELEVENLABS_MODEL (eleven_multilingual_v2), SYNC_MODEL
// (lipsync-2), SYNC_MODE (cut_off), SHOTSTACK_ENV (v1; "stage" is the free
// watermarked sandbox), HIGGSFIELD_I2V / HIGGSFIELD_T2V (Kling 3.0 standard).
//
// Deployed with verify_jwt = true; the browser and the cron call it with the
// anon key. Actions: setup, setup_status, create, run, retry, tick.

import {
  STEP_WORDS,
  alignmentDuration,
  brollPrompts,
  brollWindows,
  buildTimeline,
  jobPrefix,
  offerStart,
  onScreenText,
  sampleTimeline,
  scriptTitle,
  slug,
  spokenLines,
  spokenText,
} from './plan.js'

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
const DRIVE_PREFIX = 'drive:'
const ACTIVE = ['queued', 'generating', 'rendering']
const LOCK_SECONDS = 90
const MAX_MP4_BYTES = 50 * 1024 * 1024 // the bucket's ceiling on this plan
const MAX_SPOKEN_CHARS = 1500
const SAMPLE_SECONDS = 90
const REQUIRED = ['ELEVENLABS_API_KEY', 'SYNC_API_KEY', 'SHOTSTACK_API_KEY']

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

function requireSecrets(names: string[]) {
  const missing = names.filter((n) => !secret(n))
  if (missing.length === 0) return
  const one = missing.length === 1
  throw new Fail(
    `AI video is not switched on yet: ${missing.join(', ')} ${one ? 'is' : 'are'} not set on this project. Add ${one ? 'it' : 'them'} under Project Settings > Edge Functions > Secrets, then try again.`,
    500,
    true
  )
}

// ---------------------------------------------------------------------------
// Database and storage, over PostgREST with the service role.
// ---------------------------------------------------------------------------

function makeCtx(supabaseUrl: string, serviceKey: string) {
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }
  const rest = (path: string) => `${supabaseUrl}/rest/v1/${path}`

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
    supabaseUrl,
    async select(table: string, query: string): Promise<Row[]> {
      return readRows(await fetch(rest(`${table}?${query}`), { headers: dbHeaders }), `Reading ${table}`)
    },
    async one(table: string, query: string): Promise<Row | null> {
      return (await ctx.select(table, `${query}&limit=1`))[0] || null
    },
    async insert(table: string, row: Row): Promise<Row> {
      const r = await fetch(rest(table), {
        method: 'POST',
        headers: { ...dbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(row),
      })
      return (await readRows(r, `Writing ${table}`))[0]
    },
    async upsert(table: string, row: Row, onConflict: string): Promise<Row> {
      const r = await fetch(rest(`${table}?on_conflict=${onConflict}`), {
        method: 'POST',
        headers: { ...dbHeaders, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(row),
      })
      return (await readRows(r, `Writing ${table}`))[0]
    },
    async patch(table: string, query: string, fields: Row): Promise<Row[]> {
      const r = await fetch(rest(`${table}?${query}`), {
        method: 'PATCH',
        headers: { ...dbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(fields),
      })
      return readRows(r, `Updating ${table}`)
    },
    publicUrl(path: string) {
      const encoded = String(path).split('/').map(enc).join('/')
      return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${encoded}`
    },
    async upload(path: string, bytes: Uint8Array, contentType: string) {
      const encoded = String(path).split('/').map(enc).join('/')
      const r = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${encoded}`, {
        method: 'POST',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': contentType, 'x-upsert': 'true' },
        body: bytes,
      })
      if (!r.ok) throw new Fail(`Could not store ${path} (${r.status}): ${(await r.text()).slice(0, 200)}`)
    },
    /**
     * Where a vendor fetches a client's clip from: the public bucket URL, or
     * for a Drive clip a short-lived grant on the drive-video function, the
     * same way Meta is handed one.
     */
    async mediaUrl(clientId: string, path: string) {
      if (!path.startsWith(DRIVE_PREFIX)) return ctx.publicUrl(path)
      const grant = await ctx.insert('drive_video_grants', { client_id: clientId, drive_file_id: path.slice(DRIVE_PREFIX.length) })
      if (!grant?.token) throw new Fail('Could not create a download link for that Drive clip.')
      return `${supabaseUrl}/functions/v1/drive-video?t=${grant.token}`
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

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const vendorText = async (r: Response) => {
  const text = await r.text()
  try {
    const j = JSON.parse(text)
    const d = j?.detail
    return String(
      (typeof d === 'string' ? d : d?.message) || j?.message || j?.error || j?.response?.message || (Array.isArray(d) ? JSON.stringify(d) : '') || text
    ).slice(0, 300)
  } catch {
    return text.slice(0, 300)
  }
}

// ---------------------------------------------------------------------------
// Shotstack: the cut, and the audio sample off the base clip.
// ---------------------------------------------------------------------------

const shotstackBase = () => `https://api.shotstack.io/edit/${secret('SHOTSTACK_ENV') || 'v1'}`
const shotstackHeaders = () => ({ 'x-api-key': secret('SHOTSTACK_API_KEY'), 'Content-Type': 'application/json', Accept: 'application/json' })

async function shotstackRender(edit: unknown): Promise<string> {
  const r = await fetch(`${shotstackBase()}/render`, { method: 'POST', headers: shotstackHeaders(), body: JSON.stringify(edit) })
  const text = await r.text()
  let out: any = {}
  try {
    out = JSON.parse(text)
  } catch {
    /* not JSON; the status carries the news */
  }
  const id = out?.response?.id
  if (!r.ok || !id) {
    const detail = out?.response?.error ? JSON.stringify(out.response.error).slice(0, 300) : out?.response?.message || out?.message || text.slice(0, 300)
    throw new Fail(`Shotstack would not take the edit (${r.status}): ${detail}`)
  }
  return String(id)
}

async function shotstackStatus(id: string) {
  const r = await fetch(`${shotstackBase()}/render/${enc(id)}?data=false`, { headers: shotstackHeaders() })
  if (!r.ok) throw new Fail(`Shotstack status check failed (${r.status}): ${await vendorText(r)}`)
  const out: any = await r.json().catch(() => ({}))
  const res = out?.response || {}
  return { status: String(res.status || ''), url: res.url || '', poster: res.poster || '', error: res.error || '' }
}

// ---------------------------------------------------------------------------
// ElevenLabs: the owner's voice.
// ---------------------------------------------------------------------------

const EL = 'https://api.elevenlabs.io/v1'

async function elAddVoice(name: string, mp3: Uint8Array): Promise<string> {
  const fd = new FormData()
  fd.append('name', name.slice(0, 90))
  fd.append('files', new Blob([mp3], { type: 'audio/mpeg' }), 'sample.mp3')
  // Phone clips in a truck cab are not studio clean; the isolation pass helps
  // more often than it hurts.
  fd.append('remove_background_noise', 'true')
  fd.append('description', 'Owner base clip, cloned by the Working Class CRM for their own ads.')
  const r = await fetch(`${EL}/voices/add`, { method: 'POST', headers: { 'xi-api-key': secret('ELEVENLABS_API_KEY') }, body: fd })
  if (!r.ok) throw new Fail(`ElevenLabs would not clone the voice (${r.status}): ${await vendorText(r)}`)
  const out: any = await r.json().catch(() => ({}))
  if (!out?.voice_id) throw new Fail('ElevenLabs returned no voice id.')
  return String(out.voice_id)
}

async function elDeleteVoice(voiceId: string) {
  await fetch(`${EL}/voices/${enc(voiceId)}`, { method: 'DELETE', headers: { 'xi-api-key': secret('ELEVENLABS_API_KEY') } }).catch(() => {})
}

async function elSpeak(voiceId: string, text: string) {
  const r = await fetch(`${EL}/text-to-speech/${enc(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': secret('ELEVENLABS_API_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: secret('ELEVENLABS_MODEL') || 'eleven_multilingual_v2',
      voice_settings: { stability: 0.45, similarity_boost: 0.85, style: 0.15, use_speaker_boost: true },
    }),
  })
  if (!r.ok) throw new Fail(`ElevenLabs would not read the script (${r.status}): ${await vendorText(r)}`)
  const out: any = await r.json().catch(() => ({}))
  if (!out?.audio_base64) throw new Fail('ElevenLabs returned no audio.')
  return { audio: base64ToBytes(out.audio_base64), alignment: out.alignment || out.normalized_alignment || null }
}

// ---------------------------------------------------------------------------
// Sync.so: the lip-sync.
// ---------------------------------------------------------------------------

const SYNC = 'https://api.sync.so/v2'
const syncHeaders = () => ({ 'x-api-key': secret('SYNC_API_KEY'), 'Content-Type': 'application/json' })

async function syncCreate({ videoUrl, audioUrl, name }: { videoUrl: string; audioUrl: string; name: string }): Promise<string> {
  const r = await fetch(`${SYNC}/generate`, {
    method: 'POST',
    headers: syncHeaders(),
    body: JSON.stringify({
      model: secret('SYNC_MODEL') || 'lipsync-2',
      input: [
        { type: 'video', url: videoUrl },
        { type: 'audio', url: audioUrl },
      ],
      // The base clip is minutes long and the script is seconds: cut the
      // clip to the audio rather than loop or stretch anything.
      options: { sync_mode: secret('SYNC_MODE') || 'cut_off' },
      outputFileName: name.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 120),
    }),
  })
  if (!r.ok) throw new Fail(`Sync.so would not start the lip-sync (${r.status}): ${await vendorText(r)}`)
  const out: any = await r.json().catch(() => ({}))
  if (!out?.id) throw new Fail('Sync.so returned no generation id.')
  return String(out.id)
}

async function syncGet(id: string) {
  const r = await fetch(`${SYNC}/generate/${enc(id)}`, { headers: syncHeaders() })
  if (!r.ok) throw new Fail(`Sync.so status check failed (${r.status}): ${await vendorText(r)}`)
  const out: any = await r.json().catch(() => ({}))
  return { status: String(out?.status || ''), outputUrl: out?.outputUrl || '', error: out?.error || out?.errorCode || '' }
}

// ---------------------------------------------------------------------------
// Higgsfield: B-roll.
// ---------------------------------------------------------------------------

const HF = 'https://api.higgsfield.ai'
const hfReady = () => Boolean(secret('HIGGSFIELD_API_KEY_ID') && secret('HIGGSFIELD_API_KEY_SECRET'))
const hfHeaders = () => ({
  Authorization: `Key ${secret('HIGGSFIELD_API_KEY_ID')}:${secret('HIGGSFIELD_API_KEY_SECRET')}`,
  'Content-Type': 'application/json',
})
const HF_I2V = () => secret('HIGGSFIELD_I2V') || 'kling-video/v3.0/std/image-to-video'
const HF_T2V = () => secret('HIGGSFIELD_T2V') || 'kling-video/v3.0/std/text-to-video'

async function hfSubmit(path: string, body: Row, idempotencyKey: string) {
  const r = await fetch(`${HF}/${path}`, {
    method: 'POST',
    headers: { ...hfHeaders(), 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Fail(`Higgsfield refused the shot (${r.status}): ${await vendorText(r)}`)
  const out: any = await r.json().catch(() => ({}))
  if (!out?.request_id) throw new Fail('Higgsfield returned no request id.')
  return { request_id: String(out.request_id), status_url: String(out.status_url || `${HF}/requests/${out.request_id}/status`) }
}

async function hfStatus(statusUrl: string) {
  const r = await fetch(statusUrl, { headers: hfHeaders() })
  if (!r.ok) throw new Fail(`Higgsfield status check failed (${r.status}): ${await vendorText(r)}`)
  const out: any = await r.json().catch(() => ({}))
  return { status: String(out?.status || ''), url: out?.video?.url || '', error: out?.error || '' }
}

const HF_TERMINAL = ['completed', 'failed', 'nsfw', 'canceled', 'skipped']

// ---------------------------------------------------------------------------
// Setup: the base clip and the voice.
// ---------------------------------------------------------------------------

async function startSetup(ctx: Ctx, body: Row) {
  const clientId = str(body.client_id)
  const basePath = str(body.base_video_path)
  const consentName = str(body.consent_name)
  if (!clientId) throw bad('client_id is required.')
  if (!basePath) throw bad('Pick the owner’s base clip first.')
  if (!consentName) throw bad('Who agreed to the voice clone? Put the owner’s name.')
  requireSecrets(['SHOTSTACK_API_KEY', 'ELEVENLABS_API_KEY'])

  const client = await ctx.one('clients', `select=id,name&id=eq.${enc(clientId)}`)
  if (!client) throw bad('That client does not exist.')
  const existing = await ctx.one('client_ai_voice', `select=*&client_id=eq.${enc(clientId)}`)

  const refPaths = Array.isArray(body.ref_paths)
    ? body.ref_paths.filter((p: unknown) => typeof p === 'string' && p.trim()).slice(0, 3)
    : existing?.ref_paths || []

  // The voice sample: an audio-only render of the first 90 seconds.
  const mediaUrl = await ctx.mediaUrl(clientId, basePath)
  const renderId = await shotstackRender(sampleTimeline(mediaUrl, SAMPLE_SECONDS))

  const sameOwner = existing?.consent_name === consentName && existing?.consent_at
  const row = await ctx.upsert(
    'client_ai_voice',
    {
      client_id: clientId,
      base_video_path: basePath,
      base_video_name: str(body.base_video_name) || null,
      ref_paths: refPaths,
      consent_name: consentName,
      consent_at: sameOwner ? existing.consent_at : nowIso(),
      consent_note: str(body.consent_note) || null,
      status: 'preparing',
      error: null,
      setup_render_id: renderId,
      updated_at: nowIso(),
    },
    'client_id'
  )
  return { setup: row }
}

async function setupStatus(ctx: Ctx, body: Row) {
  const clientId = str(body.client_id)
  if (!clientId) throw bad('client_id is required.')
  let row = await ctx.one('client_ai_voice', `select=*&client_id=eq.${enc(clientId)}`)
  if (row && row.status === 'preparing') row = await advanceSetup(ctx, row)
  return { setup: row }
}

/** Moves a preparing setup along: sample rendered → voice cloned → ready. */
async function advanceSetup(ctx: Ctx, row: Row): Promise<Row> {
  const where = `client_id=eq.${enc(row.client_id)}`
  if (!row.setup_render_id) {
    return (await ctx.patch('client_ai_voice', where, { status: 'error', error: 'The voice sample was never started. Press Prepare the voice again.', updated_at: nowIso() }))[0] || row
  }
  try {
    const st = await shotstackStatus(row.setup_render_id)
    if (st.status === 'failed') throw new Fail(`Could not pull the audio off the clip: ${st.error || 'the render failed'}. Is the clip playable?`)
    if (st.status !== 'done' || !st.url) return row

    const mp3 = await fetchBytes(st.url, 30 * 1024 * 1024, 'voice sample')
    const samplePath = `ai-video/${row.client_id}/voice-sample-${Date.now()}.mp3`
    await ctx.upload(samplePath, mp3, 'audio/mpeg')

    const client = await ctx.one('clients', `select=name&id=eq.${enc(row.client_id)}`)
    const voiceId = await elAddVoice(`${client?.name || 'Owner'} owner (WC CRM)`, mp3)
    if (row.voice_id && row.voice_id !== voiceId) await elDeleteVoice(row.voice_id)

    return (
      (
        await ctx.patch('client_ai_voice', where, {
          voice_id: voiceId,
          voice_sample_path: samplePath,
          status: 'ready',
          error: null,
          setup_render_id: null,
          prepared_at: nowIso(),
          updated_at: nowIso(),
        })
      )[0] || row
    )
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err).slice(0, 600)
    return (await ctx.patch('client_ai_voice', where, { status: 'error', error: message, setup_render_id: null, updated_at: nowIso() }))[0] || row
  }
}

// ---------------------------------------------------------------------------
// Jobs.
// ---------------------------------------------------------------------------

async function createJob(ctx: Ctx, body: Row) {
  const clientId = str(body.client_id)
  const script = String(body.script || '').trim()
  if (!clientId || !script) throw bad('client_id and script are required.')

  const setup = await ctx.one('client_ai_voice', `select=*&client_id=eq.${enc(clientId)}`)
  if (!setup || setup.status !== 'ready' || !setup.voice_id || !setup.base_video_path) {
    throw bad('Set up the owner’s voice first: AI videos, on the client page.')
  }
  requireSecrets(REQUIRED)

  const spoken = spokenText(script)
  if (!spoken) throw bad('That script has no spoken lines.')
  if (spoken.length > MAX_SPOKEN_CHARS) {
    throw bad(`That script is ${spoken.length} characters of speech; keep it under ${MAX_SPOKEN_CHARS} (about a minute).`)
  }

  const job = await ctx.insert('ai_videos', {
    client_id: clientId,
    title: str(body.title) || scriptTitle(script) || null,
    script,
    spoken,
    on_screen: onScreenText(script) || null,
    status: 'queued',
    step: STEP_WORDS.queued,
  })
  return { job: await advance(ctx, job) }
}

async function runJob(ctx: Ctx, body: Row) {
  const id = str(body.id)
  if (!id) throw bad('id is required.')
  const job = await ctx.one('ai_videos', `select=*&id=eq.${enc(id)}`)
  if (!job) throw bad('That video job does not exist.')
  return { job: ACTIVE.includes(job.status) ? await advance(ctx, job) : job }
}

async function retryJob(ctx: Ctx, body: Row) {
  const id = str(body.id)
  if (!id) throw bad('id is required.')
  const job = await ctx.one('ai_videos', `select=*&id=eq.${enc(id)}`)
  if (!job) throw bad('That video job does not exist.')
  if (job.status !== 'failed') return { job }
  // Resume where it fell over rather than pay for the lip-sync again: a
  // failed cut keeps its vendor outputs, a failed submit starts over.
  const resume = (job.failed_from === 'rendering' || job.failed_from === 'generating') && job.sync_id ? 'generating' : 'queued'
  const patched =
    (
      await ctx.patch('ai_videos', `id=eq.${enc(id)}`, {
        status: resume,
        step: STEP_WORDS[resume],
        error: null,
        failed_from: null,
        render_id: null,
        locked_until: null,
        updated_at: nowIso(),
      })
    )[0] || job
  return { job: await advance(ctx, patched) }
}

/** The cron: setups being prepared and a few of the oldest active jobs. */
async function tick(ctx: Ctx) {
  const setups = await ctx.select('client_ai_voice', 'select=*&status=eq.preparing&limit=5')
  for (const s of setups) await advanceSetup(ctx, s)
  const free = `or=(locked_until.is.null,locked_until.lt.${enc(nowIso())})`
  const jobs = await ctx.select('ai_videos', `select=*&status=in.(queued,generating,rendering)&${free}&order=updated_at.asc&limit=3`)
  const moved: Row[] = []
  for (const j of jobs) {
    const r = await advance(ctx, j)
    moved.push({ id: r.id, status: r.status, step: r.step })
  }
  return { setups: setups.length, jobs: moved }
}

/**
 * One step for one job, under a lock. A failure is written on the row with
 * the status it happened in, so Retry can resume there and the panel can
 * say what went wrong.
 */
async function advance(ctx: Ctx, job: Row): Promise<Row> {
  const until = new Date(Date.now() + LOCK_SECONDS * 1000).toISOString()
  const locked = await ctx.patch(
    'ai_videos',
    `id=eq.${enc(job.id)}&or=(locked_until.is.null,locked_until.lt.${enc(nowIso())})`,
    { locked_until: until }
  )
  if (locked.length === 0) return job // the cron or another tab is on it
  let row = locked[0]
  const where = `id=eq.${enc(row.id)}`
  try {
    if (row.status === 'queued') row = await stepStart(ctx, row)
    else if (row.status === 'generating') row = await stepGenerate(ctx, row)
    else if (row.status === 'rendering') row = await stepRender(ctx, row)
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err).slice(0, 600)
    return (
      (
        await ctx.patch('ai_videos', where, {
          status: 'failed',
          failed_from: row.status,
          error: message,
          step: 'Failed',
          locked_until: null,
          updated_at: nowIso(),
        })
      )[0] || row
    )
  }
  return (await ctx.patch('ai_videos', where, { locked_until: null, updated_at: nowIso() }))[0] || row
}

const patchJob = async (ctx: Ctx, job: Row, fields: Row) => (await ctx.patch('ai_videos', `id=eq.${enc(job.id)}`, { ...fields, updated_at: nowIso() }))[0] || { ...job, ...fields }

/** Words per second a person reads at, for the one case the alignment is missing. */
const estimateSeconds = (text: string) => Math.max(5, Math.round((text.split(/\s+/).filter(Boolean).length / 2.6) * 10) / 10)

/** queued → generating: the voice, then the lip-sync and the B-roll submitted. */
async function stepStart(ctx: Ctx, job: Row): Promise<Row> {
  requireSecrets(REQUIRED)
  const setup = await ctx.one('client_ai_voice', `select=*&client_id=eq.${enc(job.client_id)}`)
  if (!setup || setup.status !== 'ready' || !setup.voice_id || !setup.base_video_path) {
    throw new Fail('The owner’s voice is not ready. Set it up on the client page first.')
  }
  const client = await ctx.one('clients', `select=id,name,industry,market&id=eq.${enc(job.client_id)}`)
  job = await patchJob(ctx, job, { step: 'Reading the script in the owner’s voice', attempts: Number(job.attempts || 0) + 1 })

  const lines = spokenLines(job.script)
  const text = job.spoken || spokenText(job.script)
  const { audio, alignment } = await elSpeak(setup.voice_id, text)
  const duration = alignmentDuration(alignment) || estimateSeconds(text)
  const prefix = jobPrefix(job.client_id, job.id)
  const audioPath = `${prefix}/voice.mp3`
  await ctx.upload(audioPath, audio, 'audio/mpeg')
  const offerAt = offerStart(lines, alignment, duration)

  // The lip-sync: the owner's own clip, saying the new words.
  job = await patchJob(ctx, job, { step: 'Lip-syncing the owner to the new words', audio_path: audioPath, duration_seconds: duration, offer_start: offerAt })
  const baseUrl = await ctx.mediaUrl(job.client_id, setup.base_video_path)
  const syncId = await syncCreate({ videoUrl: baseUrl, audioUrl: ctx.publicUrl(audioPath), name: `wc-${slug(job.title)}-${String(job.id).slice(0, 8)}` })

  // The B-roll, from the client's photos first and the trade after.
  const windows = brollWindows(duration)
  const broll: Row[] = []
  let note: string | null = null
  if (windows.length === 0) note = 'No B-roll: the script is too short for a cutaway.'
  else if (!hfReady()) note = 'No B-roll: HIGGSFIELD_API_KEY_ID and HIGGSFIELD_API_KEY_SECRET are not set, so this cut is the owner only.'
  else {
    const refs: string[] = (setup.ref_paths || []).filter((p: string) => p && !p.startsWith(DRIVE_PREFIX)).slice(0, windows.length)
    const prompts = brollPrompts({ industry: client?.industry, market: client?.market, script: job.script, count: windows.length, refCount: refs.length })
    for (const [i, p] of prompts.entries()) {
      const key = `wc-${job.id}-${job.attempts}-${i}`
      try {
        const sub =
          p.kind === 'image'
            ? await hfSubmit(HF_I2V(), { prompt: p.prompt, image_url: ctx.publicUrl(refs[i]), duration: 5, sound: 'off' }, key)
            : await hfSubmit(HF_T2V(), { prompt: p.prompt, duration: 5, aspect_ratio: '9:16', sound: 'off' }, key)
        broll.push({ kind: p.kind, prompt: p.prompt, request_id: sub.request_id, status_url: sub.status_url, status: 'queued' })
      } catch (err) {
        broll.push({ kind: p.kind, prompt: p.prompt, status: 'failed', error: String(err instanceof Error ? err.message : err).slice(0, 300) })
      }
    }
    if (broll.length > 0 && broll.every((b) => b.status === 'failed')) note = `No B-roll: Higgsfield refused every shot (${broll[0].error}).`
  }

  return patchJob(ctx, job, { status: 'generating', step: STEP_WORDS.generating, sync_id: syncId, broll, note })
}

/** generating: poll the vendors; when everything is in, copy it over and cut. */
async function stepGenerate(ctx: Ctx, job: Row): Promise<Row> {
  let changed = false
  let ownerUrl: string = job.owner_url || ''
  if (!ownerUrl) {
    const s = await syncGet(job.sync_id)
    if (s.status === 'FAILED' || s.status === 'REJECTED') throw new Fail(`The lip-sync failed: ${s.error || s.status}. A clip where the owner faces the camera with nothing over the mouth works best.`)
    if (s.status === 'COMPLETED' && s.outputUrl) {
      ownerUrl = s.outputUrl
      changed = true
    }
  }

  const broll: Row[] = Array.isArray(job.broll) ? job.broll.map((b: Row) => ({ ...b })) : []
  for (const b of broll) {
    if (!b.status_url || HF_TERMINAL.includes(b.status)) continue
    try {
      const st = await hfStatus(b.status_url)
      if (st.status === 'completed' && st.url) {
        b.status = 'completed'
        b.url = st.url
        changed = true
      } else if (['failed', 'nsfw', 'canceled'].includes(st.status)) {
        b.status = st.status
        b.error = st.error || st.status
        changed = true
      } else if (st.status && st.status !== b.status) {
        b.status = st.status
        changed = true
      }
    } catch (err) {
      // One shot's status call failing is not the video failing; ask again next time.
      b.last_error = String(err instanceof Error ? err.message : err).slice(0, 200)
    }
  }

  const pending = broll.some((b) => b.status_url && !HF_TERMINAL.includes(b.status))
  if (!ownerUrl || pending) {
    const step = !ownerUrl ? 'Lip-syncing the owner to the new words' : 'Waiting on the B-roll'
    return changed || step !== job.step ? patchJob(ctx, job, { owner_url: ownerUrl || null, broll, step }) : job
  }

  // Everything is in. Copy it into our bucket (vendor links expire) and cut.
  job = await patchJob(ctx, job, { owner_url: ownerUrl, broll, step: 'Collecting the footage' })
  const prefix = jobPrefix(job.client_id, job.id)
  const ownerPath = `${prefix}/owner.mp4`
  await ctx.upload(ownerPath, await fetchBytes(ownerUrl, 120 * 1024 * 1024, 'lip-synced clip'), 'video/mp4')

  const usable: { url: string }[] = []
  for (const [i, b] of broll.entries()) {
    if (b.status !== 'completed' || !b.url) continue
    try {
      const p = `${prefix}/broll-${i + 1}.mp4`
      await ctx.upload(p, await fetchBytes(b.url, 60 * 1024 * 1024, 'B-roll clip'), 'video/mp4')
      b.path = p
      usable.push({ url: ctx.publicUrl(p) })
    } catch (err) {
      b.status = 'failed'
      b.error = String(err instanceof Error ? err.message : err).slice(0, 300)
    }
  }

  const client = await ctx.one('clients', `select=name,logo_path&id=eq.${enc(job.client_id)}`)
  const logoPath = String(client?.logo_path || '')
  const edit = buildTimeline({
    ownerUrl: ctx.publicUrl(ownerPath),
    duration: Number(job.duration_seconds),
    broll: usable,
    onScreen: job.on_screen || '',
    business: client?.name || '',
    logoUrl: logoPath && !logoPath.startsWith(DRIVE_PREFIX) ? ctx.publicUrl(logoPath) : '',
    offerAt: job.offer_start != null ? Number(job.offer_start) : null,
  })
  const renderId = await shotstackRender(edit)
  return patchJob(ctx, job, { status: 'rendering', step: STEP_WORDS.rendering, owner_path: ownerPath, broll, render_id: renderId, timeline: edit })
}

/** rendering → done: the MP4 into the client's files, with a poster frame. */
async function stepRender(ctx: Ctx, job: Row): Promise<Row> {
  const st = await shotstackStatus(job.render_id)
  if (st.status === 'failed') throw new Fail(`The cut failed: ${st.error || 'the render failed'}.`)
  if (st.status !== 'done' || !st.url) return job

  const mp4 = await fetchBytes(st.url, MAX_MP4_BYTES + 1, 'finished video')
  if (mp4.byteLength > MAX_MP4_BYTES) {
    throw new Fail(`The finished video is ${Math.round(mp4.byteLength / 1048576)}MB, over the 50MB the bucket allows. Shorten the script.`)
  }
  const stamp = Date.now()
  const fileName = `ai-${slug(job.title)}-${stamp}.mp4`
  const videoPath = `${job.client_id}/${stamp}-${fileName}`
  await ctx.upload(videoPath, mp4, 'video/mp4')

  let posterPath: string | null = null
  if (st.poster) {
    try {
      posterPath = `${jobPrefix(job.client_id, job.id)}/poster.jpg`
      await ctx.upload(posterPath, await fetchBytes(st.poster, 8 * 1024 * 1024, 'poster'), 'image/jpeg')
    } catch {
      posterPath = null
    }
  }

  // A client file like any uploaded clip: it shows in Files, the publish
  // video list and the approval link without anything knowing it was made.
  await ctx.insert('client_files', {
    client_id: job.client_id,
    file_name: fileName,
    file_type: 'video/mp4',
    file_size: mp4.byteLength,
    storage_path: videoPath,
    description: 'AI video',
    uploaded_by: 'AI video',
  })

  return patchJob(ctx, job, { status: 'done', step: STEP_WORDS.done, video_path: videoPath, poster_path: posterPath, error: null })
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ctx = makeCtx(supabaseUrl, serviceKey)

  let body: Row
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }

  const action = str(body.action)
  try {
    switch (action) {
      case 'setup':
        return json(await startSetup(ctx, body))
      case 'setup_status':
        return json(await setupStatus(ctx, body))
      case 'create':
        return json(await createJob(ctx, body))
      case 'run':
        return json(await runJob(ctx, body))
      case 'retry':
        return json(await retryJob(ctx, body))
      case 'tick':
        return json(await tick(ctx))
      default:
        return json({ error: `Unknown action "${action}". Use setup, setup_status, create, run, retry or tick.` }, 400)
    }
  } catch (err) {
    const e = err as Fail
    return json({ error: String(e?.message || err), ...(e?.notConfigured ? { not_configured: true } : {}) }, e?.status || 500)
  }
})
