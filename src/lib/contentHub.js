// The Content tab's arithmetic: which clients to show, in what order, with
// what numbers on the card. Pure, so scripts/check-content-hub.mjs can pin it.
//
// The tab is three doors -- Ad Studio, Google Drive, Publish -- and behind
// each door the same list of clients, ordered so the ones with something
// going on are at the top. "Something going on" is recent creative work:
// the newest saved ad, published ad or uploaded video.

/** Folders linked for a client, primary first. */
export function driveFolders(client) {
  return [client?.drive_folder_id, ...(client?.extra_drive_folder_ids || [])].filter(Boolean)
}

export const folderUrl = (id) => `https://drive.google.com/drive/folders/${id}`

const newest = (rows) => rows.reduce((best, r) => (r.created_at && (!best || r.created_at > best) ? r.created_at : best), null)

/**
 * One row per client worth showing: not archived. Internal businesses stay
 * (the two Horizon accounts are where most of the creative work happens)
 * and are marked so the card can say so.
 *
 * savedAds, publishedAds, videos: rows with client_id and created_at
 * (publishedAds also status; live means status ACTIVE).
 */
export function rollupClients(clients = [], savedAds = [], publishedAds = [], videos = []) {
  const by = (rows) => {
    const m = new Map()
    for (const r of rows) {
      if (!r?.client_id) continue
      if (!m.has(r.client_id)) m.set(r.client_id, [])
      m.get(r.client_id).push(r)
    }
    return m
  }
  const saved = by(savedAds)
  const published = by(publishedAds)
  const vids = by(videos)

  return clients
    .filter((c) => c && !c.archived)
    .map((c) => {
      const s = saved.get(c.id) || []
      const p = published.get(c.id) || []
      const v = vids.get(c.id) || []
      const lastActivity = [newest(s), newest(p), newest(v)].filter(Boolean).sort().pop() || null
      return {
        id: c.id,
        name: c.name,
        industry: c.industry || '',
        internal: Boolean(c.is_internal),
        folders: driveFolders(c),
        saved: s.length,
        published: p.length,
        live: p.filter((x) => String(x.status || '').toUpperCase() === 'ACTIVE').length,
        videos: v.length,
        lastPublished: newest(p),
        lastActivity,
      }
    })
}

/** Most recent creative activity first, then by name. Never-touched last. */
export function sortForContent(rows) {
  return [...rows].sort((a, b) => {
    if (a.lastActivity !== b.lastActivity) {
      if (!a.lastActivity) return 1
      if (!b.lastActivity) return -1
      return a.lastActivity < b.lastActivity ? 1 : -1
    }
    return a.name.localeCompare(b.name)
  })
}

export function searchClients(rows, q) {
  const s = String(q || '').trim().toLowerCase()
  if (!s) return rows
  return rows.filter((r) => `${r.name} ${r.industry}`.toLowerCase().includes(s))
}

/** The numbers on the three doors. */
export function hubStats(rows) {
  return {
    clients: rows.length,
    saved: rows.reduce((n, r) => n + r.saved, 0),
    videos: rows.reduce((n, r) => n + r.videos, 0),
    withDrive: rows.filter((r) => r.folders.length > 0).length,
    folders: rows.reduce((n, r) => n + r.folders.length, 0),
    published: rows.reduce((n, r) => n + r.published, 0),
    live: rows.reduce((n, r) => n + r.live, 0),
    readyToPublish: rows.filter((r) => r.saved > 0 || r.videos > 0).length,
  }
}

/** "3 days ago", "today", "in 2 weeks" is not needed here: only the past. */
export function ago(iso, now = new Date()) {
  if (!iso) return ''
  const days = Math.floor((now - new Date(iso)) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} wk ago`
  if (days < 365) return `${Math.floor(days / 30)} mo ago`
  return `${Math.floor(days / 365)} yr ago`
}
