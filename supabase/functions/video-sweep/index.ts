// Every clip an editor drops into the CRM goes to the client's Meta ad
// account on its own, and is marked ready on its own.
//
// "Make clips dropped in the CRM by the editor auto send to Meta so they are
// ready when we click publish, or if someone wants to do it manually."
//
// The drop zone already sends a clip to Meta from the editor's browser the
// moment it lands. Two things were missing, and both showed up as "not in
// Meta yet" on the board and in Slack for clips Meta was in fact already
// transcoding:
//
//   * Nothing re-sent a clip whose send did not happen: the tab closed, the
//     call failed, the client had no ad account yet that day.
//   * Nothing asked Meta whether it had FINISHED. The row stayed 'processing'
//     until somebody opened the publish page, whose picker polls; a clip
//     dropped on Friday read "not in Meta yet" all weekend.
//
// So, every couple of minutes (pg_cron, supabase/video-sweep.sql):
//
//   send   every CRM upload (a client_files video row from the last 30 days)
//          with no registration in the client's CURRENT ad account is handed
//          to Meta by URL, the same /advideos call meta-publish and
//          drive-video-register make; Meta downloads the bytes itself and
//          keeps its own copy. A send Meta refused is recorded on the row
//          (status 'error', no video id) and tried again six hours later;
//          the publish page's "Send to Meta" button retries it at once.
//   poll   every registration still 'processing' (or ready with no cover
//          frame yet) is asked about, and the row gets Meta's answer: ready
//          and the preferred thumbnail, or the error. The picker reads the
//          same row, so the publish page needs no idea this ran.
//
// What is NOT sent: a video that only sits in the client's Google Drive
// folder (clients put raw phone footage there all week; a Drive clip goes to
// Meta when somebody picks it on the publish page), and a drop waved off as
// "published manually" (its file is in the account already, by hand; a
// second copy would only clutter the library).
//
// Once a clip is in the account it is in the Media Library in Ads Manager
// under "<Client> — <file name>", so an ad can be built from it by hand there
// as well as here.
//
// Secrets: META_ACCESS_TOKEN (the same System User token every Meta function
// reads). Body: { action: 'sweep' | 'preview' }; preview lists what a sweep
// would do and touches nothing.

import { createClient } from 'npm:@supabase/supabase-js@2'

const META_API_VERSION = 'v21.0'
const GRAPH = `https://graph.facebook.com/${META_API_VERSION}`

// How far back a drop is still sent. The board's own "new clip" window.
const WINDOW_DAYS = 30
// How long a processing row is still asked about. Meta transcodes in
// minutes; a row still processing after two weeks is not going to finish.
const POLL_DAYS = 14
// A send Meta refused is tried again after this long.
const RETRY_HOURS = 6
// Per run. A send is one quick call (Meta downloads later); a poll is one or
// two. The next run is two minutes away, so a backlog clears on its own.
const MAX_SENDS = 10
const MAX_POLLS = 25

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })
}

// Ad account IDs are stored bare in the CRM; every Graph path, and every
// ad_videos row, carries act_. Both bugs this has caused are in
// drive-video-register's header.
function actId(raw: unknown): string {
  const bare = String(raw || '').trim().replace(/^act_/i, '')
  return bare ? `act_${bare}` : ''
}

// The public URL of a file in the client-files bucket, segment by segment:
// uploaded names arrive with spaces and parentheses straight off a phone.
function bucketUrl(supabaseUrl: string, storagePath: string): string {
  return `${supabaseUrl}/storage/v1/object/public/client-files/${String(storagePath).split('/').map(encodeURIComponent).join('/')}`
}

function graphMessage(body: Record<string, any>, status: number): string {
  const err = body?.error || {}
  return [err.error_user_title, err.error_user_msg || err.message].filter(Boolean).join(' — ') || `Meta returned ${status}`
}

async function graphGet(path: string, params: Record<string, string>, token: string) {
  const url = new URL(`${GRAPH}/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('access_token', token)
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(graphMessage(body, res.status))
  return body
}

// Kept identical to meta-publish's uploadVideo and drive-video-register's
// POST, so the three cannot disagree about how a video is handed over.
async function sendVideo(account: string, fileUrl: string, name: string, token: string): Promise<string> {
  const form = new URLSearchParams({ file_url: fileUrl, name, access_token: token })
  const res = await fetch(`${GRAPH}/${account}/advideos`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body?.id) throw new Error(graphMessage(body, res.status))
  return String(body.id)
}

// Where Meta has got to, and the preferred frame once there is one: the same
// two reads meta-publish's videoState makes, so the row ends up the same.
async function videoState(videoId: string, token: string) {
  const info = await graphGet(videoId, { fields: 'status' }, token)
  const status = String(info?.status?.video_status || 'processing')
  let thumbUrl = ''
  if (status === 'ready') {
    const thumbs = await graphGet(videoId, { fields: 'thumbnails{uri,is_preferred}' }, token)
    const list = (thumbs?.thumbnails?.data || []) as { uri?: string; is_preferred?: boolean }[]
    thumbUrl = String(list.find((t) => t.is_preferred)?.uri || list[0]?.uri || '')
  }
  return { status, thumbUrl, error: status === 'error' ? String(info?.status?.processing_progress ?? 'Meta could not process this video.') : '' }
}

type ClientRow = { id: string; name: string; meta_ad_account_id: string | null; archived: boolean | null }
type FileRow = { client_id: string; storage_path: string; file_name: string | null; date_uploaded: string | null; drop_dismissed_at: string | null }
type VideoRow = { id: string; client_id: string; storage_path: string; meta_account_id: string; meta_video_id: string | null; status: string; thumb_url: string | null; error: string | null; created_at: string; updated_at: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const token = Deno.env.get('META_ACCESS_TOKEN') || ''
  if (!token) return json({ error: 'META_ACCESS_TOKEN is not set on this project. See docs/meta-connection.md.' }, 500)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  let body: { action?: string } = {}
  try {
    body = await req.json()
  } catch {
    // A cron ping with no body is a sweep.
  }
  const action = body.action || 'sweep'
  if (action !== 'sweep' && action !== 'preview') return json({ error: `Unknown action "${action}".` }, 400)
  const preview = action === 'preview'

  try {
    const now = new Date()
    const since = new Date(now.getTime() - WINDOW_DAYS * 86400000).toISOString()
    const pollSince = new Date(now.getTime() - POLL_DAYS * 86400000).toISOString()
    const retryBefore = new Date(now.getTime() - RETRY_HOURS * 3600000).toISOString()

    // Clients with an ad account to send to. An archived client's clips stay
    // where they are.
    const { data: clientRows, error: cErr } = await supabase.from('clients').select('id, name, meta_ad_account_id, archived').not('meta_ad_account_id', 'is', null)
    if (cErr) throw new Error(`clients: ${cErr.message}`)
    const clients = new Map<string, { id: string; name: string; account: string }>()
    for (const c of (clientRows || []) as ClientRow[]) {
      const account = actId(c.meta_ad_account_id)
      if (!account || c.archived) continue
      clients.set(c.id, { id: c.id, name: c.name, account })
    }
    const ids = [...clients.keys()]
    if (!ids.length) return json({ day: now.toISOString().slice(0, 10), preview, sent: [], ready: [], failed: [], processing: 0, note: 'No client has a Meta ad account.' })

    // The drops: CRM uploads, bucket paths only. A Drive clip is never one.
    const [{ data: fileRows, error: fErr }, { data: videoRows, error: vErr }] = await Promise.all([
      supabase.from('client_files').select('client_id, storage_path, file_name, date_uploaded, drop_dismissed_at').in('client_id', ids).ilike('file_type', 'video/%').gte('date_uploaded', since),
      supabase.from('ad_videos').select('id, client_id, storage_path, meta_account_id, meta_video_id, status, thumb_url, error, created_at, updated_at').in('client_id', ids),
    ])
    if (fErr) throw new Error(`client_files: ${fErr.message}`)
    if (vErr) throw new Error(`ad_videos: ${vErr.message}`)
    const files = ((fileRows || []) as FileRow[]).filter((f) => f.storage_path && !f.storage_path.startsWith('drive:')).sort((a, b) => String(b.date_uploaded || '').localeCompare(String(a.date_uploaded || '')))
    const videos = (videoRows || []) as VideoRow[]
    const byKey = new Map(videos.map((v) => [`${v.storage_path}|${v.meta_account_id}`, v]))

    // --- send -------------------------------------------------------------------
    const toSend: { client: { id: string; name: string; account: string }; file: FileRow; again: boolean }[] = []
    for (const f of files) {
      const client = clients.get(f.client_id)
      if (!client) continue
      // Published by hand: the account has it already.
      if (f.drop_dismissed_at) continue
      const row = byKey.get(`${f.storage_path}|${client.account}`)
      if (!row) toSend.push({ client, file: f, again: false })
      // A send Meta refused last time, old enough to try once more. A row
      // with a video id is Meta's to finish, never re-sent: a second copy
      // would sit beside the first in the library.
      else if (!row.meta_video_id && row.status === 'error' && row.updated_at < retryBefore) toSend.push({ client, file: f, again: true })
    }

    const sent: { client: string; file: string; again: boolean }[] = []
    const failed: { client: string; file: string; error: string }[] = []
    for (const s of toSend.slice(0, MAX_SENDS)) {
      const fileName = String(s.file.file_name || s.file.storage_path.split('/').pop() || 'video')
      if (preview) {
        sent.push({ client: s.client.name, file: fileName, again: s.again })
        continue
      }
      const base = { client_id: s.client.id, storage_path: s.file.storage_path, file_name: fileName, meta_account_id: s.client.account, updated_at: now.toISOString() }
      try {
        const videoId = await sendVideo(s.client.account, bucketUrl(supabaseUrl, s.file.storage_path), `${s.client.name} — ${fileName}`, token)
        const { error } = await supabase.from('ad_videos').upsert({ ...base, meta_video_id: videoId, status: 'processing', error: null }, { onConflict: 'storage_path,meta_account_id' })
        if (error) throw new Error(`Meta has it (${videoId}) but the row was not written: ${error.message}`)
        sent.push({ client: s.client.name, file: fileName, again: s.again })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        failed.push({ client: s.client.name, file: fileName, error: message })
        // Recorded so the next run does not try again at once, and so the
        // publish page can show why ("Meta would not take it: ...").
        await supabase.from('ad_videos').upsert({ ...base, meta_video_id: null, status: 'error', error: `Meta would not take it: ${message}`.slice(0, 500) }, { onConflict: 'storage_path,meta_account_id' })
      }
    }

    // --- poll -------------------------------------------------------------------
    const toPoll = videos.filter((v) => {
      const client = clients.get(v.client_id)
      if (!client || v.meta_account_id !== client.account || !v.meta_video_id) return false
      if (v.created_at < pollSince) return false
      return v.status === 'processing' || (v.status === 'ready' && !v.thumb_url)
    })
    const ready: { client: string; file: string }[] = []
    const errored: { client: string; file: string; error: string }[] = []
    let stillProcessing = 0
    for (const v of toPoll.slice(0, MAX_POLLS)) {
      const client = clients.get(v.client_id)!
      const fileName = String(v.storage_path.split('/').pop() || v.storage_path)
      if (preview) {
        stillProcessing++
        continue
      }
      try {
        const state = await videoState(String(v.meta_video_id), token)
        await supabase.from('ad_videos').update({ status: state.status, thumb_url: state.thumbUrl || null, error: state.error || null, updated_at: new Date().toISOString() }).eq('id', v.id)
        if (state.status === 'ready' && state.thumbUrl) ready.push({ client: client.name, file: fileName })
        else if (state.status === 'error') errored.push({ client: client.name, file: fileName, error: state.error })
        else stillProcessing++
      } catch (err) {
        // A read that failed is not news about the video: leave the row and
        // ask again next time.
        failed.push({ client: client.name, file: fileName, error: err instanceof Error ? err.message : String(err) })
        stillProcessing++
      }
    }

    return json({
      day: now.toISOString().slice(0, 10),
      preview,
      sent,
      ready,
      errored,
      failed,
      processing: stillProcessing,
      backlog: { send: Math.max(0, toSend.length - MAX_SENDS), poll: Math.max(0, toPoll.length - MAX_POLLS) },
    })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
