// Streams one Google Drive video to whoever holds a valid grant token.
//
// WHY THIS IS PUBLIC, which is the only surprising thing about it. Meta's
// /advideos endpoint does not take the bytes for a file this size -- it takes
// a file_url and downloads the video itself, from its own servers. So the URL
// has to work without any Authorization header the CRM could attach.
//
// WHY NOT COPY THE VIDEO INTO THE PUBLIC BUCKET INSTEAD, which would need no
// new endpoint at all: this project is on Supabase's free plan, where Storage
// refuses any object over 50MB. Verified rather than assumed -- streaming a
// 69MB .MOV from Drive into client-files returned 413 EntityTooLarge in 4.5s,
// with the stream itself working fine. Ad clips off a phone are routinely
// bigger than 50MB; the two in this client's folder are 69MB and 344MB.
//
// WHAT KEEPS IT SAFE:
//   * A token is required, and it is an opaque row in drive_video_grants, not
//     something derivable from the file id. One service account can see every
//     client's Drive folder, so a bare file id must never be enough.
//   * The grant names both the client and the file, and the file's parents are
//     checked against THAT client's folders. A grant for one client cannot be
//     pointed at another client's video.
//   * Grants expire, and every fetch is counted, so an unused grant is
//     distinguishable from a download Meta attempted and failed.
//   * Read-only Drive scope, and nothing here can list a folder or name a file
//     it was not granted.
//
// The bytes are piped straight through. Nothing calls arrayBuffer(): a 344MB
// file is far more than an Edge Function can hold, and buffering is exactly
// what this must not do.
//
// Secrets: GOOGLE_SERVICE_ACCOUNT_JSON, the same one drive-assets uses.

const DRIVE = 'https://www.googleapis.com/drive/v3'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToDer(pem: string): Uint8Array {
  const bin = atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

let cached: { token: string; expiresAt: number } | null = null

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set on this project.')
  const sa = JSON.parse(raw)
  const now = Math.floor(Date.now() / 1000)
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)))
  const signingInput =
    `${enc({ alg: 'RS256', typ: 'JWT' })}.` +
    `${enc({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput))
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${signingInput}.${b64url(new Uint8Array(sig))}`,
    }),
  })
  const body = await res.json()
  if (!body.access_token) {
    throw new Error(`Google refused the service account: ${body.error_description || body.error}`)
  }
  cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in || 3600) * 1000 }
  return cached.token
}

function fail(message: string, status: number) {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain' } })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const grantToken = (url.searchParams.get('t') || '').trim()
  // Deliberately terse and identical for a missing, unknown and expired token.
  // This is an unauthenticated endpoint; it should not help anyone work out
  // which tokens exist.
  if (!/^[0-9a-f-]{36}$/i.test(grantToken)) return fail('Not found.', 404)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  try {
    const grant = await fetch(
      `${supabaseUrl}/rest/v1/drive_video_grants` +
        `?token=eq.${encodeURIComponent(grantToken)}` +
        `&select=token,client_id,drive_file_id,expires_at,fetch_count`,
      { headers: db }
    )
      .then((r) => r.json())
      .then((rows) => rows?.[0])

    if (!grant) return fail('Not found.', 404)
    if (new Date(grant.expires_at).getTime() < Date.now()) return fail('Not found.', 404)

    // The client's folders, read from the CRM rather than trusted from the
    // grant, so the parent check below is against the real ones.
    const client = await fetch(
      `${supabaseUrl}/rest/v1/clients?id=eq.${encodeURIComponent(grant.client_id)}` +
        `&select=drive_folder_id,extra_drive_folder_ids`,
      { headers: db }
    )
      .then((r) => r.json())
      .then((rows) => rows?.[0])

    // EVERY folder linked for this client. A client can share more than one,
    // and a video in the second folder has to be streamable -- otherwise it
    // lists in the CRM, registers with Meta, and then Meta's download 404s
    // here with nothing on screen to explain why.
    const folderIds = [client?.drive_folder_id, ...(client?.extra_drive_folder_ids || [])]
      .map((f) => String(f || '').trim())
      .filter(Boolean)
    if (folderIds.length === 0) return fail('Not found.', 404)

    const token = await accessToken()

    const meta = await fetch(
      `${DRIVE}/files/${encodeURIComponent(grant.drive_file_id)}` +
        `?fields=id,name,mimeType,size,parents&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).then((r) => r.json())

    // The grant is for a file in one of THIS client's folders. Without this a
    // grant could be minted for one client and aimed at another client's video.
    if (!(meta?.parents || []).some((p: string) => folderIds.includes(p))) {
      return fail('Not found.', 404)
    }
    if (!String(meta.mimeType || '').startsWith('video/')) return fail('Not a video.', 400)

    // Recorded before streaming, so a download that dies halfway still leaves
    // evidence that it was attempted.
    await fetch(`${supabaseUrl}/rest/v1/drive_video_grants?token=eq.${encodeURIComponent(grantToken)}`, {
      method: 'PATCH',
      headers: { ...db, Prefer: 'return=minimal' },
      body: JSON.stringify({
        fetched_at: new Date().toISOString(),
        fetch_count: (Number(grant.fetch_count) || 0) + 1,
      }),
    })

    // HEAD lets Meta check the size and type without pulling the file.
    if (req.method === 'HEAD') {
      return new Response(null, {
        headers: {
          'Content-Type': meta.mimeType,
          'Content-Length': String(meta.size || ''),
          'Accept-Ranges': 'none',
        },
      })
    }

    const bytes = await fetch(
      `${DRIVE}/files/${encodeURIComponent(grant.drive_file_id)}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!bytes.ok || !bytes.body) return fail(`Drive returned ${bytes.status}.`, 502)

    return new Response(bytes.body, {
      headers: {
        'Content-Type': meta.mimeType,
        // Meta wants a size up front, and Drive gives one for a binary file.
        ...(meta.size ? { 'Content-Length': String(meta.size) } : {}),
        // A filename with an extension, because some fetchers infer the
        // container from it rather than from the content type.
        'Content-Disposition': `inline; filename="${String(meta.name || 'video.mp4').replace(/[^\w.-]+/g, '-')}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    return fail(String(err instanceof Error ? err.message : err), 500)
  }
})
