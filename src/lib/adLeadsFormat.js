// How a lead reads on screen. Pure: scripts/check-ad-leads.mjs imports it;
// the fetch is in adLeads.js.

/** "Sep 29, 3:14 PM" for a lead's time. */
export function leadWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** A phone number as typed by Meta ("+15125550142") into something readable. */
export function prettyPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  const d = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (d.length !== 10) return String(raw || '')
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}
