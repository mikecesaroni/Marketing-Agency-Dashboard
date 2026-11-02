// A pasted list of ZIP codes, the pure part.
//
// Clients send their service area as a list of ZIPs: an email, a spreadsheet
// column, a line from their CRM, "Raleigh NC 27601, 27603, 27605-1234 ...".
// Typing those into the location picker one at a time was the slow way
// ("what's the easiest way to add all this when a client sends ZIPs to
// target on Meta; can we make it so I paste this all in and it creates all
// the targeting on the ad set"). This reads the ZIPs out of whatever was
// pasted; the meta-geo function checks them with Meta in bulk and the picker
// adds the ones Meta knows as ZIP locations on the ad set.

/** The most ZIPs one paste is read for. Past this it is a list to split. */
export const MAX_ZIPS = 1000

/**
 * Every five-digit US ZIP in the text, once each, in the order written.
 * "27605-1234" is 27605; a longer run of digits (a phone number) is not a
 * ZIP; "02134" keeps its leading zero.
 */
export function zipsFromText(text) {
  const out = []
  const seen = new Set()
  const re = /(?<!\d)(\d{5})(?:-\d{4})?(?!\d)/g
  let m
  while ((m = re.exec(String(text || ''))) && out.length < MAX_ZIPS) {
    const zip = m[1]
    if (seen.has(zip)) continue
    seen.add(zip)
    out.push(zip)
  }
  return out
}

/** Meta's key for a US ZIP: "US:27601". */
export function zipKey(zip, country = 'US') {
  return `${country}:${String(zip).trim()}`
}

/**
 * A Meta adgeolocationmeta row as the picker's location: the key Meta
 * issued, type 'zip' (no radius), and a label that says where it is so
 * "27601" reads as "27601, Raleigh, North Carolina".
 */
export function zipLocation(row = {}) {
  const name = String(row.name || '').trim()
  const city = String(row.primary_city || '').trim()
  const region = String(row.region || '').trim()
  return {
    key: String(row.key || ''),
    type: 'zip',
    name,
    region,
    country_code: String(row.country_code || ''),
    country_name: String(row.country_name || ''),
    label: [name, city, region].filter(Boolean).join(', '),
  }
}

/**
 * What to say after a paste: how many went in, how many were already
 * there, which Meta did not know.
 */
export function pasteSummary({ added = 0, already = 0, missing = [] } = {}) {
  const bits = []
  if (added) bits.push(`Added ${added} ZIP${added === 1 ? '' : 's'}`)
  if (already) bits.push(`${already} already there`)
  if (missing.length) bits.push(`${missing.length} not known to Meta: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? ` and ${missing.length - 12} more` : ''}`)
  if (!bits.length) return 'No ZIP codes found in what was pasted.'
  return `${bits.join(' · ')}.`
}
