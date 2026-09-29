// A client's website, read into the chat's memory.
//
// The read-website function fetches the site and saves a fact sheet on the
// client row (clients.website_profile). The block below is how that sheet
// appears in the chat brief. Pure: scripts/check-read-website.mjs imports it.
// The call itself is readWebsite() in websiteRead.js.

// Re-read on open once the sheet is this old; sites change offers seasonally.
export const STALE_DAYS = 60

/** The brief's website section, or '' when the site has not been read. */
export function websiteBlock(client) {
  const sheet = String(client?.website_profile || '').trim()
  if (!sheet) return ''
  const when = client.website_profile_at ? String(client.website_profile_at).slice(0, 10) : 'recently'
  const from = hostOf(client.website_profile_url) || 'their website'
  return `=== FROM THEIR WEBSITE (read ${when} from ${from}) ===
Their own site, read by my CRM. Use their words, offers, guarantees, towns and
customer quotes from here in scripts and ads. Where it disagrees with the intake
above, the intake wins (the owner told us directly) and you say so. Anything
listed under MISSING FROM THE SITE must not be invented.

${sheet}`
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Days since the last read, or null when never read. */
export function ageDays(client, today = new Date()) {
  if (!client?.website_profile_at) return null
  return Math.floor((today - new Date(client.website_profile_at)) / 86400000)
}

/**
 * Should opening the chat start a read by itself? Only when there is a site
 * to read and the sheet is missing or stale, and never straight after a
 * failure (that would retry a broken site on every open).
 */
export function shouldAutoRead(client, website, today = new Date()) {
  if (!website) return false
  const age = ageDays(client, today)
  if (client?.website_profile_error && age != null && age < 7) return false
  if (!client?.website_profile) return true
  return age != null && age >= STALE_DAYS
}
