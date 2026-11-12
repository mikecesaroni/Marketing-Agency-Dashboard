// The words ahead of the click.
//
// 2026-11-12: "Can you make it so when statics or videos are dropped, the CRM
// already starts making the ad copies, so when I go to click publish I don't
// have to wait for all the ad copies to be written" and "also make it so it
// does this for what's already dropped in the CRM as well and hasn't been
// published yet".
//
// Until now the three text options (three primary texts, three headlines,
// three descriptions; Meta mixes them) were written by the publish page
// itself, the moment a static or a clip was ticked, so the page was the
// thing you waited on. Now they are written here, on a schedule, for every
// dropped static and clip that nobody has published yet:
//
//   statics  every saved_ads row an editor dropped in (dropped_by set) in
//            the last 30 days with no text options yet, not published, not
//            cleared. The painted words (the ad's name as the hook) and the
//            client's own facts go to the copy assistant, the first of each
//            lands in primary_text / headline / description (words already
//            typed stay as option one) and the rest in more_copy, exactly
//            where the publish page keeps them, so it opens with the fields
//            full and writes nothing.
//   clips    every CRM drop (a client_files video in the last 30 days, not
//            cleared) with its ad_videos row in the client's current account
//            (the video-sweep makes one within two minutes of a drop), not
//            published. A clip with no transcript yet is sent for one first
//            (transcribe-video, the same call the publish page makes), and
//            the copy is written on the next run from what is said in it;
//            a clip transcription gave up on gets its words from the
//            client's facts and the note alone, as the page would. The
//            words land on ad_videos.copy, where the page reads them.
//
// Every row is CLAIMED before anything is asked for (copy_requested_at,
// transcribe_requested_at), so two runs at once (the two-minute schedule
// and the nudge a drop box sends the moment a drop lands) cannot pay for
// the same words twice. A claim with nothing written after twenty minutes
// is tried again; one that failed (copy_error) waits six hours. A few per
// run, in parallel, well inside the function's time: the next run is two
// minutes away, so a backlog, the one already in the CRM included, clears
// on its own.
//
// Body: { action: 'sweep' | 'preview', client_id? }. preview lists what a
// sweep would do and touches nothing; client_id narrows a run to one
// client (the drop boxes send it). Columns: supabase/copy-ahead.sql.
// Secrets: none of its own; it calls ad-copy and transcribe-video with the
// service key, and they hold theirs.

import { createClient } from 'npm:@supabase/supabase-js@2'

// How far back a drop still gets its words. The boards' own window.
const WINDOW_DAYS = 30
// A claim with nothing written after this long is tried again.
const IN_FLIGHT_MINUTES = 20
// A write that failed is tried again after this long.
const ERROR_RETRY_HOURS = 6
// Per run, in parallel. A write is one call to the copy assistant, twenty
// to forty seconds; a transcription about the same.
const MAX_WRITES = 3
const MAX_TRANSCRIBES = 2
// The same ask the publish page makes (src/lib/adCopy.js suggestTextOptions).
const INSTRUCTION = 'Write three primary texts, three headlines and three descriptions for this ad. Meta mixes them, so each list stands on its own.'
// A saved ad's file: ads/<client>/<stamp>-<size>.<ext> (src/lib/staticDrops.js).
const STAMP_RE = /\/(\d+)-(\w+)\.(?:png|jpe?g|webp)$/i

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })
}

function actId(raw: unknown): string {
  const bare = String(raw || '').trim().replace(/^act_/i, '')
  return bare ? `act_${bare}` : ''
}

// The public URL of a file in the client-files bucket, segment by segment.
function bucketUrl(supabaseUrl: string, storagePath: string): string {
  return `${supabaseUrl}/storage/v1/object/public/client-files/${String(storagePath).split('/').map(encodeURIComponent).join('/')}`
}

const clean = (v: unknown) => String(v ?? '').trim()
const three = (list: unknown) => (Array.isArray(list) ? list.map(clean).filter(Boolean).slice(0, 3) : [])

type ClientRow = { id: string; name: string; industry: string | null; market: string | null; meta_ad_account_id: string | null; archived: boolean | null }
type Intake = Record<string, unknown>
type StaticRow = {
  id: string; client_id: string; stamp: string; hook: string | null; badge: string | null; offer_amount: string | null; offer_detail: string | null
  subhead: string | null; proof: string | null; primary_text: string | null; headline: string | null; description: string | null
  more_copy: Record<string, unknown> | null; about: string | null; created_at: string; copy_requested_at: string | null; copy_written_at: string | null; copy_error: string | null; dropped_by: string | null
}
type VideoRow = {
  id: string; client_id: string; storage_path: string; file_name: string | null; meta_account_id: string; meta_video_id: string | null; status: string
  about: string | null; transcript: string | null; transcript_error: string | null; copy: Record<string, unknown> | null; created_at: string
  transcribe_requested_at: string | null; copy_requested_at: string | null; copy_written_at: string | null; copy_error: string | null
}
type FileRow = { client_id: string; storage_path: string; file_name: string | null; file_type: string | null; date_uploaded: string | null; drop_dismissed_at: string | null }

/**
 * What the business actually sells, off the client row and their onboarding
 * answers: the same fields the publish page sends (src/lib/adCopy.js), so
 * the words written here are the words it would have written.
 */
function facts(client: ClientRow, intake: Intake | null) {
  const i = intake || {}
  return {
    client_id: client.id,
    client_name: client.name,
    industry: client.industry || i.industry_trade,
    market: client.market,
    service_area: i.service_area,
    services: i.service_want_more || i.most_profitable_service || i.services_offered,
    offer: i.offer_headline || i.current_offers_guarantees,
    guarantee: i.guarantee,
    price_range: i.typical_price_range,
    why_choose: i.why_people_choose,
    ideal_customer: i.ideal_customer,
    cta_label: i.cta_offering,
    words_to_avoid: i.words_to_avoid,
  }
}

/** Whether a copy record already carries text options (src/lib/textOptions.js hasTextOptions, on the saved shapes). */
function staticHasOptions(row: StaticRow): boolean {
  const m = row.more_copy || {}
  return ['primary_texts', 'headlines', 'descriptions'].some((k) => Array.isArray(m[k]) && (m[k] as unknown[]).some((s) => clean(s)))
}
function videoHasOptions(row: VideoRow): boolean {
  const c = row.copy || {}
  return ['more_primary_texts', 'more_headlines', 'more_descriptions'].some((k) => Array.isArray(c[k]) && (c[k] as unknown[]).some((s) => clean(s)))
}

/**
 * The first of each into the main field (words already there stay as option
 * one) and the rest as the extras: src/lib/textOptions.js patchAddingOptions,
 * three in all.
 */
function merge(have: unknown, list: string[]) {
  const first = clean(have)
  if (first) return { main: first, more: list.filter((s) => s !== first).slice(0, 2) }
  return { main: list[0] || '', more: list.slice(1, 3) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  let body: { action?: string; client_id?: string } = {}
  try {
    body = await req.json()
  } catch {
    // A cron ping with no body is a sweep.
  }
  const action = body.action || 'sweep'
  if (action !== 'sweep' && action !== 'preview') return json({ error: `Unknown action "${action}".` }, 400)
  const preview = action === 'preview'
  const onlyClient = /^[0-9a-f-]{36}$/i.test(String(body.client_id || '')) ? String(body.client_id) : ''

  // The two functions that do the work, called the way the publish page
  // calls them, with the service key standing in for the signed-in user.
  const callFn = async (name: string, payload: Record<string, unknown>) => {
    const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.error) throw new Error(String(data?.error || `${name} returned ${res.status}`))
    return data as Record<string, any>
  }

  try {
    const now = new Date()
    const nowIso = now.toISOString()
    const since = new Date(now.getTime() - WINDOW_DAYS * 86400000).toISOString()
    const inFlightBefore = new Date(now.getTime() - IN_FLIGHT_MINUTES * 60000).toISOString()
    const errorBefore = new Date(now.getTime() - ERROR_RETRY_HOURS * 3600000).toISOString()
    // Free to claim: never claimed, or claimed and gone quiet, or failed a while ago.
    const free = (requestedAt: string | null, error: string | null) =>
      !requestedAt || (error ? requestedAt < errorBefore : requestedAt < inFlightBefore)

    // --- who ---------------------------------------------------------------------
    let clientQuery = supabase.from('clients').select('id, name, industry, market, meta_ad_account_id, archived')
    if (onlyClient) clientQuery = clientQuery.eq('id', onlyClient)
    const { data: clientRows, error: cErr } = await clientQuery
    if (cErr) throw new Error(`clients: ${cErr.message}`)
    const clients = new Map<string, ClientRow>()
    for (const c of (clientRows || []) as ClientRow[]) if (!c.archived) clients.set(c.id, c)
    const ids = [...clients.keys()]
    if (!ids.length) return json({ day: nowIso.slice(0, 10), preview, note: 'No client to write for.' })

    // --- what is dropped, published, cleared ---------------------------------------------
    const [staticsRes, videosRes, filesRes, publishedRes] = await Promise.all([
      supabase
        .from('saved_ads')
        .select('id, client_id, stamp, hook, badge, offer_amount, offer_detail, subhead, proof, primary_text, headline, description, more_copy, about, created_at, copy_requested_at, copy_written_at, copy_error, dropped_by')
        .in('client_id', ids)
        .not('dropped_by', 'is', null)
        .gte('created_at', since)
        .order('created_at', { ascending: false }),
      supabase
        .from('ad_videos')
        .select('id, client_id, storage_path, file_name, meta_account_id, meta_video_id, status, about, transcript, transcript_error, copy, created_at, transcribe_requested_at, copy_requested_at, copy_written_at, copy_error')
        .in('client_id', ids)
        .gte('created_at', since)
        .order('created_at', { ascending: false }),
      supabase.from('client_files').select('client_id, storage_path, file_name, file_type, date_uploaded, drop_dismissed_at, drop_note').in('client_id', ids).gte('date_uploaded', since),
      supabase.from('published_ads').select('client_id, stamp, video_id').in('client_id', ids),
    ])
    for (const [name, r] of [['saved_ads', staticsRes], ['ad_videos', videosRes], ['client_files', filesRes], ['published_ads', publishedRes]] as const) {
      if (r.error) throw new Error(`${name}: ${r.error.message}`)
    }
    const files = (filesRes.data || []) as FileRow[]
    const publishedStamps = new Set((publishedRes.data || []).map((p: any) => `${p.client_id}:${p.stamp}`).filter((k: string) => !k.endsWith(':null')))
    const publishedVideos = new Set((publishedRes.data || []).map((p: any) => String(p.video_id || '')).filter(Boolean))
    // Cleared statics, by stamp; cleared clips, by path. And, per static,
    // the picture the copy assistant is shown (the 4:5 first) and the note
    // the editor typed on the drop.
    const clearedStamps = new Set<string>()
    const clearedPaths = new Set<string>()
    const droppedPaths = new Map<string, FileRow>()
    const staticFiles = new Map<string, { path: string; key: string }[]>()
    const staticNotes = new Map<string, string>()
    for (const f of files) {
      const m = String(f.storage_path || '').match(STAMP_RE)
      if (m && f.drop_dismissed_at) clearedStamps.add(`${f.client_id}:${m[1]}`)
      if (m) {
        const k = `${f.client_id}:${m[1]}`
        if (!staticFiles.has(k)) staticFiles.set(k, [])
        staticFiles.get(k)!.push({ path: f.storage_path, key: m[2].toLowerCase() })
        if (clean((f as any).drop_note) && !staticNotes.has(k)) staticNotes.set(k, clean((f as any).drop_note))
      }
      if (String(f.file_type || '').startsWith('video/') && !String(f.storage_path || '').startsWith('drive:')) {
        if (f.drop_dismissed_at) clearedPaths.add(f.storage_path)
        else droppedPaths.set(f.storage_path, f)
      }
    }

    // --- the statics still without words --------------------------------------------
    const staticsTodo = ((staticsRes.data || []) as StaticRow[]).filter((s) => {
      if (staticHasOptions(s) || s.copy_written_at) return false
      if (publishedStamps.has(`${s.client_id}:${s.stamp}`) || clearedStamps.has(`${s.client_id}:${s.stamp}`)) return false
      return free(s.copy_requested_at, s.copy_error)
    })

    // --- the clips: a transcript first, then the words ---------------------------------
    const transcribeTodo: VideoRow[] = []
    const videosTodo: VideoRow[] = []
    for (const v of (videosRes.data || []) as VideoRow[]) {
      const client = clients.get(v.client_id)
      if (!client || v.meta_account_id !== actId(client.meta_ad_account_id)) continue
      // A CRM drop, not cleared, not published. A Drive clip is somebody's
      // pick on the publish page, and gets its words there.
      if (!droppedPaths.has(v.storage_path) || clearedPaths.has(v.storage_path)) continue
      if (v.meta_video_id && publishedVideos.has(v.meta_video_id)) continue
      if (videoHasOptions(v) || v.copy_written_at) continue
      const heard = Boolean(clean(v.transcript) || clean(v.transcript_error))
      if (!heard) {
        if (free(v.transcribe_requested_at, null)) transcribeTodo.push(v)
        continue
      }
      if (free(v.copy_requested_at, v.copy_error)) videosTodo.push(v)
    }

    const name = (id: string) => clients.get(id)?.name || id
    if (preview) {
      return json({
        day: nowIso.slice(0, 10),
        preview: true,
        statics: staticsTodo.map((s) => ({ client: name(s.client_id), stamp: s.stamp, name: s.hook || '', has_words: Boolean(clean(s.primary_text)) })),
        videos: videosTodo.map((v) => ({ client: name(v.client_id), file: v.file_name || v.storage_path, transcript: Boolean(clean(v.transcript)) })),
        transcribe: transcribeTodo.map((v) => ({ client: name(v.client_id), file: v.file_name || v.storage_path })),
        per_run: { writes: MAX_WRITES, transcribes: MAX_TRANSCRIBES },
      })
    }

    // The intake answers for the clients being written for, once.
    const needIntake = [...new Set([...staticsTodo, ...videosTodo].map((r) => r.client_id))]
    const intakes = new Map<string, Intake>()
    if (needIntake.length) {
      const { data: rows } = await supabase.from('onboarding_intake').select('*').in('client_id', needIntake)
      for (const r of (rows || []) as Intake[]) intakes.set(String(r.client_id), r)
    }

    // A claim, or nothing: only the run that flips the column does the work.
    const claim = async (table: string, id: string, column: string) => {
      const { data } = await supabase
        .from(table)
        .update({ [column]: nowIso, ...(column === 'copy_requested_at' ? { copy_error: null } : {}) })
        .eq('id', id)
        .or(`${column}.is.null,${column}.lt.${inFlightBefore}`)
        .select('id')
      return Boolean(data && data.length)
    }

    const written: { kind: string; client: string; name: string }[] = []
    const failed: { kind: string; client: string; name: string; error: string }[] = []
    const transcribed: { client: string; name: string; ok: boolean; note?: string }[] = []

    const writeStatic = async (s: StaticRow) => {
      const client = clients.get(s.client_id)!
      const label = s.hook || `static ${s.stamp}`
      if (!(await claim('saved_ads', s.id, 'copy_requested_at'))) return
      try {
        // The picture itself, the 4:5 first, so the words match what is
        // painted on it; and what the ad is for, typed on the drop.
        const sizes = staticFiles.get(`${s.client_id}:${s.stamp}`) || []
        const picture = ['feed', 'square', 'story'].map((k) => sizes.find((f) => f.key === k)).find(Boolean)
        const out = await callFn('ad-copy', {
          mode: 'text_options',
          medium: 'image',
          emojis: true,
          ...facts(client, intakes.get(s.client_id) || null),
          image_url: picture ? bucketUrl(supabaseUrl, picture.path) : undefined,
          about: clean(s.about) || staticNotes.get(`${s.client_id}:${s.stamp}`) || '',
          current: {
            badge: s.badge || '',
            hook: s.hook || '',
            offerAmount: s.offer_amount || '',
            offerDetail: s.offer_detail || '',
            subhead: s.subhead || '',
            proof: s.proof || '',
            primaryText: s.primary_text || '',
            headline: s.headline || '',
            description: s.description || '',
          },
          instruction: INSTRUCTION,
        })
        const lists = { primaryTexts: three(out.primaryTexts), headlines: three(out.headlines), descriptions: three(out.descriptions) }
        if (!lists.primaryTexts.length) throw new Error(clean(out.note) || 'The copy assistant did not return a primary text.')
        const p = merge(s.primary_text, lists.primaryTexts)
        const h = merge(s.headline, lists.headlines)
        const d = merge(s.description, lists.descriptions)
        const { error } = await supabase
          .from('saved_ads')
          .update({
            primary_text: p.main || null,
            headline: h.main || null,
            description: d.main || null,
            more_copy: { primary_texts: p.more, headlines: h.more, descriptions: d.more },
            copy_written_at: new Date().toISOString(),
            copy_error: null,
          })
          .eq('id', s.id)
        if (error) throw new Error(`saved_ads: ${error.message}`)
        written.push({ kind: 'static', client: client.name, name: label })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        failed.push({ kind: 'static', client: client.name, name: label, error: message })
        await supabase.from('saved_ads').update({ copy_error: message.slice(0, 500) }).eq('id', s.id)
      }
    }

    const writeVideo = async (v: VideoRow) => {
      const client = clients.get(v.client_id)!
      const label = v.file_name || v.storage_path.split('/').pop() || v.storage_path
      if (!(await claim('ad_videos', v.id, 'copy_requested_at'))) return
      try {
        const copy = v.copy || {}
        const out = await callFn('ad-copy', {
          mode: 'text_options',
          medium: 'video',
          emojis: true,
          ...facts(client, intakes.get(v.client_id) || null),
          about: v.about || '',
          transcript: v.transcript || '',
          current: { primaryText: copy.primary_text || '', headline: copy.headline || '', description: copy.description || '' },
          instruction: INSTRUCTION,
        })
        const lists = { primaryTexts: three(out.primaryTexts), headlines: three(out.headlines), descriptions: three(out.descriptions) }
        if (!lists.primaryTexts.length) throw new Error(clean(out.note) || 'The copy assistant did not return a primary text.')
        const p = merge(copy.primary_text, lists.primaryTexts)
        const h = merge(copy.headline, lists.headlines)
        const d = merge(copy.description, lists.descriptions)
        const { error } = await supabase
          .from('ad_videos')
          .update({
            copy: { ...copy, primary_text: p.main, headline: h.main, description: d.main, more_primary_texts: p.more, more_headlines: h.more, more_descriptions: d.more },
            copy_written_at: new Date().toISOString(),
            copy_error: null,
          })
          .eq('id', v.id)
        if (error) throw new Error(`ad_videos: ${error.message}`)
        written.push({ kind: 'video', client: client.name, name: label })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        failed.push({ kind: 'video', client: client.name, name: label, error: message })
        await supabase.from('ad_videos').update({ copy_error: message.slice(0, 500) }).eq('id', v.id)
      }
    }

    const transcribe = async (v: VideoRow) => {
      const client = clients.get(v.client_id)!
      const label = v.file_name || v.storage_path.split('/').pop() || v.storage_path
      if (!(await claim('ad_videos', v.id, 'transcribe_requested_at'))) return
      try {
        const out = await callFn('transcribe-video', { client_id: v.client_id, storage_path: v.storage_path })
        transcribed.push({ client: client.name, name: label, ok: true, note: out?.empty ? 'no speech found' : undefined })
      } catch (err) {
        // Recorded on the row the way the function records its own failures,
        // so the next run writes the words from the note and the facts, as
        // the publish page does when transcription has given up.
        const message = err instanceof Error ? err.message : String(err)
        transcribed.push({ client: client.name, name: label, ok: false, note: message })
        await supabase.from('ad_videos').update({ transcript_error: message.slice(0, 500) }).eq('id', v.id).is('transcript', null)
      }
    }

    // Newest first across both kinds, a few per run, all at once.
    const writes = [...staticsTodo.map((s) => ({ at: s.created_at, run: () => writeStatic(s) })), ...videosTodo.map((v) => ({ at: v.created_at, run: () => writeVideo(v) }))]
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, MAX_WRITES)
    await Promise.allSettled([...writes.map((w) => w.run()), ...transcribeTodo.slice(0, MAX_TRANSCRIBES).map((v) => transcribe(v))])

    return json({
      day: nowIso.slice(0, 10),
      preview: false,
      written,
      failed,
      transcribed,
      backlog: {
        writes: Math.max(0, staticsTodo.length + videosTodo.length - MAX_WRITES),
        transcribe: Math.max(0, transcribeTodo.length - MAX_TRANSCRIBES),
      },
    })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
