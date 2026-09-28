// Where you have been, so every page can offer "← <the page you came from>".
//
// The trail is one entry per browser history entry, keyed by React Router's
// location key, and kept in sessionStorage so a reload keeps it. The back
// button itself is just history back: this only decides whether to show it
// and what to call it. Pure apart from the two storage helpers at the end.

const MAX = 60

/**
 * The trail after arriving at `entry` ({ key, path, title }).
 *
 * - A key already on the trail means we went back (or forward) to it: the
 *   trail is cut to end there, and its title refreshed if we have one.
 * - A REPLACE navigation (a page tidying its own URL) swaps the last entry
 *   instead of adding one, because the browser did not add a history step
 *   either, and a back button that pointed at the pre-tidy URL would land a
 *   page too far back.
 * - Anything else is a new step.
 */
export function stepTrail(trail, entry, navType = 'PUSH') {
  const list = Array.isArray(trail) ? trail : []
  const i = list.findIndex((e) => e.key === entry.key)
  if (i >= 0) {
    const cut = list.slice(0, i + 1)
    cut[i] = { ...cut[i], path: entry.path, title: entry.title || cut[i].title }
    return cut
  }
  if (navType === 'REPLACE' && list.length) {
    const last = list[list.length - 1]
    return [...list.slice(0, -1), { ...entry, title: entry.title || (last.path === entry.path ? last.title : '') }]
  }
  return [...list, entry].slice(-MAX)
}

/** The entry before this one, if there is one and it is a different page. */
export function previousOf(trail, key) {
  const list = Array.isArray(trail) ? trail : []
  const i = list.findIndex((e) => e.key === key)
  if (i <= 0) return null
  const prev = list[i - 1]
  const here = list[i]
  return prev && prev.path !== here.path ? prev : null
}

// Titles that say nothing about which page it was.
const GENERIC = new Set(['', 'client', 'loading', 'loading…', 'loading...'])

/** A page title worth putting on a button, or '' for a placeholder. */
export function cleanTitle(title) {
  const t = typeof title === 'string' ? title.trim() : ''
  return GENERIC.has(t.toLowerCase()) ? '' : t
}

/**
 * What to call a page on the back button: its own title, else a name from
 * its path, else "Back".
 */
export function trailLabel(entry, pathNames = {}) {
  if (!entry) return 'Back'
  if (entry.title) return entry.title
  const path = String(entry.path || '').split('?')[0]
  if (pathNames[path]) return pathNames[path]
  if (path.startsWith('/client/')) return 'Client'
  if (path.startsWith('/publish/')) return 'Publish a video'
  if (path.startsWith('/funnel/')) return 'Build a funnel'
  return 'Back'
}

const KEY = 'crm.trail'

export function readTrail() {
  try {
    const raw = sessionStorage.getItem(KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function writeTrail(trail) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trail))
  } catch {
    // Private windows can refuse storage. The button just shows less.
  }
}
