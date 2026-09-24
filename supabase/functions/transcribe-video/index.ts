// Turns the audio of an ad video into text, so the copy can be written from
// what is actually said in it.
//
// BACK FROM RETIREMENT, on purpose. An earlier version of this did the same
// job with Deepgram and was retired because it meant a second vendor for an
// input a person could type in ten seconds. The team then typed transcripts
// in by hand, into the "what happens in this video" box, for weeks. That is
// the ten seconds turning into ten minutes per clip, and it is the reason
// this is back: asked for on 2026-09-24, with the copy assistant reading the
// transcript and offering three versions to choose from.
//
// Deepgram again, and not Whisper, for the same reasons as before: Deepgram
// takes a URL and streams the file itself (no 25MB multipart cap), and it
// handles the phone .mov files the bucket is full of.
//
// WHERE THE FILE COMES FROM. The same two places Meta downloads from:
//   * an uploaded video: the public client-files bucket URL
//   * a Drive video: a short-lived grant on the drive-video function, minted
//     the same way drive-video-register mints one for Meta
// so if Meta can fetch a clip, Deepgram can.
//
// Idempotent: a video already transcribed returns what is stored unless
// `force` is set. The transcript lives on ad_videos.transcript; a failure is
// written to ad_videos.transcript_error so the screen can say why.
//
// Secrets: DEEPGRAM_API_KEY (new; Project Settings > Edge Functions > Secrets).

const DEEPGRAM = 'https://api.deepgram.com/v1/listen'
const DRIVE_PREFIX = 'drive:'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }

  const clientId = String(body.client_id || '').trim()
  const storagePath = String(body.storage_path || '').trim()
  if (!clientId || !storagePath) return json({ error: 'client_id and storage_path are required.' }, 400)

  const key = Deno.env.get('DEEPGRAM_API_KEY')
  if (!key) {
    return json(
      {
        error:
          'Transcription is not switched on yet: DEEPGRAM_API_KEY is not set on this project. Add it under Project Settings > Edge Functions > Secrets (a free Deepgram account comes with credit), then try again.',
        not_configured: true,
      },
      500
    )
  }

  // The row this transcript belongs to. Videos are registered here the moment
  // they are uploaded or picked from Drive, so a missing row means a path
  // this client does not own.
  const rowUrl =
    `${supabaseUrl}/rest/v1/ad_videos?client_id=eq.${encodeURIComponent(clientId)}` +
    `&storage_path=eq.${encodeURIComponent(storagePath)}&select=id,transcript,transcribed_at,file_name&limit=1`
  const row = await fetch(rowUrl, { headers: dbHeaders })
    .then((r) => r.json())
    .then((rows) => rows?.[0])
  if (!row) return json({ error: 'That video is not registered for this client. Send it to Meta first.' }, 404)

  if (row.transcript && !body.force) {
    return json({ transcript: row.transcript, transcribed_at: row.transcribed_at, cached: true })
  }

  const patch = async (fields: Record<string, unknown>) => {
    await fetch(`${supabaseUrl}/rest/v1/ad_videos?id=eq.${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      headers: { ...dbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify(fields),
    }).catch(() => {})
  }

  try {
    // Where Deepgram fetches the bytes from.
    let mediaUrl: string
    if (storagePath.startsWith(DRIVE_PREFIX)) {
      const grant = await fetch(`${supabaseUrl}/rest/v1/drive_video_grants`, {
        method: 'POST',
        headers: { ...dbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ client_id: clientId, drive_file_id: storagePath.slice(DRIVE_PREFIX.length) }),
      })
        .then((r) => r.json())
        .then((rows) => rows?.[0])
      if (!grant?.token) throw new Error('Could not create a download link for that Drive video.')
      mediaUrl = `${supabaseUrl}/functions/v1/drive-video?t=${grant.token}`
    } else {
      const encoded = storagePath.split('/').map(encodeURIComponent).join('/')
      mediaUrl = `${supabaseUrl}/storage/v1/object/public/client-files/${encoded}`
    }

    // Nova-3 with smart formatting: punctuation, numbers as digits ("$79",
    // not "seventy nine dollars"), paragraphs. Language detected, because a
    // Spanish-language clip is not unheard of in this book of clients.
    const params = new URLSearchParams({
      model: 'nova-3',
      smart_format: 'true',
      punctuate: 'true',
      paragraphs: 'true',
      detect_language: 'true',
    })
    const res = await fetch(`${DEEPGRAM}?${params}`, {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: mediaUrl }),
    })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) {
      const reason = out?.err_msg || out?.message || out?.error || `Deepgram returned ${res.status}`
      throw new Error(String(reason))
    }

    const alt = out?.results?.channels?.[0]?.alternatives?.[0]
    const transcript = String(alt?.paragraphs?.transcript || alt?.transcript || '').trim()
    const duration = Number(out?.metadata?.duration || 0)

    if (!transcript) {
      // Not an error to retry: a clip with music and no speech is a real
      // outcome, and the screen should say "nothing said" rather than keep
      // trying.
      await patch({ transcript: null, transcribed_at: new Date().toISOString(), transcript_error: 'No speech was found in the audio.' })
      return json({ transcript: '', duration, empty: true })
    }

    await patch({ transcript, transcribed_at: new Date().toISOString(), transcript_error: null })
    return json({ transcript, duration, language: out?.results?.channels?.[0]?.detected_language || null })
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err)
    await patch({ transcript_error: message })
    return json({ error: message }, 502)
  }
})
