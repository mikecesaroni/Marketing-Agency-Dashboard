// Netlify Edge Function: the link preview for client pages.
//
// Runs in front of /dashboard/<token> and /report/<token>, lets the normal
// response through (the app's one HTML file), and rewrites its head so a
// message app shows "KPI Dashboard for <business>" with a card image
// instead of the CRM's title. See preview.js for the words and the
// rewrite; this file is only the plumbing. Anything that is not an HTML
// page, and any error, passes through untouched (onError: bypass).
//
// Needs the site's VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, which the
// build already has. The lookup is one read-only call that returns a name.

import { lookupName, matchClientPath, previewMeta, rewriteHtml } from './preview.js'

declare const Netlify: { env: { get(key: string): string | undefined } }

export default async (request: Request, context: { next: () => Promise<Response> }) => {
  const url = new URL(request.url)
  const match = matchClientPath(url.pathname)
  if (!match) return context.next()

  const res = await context.next()
  const type = res.headers.get('content-type') || ''
  if (!type.includes('text/html')) return res

  const html = await res.text()
  const name = await lookupName({
    kind: match.kind,
    token: match.token,
    supabaseUrl: Netlify.env.get('VITE_SUPABASE_URL'),
    anonKey: Netlify.env.get('VITE_SUPABASE_ANON_KEY'),
  })

  const headers = new Headers(res.headers)
  headers.delete('content-length')
  headers.delete('content-encoding')
  headers.set('cache-control', 'no-store')
  return new Response(rewriteHtml(html, previewMeta({ kind: match.kind, name, origin: url.origin, pathname: url.pathname })), {
    status: res.status,
    headers,
  })
}

export const config = { path: ['/dashboard/*', '/report/*'], onError: 'bypass' }
