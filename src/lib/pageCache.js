// What a page showed last time, so going back to it is instant.
//
// Every page used to start blank and wait for the database, which made
// hopping between the client list and a client page feel slow even though
// each round trip is under a second. Now a page that has loaded before puts
// its last answer on screen at once and refreshes it in the background;
// the new answer replaces the old when it lands, usually before anyone
// notices. Nothing is shown that was not true a moment ago, and nothing
// stays stale: every open still asks the database.
//
// Kept in memory for the tab's life and mirrored to sessionStorage, so a
// reload keeps it too. Session, not local: it dies with the tab, which is
// the right lifetime for a snapshot of live numbers, and it never outlives
// a sign-out.
//
// Writes go through the pages' own code; after one, bust(prefix) drops every
// key under it so the next open does not flash the old value first.

const MEM = new Map()
const STORE_KEY = 'crm.cache.v1'
// Older than this is not worth flashing on screen: a day-old number that
// then jumps reads as a glitch, not as speed.
export const MAX_AGE_MS = 6 * 60 * 60 * 1000
// sessionStorage is around 5MB; one page's answer can be a few hundred KB.
const MAX_STORE_BYTES = 3_500_000

function readStore() {
  try {
    const raw = sessionStorage.getItem(STORE_KEY)
    const obj = raw ? JSON.parse(raw) : {}
    return obj && typeof obj === 'object' ? obj : {}
  } catch {
    return {}
  }
}

let storeTimer = null
function writeStoreSoon() {
  clearTimeout(storeTimer)
  storeTimer = setTimeout(() => {
    try {
      const obj = {}
      for (const [k, v] of MEM) obj[k] = v
      let json = JSON.stringify(obj)
      // Too big: drop the oldest entries until it fits.
      while (json.length > MAX_STORE_BYTES && MEM.size) {
        const oldest = [...MEM.entries()].sort((a, b) => a[1].at - b[1].at)[0]?.[0]
        if (!oldest) break
        MEM.delete(oldest)
        delete obj[oldest]
        json = JSON.stringify(obj)
      }
      sessionStorage.setItem(STORE_KEY, json)
    } catch {
      // Storage full or blocked: memory still has it for this tab.
    }
  }, 300)
}

let hydrated = false
function hydrate() {
  if (hydrated) return
  hydrated = true
  const now = Date.now()
  for (const [k, v] of Object.entries(readStore())) {
    if (v && typeof v === 'object' && now - (v.at || 0) <= MAX_AGE_MS) MEM.set(k, v)
  }
}

/** The last answer for this key, or undefined when there is none fresh enough. */
export function cacheGet(key) {
  hydrate()
  const hit = MEM.get(key)
  if (!hit) return undefined
  if (Date.now() - hit.at > MAX_AGE_MS) {
    MEM.delete(key)
    return undefined
  }
  return hit.value
}

/** Remember an answer. Only plain data: it is JSON on the way to storage. */
export function cacheSet(key, value) {
  hydrate()
  if (value === undefined) return
  MEM.set(key, { value, at: Date.now() })
  writeStoreSoon()
}

/** Forget every key that starts with prefix (or everything, with none). */
export function cacheBust(prefix = '') {
  hydrate()
  for (const k of [...MEM.keys()]) if (k.startsWith(prefix)) MEM.delete(k)
  writeStoreSoon()
}

/**
 * Run a fetch with the cache in front of it: the last answer (if any) goes
 * to `onData` at once, then the fresh one when it lands, and the fresh one
 * is remembered. Returns the fresh answer. Throws what the fetcher throws,
 * after the cached answer has already been shown, so a page that had data
 * keeps it and shows the error beside it.
 */
export async function cached(key, fetcher, onData) {
  const had = cacheGet(key)
  if (had !== undefined) onData(had, { fromCache: true })
  const fresh = await fetcher()
  cacheSet(key, fresh)
  onData(fresh, { fromCache: false })
  return fresh
}

/** Key helpers, so every page spells a key the same way. */
export const keys = {
  clients: () => 'clients:list',
  client: (id) => `client:${id}:core`,
  clientSnapshot: (id) => `client:${id}:snapshot`,
  clientTasks: (id) => `client:${id}:tasks`,
  dashboard: () => 'dashboard:main',
  nextSteps: () => 'nextsteps:all',
}
