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
export const PUBLIC_PREFIXES = ['/dashboard/', '/report/', '/approve/', '/onboarding/']

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
