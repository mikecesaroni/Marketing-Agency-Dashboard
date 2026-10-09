// Link previews for the pages a client is sent.
//
// When a dashboard or report link lands in iMessage, WhatsApp, Slack or an
// email, the app fetches the page without running any JavaScript and
// shows whatever the HTML head says. The app is one HTML file for every
// address, so that would be the CRM's own title. The edge function in
// client-preview.ts (next door, in edge-functions) runs in front of those two paths, looks the token up
// (client_link_name, which returns a business name and nothing else), and
// rewrites the head: "KPI Dashboard for Belk Heating and Cooling", a
// sentence, and a card image. Nothing else about the page changes.
//
// Kept outside netlify/edge-functions on purpose: every file in that folder
// is treated as an edge function entry point, and this one has no default
// export. Plain JavaScript so scripts/check-link-preview.mjs can load it in Node.

export const KINDS = {
  dashboard: {
    prefix: '/dashboard/',
    title: (name) => (name ? `Live KPI Dashboard for ${name}` : 'Live KPI Dashboard'),
    description: 'Live numbers: leads, spend, cost per lead and what each one means. Updated every morning.',
    image: '/og-kpi-dashboard.png',
  },
  report: {
    prefix: '/report/',
    title: (name) => (name ? `Weekly ads report for ${name}` : 'Weekly ads report'),
    description: 'Last week in plain words: spend, leads, cost per lead, and the number that matters most.',
    image: '/og-weekly-report.png',
  },
}

/** Which client page an address is, and its token; null for anything else. */
export function matchClientPath(pathname) {
  const p = String(pathname || '')
  for (const [kind, k] of Object.entries(KINDS)) {
    if (!p.startsWith(k.prefix)) continue
    const token = p.slice(k.prefix.length).split('/')[0]
    if (/^[a-z0-9]{20,}$/i.test(token)) return { kind, token }
  }
  return null
}

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** The words and the picture for one page. */
export function previewMeta({ kind, name, origin, pathname }) {
  const k = KINDS[kind]
  return {
    title: k.title(String(name || '').trim()),
    description: k.description,
    image: `${origin}${k.image}`,
    url: `${origin}${pathname}`,
  }
}

/** The page's head with the preview words in it. The body is untouched. */
export function rewriteHtml(html, meta) {
  const tags = [
    '<meta property="og:type" content="website" />',
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:image" content="${esc(meta.image)}" />`,
    `<meta property="og:url" content="${esc(meta.url)}" />`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    `<meta name="twitter:image" content="${esc(meta.image)}" />`,
  ].join('\n    ')
  let out = String(html || '')
  if (/<title>[\s\S]*?<\/title>/i.test(out)) out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(meta.title)}</title>`)
  else out = out.replace(/<head([^>]*)>/i, `<head$1>\n    <title>${esc(meta.title)}</title>`)
  return out.replace(/<\/head>/i, `    ${tags}\n  </head>`)
}

/**
 * The business name behind a token, through client_link_name. Empty on
 * any trouble: a preview without a name is still a preview.
 */
export async function lookupName({ kind, token, supabaseUrl, anonKey, fetchFn, timeoutMs = 2500 }) {
  if (!supabaseUrl || !anonKey) return ''
  const doFetch = fetchFn || globalThis.fetch
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await doFetch(`${String(supabaseUrl).replace(/\/+$/, '')}/rest/v1/rpc/client_link_name`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_kind: kind, p_token: token }),
      signal: ctrl.signal,
    })
    if (!res.ok) return ''
    const value = await res.json()
    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  } finally {
    clearTimeout(timer)
  }
}
