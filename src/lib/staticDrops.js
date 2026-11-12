// Dropped statics: the finished images an editor drops in for a client on
// the Content page, and the board that says which are waiting to publish.
//
// 2026-11-12: "Make a separate box to drop in static images that our editor
// is making for clients. Make it so we can publish with a click like the
// video ones in content page."
//
// THE SHAPE. A dropped static is stored exactly like a Studio-saved ad: the
// files under ads/<client>/<stamp>-<size>.<ext> and one saved_ads row per
// stamp (src/lib/savedAds.js groups the files by stamp into a set, one image
// per size). That is what makes "publish with a click" free: the publish
// page already lists every saved set, ticks the ones named in the URL and
// writes the words for a ticked set that has none; meta-publish already
// uploads each size and maps it to its placements. The drop zone's only job
// is to put the files where a saved ad's files go, with the size worked out
// from the pixels and the files of one ad grouped under one stamp.
//
// Pure, so scripts/check-static-drops.mjs can pin it; the uploads are in
// staticDropStore.js.

import { dropNote, personName } from './videoLaunch.js'

export const STATIC_EXT = /\.(png|jpe?g|webp)$/i
// Meta's own limit on an ad image is 30 MB.
export const MAX_STATIC_BYTES = 30 * 1024 * 1024
// A static dropped longer ago than this and never published is forgotten,
// not waiting (the same window as the clips).
export const WAITING_WINDOW_MS = 30 * 86400000

// The three artboard sizes the Studio saves and meta-publish maps to
// placements (src/lib/adCanvas.js SIZES), by shape.
const SIZE_RATIOS = [
  { key: 'square', ratio: 1 },
  { key: 'feed', ratio: 1080 / 1350 },
  { key: 'story', ratio: 1080 / 1920 },
]
const SIZE_ORDER = { square: 0, feed: 1, story: 2 }

export function isStaticFile(name) {
  return STATIC_EXT.test(String(name || ''))
}

/** Empty string when the file is fine, otherwise the reason it is not. */
export function validateStatic(file) {
  if (!file) return 'Pick an image first.'
  if (!isStaticFile(file.name)) return `${file.name} is not an image Meta will take. Use .png or .jpg.`
  if (Number(file.size) > MAX_STATIC_BYTES) return `${file.name} is over Meta's 30 MB limit for an ad image. Export it smaller.`
  if (Number(file.size) === 0) return `${file.name} is empty.`
  return ''
}

/**
 * Which artboard size an image stands in for, from its pixels: the nearest
 * of square (1:1), feed (4:5) and story (9:16). A landscape export reads as
 * square, the nearest shape, and Meta crops it for that placement. No
 * pixels (a browser that could not read the file) means feed, the size
 * Meta serves most places.
 */
export function sizeKeyFor(width, height) {
  const w = Number(width) || 0
  const h = Number(height) || 0
  if (!w || !h) return 'feed'
  const r = w / h
  let best = 'feed'
  let gap = Infinity
  for (const s of SIZE_RATIOS) {
    const d = Math.abs(r - s.ratio)
    if (d < gap) {
      gap = d
      best = s.key
    }
  }
  return best
}

// Words in a file name that say which size it is rather than which ad:
// "tuneup-square.png", "tuneup 9x16.png" and "tuneup_story_final.png" are
// one ad in three shapes.
const SIZE_WORDS = /\b(square|sq|feed|portrait|story|stories|reel|reels|vertical|landscape|1x1|4x5|9x16|1080x1080|1080x1350|1080x1920|final|export|copy)\b/gi

/** The ad's name from a file name: the stem with the size words taken out. */
export function staticStem(fileName) {
  return String(fileName || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_\-.()[\]]+/g, ' ')
    .replace(SIZE_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The extension the file is stored under: png, jpg or webp. */
export function staticExt(fileName) {
  const m = String(fileName || '').match(STATIC_EXT)
  const ext = (m ? m[1] : 'png').toLowerCase()
  return ext === 'jpeg' ? 'jpg' : ext
}

/**
 * How one drop becomes saved-ad sets.
 *
 * files: [{ name, width, height }] in the order dropped. Files that share a
 * name once the size words are gone are one ad in several sizes and go
 * under one stamp, one file per size; a second file of a size the set
 * already has starts a new set (two different square ads named the same).
 * Stamps count up from the one given, so a drop of three ads gets three
 * stamps a millisecond apart, the way three Studio saves would.
 *
 * Returns [{ stamp, name, items: [{ index, key, ext }] }].
 */
export function planStaticDrop(files = [], stamp = Date.now()) {
  const sets = []
  let next = Number(stamp) || Date.now()
  for (const [index, f] of [...files].entries()) {
    const key = sizeKeyFor(f?.width, f?.height)
    const name = staticStem(f?.name)
    const group = name.toLowerCase()
    let set = sets.find((s) => s.group === group && !s.items.some((i) => i.key === key))
    if (!set) {
      set = { stamp: String(next++), name: name || 'static', group, items: [] }
      sets.push(set)
    }
    set.items.push({ index, key, ext: staticExt(f?.name) })
  }
  return sets.map(({ group: _group, ...s }) => ({ ...s, items: s.items.sort((a, b) => SIZE_ORDER[a.key] - SIZE_ORDER[b.key]) }))
}

/** Where a dropped file goes: the same place a saved ad's artboard goes. */
export function staticPath(clientId, stamp, key, ext = 'png') {
  return `ads/${clientId}/${stamp}-${key}.${ext}`
}

const STAMP_RE = /\/(\d+)-(\w+)\.(?:png|jpe?g|webp)$/i

/** { stamp, key } from a stored path, or null when it is not a saved-ad file. */
export function parseStaticPath(storagePath) {
  const m = String(storagePath || '').match(STAMP_RE)
  return m ? { stamp: m[1], key: m[2] } : null
}

/**
 * The dropped sets of one client, from their client_files rows (drop_kind
 * 'static'): one per stamp, files in size order, signed and noted from the
 * rows. `dismissed` when any file was waved off the board.
 */
export function staticSets(files = []) {
  const by = new Map()
  for (const f of files) {
    const parsed = parseStaticPath(f?.storage_path)
    if (!parsed) continue
    const s = by.get(parsed.stamp) || { stamp: parsed.stamp, name: '', files: [], at: '', by: '', note: '', dismissed: false }
    s.files.push({ path: f.storage_path, name: f.file_name || f.storage_path, key: parsed.key })
    const at = String(f.date_uploaded || '')
    // The drop is when the first file landed.
    if (at && (!s.at || at < s.at)) s.at = at
    if (!s.by) s.by = personName(f.uploaded_by)
    if (!s.note) s.note = dropNote(f.drop_note)
    if (f.drop_dismissed_at) s.dismissed = true
    by.set(parsed.stamp, s)
  }
  return [...by.values()].map((s) => {
    s.files.sort((a, b) => (SIZE_ORDER[a.key] ?? 9) - (SIZE_ORDER[b.key] ?? 9))
    s.name = staticStem(s.files[0]?.name) || `static ${s.stamp}`
    return s
  })
}

/**
 * The dropped statics nobody has published yet: not waved off, inside the
 * window, after the "start fresh" moment, and with no published ad
 * carrying the stamp. Newest first.
 *
 * files: this client's client_files rows with drop_kind 'static'
 * ads: this client's published_ads rows ({ stamp })
 * resetAt: app_settings.video_drops_reset_at, shared with the clips
 */
export function waitingStatics({ files = [], ads = [], now = new Date(), resetAt = '' }) {
  const published = new Set(ads.map((a) => (a?.stamp ? String(a.stamp) : '')).filter(Boolean))
  const since = new Date(now - WAITING_WINDOW_MS).toISOString()
  const reset = resetAt ? new Date(resetAt).toISOString() : ''
  return staticSets(files)
    .filter((s) => !s.dismissed && !published.has(s.stamp) && s.at && s.at > since && s.at > reset)
    .sort((a, b) => (a.at < b.at ? 1 : -1))
}

/**
 * The static board: one row per client with a static waiting, newest drop
 * first. Nothing else is on it: statics carry no weekly promise, so a
 * client with none waiting has nothing to say here.
 *
 * clients: id, name, archived, is_internal, meta_ad_account_id, paused_at
 * publishedAds: client_id, stamp
 * files: client_files rows with drop_kind 'static' (client_id, storage_path,
 *   file_name, date_uploaded, uploaded_by, drop_note, drop_dismissed_at)
 */
export function staticDrops(clients = [], publishedAds = [], files = [], now = new Date(), resetAt = '') {
  const adsBy = new Map()
  for (const a of publishedAds) {
    if (!a?.client_id) continue
    if (!adsBy.has(a.client_id)) adsBy.set(a.client_id, [])
    adsBy.get(a.client_id).push(a)
  }
  const filesBy = new Map()
  for (const f of files) {
    if (!f?.client_id) continue
    if (!filesBy.has(f.client_id)) filesBy.set(f.client_id, [])
    filesBy.get(f.client_id).push(f)
  }
  return clients
    .filter((c) => c && !c.archived && filesBy.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      internal: Boolean(c.is_internal),
      hasMeta: Boolean(c.meta_ad_account_id),
      paused: Boolean(c.paused_at),
      waiting: waitingStatics({ files: filesBy.get(c.id), ads: adsBy.get(c.id) || [], now, resetAt }),
    }))
    .filter((r) => r.waiting.length > 0)
    .sort((a, b) => (a.waiting[0].at < b.waiting[0].at ? 1 : -1))
}

/** The publish page with these sets already ticked. */
export function publishStaticHref(clientId, stamps = []) {
  const list = [].concat(stamps || []).map((s) => String(s || '').trim()).filter(Boolean)
  return `/publish/${clientId}${list.length ? `?static=${list.map(encodeURIComponent).join(',')}` : ''}`
}
