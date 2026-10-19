// The client portal: one private link, several tabs.
//
// A client gets one link (their dashboard token). The pages behind it are
// tabs of the same place: their numbers (/dashboard/<token>), their video
// scripts (/scripts/<token>) and their videos (/videos/<token>), with room
// for more. Each tab keeps its own address, so a deep link, a link preview
// and the browser's back button all keep working; the tab bar just moves
// between them.
//
// Plain JavaScript with no imports, so scripts/check-client-portal.mjs
// can load it in Node. To add a tab: one entry here, an icon in
// PortalTabs.jsx, a route in App.jsx (both lists), its prefix in
// publicSite.js and HelpChat.jsx, a link preview in netlify/lib/preview.js
// and client-preview.ts, the kind in client_link_name, and a page that
// renders <PortalTabs> in its header.

export const PORTAL_TABS = [
  { key: 'numbers', label: 'Live KPIs', prefix: '/dashboard/', hint: 'Leads, spend and what they mean' },
  { key: 'scripts', label: 'Video scripts', prefix: '/scripts/', hint: 'What to film this week' },
  { key: 'videos', label: 'Your videos', prefix: '/videos/', hint: 'Watch and download your ads' },
]

/** The address of one tab for a token. */
export function portalPath(key, token) {
  const tab = PORTAL_TABS.find((t) => t.key === key) || PORTAL_TABS[0]
  return `${tab.prefix}${token}`
}

/** Which tab an address is on, or '' for none of them. */
export function portalTabFor(pathname) {
  const p = String(pathname || '')
  return PORTAL_TABS.find((t) => p.startsWith(t.prefix) && p.length > t.prefix.length)?.key || ''
}

/** The one link to send a client: the portal opens on their numbers. */
export function portalLinkPath(token) {
  return portalPath('numbers', token)
}
