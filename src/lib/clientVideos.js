// The client's videos, the pure half.
//
// A client's own link has a "Your videos" tab: every video ad that went
// live on their account, to watch and to download and post on their own
// pages. The rows come from client_videos_load (supabase/client-videos.sql):
// the ads published through the CRM, with the clip's path in the bucket
// when the CRM uploaded it, and the ads made straight in Ads Manager that
// the nightly sync knows from their video plays. What the database cannot
// give is Meta's own copy of a clip, which the client-dashboard function
// fetches on request (its `videos` action) for the rows with no file of
// ours: a signed link that expires, used straight away.
//
// Plain JavaScript with no imports, so scripts/check-client-videos.mjs can
// load it in Node. The network half is clientVideoStore.js.

const DRIVE_PREFIX = 'drive:'

/**
 * One video for the page, from a client_videos_load row and whatever Meta
 * said about the same ad (a creative from the client-dashboard function,
 * or nothing). `path` is the clip in our bucket, '' when we have none;
 * `driveId` the file in the client's Drive folder when it was published
 * from there; `metaUrl` Meta's own copy when it was fetched.
 */
export function shapeVideo(row, creative) {
  const stored = String(row?.storage_path || '')
  const drive = stored.startsWith(DRIVE_PREFIX)
  return {
    adId: String(row?.ad_id || ''),
    name: String(row?.name || '').trim() || 'Video ad',
    publishedAt: row?.published_at || '',
    source: row?.source === 'crm' ? 'crm' : 'synced',
    path: stored && !drive ? stored : '',
    driveId: drive ? stored.slice(DRIVE_PREFIX.length) : '',
    metaUrl: creative?.video || '',
    poster: row?.thumb || creative?.image || creative?.thumb || '',
    seconds: Number(row?.duration_seconds) || 0,
    width: Number(row?.width) || 0,
    height: Number(row?.height) || 0,
    videoId: String(row?.video_id || creative?.video_id || ''),
  }
}

/** Every row shaped, in the order the database gave them (newest first). `creatives` is a Map or an object by ad id. */
export function mergeClientVideos(rows, creatives) {
  const lookup = (id) => (creatives instanceof Map ? creatives.get(id) : creatives?.[id]) || null
  return (rows || []).map((r) => shapeVideo(r, lookup(String(r?.ad_id || ''))))
}

/**
 * How the client gets this one: 'download' (our file, under its own name),
 * 'meta' (Meta's copy, opened in a new tab and saved from the player),
 * 'drive' (their own Drive folder), or 'none' when nothing can be offered.
 */
export function wayToGet(v) {
  if (v?.path) return 'download'
  if (v?.metaUrl) return 'meta'
  if (v?.driveId) return 'drive'
  return 'none'
}

/** The ad ids whose clip is not in our bucket, so Meta's copy is worth asking for. At most `limit`. */
export function idsNeedingMeta(list, limit = 60) {
  return (list || [])
    .filter((v) => !v.path && !v.metaUrl && v.adId)
    .map((v) => v.adId)
    .slice(0, limit)
}

/** The Drive file's page, for a clip published from the client's folder. */
export const driveFileUrl = (driveId) => (driveId ? `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/view` : '')

/**
 * The name the download arrives under: the ad's name made safe for a file
 * system, with the clip's own extension. "WC_Belk | Oct 9 | $99 heat check"
 * becomes WC_Belk-Oct-9-99-heat-check.mp4.
 */
export function downloadName(v) {
  const ext = /\.(mp4|mov|m4v|webm)$/i.exec(String(v?.path || ''))?.[1]?.toLowerCase() || 'mp4'
  const base = String(v?.name || 'video')
    .replace(/[^A-Za-z0-9_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return `${base || 'video'}.${ext}`
}

/** "0:32" or "1:05"; '' when the length is not known. */
export function durationLabel(seconds) {
  const s = Math.round(Number(seconds) || 0)
  if (s <= 0) return ''
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "Vertical", "Square" or "Landscape"; '' when the size is not known. */
export function shapeLabel(width, height) {
  const w = Number(width) || 0
  const h = Number(height) || 0
  if (!w || !h) return ''
  if (h > w * 1.15) return 'Vertical'
  if (w > h * 1.15) return 'Landscape'
  return 'Square'
}

/** "Oct 9", or "Oct 9, 2025" once it is not this year. */
export function whenLabel(iso, today = new Date()) {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(iso)) ? `${iso}T12:00:00` : iso)
  if (Number.isNaN(d.getTime())) return ''
  const sameYear = d.getFullYear() === today.getFullYear()
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

/** The line under a video's name: when it went live, how long it is, its shape. */
export function detailLine(v, today = new Date()) {
  const parts = []
  const when = whenLabel(v?.publishedAt, today)
  if (when) parts.push(`${v?.source === 'crm' ? 'Published' : 'Live since'} ${when}`)
  const len = durationLabel(v?.seconds)
  if (len) parts.push(len)
  const shape = shapeLabel(v?.width, v?.height)
  if (shape) parts.push(shape)
  return parts.join(' · ')
}

/** The sentence at the top: how many have gone live and how many are files to download. */
export function summaryLine(list) {
  const n = (list || []).length
  if (n === 0) return 'No video ads have gone live on your account yet.'
  const files = (list || []).filter((v) => v.path).length
  const videos = n === 1 ? '1 video ad has' : `${n} video ads have`
  if (files === n) return `${videos} gone live. Every one of them is here to watch and download.`
  if (files === 0) return `${videos} gone live. Watch them here; the files open from Meta's copy.`
  return `${videos} gone live. ${files === 1 ? '1 is' : `${files} are`} here to download; the rest open from Meta's copy.`
}
