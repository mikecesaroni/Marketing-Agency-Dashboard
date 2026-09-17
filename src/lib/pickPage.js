// Which Facebook Page is this client's, out of everything the token can see.
//
// The token manages every client's Page, so "the Pages Meta returns" is a
// list of eleven businesses. discover_assets ranks them by how many of the
// account's ads already post as each, which is decisive once ads exist and
// says nothing before: with every count at zero the first in the list was
// being suggested, and Perfect Breeze was saved with Tito's Page.
//
// Order of evidence: a Page the account's ads already use; the only Page
// there is; a Page whose name matches the client's; otherwise nothing, and
// a blank is left for a person.

const STOP = new Set(['llc', 'inc', 'co', 'company', 'corp', 'ltd', 'the', 'and', 'of', 'services', 'service', 'group'])

function tokens(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP.has(t))
}

function squash(name) {
  return tokens(name).join('')
}

/** How alike two business names are: shared meaningful words, or one name inside the other once spaces are gone. */
export function nameScore(clientName, pageName) {
  const a = tokens(clientName)
  const b = tokens(pageName)
  if (a.length === 0 || b.length === 0) return 0
  const shared = a.filter((t) => b.includes(t)).length
  const sa = squash(clientName)
  const sb = squash(pageName)
  const contained = sa.length >= 5 && sb.length >= 5 && (sa.includes(sb) || sb.includes(sa)) ? 2 : 0
  return Math.max(shared, contained)
}

/**
 * pages: [{id, name, ads_using}] as discover_assets returns them.
 * Returns a Page id or null.
 */
export function pickPage(clientName, pages) {
  const list = (Array.isArray(pages) ? pages : []).filter((p) => p && p.id)
  if (list.length === 0) return null

  const used = list.filter((p) => (Number(p.ads_using) || 0) > 0).sort((a, b) => b.ads_using - a.ads_using)
  if (used.length > 0) return used[0].id

  if (list.length === 1) return list[0].id

  const scored = list.map((p) => ({ id: p.id, score: nameScore(clientName, p.name) })).sort((a, b) => b.score - a.score)
  if (scored[0].score === 0) return null
  if (scored.length > 1 && scored[1].score === scored[0].score) return null
  return scored[0].id
}
