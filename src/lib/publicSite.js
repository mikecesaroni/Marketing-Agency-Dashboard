// The client-facing side of the app, kept apart from the CRM.
//
// Clients get links: a dashboard, a weekly report, an ad approval, an
// onboarding form. Those pages are public (the token in the link is the
// credential) and must never be a way into the CRM. Two walls:
//
// 1. A client-facing SITE. The same build, deployed a second time (or on a
//    second domain) with VITE_PUBLIC_ONLY=true or its host named in
//    VITE_PUBLIC_HOST, serves ONLY the public pages; every other address is
//    a dead end. Netlify can enforce the same thing at the edge (see
//    netlify.toml).
// 2. Links the CRM makes for clients use the address saved in the CRM
//    (app_settings.public_app_url, set on the Reports page under Client
//    dashboards: "can we change the URL of this CRM when we send out
//    links", 2026-11-07), else VITE_PUBLIC_APP_URL from the build, else
//    the address the CRM is open on. So a client never sees the CRM's own
//    address once a domain is saved. The weekly-report function reads the
//    same setting for the links in its emails (then its APP_URL secret).
//
// Plain JavaScript with no imports, so scripts/check-public-site.mjs can
// load it in Node.

/** The paths a client may open. Everything else is the CRM. */
export const PUBLIC_PREFIXES = ['/dashboard/', '/report/', '/approve/', '/onboarding/', '/scripts/', '/videos/', '/pay/']

export function isPublicPath(pathname) {
  const p = String(pathname || '')
  return PUBLIC_PREFIXES.some((prefix) => p.startsWith(prefix) && p.length > prefix.length)
}

const hosts = (value) =>
  String(value || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)

/** True when this deployment is the client-facing site. */
export function isPublicOnlySite({ hostname, env } = {}) {
  const e = env || {}
  if (String(e.VITE_PUBLIC_ONLY || '').toLowerCase() === 'true') return true
  return hosts(e.VITE_PUBLIC_HOST).includes(String(hostname || '').toLowerCase())
}

/** The app_settings key holding the address client links go out on. */
export const PUBLIC_APP_URL_KEY = 'public_app_url'

/**
 * An address as typed ("clients.example.com/", "https://Clients.Example.com")
 * made into a base for links: https:// added when no scheme was given, the
 * host lowercased, no path, no trailing slash. Empty for anything that is
 * not a web address, so a slip cannot send every link somewhere odd.
 */
export function cleanPublicUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  // Any scheme but http(s) is not a web address (mailto:, ftp:); a bare
  // host gets https.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) return ''
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const u = new URL(withScheme)
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return ''
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return ''
    return `${u.protocol}//${u.hostname.toLowerCase()}${u.port ? `:${u.port}` : ''}`
  } catch {
    return ''
  }
}

/**
 * Where client links point: the address saved in the CRM when there is
 * one, else the client-facing site from the build, else the address the
 * CRM is open on.
 */
export function publicBase(env, origin, saved = '') {
  const e = env || {}
  return (cleanPublicUrl(saved) || String(e.VITE_PUBLIC_APP_URL || origin || '')).replace(/\/+$/, '')
}

const runtimeEnv = () => (typeof import.meta !== 'undefined' && import.meta.env) || {}
const runtimeOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '')

// The saved address, read once when the CRM opens (src/lib/publicSiteStore.js)
// and kept here so every link builder stays a plain function.
let savedPublicUrl = ''
export function setPublicAppUrl(value) {
  savedPublicUrl = cleanPublicUrl(value)
  return savedPublicUrl
}
export const getPublicAppUrl = () => savedPublicUrl

/** A full link for a client, from a public path such as /dashboard/<token>. */
export function publicLink(path) {
  return `${publicBase(runtimeEnv(), runtimeOrigin(), savedPublicUrl)}${path}`
}

/** Is this page running on the client-facing site? */
export function onPublicSite() {
  return isPublicOnlySite({ hostname: typeof window !== 'undefined' ? window.location.hostname : '', env: runtimeEnv() })
}

// ---------------------------------------------------------------------------
// The third wall, for the day the client-facing site is not switched on and
// a client's link carries the CRM's own address: a tab that has opened a
// client page is a client's tab. From then on, every CRM address in that
// tab (the root, /clients, /login itself) is "Nothing here", not a sign-in
// form ("make sure there's no way they can get inside our main CRM from
// these links, or even get prompted to log in"). A signed-in teammate is
// never affected: the session wins. A teammate who is NOT signed in and
// opened a client link in a tab signs in from a fresh tab.
//
// Per tab (sessionStorage), so a client who closes the tab and later types
// the CRM's address by hand meets the login page like any stranger, which
// says nothing about what the link was for.
// ---------------------------------------------------------------------------

export const CLIENT_VISITOR_KEY = 'crm.client-visitor'

/** Mark this tab as a client's. `storage` is sessionStorage or a stand-in. */
export function markClientVisitor(storage) {
  try {
    storage?.setItem(CLIENT_VISITOR_KEY, '1')
  } catch {
    /* private window, storage off: the other two walls still stand */
  }
}

/** Has this tab opened a client page? */
export function isClientVisitor(storage) {
  try {
    return storage?.getItem(CLIENT_VISITOR_KEY) === '1'
  } catch {
    return false
  }
}

const sessionStore = () => (typeof window !== 'undefined' ? window.sessionStorage : null)

export const rememberClientVisitor = () => markClientVisitor(sessionStore())
export const cameFromClientLink = () => isClientVisitor(sessionStore())
