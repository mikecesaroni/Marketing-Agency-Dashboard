import JSZip from 'jszip'

// All three sizes, one click, one file.
//
// ZIPPED RATHER THAN THREE DOWNLOADS, and not for tidiness: browsers block or
// mangle rapid successive downloads from one gesture -- Safari and every phone
// especially -- so "download all three" fired as three clicks reliably yields
// one or two files and no error. The same reasoning already applies to the
// client files section; this is the ad-sized version of it.
//
// Naming is here rather than at the call sites because three of them were
// deriving a filename from the client name with their own copy of the same
// regex, which is how a set ends up half named one thing and half another.

/** Client name -> filename stem. 'Belk Heating & Cooling' -> 'belk-heating-cooling'. */
export function slug(name) {
  return String(name || 'client')
    .replace(/\W+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

/** One PNG's name, inside the archive or on its own. */
export function adFileName(clientName, sizeKey) {
  return `${slug(clientName)}-${sizeKey}.png`
}

/** What the archive itself is called, dated so two downloads never collide. */
export function zipFileName(clientName, stamp = new Date()) {
  const d = stamp instanceof Date ? stamp : new Date(Number(stamp) || Date.now())
  const day = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
  return `${slug(clientName)}-ads-${day}.zip`
}

/**
 * The raw bytes of whatever a caller handed over.
 *
 * A canvas gives a Blob, a fetch gives a Response body, a test gives a typed
 * array. Normalising here rather than trusting JSZip to recognise each is not
 * belt-and-braces: JSZip decides whether Blobs are supported by sniffing the
 * environment, so passing one works in a browser and throws "Can't read the
 * data of ..." anywhere else. An ArrayBuffer it accepts everywhere.
 */
async function bytesOf(data) {
  if (!data) return null
  if (typeof data.arrayBuffer === 'function') return await data.arrayBuffer()
  if (data instanceof ArrayBuffer) return data
  if (data.buffer instanceof ArrayBuffer) return data.buffer
  return null
}

/**
 * Puts the given sizes into one archive.
 *
 * `entries` is [{ sizeKey, blob }] in the order they should appear. A size
 * with no bytes is skipped rather than written empty: an archive with a 0-byte
 * PNG in it looks like a successful download and is not one.
 *
 * Duplicate size keys would silently overwrite each other inside a zip, so a
 * repeat gets a numbered suffix instead of vanishing.
 */
export async function zipAdSizes({ clientName, entries = [] }) {
  const zip = new JSZip()
  const used = new Set()
  const names = []

  for (const entry of entries) {
    const bytes = await bytesOf(entry?.blob)
    if (!bytes || bytes.byteLength === 0) continue

    let name = adFileName(clientName, entry.sizeKey)
    if (used.has(name)) {
      let n = 2
      while (used.has(adFileName(clientName, `${entry.sizeKey}-${n}`))) n++
      name = adFileName(clientName, `${entry.sizeKey}-${n}`)
    }
    used.add(name)
    names.push(name)
    zip.file(name, bytes)
  }

  if (names.length === 0) return { blob: null, names }
  // 'blob' in a browser; the tests run in Node, where uint8array is the type
  // JSZip can always produce.
  const type = typeof Blob === 'function' && typeof document !== 'undefined' ? 'blob' : 'uint8array'
  return { blob: await zip.generateAsync({ type }), names }
}

/** Hands a blob to the browser as a download. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Revoked on a turn of the event loop rather than immediately: revoking
  // synchronously after click() cancels the download in Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
