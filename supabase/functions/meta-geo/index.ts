// Bulk ZIP lookup for the publish page's location picker.
//
// A client sends their service area as a list of ZIPs. The picker's search
// (meta-publish, action search_locations) looks one place up at a time,
// which for sixty ZIPs is sixty round trips and sixty clicks. This takes the
// whole list and asks Meta once per hundred (search type adgeolocationmeta,
// which returns the location record for every key it knows), so the picker
// can add them all as ZIP targeting on the ad set and say which ones Meta
// did not recognise.
//
// Its own function rather than one more action on meta-publish: that file
// is two thousand lines and is deployed by pasting it whole, and a lookup
// that touches no client data has no reason to ride along with it. Same
// token, same Graph version.
//
// Secrets: META_ACCESS_TOKEN.
//
// Body:  { action: 'lookup_zips', zips: ['27601', ...], country?: 'US' }
// Reply: { locations: [{ key, type: 'zip', name, region, country_code, country_name, primary_city, label }], missing: ['00000'] }

const META_API_VERSION = 'v21.0'
const GRAPH = `https://graph.facebook.com/${META_API_VERSION}`
// Meta takes a list of keys per call; a hundred keeps the URL well inside
// what the Graph API accepts.
const CHUNK = 100
const MAX_ZIPS = 1000

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })
}

async function graphGet(path: string, params: Record<string, string>, token: string) {
  const url = new URL(`${GRAPH}/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('access_token', token)
  const res = await fetch(url)
  const body = await res.json()
  if (!res.ok) {
    const err = body?.error || {}
    throw new Error([err.error_user_title, err.error_user_msg || err.message].filter(Boolean).join(' — ') || `Meta returned ${res.status} on ${path}`)
  }
  return body
}

type Row = { key?: string; name?: string; type?: string; primary_city?: string; region?: string; country_code?: string; country_name?: string }

const asLocation = (row: Row) => ({
  key: String(row.key || ''),
  type: 'zip',
  name: String(row.name || ''),
  region: String(row.region || ''),
  country_code: String(row.country_code || ''),
  country_name: String(row.country_name || ''),
  primary_city: String(row.primary_city || ''),
  label: [row.name, row.primary_city, row.region].filter(Boolean).join(', '),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const token = Deno.env.get('META_ACCESS_TOKEN')
  if (!token) return json({ error: 'META_ACCESS_TOKEN is not set on this project. See docs/meta-connection.md.' }, 500)

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }
  if (body.action !== 'lookup_zips') return json({ error: `Unknown action "${String(body.action || '')}".` }, 400)

  const country = /^[A-Z]{2}$/.test(String(body.country || '')) ? String(body.country) : 'US'
  const zips = [...new Set((Array.isArray(body.zips) ? body.zips : []).map((z) => String(z || '').trim()).filter((z) => /^\d{5}$/.test(z)))].slice(0, MAX_ZIPS)
  if (!zips.length) return json({ locations: [], missing: [] })

  try {
    const found = new Map<string, Row>()
    for (let i = 0; i < zips.length; i += CHUNK) {
      const chunk = zips.slice(i, i + CHUNK)
      const keys = chunk.map((z) => `${country}:${z}`)
      try {
        const res = await graphGet('search', { type: 'adgeolocationmeta', zips: JSON.stringify(keys) }, token)
        for (const row of Object.values((res?.zips || {}) as Record<string, Row>)) {
          if (row?.key) found.set(row.key, row)
        }
      } catch {
        // One unknown key can fail the whole chunk on some API versions, so
        // fall back to asking for each ZIP on its own, the way the picker's
        // search does. Slower, and only on the chunk that failed.
        for (const z of chunk) {
          try {
            const one = await graphGet('search', { type: 'adgeolocation', location_types: JSON.stringify(['zip']), q: z, limit: '5' }, token)
            const hit = ((one?.data || []) as Row[]).find((r) => r.type === 'zip' && String(r.name) === z && String(r.country_code || 'US') === country)
            if (hit?.key) found.set(hit.key, hit)
          } catch {
            // Left as missing.
          }
        }
      }
    }
    const locations = zips.map((z) => found.get(`${country}:${z}`)).filter(Boolean).map((row) => asLocation(row as Row))
    const missing = zips.filter((z) => !found.has(`${country}:${z}`))
    return json({ locations, missing })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 502)
  }
})
