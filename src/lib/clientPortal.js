// The client portal: one private link, several tabs.
//
// A client gets one link (their dashboard token). The pages behind it are
// tabs of the same place: their numbers (/dashboard/<token>) and their
// video scripts (/scripts/<token>), with room for more. Each tab keeps its
// own address, so a deep link, a link preview and the browser's back
// button all keep working; the tab bar just moves between them.
//
// Plain JavaScript with no imports, so scripts/check-client-portal.mjs
// can load it in Node. To add a tab: one entry here, a route in App.jsx
// (both lists), its prefix in publicSite.js, and a page that renders
// <PortalTabs> in its header.

export const PORTAL_TABS = [
  { key: 'numbers', label: 'Your numbers', prefix: '/dashboard/', hint: 'Leads, spend and what they mean' },
  { key: 'scripts', label: 'Video scripts', prefix: '/scripts/', hint: 'What to film this week' },
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
