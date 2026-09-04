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
//   whoami {}                            -> the service account's email
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

// What a browser can actually decode in an <img>. HEIC/HEIF is the one that
// matters: it is the iPhone default, so a folder of job-site photos is mostly
// HEIC, and no browser can render it. Drive can, so anything outside this set
// is served as Drive's rendered JPEG instead of the raw bytes.
const BROWSER_RENDERABLE = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
])

// Longest edge Drive is asked to render to. The artboards top out at 1920, so
// this leaves room to crop and scale without a visibly soft background, while
// staying far below the multi-megabyte original.
const RENDER_PX = 2048
const THUMB_PX = 400

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

  try {
    // Which robot to share a folder with. Deliberately exposed: it is an address
    // you paste into Drive's share dialog, not a credential, and the alternative
    // is digging the JSON key back out of a password manager for every client.
    if (action === 'whoami') {
      const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
      if (!raw) {
        return json(
          {
            error:
              'GOOGLE_SERVICE_ACCOUNT_JSON is not set on this project. Add it under Project Settings > Edge Functions > Secrets. See docs/google-drive.md.',
          },
          500
        )
      }
      return json({ client_email: JSON.parse(raw)?.client_email || null })
    }

    const clientId = body.client_id
    if (!clientId) return json({ error: 'client_id is required.' }, 400)

    // The folder is read from the CRM rather than taken from the request, so a
    // caller cannot name a folder of their own and have the service account
    // read it.
    const res = await fetch(
      `${supabaseUrl}/rest/v1/clients?select=id,name,drive_folder_id&id=eq.${encodeURIComponent(clientId)}`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    )
    const client = (await res.json())?.[0]
    // 400 rather than 404 on purpose. The browser reads a 404 as "this function
    // is not deployed", because that is the only 404 the gateway itself
    // produces; returning one here would report a missing row as a missing
    // deployment.
    if (!client) return json({ error: 'That client was not found.' }, 400)

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
          // Images, PDFs and videos.
          //
          // PDFs because a logo arrives as one more often than not -- a
          // designer exports vector, and "Logo Titos Appliances.pdf" sat in
          // this folder invisible to the CRM while somebody refreshed the page
          // wondering where it had gone. Drive renders a PDF to PNG the same
          // way it renders HEIC (verified against that file: PNG bytes at both
          // 400px and 2048px), so the unrenderable path below handles it.
          //
          // Videos because they can be published as video ads without being
          // copied anywhere: Meta downloads them from Drive itself, through
          // the drive-video function. That matters because Storage on the free
          // plan refuses anything over 50MB, and ad clips are bigger. Drive
          // renders a poster frame for them, which is what fills the grid.
          q:
            `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false and ` +
            `(mimeType contains 'image/' or mimeType contains 'video/' or ` +
            `mimeType = 'application/pdf')`,
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
        // The picker shows this so a HEIC that only works because Drive
        // converts it is not mistaken for a normal upload.
        converted: !BROWSER_RENDERABLE.has(String(f.mimeType)),
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
      const kind = String(meta.mimeType || '')
      const allowed =
        kind.startsWith('image/') || kind.startsWith('video/') || kind === 'application/pdf'
      if (!allowed) {
        return json({ error: `"${meta.name}" is not an image, a video or a PDF.` }, 400)
      }

      // A VIDEO ONLY EVER COMES BACK AS ITS POSTER FRAME here, never as the
      // clip. Tens of megabytes through this function to fill a thumbnail
      // would be pointless, and nothing needs the bytes: the grid wants a
      // still, playback opens Drive, and Meta downloads the video from
      // drive-video instead. The unrenderable branch below returns Drive's
      // render, which for a video is exactly that poster.
      if (kind.startsWith('video/') && !meta.thumbnailLink) {
        return json(
          { error: `Drive has no poster frame for "${meta.name}" yet. Try again shortly.` },
          415
        )
      }

      // Two reasons to serve Drive's render rather than the original: the grid
      // wants a small image, and a format the browser cannot decode has to be
      // converted by someone. Drive already does both.
      const unrenderable = !BROWSER_RENDERABLE.has(String(meta.mimeType))
      // Forced for video, so the raw-bytes fallback at the end of this branch
      // can never stream a whole clip to a browser that asked for a picture.
      const wantsRender = body.thumb || unrenderable
      if (wantsRender) {
        if (!meta.thumbnailLink) {
          // Only fatal for a format we could not have displayed anyway.
          if (unrenderable) {
            return json(
              {
                error: `"${meta.name}" is ${meta.mimeType}, which browsers cannot display, and Drive has no rendered version of it. Re-save it as a JPEG.`,
              },
              415
            )
          }
        } else {
          const size = body.thumb ? THUMB_PX : RENDER_PX
          const rendered = await fetch(
            String(meta.thumbnailLink).replace(/=s\d+$/, `=s${size}`)
          )
          if (rendered.ok) {
            return new Response(rendered.body, {
              headers: {
                'Content-Type': rendered.headers.get('Content-Type') || 'image/jpeg',
                'Cache-Control': 'private, max-age=300',
                ...CORS,
              },
            })
          }
          // For a decodable format the original below is a fine fallback. For
          // HEIC it is not: handing back bytes no browser can read is the bug
          // this branch exists to prevent, so say so instead.
          if (unrenderable) {
            return json(
              {
                error: `Drive could not render "${meta.name}" (${meta.mimeType}) for the browser. Re-save it as a JPEG.`,
              },
              502
            )
          }
        }
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
