// Registers a video that lives in a client's Google Drive folder as a Meta
// AdVideo, without copying the file anywhere.
//
// WHY THIS IS ITS OWN FUNCTION rather than a branch inside meta-publish, which
// is where every other Meta call lives:
//
//   * meta-publish's register_video looks its video up in ad_videos by
//     (storage_path, meta_account_id) and, when it finds one, skips the upload
//     entirely and only polls Meta for the transcode state. So a row written
//     here is picked up by the existing flow for free -- status polling,
//     thumbnail, publishing, all unchanged. Nothing in meta-publish had to
//     learn what Drive is.
//   * meta-publish is 2,000 lines and creates campaigns, ad sets and ads. It
//     is the last file in this project worth touching for a feature that can
//     be added beside it.
//
// The only thing duplicated is the /advideos POST, which is four lines. Kept
// deliberately identical to meta-publish's uploadVideo so the two cannot
// disagree about how a video is handed over.
//
// WHY META DOWNLOADS FROM US AT ALL. Meta's /advideos takes a file_url and
// fetches the bytes itself. The obvious alternative -- copy the Drive file
// into the public client-files bucket and use its URL -- is not available:
// this project is on Supabase's free plan, where Storage refuses any object
// over 50MB. Verified, not assumed: streaming a 69MB .MOV in returned 413
// EntityTooLarge. Real ad clips are bigger than that.
//
// WHERE THE ACCESS CHECK LIVES. Not here. This mints a grant naming a client
// and a file id; drive-video is what actually reads Drive, and it refuses to
// stream unless that file really sits in that client's folder. Verified: a
// grant issued for one client naming another client's video returns 404 and
// streams nothing. Doing the same check twice would mean a second copy of the
// service-account JWT signing here, and the worst a bogus grant can cause is
// a Meta transcode that fails and reports itself.
//
// Secrets: META_ACCESS_TOKEN.

const GRAPH = 'https://graph.facebook.com/v21.0'

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

  const token = Deno.env.get('META_ACCESS_TOKEN')
  if (!token) {
    return json({ error: 'META_ACCESS_TOKEN is not set on this project.' }, 500)
  }
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
  const fileId = String(body.file_id || '').trim()
  if (!clientId || !fileId) return json({ error: 'client_id and file_id are required.' }, 400)

  try {
    const client = await fetch(
      `${supabaseUrl}/rest/v1/clients?id=eq.${encodeURIComponent(clientId)}` +
        `&select=id,name,meta_ad_account_id,drive_folder_id`,
      { headers: dbHeaders }
    )
      .then((r) => r.json())
      .then((rows) => rows?.[0])

    // 400 rather than 404: the browser reads a 404 from this gateway as "the
    // function is not deployed", so a missing row must not look like one.
    if (!client) return json({ error: 'That client was not found.' }, 400)
    if (!(client.drive_folder_id || '').trim()) {
      return json({ error: `${client.name} has no Drive folder linked.` }, 400)
    }

    // THE act_ PREFIX, WHICH HAS NOW CAUSED TWO BUGS IN THIS FEATURE.
    //
    // The CRM stores the id bare, because that is what a person copies out of
    // Ads Manager. Every Graph path needs act_ in front. And meta-publish
    // stores the PREFIXED form in ad_videos and looks rows up by it -- so a
    // row written here with the bare form is invisible to its status poll:
    // "That video has not been sent to Meta yet", for a video Meta was already
    // transcoding. Found by polling for real rather than assuming.
    //
    // Bare for the Graph URL, prefixed for the row. Both spellings, each where
    // it belongs.
    const bare = String(client.meta_ad_account_id || '').trim().replace(/^act_/i, '')
    if (!bare) return json({ error: `${client.name} has no Meta ad account connected.` }, 400)
    const account = `act_${bare}`

    const storagePath = `drive:${fileId}`

    // Already registered in THIS ad account? Hand back what exists. A second
    // /advideos call would transcode a duplicate into the account and orphan
    // the first copy, and Meta charges nothing to keep the one already there.
    const existing = await fetch(
      `${supabaseUrl}/rest/v1/ad_videos?select=*` +
        `&storage_path=eq.${encodeURIComponent(storagePath)}` +
        `&meta_account_id=eq.${encodeURIComponent(account)}`,
      { headers: dbHeaders }
    )
      .then((r) => r.json())
      .then((rows) => rows?.[0])

    if (existing?.meta_video_id) {
      return json({
        meta_video_id: existing.meta_video_id,
        meta_account_id: account,
        storage_path: storagePath,
        status: existing.status || 'processing',
        already: true,
      })
    }

    const grant = await fetch(`${supabaseUrl}/rest/v1/drive_video_grants`, {
      method: 'POST',
      headers: { ...dbHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({ client_id: clientId, drive_file_id: fileId }),
    })
      .then((r) => r.json())
      .then((rows) => rows?.[0])

    if (!grant?.token) {
      return json({ error: 'Could not create a download link for that Drive video.' }, 500)
    }

    const fileUrl = `${supabaseUrl}/functions/v1/drive-video?t=${grant.token}`
    const fileName = String(body.file_name || fileId)

    const form = new URLSearchParams({
      file_url: fileUrl,
      name: `${client.name} — ${fileName}`,
      access_token: token,
    })
    const res = await fetch(`${GRAPH}/act_${bare}/advideos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    })
    const out = await res.json()

    if (!res.ok || !out?.id) {
      const detail = out?.error?.error_user_msg || out?.error?.message || `Meta returned ${res.status}`
      return json({ error: `Meta would not take that video: ${detail}` }, 502)
    }

    // status 'processing', not 'ready'. Meta transcodes asynchronously and a
    // creative referencing an unfinished video is rejected, so the picker polls
    // meta-publish's video_status from here on -- which finds this row and
    // needs no idea the video came from Drive.
    await fetch(`${supabaseUrl}/rest/v1/ad_videos?on_conflict=storage_path,meta_account_id`, {
      method: 'POST',
      headers: { ...dbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        client_id: clientId,
        storage_path: storagePath,
        file_name: fileName,
        meta_account_id: account,
        meta_video_id: out.id,
        status: 'processing',
        error: null,
      }),
    })

    return json({
      meta_video_id: out.id,
      meta_account_id: account,
      storage_path: storagePath,
      status: 'processing',
    })
  } catch (err) {
    return json({ error: String(err instanceof Error ? err.message : err) }, 500)
  }
})
