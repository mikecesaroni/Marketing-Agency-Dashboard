// The Drive photos page's arithmetic. Pure, so scripts/check-drive-photos.mjs
// can pin it.

/** When a file was added: Drive's createdTime, or modifiedTime for older listings without it. */
export const addedAt = (f) => f?.created_time || f?.modified_time || ''

/** Newest added first. Ties keep their listed order. */
export function sortNewestAdded(files = []) {
  return [...files].sort((a, b) => (addedAt(b) > addedAt(a) ? 1 : addedAt(b) < addedAt(a) ? -1 : 0))
}

/** photo, video or pdf, by mime type. */
export function kindOf(f) {
  const m = String(f?.mime_type || '')
  if (m.startsWith('video/')) return 'video'
  if (m === 'application/pdf') return 'pdf'
  return 'photo'
}

const dayKey = (iso) => (iso ? String(iso).slice(0, 10) : '')

/**
 * Files grouped by the day they were added, newest day first. Labels read
 * the way a person says them: Today, Yesterday, then the date.
 */
export function groupByAdded(files = [], today = new Date()) {
  const todayKey = localDay(today)
  const yesterdayKey = localDay(new Date(today.getTime() - 86400000))
  const groups = new Map()
  for (const f of sortNewestAdded(files)) {
    const key = dayKey(localIso(addedAt(f))) || 'unknown'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(f)
  }
  return [...groups.entries()].map(([key, list]) => ({
    key,
    label: key === todayKey ? 'Added today' : key === yesterdayKey ? 'Added yesterday' : key === 'unknown' ? 'No date' : labelFor(key, today),
    files: list,
  }))
}

// Local-day helpers, so a photo added at 11pm is grouped with the day the
// person remembers adding it, not the UTC day.
function localDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function localIso(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : localDay(d)
}
function labelFor(key, today) {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const sameYear = y === today.getFullYear()
  return date.toLocaleDateString([], sameYear ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}
