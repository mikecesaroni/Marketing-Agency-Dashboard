// Self-check for the paged read. Run: node scripts/check-paged-query.mjs
//
// The rule: A READ THAT CROSSES THE 1000-ROW PAGE RETURNS EVERY ROW, IN
// ORDER, EXACTLY ONCE, AND STOPS ON THE FIRST SHORT PAGE.

import { fetchAllRows } from '../src/lib/pagedQuery.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

// A fake table of n rows and a builder that behaves like PostgREST's range.
function table(n, { failAt } = {}) {
  const all = Array.from({ length: n }, (_, i) => ({ id: i + 1 }))
  const calls = []
  const makeQuery = () => ({
    range(from, to) {
      calls.push([from, to])
      if (failAt !== undefined && from === failAt) return Promise.resolve({ data: null, error: new Error('boom') })
      return Promise.resolve({ data: all.slice(from, to + 1), error: null })
    },
  })
  return { makeQuery, calls }
}

{
  const t = table(1095)
  const rows = await fetchAllRows(t.makeQuery, 1000)
  check('1095 rows come back whole', rows.length, 1095)
  check('in order, no duplicates', rows.map((r) => r.id).every((id, i) => id === i + 1), true)
  check('two requests, second is the short page', t.calls, [[0, 999], [1000, 1999]])
}
{
  const t = table(1000)
  const rows = await fetchAllRows(t.makeQuery, 1000)
  check('exactly one full page: a second, empty request settles it', [rows.length, t.calls.length], [1000, 2])
}
{
  const t = table(7)
  const rows = await fetchAllRows(t.makeQuery, 1000)
  check('a small table is one request', [rows.length, t.calls.length], [7, 1])
}
{
  const t = table(0)
  check('an empty table is []', await fetchAllRows(t.makeQuery, 1000), [])
}
{
  const t = table(25)
  const rows = await fetchAllRows(t.makeQuery, 10)
  check('small page size walks three pages', [rows.length, t.calls.length], [25, 3])
}
{
  const t = table(25, { failAt: 10 })
  let msg = ''
  try {
    await fetchAllRows(t.makeQuery, 10)
  } catch (e) {
    msg = e.message
  }
  check('an error on any page is thrown, not swallowed', msg, 'boom')
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
