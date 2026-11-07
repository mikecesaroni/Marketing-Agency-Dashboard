// Self-check for the wall between client links and the CRM.
// Run: node scripts/check-public-site.mjs
import { readFileSync } from 'node:fs'
import { CLIENT_VISITOR_KEY, PUBLIC_APP_URL_KEY, PUBLIC_PREFIXES, cleanPublicUrl, getPublicAppUrl, isClientVisitor, isPublicOnlySite, isPublicPath, markClientVisitor, publicBase, publicLink, setPublicAppUrl } from '../src/lib/publicSite.js'

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

// The address saved in the CRM ("can we change the URL of this CRM when we
// send out links") wins over the build and the site.
check('the setting lives under one key', PUBLIC_APP_URL_KEY, 'public_app_url')
check('an address as typed becomes a base: https added, the host lowercased, no path, no slash', [cleanPublicUrl('clients.Example.com/'), cleanPublicUrl('https://Clients.Example.com/dashboard/x'), cleanPublicUrl('http://localhost:5173/'), cleanPublicUrl('  ')], ['https://clients.example.com', 'https://clients.example.com', 'http://localhost:5173', ''])
check('not a web address: nothing, so a slip cannot send every link somewhere odd', [cleanPublicUrl('mailto:x@y.z'), cleanPublicUrl('just words'), cleanPublicUrl('ftp://x.com')], ['', '', ''])
check('the saved address beats the build and the site', publicBase({ VITE_PUBLIC_APP_URL: 'https://build.example.com' }, 'https://crm.example.com', 'clients.example.com'), 'https://clients.example.com')
check('a saved address that is not one falls through to the build', publicBase({ VITE_PUBLIC_APP_URL: 'https://build.example.com' }, 'https://crm.example.com', 'nope'), 'https://build.example.com')
check('publicLink reads the saved address from the cache', [setPublicAppUrl('reports.example.com'), getPublicAppUrl(), publicLink('/dashboard/t1'), setPublicAppUrl(''), publicLink('/dashboard/t1')], ['https://reports.example.com', 'https://reports.example.com', 'https://reports.example.com/dashboard/t1', '', '/dashboard/t1'])
check('the weekly report email reads the same setting for its links', [read('supabase/functions/weekly-report/index.ts').includes("app_settings?key=eq.public_app_url"), read('supabase/functions/weekly-report/index.ts').includes('let appUrl')], [true, true])
check('the Reports page has the box, and the CRM reads the setting when it opens', [read('src/components/ClientDashboardsPanel.jsx').includes('data-link-address'), read('src/App.jsx').includes('loadPublicAppUrl()')], [true, true])

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

// ------------------------------------------ the client shell, client.html
// ("as soon as I added it as a bookmark it wants me to log in"): a home
// screen icon opens the manifest's start page, so a client page is served
// from a shell with no manifest at all, at the edge, before any script.
const clientHtml = read('client.html')
check('client.html has no web app manifest and no help link into the CRM guide', [/rel="manifest"/.test(clientHtml), /rel="help"/.test(clientHtml), /llms\.txt/.test(clientHtml)], [false, false, false])
check('client.html still opens full screen on an iPhone, named for the client side', clientHtml.includes('apple-mobile-web-app-capable') && /apple-mobile-web-app-title" content="Client Portal"/.test(clientHtml), true)
check('client.html boots the same app', clientHtml.includes('src="/src/main.jsx"') && clientHtml.includes('name="robots" content="noindex'), true)
const toml = read('netlify.toml')
const catchAll = toml.indexOf('from = "/*"')
check('every client path is served from client.html at the edge, before the catch-all', PUBLIC_PREFIXES.every((p) => {
  const at = toml.indexOf(`from = "${p}*"`)
  return at > -1 && at < catchAll && toml.slice(at, at + 80).includes('to = "/client.html"')
}), true)
check('the build makes both shells', /client:\s*resolve\(import\.meta\.dirname, 'client\.html'\)/.test(read('vite.config.js')), true)

// Nobody indexes a CRM.
check('index.html tells search engines to stay out', read('index.html').includes('name="robots" content="noindex'), true)
check('robots.txt disallows everything', /Disallow:\s*\/\s*$/m.test(read('public/robots.txt')), true)
check('the dead-end page exists for the edge rule', read('public/nothing-here.html').includes('Nothing here'), true)

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
