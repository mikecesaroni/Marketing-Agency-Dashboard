/**
 * "Add to Home Screen" on a client's own page.
 *
 * The site declares a web app manifest for the CRM (public/manifest.webmanifest)
 * whose start page is "/", and a home screen icon opens the manifest's start
 * page, not the page it was saved from. So a client who saved their Live
 * KPI Dashboard to their phone got the CRM login ("are you able to send the
 * password? it only shows up on a web link but I wanna save it to my
 * phone"). There is no password for a client; the icon was simply pointing
 * at the wrong door.
 *
 * On a client page the manifest link is taken out of the document and the
 * iOS title is set to the page's name. Without a manifest, iPhone and
 * Android both save the page's own address as the icon's start page, which
 * is exactly what the client wants; iOS still opens it full screen because
 * index.html keeps apple-mobile-web-app-capable. The CRM's own manifest comes
 * back the moment the route is a CRM page again.
 *
 * Pure apart from the document it is handed, so scripts/check-home-screen.mjs
 * runs it in Node with a stand-in.
 */

import { PUBLIC_PREFIXES, isPublicPath } from './publicSite.js'

const LABELS = {
  '/dashboard/': 'KPI Dashboard',
  '/report/': 'Weekly Report',
  '/approve/': 'Ad Approval',
  '/onboarding/': 'Onboarding',
  '/scripts/': 'Video Scripts',
  '/videos/': 'My Videos',
  '/pay/': 'Billing',
}

/** The name the icon gets on the phone, by which client page this is; '' for a CRM page. */
export function homeScreenLabel(pathname) {
  if (!isPublicPath(pathname)) return ''
  const prefix = PUBLIC_PREFIXES.find((p) => String(pathname || '').startsWith(p))
  return LABELS[prefix] || 'Working Class'
}

/**
 * Takes the CRM manifest off the page and names the icon. Returns a function
 * that puts everything back. `doc` is the document (or a stand-in with
 * querySelector / head.appendChild).
 */
export function applyHomeScreen(doc, label) {
  const link = doc.querySelector('link[rel="manifest"]')
  const parent = link?.parentNode || null
  const next = link?.nextSibling || null
  if (link && parent) parent.removeChild(link)

  const meta = doc.querySelector('meta[name="apple-mobile-web-app-title"]')
  const wasTitle = meta ? meta.getAttribute('content') : null
  if (meta && label) meta.setAttribute('content', label)

  return () => {
    if (link && parent && !link.parentNode) parent.insertBefore(link, next && next.parentNode === parent ? next : null)
    if (meta && wasTitle !== null) meta.setAttribute('content', wasTitle)
  }
}
