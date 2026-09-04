import { supabase } from './supabaseClient'
import { readFunctionError } from './functionError'

// Client side of the Drive integration.
//
// An image the Studio can use is identified by a string, and there are now two
// kinds: a Supabase storage path (as before) and `drive:<fileId>`. Keeping both
// in the same field is what lets saved-ad recipes, the publish flow and the
// pickers stay unchanged — they all just carry the string around.

// Re-exported so the existing importers keep working, but DEFINED in
// driveLabels.js, which has no Supabase import and can therefore be reached by
// a check script. One definition on purpose: two would drift, and a drifted
// prefix means a video that silently never matches its own registration.
import { DRIVE_PREFIX, driveFileId, drivePath, isDrivePath } from './driveLabels'

export { DRIVE_PREFIX, driveFileId, drivePath, isDrivePath }

/**
 * Pulls the folder id out of whatever someone pasted.
 *
 * Accepts a bare id or any of the URL shapes Drive hands out — /folders/<id>,
 * an ?id= query, and the /u/1/ account-scoped variant. Saving a whole URL as
 * the id is the failure worth preventing: the Drive API takes it without
 * complaint and returns an empty folder, which reads as "no photos" rather
 * than "wrong value".
 */
export function parseFolderId(input) {
  const raw = String(input || '').trim()
  if (!raw) return ''
  const fromPath = raw.match(/\/folders\/([A-Za-z0-9_-]+)/)
  if (fromPath) return fromPath[1]
  const fromQuery = raw.match(/[?&]id=([A-Za-z0-9_-]+)/)
  if (fromQuery) return fromQuery[1]
  // A bare id. Drive ids are long; anything short is a paste gone wrong.
  if (/^[A-Za-z0-9_-]{16,}$/.test(raw)) return raw
  return ''
}

async function call(body) {
  const { data, error } = await supabase.functions.invoke('drive-assets', { body })
  if (error) {
    const { status, detail } = await readFunctionError(error)
    if (!status || status === 404) {
      throw new Error(
        'Could not reach the Drive function. It is probably not deployed yet — deploy drive-assets in Supabase and try again.'
      )
    }
    throw new Error(detail || 'The Drive request failed.')
  }
  if (data?.error) throw new Error(data.error)
  return data
}

/**
 * The service account's email, so the UI can say who to share a folder with.
 *
 * Not a credential — it is the address you paste into Drive's share dialog. The
 * alternative is going back to the JSON key for every client, which is exactly
 * the kind of friction that gets a setup step skipped.
 */
export async function driveServiceAccount() {
  const data = await call({ action: 'whoami' })
  return data.client_email || ''
}

/** Images in this client's linked folder, newest first. */
export async function listDriveImages(clientId) {
  const data = await call({ action: 'list', client_id: clientId })
  return data.files || []
}

/**
 * Fetches Drive bytes and hands back a blob: URL.
 *
 * Deliberately not an <img src> pointing at the Edge Function. The function
 * needs an Authorization header, which an <img> tag cannot send, and the
 * compositor needs an image that will not taint the canvas. A blob: URL is
 * same-origin, so it solves both at once.
 */
async function fetchObjectUrl(clientId, fileId, { thumb = false } = {}) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drive-assets`
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'file', client_id: clientId, file_id: fileId, thumb }),
  })

  if (!res.ok) {
    // The function reports its own failures as JSON even on the bytes path, so
    // the real reason survives instead of becoming "request failed".
    let detail = `Drive request failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) detail = body.error
    } catch {
      // Not JSON. The status is all there is.
    }
    throw new Error(detail)
  }

  return URL.createObjectURL(await res.blob())
}

// One blob per (file, size) for the life of the page. The picker re-renders on
// every keystroke in the Studio, and re-fetching a folder of photos each time
// would be slow and would leak a blob per render.
const cache = new Map()

export function driveObjectUrl(clientId, fileId, { thumb = false } = {}) {
  const key = `${clientId}:${fileId}:${thumb ? 'thumb' : 'full'}`
  if (!cache.has(key)) {
    // The promise is cached, not the URL, so concurrent callers share one fetch
    // rather than racing and orphaning blobs. A failure is evicted so a retry
    // is not permanently stuck on the first error.
    cache.set(
      key,
      fetchObjectUrl(clientId, fileId, { thumb }).catch((err) => {
        cache.delete(key)
        throw err
      })
    )
  }
  return cache.get(key)
}

/**
 * Turns either kind of image reference into something loadImage() can take.
 *
 * The one place the two kinds of path have to be told apart.
 */
export async function resolveImageSrc(clientId, path) {
  if (!path) return null
  if (isDrivePath(path)) return driveObjectUrl(clientId, driveFileId(path))
  return supabase.storage.from('client-files').getPublicUrl(path).data.publicUrl
}

/**
 * Persists a folder against the client. Returns the parsed id actually saved.
 *
 * The FIRST folder goes in drive_folder_id and any others in
 * extra_drive_folder_ids. That split is not cosmetic: drive-assets,
 * drive-video and drive-video-register all read drive_folder_id, so a client
 * with folders but a null primary would break each of them. Keeping the
 * primary populated makes the extras purely additive.
 */
export async function saveDriveFolder(clientId, input, { additional = false } = {}) {
  const folderId = input.trim() ? parseFolderId(input) : ''
  if (input.trim() && !folderId) {
    throw new Error('That does not look like a Drive folder link or ID.')
  }

  if (!additional) {
    const { error } = await supabase
      .from('clients')
      .update({ drive_folder_id: folderId || null })
      .eq('id', clientId)
    if (error) throw new Error(error.message)
    return folderId
  }

  if (!folderId) throw new Error('Paste the second folder\u2019s link or ID.')

  const { data, error: readErr } = await supabase
    .from('clients')
    .select('drive_folder_id, extra_drive_folder_ids')
    .eq('id', clientId)
    .single()
  if (readErr) throw new Error(readErr.message)

  // A folder already linked is not an error worth raising -- somebody pasting
  // the same link twice means "make sure this is connected", and it is.
  const already = [data.drive_folder_id, ...(data.extra_drive_folder_ids || [])].filter(Boolean)
  if (already.includes(folderId)) return folderId

  // With no primary yet, this IS the primary. Otherwise it joins the extras.
  const patch = data.drive_folder_id
    ? { extra_drive_folder_ids: [...(data.extra_drive_folder_ids || []), folderId] }
    : { drive_folder_id: folderId }

  const { error } = await supabase.from('clients').update(patch).eq('id', clientId)
  if (error) throw new Error(error.message)
  return folderId
}

/** Every folder linked for this client, primary first. */
export async function fetchDriveFolders(clientId) {
  const { data, error } = await supabase
    .from('clients')
    .select('drive_folder_id, extra_drive_folder_ids')
    .eq('id', clientId)
    .single()
  if (error) throw new Error(error.message)
  return [data.drive_folder_id, ...(data.extra_drive_folder_ids || [])].filter(Boolean)
}

/** Unlinks one folder, whichever slot it is in. */
export async function removeDriveFolder(clientId, folderId) {
  const folders = await fetchDriveFolders(clientId)
  const left = folders.filter((f) => f !== folderId)
  // The first survivor becomes the primary, so the column is never left null
  // while other folders remain.
  const { error } = await supabase
    .from('clients')
    .update({ drive_folder_id: left[0] || null, extra_drive_folder_ids: left.slice(1) })
    .eq('id', clientId)
  if (error) throw new Error(error.message)
  return left
}
