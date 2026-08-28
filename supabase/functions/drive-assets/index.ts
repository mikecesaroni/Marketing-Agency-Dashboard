// Read a client's Google Drive folder from the Ad Studio.
//
// The point is to skip the upload step: point a client at their Drive folder
// once, and every photo in it is pickable in the Studio from then on, including
// one added from a phone thirty seconds ago.
//
// Why this has to be server-side at all, since it is the obvious question:
//
//   * A private Drive file cannot be read by the browser. There is no login in
//     this app, so there is no user whose Google account could consent; a
//     service account is the only credential available and it must never reach
//     the browser.
//   * The compositor draws the photo onto a canvas and calls toBlob(). A
//     cross-origin image without CORS headers taints the canvas and toBlob()
//     throws, so the ad becomes un-exportable. Bytes proxied through here are
//     fetched by JS and turned into a blob: URL, which is same-origin and
//     cannot taint anything.
//
// Nothing is copied into Supabase. The source photo stays in Drive and is read
// on demand; only the finished composited ad is written to the bucket, exactly
// as it was before this existed.
//
// Secrets: GOOGLE_SERVICE_ACCOUNT_JSON — the whole JSON key file, pasted as
// one value. See docs/google-drive.md.
//
// Actions:
//   list {client_id}                     -> images in that client's folder
//   file {client_id, file_id, thumb?}    -> the bytes, as image/*
//
// Scope note: `list` returns the folder's DIRECT children only. Drive has no
// cheap recursive listing, and walking a tree on every picker open would be
// slow and easy to abuse. Subfolders are not traversed.

const DRIVE = 'https://www.googleapis.com/drive/v3'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

// Read-only on purpose. This integration never needs to write to a client's
// Drive, and a token that cannot write cannot damage their files.
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

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

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// The JSON key stores the PEM with real newlines once JSON.parse has run, so
// this only has to strip the armour and the whitespace.
function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const bin = atob(body)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// Cached across invocations while the isolate is warm. A token is good for an
// hour and the exchange is a round trip, so re-signing per request would add
// latency to every thumbnail in the grid.
let cached: { token: string; expiresAt: number } | null = null

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token

  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!raw) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON is not set on this project. Add it under Project Settings > Edge Functions > Secrets. See docs/google-drive.md.'
    )
  }

  let sa: { client_email?: string; private_key?: string }
  try {
    sa = JSON.parse(raw)
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. Paste the whole key file as one value.')
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key.')
  }

  const now = Math.floor(Date.now() / 1000)
  const encode = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)))
  const signingInput =
    `${encode({ alg: 'RS256', typ: 'JWT' })}.` +
    `${encode({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  )

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${signingInput}.${b64url(new Uint8Array(sig))}`,
    }),
  })
  const body = await res.json()
  if (!res.ok || !body.access_token) {
    // Google's error here is the useful one — "invalid_grant" almost always
    // means the key was revoked or the clock is off, and saying so beats a
    // generic failure.
    throw new Error(
      `Google refused the service account credentials: ${body.error_description || body.error || res.status}`
    )
  }

  cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in || 3600) * 1000 }
  return cached.token
}

async function driveJson(path: string, params: Record<string, string>, token: string) {
  const url = new URL(`${DRIVE}/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const body = await res.json()
  if (!res.ok) {
    const msg = body?.error?.message || `Drive returned ${res.status}`
    if (res.status === 404) {
      throw new Error(
        `${msg} — check the folder is shared with the service account's email as a Viewer.`
      )
    }
    throw new Error(msg)
  }
  return body
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }

  const action = body.action || 'list'
  const clientId = body.client_id
  if (!clientId) return json({ error: 'client_id is required.' }, 400)

  try {
    // The folder is read from the CRM rather than taken from the request, so a
    // caller cannot name a folder of their own and have the service account
    // read it.
    const res = await fetch(
      `${supabaseUrl}/rest/v1/clients?select=id,name,drive_folder_id&id=eq.${encodeURIComponent(clientId)}`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    )
    const client = (await res.json())?.[0]
    if (!client) return json({ error: 'That client was not found.' }, 404)

    const folderId = (client.drive_folder_id || '').trim()
    if (!folderId) {
      return json(
        { error: `${client.name} has no Drive folder linked yet.`, needs_folder: true },
        400
      )
    }

    const token = await accessToken()

    // -----------------------------------------------------------------------
    // LIST
    // -----------------------------------------------------------------------
    if (action === 'list') {
      const found = await driveJson(
        'files',
        {
          q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false and mimeType contains 'image/'`,
          fields: 'files(id,name,mimeType,size,modifiedTime,thumbnailLink)',
          orderBy: 'modifiedTime desc',
          pageSize: '200',
          // Without these a folder that lives on a Shared drive returns
          // nothing at all rather than an error, which is a confusing way to
          // find out the folder is fine and the query was not.
          supportsAllDrives: 'true',
          includeItemsFromAllDrives: 'true',
        },
        token
      )

      const files = (found.files || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        mime_type: f.mimeType,
        size: Number(f.size) || null,
        modified_time: f.modifiedTime,
        has_thumbnail: Boolean(f.thumbnailLink),
      }))

      return json({ files, folder_id: folderId })
    }

    // -----------------------------------------------------------------------
    // FILE — the bytes.
    // -----------------------------------------------------------------------
    if (action === 'file') {
      const fileId = String(body.file_id || '').trim()
      if (!fileId) return json({ error: 'file_id is required.' }, 400)

      const meta = await driveJson(
        `files/${encodeURIComponent(fileId)}`,
        { fields: 'id,name,mimeType,parents,thumbnailLink', supportsAllDrives: 'true' },
        token
      )

      // Without this check the file_id alone would be enough to read anything
      // the service account can see — including another client's folder, since
      // one account is shared across all of them. The client_id in the request
      // has to actually own the file.
      if (!(meta.parents || []).includes(folderId)) {
        return json({ error: 'That file is not in this client\'s Drive folder.' }, 403)
      }
      if (!String(meta.mimeType || '').startsWith('image/')) {
        return json({ error: `"${meta.name}" is not an image.` }, 400)
      }

      // Thumbnails for the grid. Drive renders these itself, so the picker
      // loads a few hundred KB instead of a folder full of 6MB camera photos.
      if (body.thumb && meta.thumbnailLink) {
        const thumbUrl = String(meta.thumbnailLink).replace(/=s\d+$/, '=s400')
        const thumb = await fetch(thumbUrl)
        if (thumb.ok) {
          return new Response(thumb.body, {
            headers: {
              'Content-Type': thumb.headers.get('Content-Type') || 'image/jpeg',
              'Cache-Control': 'private, max-age=300',
              ...CORS,
            },
          })
        }
        // Falls through to the full file below. A thumbnail is an optimisation,
        // not a requirement.
      }

      const bytes = await fetch(
        `${DRIVE}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!bytes.ok) {
        return json({ error: `Drive would not return the file (${bytes.status}).` }, 502)
      }

      return new Response(bytes.body, {
        headers: {
          'Content-Type': meta.mimeType,
          'Cache-Control': 'private, max-age=300',
          ...CORS,
        },
      })
    }

    return json({ error: `Unknown action "${action}".` }, 400)
  } catch (err) {
    return json({ error: String(err instanceof Error ? err.message : err) }, 500)
  }
})
