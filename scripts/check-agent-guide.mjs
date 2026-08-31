// The reason to trust the guide.
//
// A navigation guide that has gone stale is worse than no guide at all: it is
// followed confidently, and it sends the reader to a page that moved or a
// sidebar item that no longer exists. Prose cannot be checked, but the part
// that actually breaks -- the routes and the nav -- can be, by reading the
// router and the layout rather than trusting a memory of them.
//
// So: every path the guide names must exist in App.jsx, every path App.jsx
// serves must be described, and every sidebar item must agree with both. Add a
// page without documenting it and this fails.
//
// Run with: node scripts/check-agent-guide.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DOWNLOADS, GOTCHAS, LOOKUPS, ROUTES, formatAgentGuide } from '../src/lib/agentGuide.js'
import { guideText } from './build-agent-guide.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const failures = []
const fail = (msg) => failures.push(msg)
const check = (cond, msg) => {
  if (!cond) fail(msg)
}

// --- what the app actually serves ----------------------------------------
const app = read('src/App.jsx')
const routerPaths = [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1])
check(routerPaths.length > 5, `only found ${routerPaths.length} routes in App.jsx — did the parse break?`)

const layout = read('src/components/Layout.jsx')
const navItems = [...layout.matchAll(/\{\s*to:\s*'([^']+)',\s*label:\s*'([^']+)'/g)].map((m) => ({
  to: m[1],
  label: m[2],
}))
check(navItems.length > 5, `only found ${navItems.length} nav items in Layout.jsx — did the parse break?`)

// --- what the guide claims ------------------------------------------------
const guidePaths = ROUTES.flatMap((r) => [r.path, ...(r.aliases || [])])

for (const path of guidePaths) {
  check(
    routerPaths.includes(path),
    `the guide describes ${path}, which App.jsx does not route. Renamed or removed?`
  )
}

for (const path of routerPaths) {
  check(
    guidePaths.includes(path),
    `App.jsx routes ${path} and the guide never mentions it. Add it to ROUTES in src/lib/agentGuide.js.`
  )
}

// --- the sidebar and the guide have to tell the same story -----------------
for (const item of navItems) {
  const route = ROUTES.find((r) => r.path === item.to)
  if (!route) {
    fail(`the sidebar links to ${item.to}, which the guide does not describe.`)
    continue
  }
  check(
    route.nav === item.label,
    `the sidebar calls ${item.to} "${item.label}", the guide says "${route.nav}". A reader told to click the wrong label gives up.`
  )
}

for (const route of ROUTES.filter((r) => r.nav)) {
  check(
    navItems.some((i) => i.to === route.path),
    `the guide says ${route.path} is in the sidebar as "${route.nav}", but Layout.jsx has no such item.`
  )
}

// --- nothing described in name only ---------------------------------------
for (const route of ROUTES) {
  check(route.name?.trim(), `${route.path} has no name.`)
  check(route.purpose?.length > 40, `${route.path} needs a real purpose, not a label.`)
  check(route.contains?.length > 0, `${route.path} lists nothing under "what is on it".`)
  check(route.actions?.length > 0, `${route.path} lists nothing under "what you can do".`)
}

check(LOOKUPS.length >= 8, 'the "where to find a thing" table is too thin to be worth reading.')
for (const l of LOOKUPS) {
  check(l.need && l.where && l.how, `a lookup row is incomplete: ${JSON.stringify(l)}`)
}
for (const d of DOWNLOADS) check(d.what && d.how, `a download row is incomplete: ${d.what}`)
for (const g of GOTCHAS) check(g.title && g.body, `a gotcha is incomplete: ${g.title}`)

// --- the committed plain-text copy must not be stale ----------------------
// It is committed rather than only generated at build time so it survives a
// deploy that skips the prebuild hook. That only helps if it is current.
let onDisk = null
try {
  onDisk = read('public/llms.txt')
} catch {
  fail('public/llms.txt is missing. Run: npm run guide')
}
if (onDisk !== null) {
  check(
    onDisk === guideText(),
    'public/llms.txt is out of date with src/lib/agentGuide.js. Run: npm run guide'
  )
}

// --- the text output has to be readable, not just present ------------------
const text = formatAgentGuide()
check(text.includes('WHERE TO FIND A PARTICULAR THING'), 'the plain text lost its lookup section.')
check(text.includes('THINGS THAT WILL CATCH YOU OUT'), 'the plain text lost its gotchas.')
check(!text.includes('undefined'), 'the plain text contains "undefined" — a missing field somewhere.')
check(!/\n{3,}/.test(text), 'the plain text has runs of blank lines.')
for (const route of ROUTES) {
  check(text.includes(route.path), `the plain text never mentions ${route.path}.`)
}

// A base URL is offered so the guide can be handed out with absolute links.
const absolute = formatAgentGuide({ baseUrl: 'https://example.com/' })
check(
  absolute.includes('https://example.com/clients'),
  'baseUrl did not make it into the paths — a guide handed to something off-site would have dead links.'
)
check(
  !absolute.includes('https://example.com//clients'),
  'baseUrl produced a double slash.'
)

if (failures.length > 0) {
  console.error(`agent-guide checks FAILED (${failures.length}):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}

console.log(
  `agent-guide checks passed (${ROUTES.length} pages, ${LOOKUPS.length} lookups, ` +
    `${DOWNLOADS.length} downloads, ${GOTCHAS.length} gotchas)`
)
