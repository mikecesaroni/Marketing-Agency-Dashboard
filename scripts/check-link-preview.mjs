// Self-check for the link previews a message app shows for a client link.
// Run: node scripts/check-link-preview.mjs
import { existsSync, readFileSync } from 'node:fs'
import { KINDS, lookupName, matchClientPath, previewMeta, rewriteHtml } from '../netlify/lib/preview.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

// ------------------------------------------------------------- which page
check('a dashboard link', matchClientPath('/dashboard/0f076c58f062a1b2c3d4e5f60718293a4b5c'), { kind: 'dashboard', token: '0f076c58f062a1b2c3d4e5f60718293a4b5c' })
check('a report link', matchClientPath('/report/abcdefghijklmnopqrstuvwx'), { kind: 'report', token: 'abcdefghijklmnopqrstuvwx' })
check('not the CRM dashboard, not a short token, not anything else', [matchClientPath('/dashboard'), matchClientPath('/dashboard/'), matchClientPath('/dashboard/short'), matchClientPath('/clients'), matchClientPath('/')], [null, null, null, null, null])

// ---------------------------------------------------------------- the words
const meta = previewMeta({ kind: 'dashboard', name: 'Belk Heating and Cooling', origin: 'https://x.netlify.app', pathname: '/dashboard/tok' })
check('KPI Dashboard for the business', meta.title, 'KPI Dashboard for Belk Heating and Cooling')
check('with a sentence, a card image and the address', [meta.description.length > 20, meta.image, meta.url], [true, 'https://x.netlify.app/og-kpi-dashboard.png', 'https://x.netlify.app/dashboard/tok'])
check('no name, still a title', previewMeta({ kind: 'dashboard', name: '', origin: 'https://x', pathname: '/d' }).title, 'KPI Dashboard')
check('the report has its own words', previewMeta({ kind: 'report', name: 'Belk', origin: 'https://x', pathname: '/r' }).title, 'Weekly ads report for Belk')
check('no em dashes in the preview words', /[—–]/.test(Object.values(KINDS).map((k) => `${k.title('X')} ${k.description}`).join(' ')), false)

// -------------------------------------------------------------- the rewrite
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const out = rewriteHtml(html, meta)
check('the title is replaced', out.includes('<title>KPI Dashboard for Belk Heating and Cooling</title>') && !out.includes('<title>The Working Class Marketing CRM</title>'), true)
check('the open graph tags are in the head', ['og:title', 'og:description', 'og:image', 'og:url', 'twitter:card'].every((p) => out.includes(p)) && out.indexOf('og:title') < out.indexOf('</head>'), true)
check('the body is untouched', out.slice(out.indexOf('<body')), html.slice(html.indexOf('<body')))
check('names are escaped', rewriteHtml('<html><head><title>x</title></head><body></body></html>', previewMeta({ kind: 'dashboard', name: 'A & B "Heating" <Co>', origin: 'https://x', pathname: '/d' })).includes('KPI Dashboard for A &amp; B &quot;Heating&quot; &lt;Co&gt;'), true)
check('a page with no title gets one', rewriteHtml('<html><head></head><body></body></html>', meta).includes('<title>KPI Dashboard for Belk Heating and Cooling</title>'), true)

// --------------------------------------------------------------- the lookup
const fakeFetch = (url, init) => {
  const body = JSON.parse(init.body)
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body.p_token === 'good' ? 'Belk Heating and Cooling' : null) })
}
check('the name comes from client_link_name', await lookupName({ kind: 'dashboard', token: 'good', supabaseUrl: 'https://s/', anonKey: 'k', fetchFn: fakeFetch }), 'Belk Heating and Cooling')
check('a bad token gives no name', await lookupName({ kind: 'dashboard', token: 'bad', supabaseUrl: 'https://s', anonKey: 'k', fetchFn: fakeFetch }), '')
check('no keys, no call', await lookupName({ kind: 'dashboard', token: 'good', supabaseUrl: '', anonKey: '', fetchFn: () => Promise.reject(new Error('should not be called')) }), '')
check('a failing call gives no name rather than an error', await lookupName({ kind: 'dashboard', token: 'good', supabaseUrl: 'https://s', anonKey: 'k', fetchFn: () => Promise.reject(new Error('down')) }), '')

// --------------------------------------------------------------- the pieces
check('both card images exist', [existsSync(new URL('../public/og-kpi-dashboard.png', import.meta.url)), existsSync(new URL('../public/og-weekly-report.png', import.meta.url))], [true, true])
const edge = readFileSync(new URL('../netlify/edge-functions/client-preview.ts', import.meta.url), 'utf8')
check('the edge function covers both paths and bypasses on error', edge.includes("path: ['/dashboard/*', '/report/*']") && edge.includes("onError: 'bypass'"), true)
const sql = readFileSync(new URL('../supabase/client-dashboard.sql', import.meta.url), 'utf8')
check('the name lookup is in the SQL file', sql.includes('function client_link_name(p_kind text, p_token text)'), true)

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
