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
// 2. Links the CRM makes for clients use VITE_PUBLIC_APP_URL when it is
//    set, so a client never sees the CRM's own address. The weekly-report
//    function does the same with its APP_URL secret.
//
// Plain JavaScript with no imports, so scripts/check-public-site.mjs can
// load it in Node.

/** The paths a client may open. Everything else is the CRM. */
export const PUBLIC_PREFIXES = ['/dashboard/', '/report/', '/approve/', '/onboarding/', '/scripts/', '/videos/']

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

/** Where client links point: the client-facing site when there is one. */
export function publicBase(env, origin) {
  const e = env || {}
  return String(e.VITE_PUBLIC_APP_URL || origin || '').replace(/\/+$/, '')
}

const runtimeEnv = () => (typeof import.meta !== 'undefined' && import.meta.env) || {}
const runtimeOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '')

/** A full link for a client, from a public path such as /dashboard/<token>. */
export function publicLink(path) {
  return `${publicBase(runtimeEnv(), runtimeOrigin())}${path}`
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
