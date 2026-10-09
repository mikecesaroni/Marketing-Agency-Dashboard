// Self-check for the wall between client links and the CRM.
// Run: node scripts/check-public-site.mjs
import { readFileSync } from 'node:fs'
import { PUBLIC_PREFIXES, isPublicOnlySite, isPublicPath, publicBase } from '../src/lib/publicSite.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

// ------------------------------------------------------------- the rules
check('the four kinds of client page', PUBLIC_PREFIXES, ['/dashboard/', '/report/', '/approve/', '/onboarding/'])
check('a token page is public', [isPublicPath('/dashboard/abc'), isPublicPath('/report/abc'), isPublicPath('/approve/abc'), isPublicPath('/onboarding/abc')], [true, true, true, true])
check('the CRM is not', [isPublicPath('/'), isPublicPath('/clients'), isPublicPath('/dashboard'), isPublicPath('/dashboard/'), isPublicPath('/reports'), isPublicPath('/login')], [false, false, false, false, false, false])
check('a flag makes a site client-facing', isPublicOnlySite({ hostname: 'anything.netlify.app', env: { VITE_PUBLIC_ONLY: 'true' } }), true)
check('so does a named host, any case, in a list', isPublicOnlySite({ hostname: 'Clients.Example.com', env: { VITE_PUBLIC_HOST: 'reports.example.com, clients.example.com' } }), true)
check('the CRM host is not client-facing', isPublicOnlySite({ hostname: 'crm.example.com', env: { VITE_PUBLIC_HOST: 'clients.example.com' } }), false)
check('nothing set means the CRM', isPublicOnlySite({ hostname: 'x.netlify.app', env: {} }), false)
check('links use the client-facing address when set', publicBase({ VITE_PUBLIC_APP_URL: 'https://clients.example.com/' }, 'https://crm.example.com'), 'https://clients.example.com')
check('and the current origin when not', publicBase({}, 'https://crm.example.com'), 'https://crm.example.com')

// ------------------------------------------------- the pages themselves
// A client page must not import the CRM shell or link into the CRM.
const publicPages = ['src/pages/ClientDashboardPage.jsx', 'src/pages/WeeklyReportPage.jsx', 'src/pages/AdApprovalPage.jsx', 'src/pages/ClientOnboardingPage.jsx']
for (const p of publicPages) {
  const src = read(p)
  const crmLink = src.match(/(?:to|href)=["'`]\/(?!dashboard\/|report\/|approve\/|onboarding\/)[a-z]/)
  check(`${p.split('/').pop()} has no CRM shell and no CRM link`, [src.includes("components/Layout"), crmLink ? crmLink[0] : null], [false, null])
}

// The router serves only the public pages on a client-facing site.
const app = read('src/App.jsx')
check('App.jsx has a client-facing mode with a dead end', app.includes('onPublicSite()') && app.includes('NothingHerePage') && app.includes('path="*"'), true)

// Links the CRM makes for clients go through publicLink.
for (const [file, needle] of [
  ['src/lib/clientDashboard.js', "publicLink(`/dashboard/"],
  ['src/lib/weeklyReport.js', "publicLink(`/report/"],
  ['src/lib/adApprovalStore.js', "publicLink(`/approve/"],
  ['src/components/OnboardingLinkPanel.jsx', "publicLink(`/onboarding/"],
  ['src/components/OnboardingCallPanel.jsx', "publicLink(`/onboarding/"],
]) {
  check(`${file.split('/').pop()} makes client links through the public base`, read(file).includes(needle) && !read(file).includes('window.location.origin'), true)
}

// Nobody indexes a CRM.
check('index.html tells search engines to stay out', read('index.html').includes('name="robots" content="noindex'), true)
check('robots.txt disallows everything', /Disallow:\s*\/\s*$/m.test(read('public/robots.txt')), true)
check('the dead-end page exists for the edge rule', read('public/nothing-here.html').includes('Nothing here'), true)

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
