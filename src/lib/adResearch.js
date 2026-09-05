/**
 * Competitor research through Meta's public Ad Library.
 *
 * WHAT THIS IS NOT, AND WHY. The obvious build is "pull every winning
 * competitor ad into the CRM automatically." That cannot be done legitimately,
 * and the reasons were checked rather than assumed on 2026-09-06:
 *
 *   * Meta's Ad Library API refuses the System User token outright (#10,
 *     subcode 2332002) for every query, commercial or political. Access needs a
 *     personal Facebook account that has passed identity verification by
 *     mailed code, and a user token from it.
 *   * Even past that gate, the API does NOT return ordinary commercial ads in
 *     the US. Outside the EU it serves political/issue ads plus the housing,
 *     employment and credit special categories. A plumber's ad in Dallas has no
 *     API path at all.
 *   * The tools that do return US commercial ads reverse-engineer Meta's
 *     internal GraphQL, against its terms of service. Not something to build
 *     into a product that is meant to be sold one day.
 *
 * What DOES work: the Ad Library web page shows every active commercial ad for
 * any keyword and country, to anyone, with no login. So this builds the exact
 * search a person would type -- the client's trade in the client's town -- and
 * opens it. The judging stays with the person looking, which is where it has
 * to be anyway: the Library exposes no performance numbers for commercial ads,
 * and the only signal of a winner is how long it has been running.
 *
 * Pure on purpose: no Supabase import, so scripts/check-ad-research.mjs can
 * reach it.
 */

const LIBRARY = 'https://www.facebook.com/ads/library/'

/** Trims, collapses whitespace, drops empties. */
function clean(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The places named in a market string, one per search.
 *
 * Markets are typed by hand and arrive as "West Chester/Upper Bronx",
 * "Fairfield and New Haven County, based in Millford" and "Raleigh, NC". One
 * search across all of that is a bad search; a search per place is what a
 * person would do. State abbreviations after a comma stay attached to their
 * city, because "Raleigh NC" is the search and "NC" alone is not.
 */
export function placesIn(market) {
  const m = clean(market)
  if (!m) return []

  // "based in X" is a fact about the office, not a market. The office town is
  // still worth a search, so it is kept as its own place.
  const parts = m
    .split(/\s*(?:\/|;|\band\b|&|\bbased in\b)\s*/i)
    .map(clean)
    .filter(Boolean)

  const out = []
  for (const part of parts) {
    // "Raleigh, NC" is one place. "Fairfield, New Haven" is two.
    const bits = part.split(',').map(clean).filter(Boolean)
    if (bits.length === 2 && /^[A-Za-z]{2}$/.test(bits[1])) {
      out.push(`${bits[0]} ${bits[1].toUpperCase()}`)
    } else {
      out.push(...bits)
    }
  }
  // Same place twice in one market is a typing habit, not two markets.
  return [...new Set(out.map((p) => p.replace(/\bcounty\b/i, '').trim()).filter(Boolean))]
}

/**
 * The trade to search for. "HVAC/Plumbing" is two trades; "Walter Filtration"
 * is one misspelt one and is searched as typed, because correcting it silently
 * would hide the typo from the person who can fix it.
 */
export function tradesIn(industry) {
  return [
    ...new Set(
      clean(industry)
        .split(/\s*(?:\/|,|\band\b|&)\s*/i)
        .map(clean)
        .filter(Boolean)
    ),
  ]
}

/**
 * The searches worth running for one client, in the order worth running them.
 *
 * Trade + place first, because that is the competition. Then the trade alone
 * nationally, which is where the best creative usually is -- a company doing
 * this at scale in another state has already paid to learn what works, and
 * the ad they have run for eight months is the one to study.
 */
export function researchSearches({ industry, market, fallbackTrade, fallbackArea } = {}) {
  const trades = tradesIn(industry).length ? tradesIn(industry) : tradesIn(fallbackTrade)
  const places = placesIn(market).length ? placesIn(market) : placesIn(fallbackArea)

  const out = []
  for (const trade of trades) {
    for (const place of places) {
      out.push({ label: `${trade} in ${place}`, terms: `${trade} ${place}`, scope: 'local' })
    }
  }
  for (const trade of trades) {
    out.push({ label: `${trade} — anywhere in the US`, terms: trade, scope: 'national' })
  }
  return out
}

/**
 * The Ad Library page for one search: active ads only, all ad types, US.
 *
 * These are the URL parameters the public page itself uses when a person
 * types a search, so the link lands on exactly what they would have seen.
 */
export function adLibraryUrl(terms, { country = 'US', activeOnly = true } = {}) {
  const q = new URLSearchParams({
    active_status: activeOnly ? 'active' : 'all',
    ad_type: 'all',
    country,
    q: clean(terms),
    search_type: 'keyword_unordered',
    media_type: 'all',
  })
  return `${LIBRARY}?${q}`
}

/** Search for a named competitor's ads, when a person knows who they are. */
export function competitorUrl(name, { country = 'US' } = {}) {
  return adLibraryUrl(name, { country, activeOnly: true })
}
