// The County map template's pure half: which state a client is in, which
// county the ad is for, and the counties' shapes projected into a box.
//
// From an Empire Solar ad (2026-11-09): "ERIE COUNTY HOMEOWNERS" big, the
// whole of New York drawn as its counties in grey with Erie lit in gold, the
// offer in gold under it and three incentive tiles. The shapes come from the
// US Atlas (counties-10m) through the geo-shapes function, one file per
// state kept in the bucket (src/lib/countyMapStore.js); this module knows
// nothing about fetching. Plain JavaScript, no imports, so
// scripts/check-county-map.mjs runs it in Node.

/** The FIPS code every state's counties start with, by postal abbreviation. */
export const STATE_FIPS = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', DC: '11', FL: '12',
  GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23',
  MD: '24', MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33',
  NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44',
  SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54', WI: '55', WY: '56',
}

const STATE_NAMES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE',
  'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
}

/**
 * The state a market or service area names: "Manchester, NH", "Buffalo NY",
 * "Westchester County, New York", "Dallas-Fort Worth, Texas". The last two
 * capital letters after a comma or a space win, then a state's full name
 * anywhere. Empty when nothing says.
 */
export function stateAbbrFrom(text) {
  const s = String(text || '').trim()
  if (!s) return ''
  const abbr = s.match(/(?:,|\s)\s*([A-Za-z]{2})\.?\s*(?:,|\d{5}|$)/)
  if (abbr && STATE_FIPS[abbr[1].toUpperCase()]) return abbr[1].toUpperCase()
  const lower = s.toLowerCase()
  // Longest names first, so "west virginia" is not read as "virginia".
  const names = Object.keys(STATE_NAMES).sort((a, b) => b.length - a.length)
  for (const name of names) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) return STATE_NAMES[name]
  }
  return ''
}

const AUDIENCE = /\b(home\s?owners|residents|families|neighbou?rs|households|businesses|folks)\b/i

/** A county's name as a key: lowercase letters only, the word County (Parish, Borough) and "St." normalised away. */
export function countyKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\bst\.?\s+/g, 'saint ')
    .replace(/\b(county|parish|borough|census area|city and borough|municipality|municipio)\b/g, '')
    .replace(/[^a-z]/g, '')
}

/**
 * The county an ad's location badge names: "Erie County" and "Erie County
 * homeowners" are Erie; "Westchester" is Westchester; a city is itself,
 * which matches a county only when one shares its name.
 */
export function countyFrom(badge) {
  const s = String(badge || '').replace(AUDIENCE, ' ').trim()
  const m = s.match(/^(.*?)\s*\b(county|parish|borough)\b/i)
  return countyKey(m ? m[1] : s)
}

/** The county in a state's list that the badge names, or null. An exact key first, then one the key starts. */
export function findCounty(counties, badge) {
  const key = countyFrom(badge)
  if (!key) return null
  const list = Array.isArray(counties) ? counties : []
  return list.find((c) => countyKey(c.name) === key) || list.find((c) => key.length >= 4 && countyKey(c.name).startsWith(key)) || null
}

/**
 * The two lines over the map: the place in capitals ("ERIE COUNTY") and the
 * audience under it ("HOMEOWNERS", or the sticker when one is typed). A
 * badge that ends in an audience word hands it to the second line.
 */
export function placeLines(badge, sticker = '') {
  const raw = String(badge || '').trim()
  const found = raw.match(AUDIENCE)
  const big = raw.replace(AUDIENCE, ' ').replace(/\s+/g, ' ').trim()
  const small = String(sticker || '').trim() || (found ? found[0] : 'Homeowners')
  return { big: (big || 'Your area').toUpperCase(), small: small.toUpperCase() }
}

/**
 * A state's counties projected into a box, north up, the whole state fitted
 * and centred: longitude is scaled by the cosine of the middle latitude so
 * the shape is not stretched, and latitude is flipped because canvas y
 * grows downward. Returns the projected rings and the box they fill.
 */
export function projectShapes(counties, box, { pad = 0 } = {}) {
  const list = (Array.isArray(counties) ? counties : []).filter((c) => Array.isArray(c?.rings) && c.rings.length)
  if (!list.length) return { counties: [], bounds: null }
  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const c of list) {
    for (const ring of c.rings) {
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon
        if (lon > maxLon) maxLon = lon
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
      }
    }
  }
  const k = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180)) || 1
  const spanX = (maxLon - minLon) * k || 1
  const spanY = maxLat - minLat || 1
  const innerW = Math.max(1, box.w - pad * 2)
  const innerH = Math.max(1, box.h - pad * 2)
  const s = Math.min(innerW / spanX, innerH / spanY)
  const width = spanX * s
  const height = spanY * s
  const ox = box.x + pad + (innerW - width) / 2
  const oy = box.y + pad + (innerH - height) / 2
  const project = ([lon, lat]) => [ox + (lon - minLon) * k * s, oy + (maxLat - lat) * s]
  return {
    counties: list.map((c) => ({ id: c.id, name: c.name, rings: c.rings.map((ring) => ring.map(project)) })),
    bounds: { x: ox, y: oy, w: width, h: height },
  }
}
