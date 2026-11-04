// Self-check for the wall between client links and the CRM.
// Run: node scripts/check-public-site.mjs
import { readFileSync } from 'node:fs'
import { CLIENT_VISITOR_KEY, PUBLIC_PREFIXES, isClientVisitor, isPublicOnlySite, isPublicPath, markClientVisitor, publicBase } from '../src/lib/publicSite.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

// ------------------------------------------------------------- the rules
check('the six kinds of client page', PUBLIC_PREFIXES, ['/dashboard/', '/report/', '/approve/', '/onboarding/', '/scripts/', '/videos/'])
check('a token page is public', [isPublicPath('/dashboard/abc'), isPublicPath('/report/abc'), isPublicPath('/approve/abc'), isPublicPath('/onboarding/abc'), isPublicPath('/scripts/abc'), isPublicPath('/videos/abc')], [true, true, true, true, true, true])
check('the CRM is not', [isPublicPath('/'), isPublicPath('/clients'), isPublicPath('/dashboard'), isPublicPath('/dashboard/'), isPublicPath('/reports'), isPublicPath('/login')], [false, false, false, false, false, false])
check('a flag makes a site client-facing', isPublicOnlySite({ hostname: 'anything.netlify.app', env: { VITE_PUBLIC_ONLY: 'true' } }), true)
check('so does a named host, any case, in a list', isPublicOnlySite({ hostname: 'Clients.Example.com', env: { VITE_PUBLIC_HOST: 'reports.example.com, clients.example.com' } }), true)
check('the CRM host is not client-facing', isPublicOnlySite({ hostname: 'crm.example.com', env: { VITE_PUBLIC_HOST: 'clients.example.com' } }), false)
check('nothing set means the CRM', isPublicOnlySite({ hostname: 'x.netlify.app', env: {} }), false)
check('links use the client-facing address when set', publicBase({ VITE_PUBLIC_APP_URL: 'https://clients.example.com/' }, 'https://crm.example.com'), 'https://clients.example.com')
check('and the current origin when not', publicBase({}, 'https://crm.example.com'), 'https://crm.example.com')

// ------------------------------------------------- the pages themselves
// A client page must not import the CRM shell or link into the CRM.
const publicPages = ['src/pages/ClientDashboardPage.jsx', 'src/pages/WeeklyReportPage.jsx', 'src/pages/AdApprovalPage.jsx', 'src/pages/ClientOnboardingPage.jsx', 'src/pages/ScriptStudioPage.jsx', 'src/pages/ClientVideosPage.jsx', 'src/components/scripts/ScriptView.jsx', 'src/components/PortalTabs.jsx', 'src/components/PortalSidebar.jsx']
for (const p of publicPages) {
  const src = read(p)
  const crmLink = src.match(/(?:to|href)=[{]?["'`]\/(?!dashboard\/|report\/|approve\/|onboarding\/|scripts\/|videos\/)[a-z]/)
  check(`${p.split('/').pop()} has no CRM shell and no CRM link`, [src.includes("components/Layout"), crmLink ? crmLink[0] : null], [false, null])
}

// The agency's help chat never floats over a client page.
check('the help chat hides on every kind of client page', PUBLIC_PREFIXES.every((p) => read('src/components/HelpChat.jsx').includes(p.replace(/\//g, ''))), true)

// The router serves only the public pages on a client-facing site.
const app = read('src/App.jsx')
check('App.jsx has a client-facing mode with a dead end', app.includes('onPublicSite()') && app.includes('NothingHerePage') && app.includes('path="*"'), true)
// The CRM's pages and the help chat load on demand, so a client's phone
// downloads none of the agency's screens; the client pages load up front.
check('the CRM pages and the help chat are on-demand files', app.includes("lazy(() => import('./components/HelpChat'))") && app.includes("lazy(() => import('./pages/ClientsPage'))") && !/^import HelpChat/m.test(app), true)
check('the client pages load with the first file', ['ClientDashboardPage', 'ScriptStudioPage', 'WeeklyReportPage', 'AdApprovalPage', 'ClientOnboardingPage'].every((p) => new RegExp(`^import ${p} from`, 'm').test(app)), true)
check('built files are cached for a year', /\/assets\/\*\s*\n\s*Cache-Control: public, max-age=31536000, immutable/.test(read('public/_headers')), true)

// Links the CRM makes for clients go through publicLink.
for (const [file, needle] of [
  ['src/lib/clientDashboard.js', "publicLink(`/dashboard/"],
  ['src/lib/weeklyReport.js', "publicLink(`/report/"],
  ['src/lib/adApprovalStore.js', "publicLink(`/approve/"],
  ['src/components/OnboardingLinkPanel.jsx', "publicLink(`/onboarding/"],
  ['src/components/OnboardingCallPanel.jsx', "publicLink(`/onboarding/"],
  ['src/lib/scriptStudioStore.js', "publicLink(`/scripts/"],
]) {
  check(`${file.split('/').pop()} makes client links through the public base`, read(file).includes(needle) && !read(file).includes('window.location.origin'), true)
}

// ------------------------------------------- the third wall: a client's tab
// ("make sure there's no way they can get inside our main CRM from these
// links, or even get prompted to log in")
const store = (() => {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }
})()
check('a fresh tab is nobody in particular', isClientVisitor(store), false)
markClientVisitor(store)
check('a tab that opened a client page is a client\'s from then on', [isClientVisitor(store), store.getItem(CLIENT_VISITOR_KEY)], [true, '1'])
check('storage that throws is survived, and reads as not a client', (() => {
  const broken = { getItem: () => { throw new Error('off') }, setItem: () => { throw new Error('off') } }
  markClientVisitor(broken)
  return isClientVisitor(broken)
})(), false)
check('no storage at all is survived', isClientVisitor(null), false)
const guard = read('src/components/RequireAuth.jsx')
check('the auth gate shows a client\'s tab the dead end, never the login form', guard.includes('cameFromClientLink()') && guard.includes('<NothingHerePage />') && guard.indexOf('if (clientTab) return <NothingHerePage />') < guard.indexOf('<Navigate to="/login"'), true)
check('...with login switched off too', (guard.match(/if \(clientTab\) return <NothingHerePage \/>/g) || []).length, 2)
check('the login address itself is a dead end in a client\'s tab', app.includes('cameFromClientLink() ? <NothingHerePage /> : <LoginPage />'), true)
check('every client page marks the tab on open', app.includes('rememberClientVisitor()') && app.includes('<PublicHomeScreen pathname={pathname} />'), true)

// Nobody indexes a CRM.
check('index.html tells search engines to stay out', read('index.html').includes('name="robots" content="noindex'), true)
check('robots.txt disallows everything', /Disallow:\s*\/\s*$/m.test(read('public/robots.txt')), true)
check('the dead-end page exists for the edge rule', read('public/nothing-here.html').includes('Nothing here'), true)

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
