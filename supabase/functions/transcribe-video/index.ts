// Turns an uploaded ad video into the words that were said in it, so the copy
// assistant can write from the client's own pitch rather than only from their
// onboarding form.
//
// WHY A VENDOR AT ALL. Meta does not give you this: probed against a real
// AdVideo, the /captions edge returns {"data": []} (it exists to receive
// caption files you upload), the captions field returns nothing, and the node
// exposes no caption, transcript or subtitle field of any kind. Claude has no
// audio input either. So speech-to-text is a real dependency.
//
// WHY DEEPGRAM AND NOT WHISPER. Whisper's API takes the file as a multipart
// upload with a 25 MB ceiling, and its documented container list does not
// include .mov. Both are disqualifying here rather than inconvenient: the
// videos already in this bucket run to 24.5 MB, the app accepts up to 250 MB,
// and half of what comes off a phone is .mov. Deepgram takes a URL instead, so
// the bytes never pass through this function -- no memory ceiling, no wall
// clock spent streaming, and the file it reads is the same public object Meta
// itself downloads.
//
// Secrets: DEEPGRAM_API_KEY.

const DEEPGRAM = 'https://api.deepgram.com/v1/listen'

// nova-3 is Deepgram's current general model. smart_format puts in the
// punctuation and capitalisation, which matters because the transcript is read
// by a language model and by a person, not parsed.
const PARAMS = new URLSearchParams({
  model: 'nova-3',
  smart_format: 'true',
  punctuate: 'true',
  // A home services ad is one or two people to camera. Diarisation would add
  // speaker labels nobody needs and make the text harder to read.
  diarize: 'false',
})

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

// The public object URL, built here so the only thing a caller names is a
// storage path. Segments are encoded because phone exports arrive with spaces
// and parentheses in the filename.
function bucketUrl(supabaseUrl: string, storagePath: string): string {
  const encoded = String(storagePath)
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
  return `${supabaseUrl}/storage/v1/object/public/client-files/${encoded}`
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

  const storagePath = String(body.storage_path || '').trim()
  const clientId = String(body.client_id || '').trim()
  if (!storagePath || !clientId) {
    return json({ error: 'client_id and storage_path are required.' }, 400)
  }

  const rowUrl =
    `${supabaseUrl}/rest/v1/ad_videos` +
    `?storage_path=eq.${encodeURIComponent(storagePath)}` +
    `&client_id=eq.${encodeURIComponent(clientId)}`

  // Returns how many rows the write actually landed on. A PATCH that matches
  // nothing is a 200 with an empty body in PostgREST, so without asking for
  // the representation back a missing ad_videos row looks exactly like a
  // successful save -- and the transcript would be silently re-bought, at real
  // cost, on every press of "Write the copy".
  const patch = async (fields: Record<string, unknown>): Promise<number> => {
    const res = await fetch(rowUrl, {
      method: 'PATCH',
      headers: { ...dbHeaders, Prefer: 'return=representation' },
      body: JSON.stringify(fields),
    })
    if (!res.ok) return 0
    const rows = await res.json().catch(() => [])
    return Array.isArray(rows) ? rows.length : 0
  }

  // Already transcribed? Hand it back rather than paying for it twice. The
  // words in a file do not change, and one clip gets its copy rewritten
  // several times while somebody hunts for an angle they like.
  const existing = await fetch(`${rowUrl}&select=transcript,transcript_status`, {
    headers: dbHeaders,
  })
    .then((r) => r.json())
    .then((rows) => rows?.[0])
    .catch(() => null)

  if (!body.force && existing && ['done', 'empty'].includes(existing.transcript_status)) {
    return json({
      status: existing.transcript_status,
      transcript: existing.transcript || '',
      cached: true,
      stored: true,
    })
  }

  const apiKey = Deno.env.get('DEEPGRAM_API_KEY')
  if (!apiKey) {
    return json(
      {
        error:
          'DEEPGRAM_API_KEY is not set on this project. Add it under Project Settings > Edge Functions > Secrets, then press this again. Until then the copy assistant works from the onboarding form only.',
      },
      501
    )
  }

  await patch({ transcript_status: 'running', transcript_error: null })

  try {
    const res = await fetch(`${DEEPGRAM}?${PARAMS}`, {
      method: 'POST',
      headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: bucketUrl(supabaseUrl, storagePath) }),
    })
    const out = await res.json()

    if (!res.ok) {
      const detail = out?.err_msg || out?.error || out?.message || `Deepgram returned ${res.status}`
      await patch({ transcript_status: 'error', transcript_error: String(detail).slice(0, 500) })
      return json({ error: `Transcription failed: ${detail}`, status: 'error' }, 502)
    }

    const transcript = String(
      out?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''
    ).trim()

    // No speech is a real answer, not a failure: plenty of ad footage is
    // B-roll over music. Recorded as its own state so the next press does not
    // pay to transcribe silence again.
    const status = transcript ? 'done' : 'empty'
    const saved = await patch({
      transcript: transcript || null,
      transcript_status: status,
      transcript_error: null,
      transcribed_at: new Date().toISOString(),
    })

    return json({
      status,
      transcript,
      cached: false,
      // False means there was no ad_videos row to cache this on, so the words
      // are correct but the next press will pay for them again. Reachable only
      // by calling this before the video has been registered with Meta.
      stored: saved > 0,
      // Useful for judging cost and for spotting a clip that is mostly silence.
      seconds: Number(out?.metadata?.duration) || null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await patch({ transcript_status: 'error', transcript_error: message.slice(0, 500) })
    return json({ error: message, status: 'error' }, 500)
  }
})
