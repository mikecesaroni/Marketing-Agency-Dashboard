// Self-check for the page cache: last answer first, fresh answer after,
// forgetting by prefix, and nothing too old.
// Run: node scripts/check-page-cache.mjs

// A stand-in for the browser's sessionStorage.
const store = new Map()
globalThis.sessionStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}

const { cacheBust, cacheGet, cacheSet, cached, keys, MAX_AGE_MS } = await import('../src/lib/pageCache.js')

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

check('nothing yet is undefined, not null', cacheGet('clients:list'), undefined)
cacheSet('clients:list', [{ id: 'a' }])
check('set then get', cacheGet('clients:list'), [{ id: 'a' }])

{
  const seen = []
  const fresh = await cached('clients:list', async () => [{ id: 'a' }, { id: 'b' }], (v, meta) => seen.push([v.length, meta.fromCache]))
  check('the last answer shows first, the fresh one after, and the fresh one is kept', [seen, fresh.length, cacheGet('clients:list').length], [[[1, true], [2, false]], 2, 2])
}
{
  const seen = []
  await cached('client:x:core', async () => ({ name: 'X' }), (v, meta) => seen.push(meta.fromCache))
  check('a first-ever load shows only the fresh answer', seen, [false])
}
{
  const seen = []
  let threw = ''
  await cached('clients:list', async () => { throw new Error('offline') }, (v, meta) => seen.push(meta.fromCache)).catch((e) => (threw = e.message))
  check('a failed refresh still showed the cached answer, then threw', [seen, threw], [[true], 'offline'])
}
cacheSet('client:x:tasks', [1])
cacheBust('client:x:')
check('bust by prefix forgets only that prefix', [cacheGet('client:x:core'), cacheGet('client:x:tasks'), Array.isArray(cacheGet('clients:list'))], [undefined, undefined, true])

// Too old to flash on screen.
await new Promise((r) => setTimeout(r, 350))
const raw = JSON.parse(store.get('crm.cache.v1'))
check('the store mirrors memory', Object.keys(raw).sort(), ['clients:list'])
raw['clients:list'].at = Date.now() - MAX_AGE_MS - 1000
store.set('crm.cache.v1', JSON.stringify(raw))
cacheBust()
check('bust with no prefix forgets everything', cacheGet('clients:list'), undefined)
check('keys are spelled one way', [keys.clients(), keys.client('7'), keys.clientTasks('7')], ['clients:list', 'client:7:core', 'client:7:tasks'])

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
