// Landing pages: the arithmetic, with no database in it, so
// scripts/check-landing-pages.mjs can pin it. The reads and writes live in
// landingPagesStore.js.

/** What a page is for. The order is the order they are listed in. */
export const PURPOSES = [
  { key: 'meta', label: 'Meta ads', tone: 'blue' },
  { key: 'google', label: 'Google Ads', tone: 'green' },
  { key: 'booking', label: 'Booking', tone: 'amber' },
  { key: 'site', label: 'Website', tone: 'slate' },
  { key: 'other', label: 'Other', tone: 'slate' },
]

export const purposeMeta = (key) => PURPOSES.find((p) => p.key === key) || PURPOSES[PURPOSES.length - 1]

/**
 * A pasted address as a real https URL, or '' when it is not one.
 * "workingclassgroup.com/dynamic-flow" is accepted; "dynamic flow" is not.
 * UTM tags and other query strings are kept as pasted.
 */
export function normalizeUrl(input) {
  const raw = String(input || '').trim()
  if (!raw || /\s/.test(raw)) return ''
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const u = new URL(withScheme)
    if (!/^https?:$/.test(u.protocol)) return ''
    if (!u.hostname.includes('.')) return ''
    return u.toString()
  } catch {
    return ''
  }
}

/** The address without the scheme or a trailing slash, for a tight row. */
export function shortUrl(url) {
  return String(url || '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '')
}

const ACRONYMS = new Set(['hvac', 'ac', 'nc', 'ny', 'tx', 'fl', 'ga', 'sc', 'va', 'llc', 'inc', 'usa', 'lsa', 'seo', 'ppc', 'faq', 'iaq', 'uv'])

/** "https://x.com/dynamic-flow" becomes "Dynamic Flow"; a bare domain becomes the domain. */
export function labelFromUrl(url) {
  const clean = normalizeUrl(url)
  if (!clean) return ''
  const u = new URL(clean)
  const last = u.pathname.split('/').filter(Boolean).pop() || ''
  if (!last) return u.hostname.replace(/^www\./i, '')
  return decodeURIComponent(last)
    .replace(/\.(html?|php|aspx?)$/i, '')
    .split(/[-_+\s]+/)
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ')
}

/** A guess at the purpose from the address, for the picker's default. */
export function guessPurpose(url) {
  const s = String(url || '').toLowerCase()
  if (/\b(book|booking|schedule|scheduling|appointment|avoca|calendly)\b/.test(s)) return 'booking'
  if (/utm_source=(facebook|fb|meta|instagram|ig)\b|fbclid=/.test(s)) return 'meta'
  if (/utm_source=google\b|gclid=|utm_medium=cpc/.test(s)) return 'google'
  return ''
}

/** Listed by purpose (Meta, Google, booking, site, other), then oldest first. */
export function sortPages(pages = []) {
  const rank = Object.fromEntries(PURPOSES.map((p, i) => [p.key, i]))
  return [...pages].sort((a, b) => {
    const d = (rank[a.purpose] ?? 99) - (rank[b.purpose] ?? 99)
    return d !== 0 ? d : String(a.created_at || '').localeCompare(String(b.created_at || ''))
  })
}

/** What a page is called on screen: its label, or a label made from the address. */
export const pageTitle = (p) => p?.label?.trim() || labelFromUrl(p?.url) || shortUrl(p?.url)

/** One copyable message with every page, ready for Slack or a client text. */
export function pagesText(clientName, pages = []) {
  const rows = sortPages(pages)
  if (!rows.length) return `${clientName}: no landing pages saved yet.`
  const lines = [`${clientName} landing pages`]
  for (const p of rows) {
    const what = purposeMeta(p.purpose).label
    lines.push(`- ${pageTitle(p)} (${what}): ${p.url}${p.notes ? `  ${p.notes}` : ''}`)
  }
  return lines.join('\n')
}

/** The block the client chat's brief gets, or '' when there are no pages. */
export function landingPagesBlock(pages = []) {
  const rows = sortPages(pages)
  if (!rows.length) return ''
  return ['=== LANDING PAGES (where the ads send people) ===', ...rows.map((p) => `${purposeMeta(p.purpose).label}: ${p.url}${p.label ? ` (${p.label})` : ''}${p.notes ? `. ${p.notes}` : ''}`)].join('\n')
}

/**
 * The address a Meta ad should send people to when the objective needs a
 * link (Leads (website), Traffic): the saved Meta ads page first, then the
 * website page, then anything but a booking page. '' when the objective
 * takes an instant form instead, or nothing is saved: the website default
 * stands then.
 */
export function defaultMetaLink(pages = [], { needsLink = false } = {}) {
  if (!needsLink) return ''
  return pagesForMetaLink(pages)[0]?.url || ''
}

/** The pages worth offering as a Meta ad's link: Meta first, then website, then the rest except booking. */
export function pagesForMetaLink(pages = []) {
  const order = { meta: 0, site: 1, other: 2, google: 3 }
  return sortPages(pages)
    .filter((p) => p.purpose !== 'booking')
    .sort((a, b) => (order[a.purpose] ?? 9) - (order[b.purpose] ?? 9))
}
