// County shapes for the County map template, one file per state.
//
// The template draws the client's whole state as its counties, with their
// county lit in the brand colour (from an Empire Solar ad, 2026-11-09). The
// shapes come from the US Atlas (us-atlas@3, counties-10m: every US county
// at 1:10,000,000, a few thousand points per state), which the browser
// should not download whole (a megabyte and a half) for one state. So this
// function builds one small JSON per state the first time it is asked,
// keeps it in the client-files bucket at stock/geo/<ABBR>.json (public, so
// the next load is a plain fetch), and answers with it.
//
// Body: { state: 'NY' }                 -> { state, fips, counties: [{ id, name, rings }], source, built_at }
//       { state, summary: true }        -> { state, fips, counties: <count>, names: [...], points: <count> }
//       { state, decimate: 6 }          -> the shapes with every 6th point kept (for a quick look)
//       { state, rebuild: true }        -> builds again over the bucket copy
//
// Rings are [lon, lat] pairs rounded to four decimals (about ten metres).
// No secrets of its own: the bucket write uses the service role key.

import { feature } from 'npm:topojson-client@3'

const ATLAS = 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json'
const BUCKET = 'client-files'

const STATE_FIPS: Record<string, string> = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', DC: '11', FL: '12',
  GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23',
  MD: '24', MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33',
  NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44',
  SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54', WI: '55', WY: '56',
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })
}

type Ring = number[][]
type County = { id: string; name: string; rings: Ring[] }
type Shapes = { state: string; fips: string; counties: County[]; source: string; built_at: string }

const round4 = (n: number) => Math.round(n * 10000) / 10000

/** Every ring of a Polygon or MultiPolygon, outer rings and holes alike, rounded. */
function ringsOf(geometry: any): Ring[] {
  if (!geometry) return []
  const polys: number[][][][] = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : []
  const out: Ring[] = []
  for (const poly of polys) {
    for (const ring of poly) {
      if (Array.isArray(ring) && ring.length >= 4) out.push(ring.map(([lon, lat]) => [round4(lon), round4(lat)]))
    }
  }
  return out
}

async function build(state: string, fips: string): Promise<Shapes> {
  const res = await fetch(ATLAS)
  if (!res.ok) throw new Error(`The US Atlas could not be read (${res.status}).`)
  const topo = await res.json()
  const fc: any = feature(topo, topo.objects.counties)
  const counties: County[] = (fc.features || [])
    .filter((f: any) => String(f.id).padStart(5, '0').startsWith(fips))
    .map((f: any) => ({ id: String(f.id).padStart(5, '0'), name: String(f.properties?.name || ''), rings: ringsOf(f.geometry) }))
    .filter((c: County) => c.rings.length)
    .sort((a: County, b: County) => a.name.localeCompare(b.name))
  if (!counties.length) throw new Error(`No counties came back for ${state}.`)
  return { state, fips, counties, source: 'us-atlas@3 counties-10m', built_at: new Date().toISOString() }
}

/** The answer in the shape asked for: whole, a summary, or thinned for a quick look. */
function answer(data: Shapes, body: Record<string, any>) {
  if (body.summary) {
    const points = data.counties.reduce((n, c) => n + c.rings.reduce((m, r) => m + r.length, 0), 0)
    return { state: data.state, fips: data.fips, counties: data.counties.length, names: data.counties.map((c) => c.name), points, built_at: data.built_at }
  }
  const every = Number(body.decimate) || 0
  if (every >= 2) {
    return {
      ...data,
      counties: data.counties.map((c) => ({
        ...c,
        rings: c.rings.map((ring) => {
          const kept = ring.filter((_, i) => i % every === 0)
          if (kept.length < 4) return ring
          const [fx, fy] = kept[0]
          const [lx, ly] = kept[kept.length - 1]
          return fx === lx && fy === ly ? kept : [...kept, kept[0]]
        }),
      })),
    }
  }
  return data
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }
  const state = String(body.state || '').trim().toUpperCase()
  const fips = STATE_FIPS[state]
  if (!fips) return json({ error: `"${body.state}" is not a US state abbreviation.` }, 400)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const path = `stock/geo/${state}.json`

  try {
    // The bucket copy first: built once, served forever.
    if (!body.rebuild) {
      const cached = await fetch(`${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`).catch(() => null)
      if (cached?.ok) {
        const data = (await cached.json()) as Shapes
        if (Array.isArray(data?.counties) && data.counties.length) return json(answer(data, body))
      }
    }

    const data = await build(state, fips)
    const up = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', 'x-upsert': 'true', 'Cache-Control': '86400' },
      body: JSON.stringify(data),
    })
    // A failed save is not a failed answer: the template still paints this
    // once, and the next call builds again.
    const stored = up.ok
    return json({ ...answer(data, body), stored })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
