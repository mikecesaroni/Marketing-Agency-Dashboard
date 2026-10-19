// Self-check for the client portal: one link, several tabs.
// Run: node scripts/check-client-portal.mjs
import { readFileSync } from 'node:fs'
import { PORTAL_TABS, portalLinkPath, portalPath, portalTabFor } from '../src/lib/clientPortal.js'
import { PUBLIC_PREFIXES } from '../src/lib/publicSite.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

check('three tabs today: numbers, scripts and videos', PORTAL_TABS.map((t) => t.key), ['numbers', 'scripts', 'videos'])
check('every tab is a client page', PORTAL_TABS.every((t) => PUBLIC_PREFIXES.includes(t.prefix)), true)
check('the address of a tab', [portalPath('numbers', 'tok'), portalPath('scripts', 'tok'), portalPath('videos', 'tok'), portalPath('nope', 'tok')], ['/dashboard/tok', '/scripts/tok', '/videos/tok', '/dashboard/tok'])
check('the tab an address is on', [portalTabFor('/dashboard/tok'), portalTabFor('/scripts/tok'), portalTabFor('/videos/tok'), portalTabFor('/report/tok'), portalTabFor('/dashboard/'), portalTabFor('/')], ['numbers', 'scripts', 'videos', '', '', ''])
check('the one link to send opens on the numbers', portalLinkPath('tok'), '/dashboard/tok')
check('no em dashes in the tab words', /[—–]/.test(JSON.stringify(PORTAL_TABS)), false)

// Every tab's page renders the tab bar, and the router serves every tab in both lists.
const app = read('src/App.jsx')
for (const t of PORTAL_TABS) {
  const route = `path="${t.prefix}:token"`
  check(`${t.key}: routed on the CRM and on the client-facing site`, app.split(route).length - 1, 2)
}
check('the dashboard renders the tabs as the numbers tab', /<PortalTabs token=\{token\} active="numbers" dark \/>/.test(read('src/pages/ClientDashboardPage.jsx')), true)
check('the scripts page renders the tabs as the scripts tab', /<PortalTabs token=\{token\} active="scripts" \/>/.test(read('src/pages/ScriptStudioPage.jsx')), true)
check('the videos page renders the tabs as the videos tab', /<PortalTabs token=\{token\} active="videos" dark \/>/.test(read('src/pages/ClientVideosPage.jsx')), true)
// On a computer the pages go down the left like the CRM; the top bar is for phones.
const sidebarOn = (file, key) => new RegExp(`<PortalSidebar token=\\{token\\} active="${key}"`).test(read(file)) && /lg:pl-64/.test(read(file))
check('every page renders the sidebar and clears it', [sidebarOn('src/pages/ClientDashboardPage.jsx', 'numbers'), sidebarOn('src/pages/ScriptStudioPage.jsx', 'scripts'), sidebarOn('src/pages/ClientVideosPage.jsx', 'videos')], [true, true, true])
check('the sidebar is for computers, the bar for phones', [/hidden lg:fixed .*lg:flex lg:w-64/.test(read('src/components/PortalSidebar.jsx')), /lg:hidden/.test(read('src/components/PortalTabs.jsx'))], [true, true])
// Three tabs fit a 360px phone: one column each, the icon over the label.
const tabs = read('src/components/PortalTabs.jsx')
check('the bar gives each tab a column and stacks the icon on a phone', [tabs.includes("3: 'grid-cols-3'"), /flex-col items-center .* sm:flex-row/.test(tabs)], [true, true])
check('every tab has an icon', PORTAL_TABS.map((t) => tabs.includes(`${t.key}: (`)), PORTAL_TABS.map(() => true))

console.log(failures === 0 ? '\nAll client portal checks pass' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
