// Keyword ideas for one client, from Google's own planner.
//
// POST { client_id, seeds: string[], locations: string[], url?: string }
//
// Resolves the location names to Google geo targets, asks the Keyword Planner
// for ideas around the seeds (and the website, when given) inside those
// places, and saves the whole answer as a plan row the browser reads. The
// grouping, scoring and negatives happen in the browser (src/lib/keywordPlan.js),
// so this stays a thin, testable bridge to Google.
//
// The planner is asked as the manager account, so it works for a client who
// has no Google Ads account yet. That is the point: the plan is built before
// the account is.
//
// Secrets: the same GOOGLE_ADS_* as google-daily-sync. The Cloud project must
// be on Basic access or higher; Test access cannot use keyword planning.

const DEFAULT_API_VERSION = 'v22'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ENGLISH = 'languageConstants/1000'
// Google takes at most 20 seed keywords and 10 places per request.
export const SEEDS_PER_CALL = 20
export const MAX_PLACES = 10

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  })
}

const env = (k: string) => (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(k)
const bareId = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const num = (v: unknown) => Number(v ?? 0) || 0

async function accessToken(): Promise<string> {
  const clientId = env('GOOGLE_ADS_CLIENT_ID')
  const clientSecret = env('GOOGLE_ADS_CLIENT_SECRET')
  const refreshToken = env('GOOGLE_ADS_REFRESH_TOKEN')
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('The Google Ads secrets are not set on this project (GOOGLE_ADS_CLIENT_ID, _SECRET, _REFRESH_TOKEN).')
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  })
  const body = await res.json()
  if (!res.ok || !body.access_token) throw new Error(`Google refused the refresh token (${body.error_description || body.error || res.status}).`)
  return body.access_token
}

async function ads(path: string, payload: unknown, token: string): Promise<any> {
  const version = env('GOOGLE_ADS_API_VERSION') || DEFAULT_API_VERSION
  const login = bareId(env('GOOGLE_ADS_LOGIN_CUSTOMER_ID'))
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  if (login) headers['login-customer-id'] = login
  const dev = env('GOOGLE_ADS_DEVELOPER_TOKEN')
  if (dev) headers['developer-token'] = dev
  const res = await fetch(`https://googleads.googleapis.com/${version}/${path}`, { method: 'POST', headers, body: JSON.stringify(payload) })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = body?.error?.message || body?.[0]?.error?.message || `Google Ads API returned ${res.status}`
    const fine = body?.error?.details?.[0]?.errors?.[0]?.message
    throw new Error(fine ? `${detail} ${fine}` : detail)
  }
  return body
}

/**
 * Free-typed places into a clean list of names Google can look up. Takes
 * "Dallas. Plano radius 20-30 mile radius", "Raleigh, NC", "SWFL ( Lee,
 * Collier )" and gives back the place names, radius talk dropped, at most
 * MAX_PLACES.
 */
export function parseLocations(...texts: unknown[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of texts) {
    for (const raw of String(t || '').split(/[,;/\n.()]+|\band\b|&/i)) {
      let s = raw
        .replace(/\b\d+\s*(-\s*\d+\s*)?(miles?|mi|km)\b/gi, ' ')
        .replace(/\b(radius|around|within|of|the|greater|area|county|counties|region|surrounding|areas|based in|will send zip codes|zip codes?)\b/gi, ' ')
        .replace(/\d+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (s.length < 3 || s.length > 40) continue
      if (/^(tx|nc|fl|ny|pa|ri|ct|ut|md|il|ms|ma|ca|az|nj|oh|va|ga)$/i.test(s)) continue
      const key = s.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(s)
      if (out.length >= MAX_PLACES) return out
    }
  }
  return out
}

export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

type Place = { name: string; id: string; canonical: string; type: string }

/** Names to Google geo targets, US only, one best match per name. */
async function resolvePlaces(names: string[], token: string): Promise<Place[]> {
  if (!names.length) return []
  const body = await ads('geoTargetConstants:suggest', { locale: 'en', countryCode: 'US', locationNames: { names } }, token)
  const out: Place[] = []
  const seen = new Set<string>()
  for (const name of names) {
    const hits = (body?.geoTargetConstantSuggestions || []).filter((s: any) => String(s.searchTerm || '').toLowerCase() === name.toLowerCase())
    // Prefer a city, then a county, then whatever Google offered first.
    const rank = (s: any) => ({ City: 0, County: 1, 'Postal Code': 2, State: 3 }[String(s.geoTargetConstant?.targetType)] ?? 4)
    const best = hits.sort((a: any, b: any) => rank(a) - rank(b))[0]
    const g = best?.geoTargetConstant
    if (!g?.resourceName || seen.has(g.resourceName)) continue
    seen.add(g.resourceName)
    out.push({ name, id: g.resourceName, canonical: g.canonicalName || g.name || name, type: g.targetType || '' })
  }
  return out
}

export type Idea = {
  text: string
  volume: number
  competition: string
  competitionIndex: number
  lowBid: number
  highBid: number
  avgCpc: number
  monthly: { y: number; m: number; v: number }[]
  concepts: string[]
  fromUrl: boolean
}

const MONTHS: Record<string, number> = { JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6, JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12 }

/** One planner answer into our shape. */
export function toIdea(r: any, fromUrl = false): Idea | null {
  const text = String(r?.text || '').trim().toLowerCase()
  if (!text) return null
  const m = r.keywordIdeaMetrics || {}
  return {
    text,
    volume: num(m.avgMonthlySearches),
    competition: String(m.competition || 'UNSPECIFIED'),
    competitionIndex: num(m.competitionIndex),
    lowBid: num(m.lowTopOfPageBidMicros) / 1e6,
    highBid: num(m.highTopOfPageBidMicros) / 1e6,
    avgCpc: num(m.averageCpcMicros) / 1e6,
    monthly: (m.monthlySearchVolumes || [])
      .map((x: any) => ({ y: num(x.year), m: MONTHS[String(x.month)] || num(x.month), v: num(x.monthlySearches) }))
      .sort((a: any, b: any) => a.y - b.y || a.m - b.m),
    concepts: ((r.keywordAnnotations?.concepts || []) as any[]).map((c) => String(c.name || c.conceptGroup?.name || '')).filter(Boolean),
    fromUrl,
  }
}

/** Ideas from several calls into one list, the bigger volume winning a tie. */
export function mergeIdeas(lists: Idea[][]): Idea[] {
  const by = new Map<string, Idea>()
  for (const list of lists) {
    for (const i of list) {
      const had = by.get(i.text)
      if (!had) by.set(i.text, { ...i })
      else if (i.volume > had.volume) by.set(i.text, { ...i, fromUrl: had.fromUrl || i.fromUrl })
      else had.fromUrl = had.fromUrl || i.fromUrl
    }
  }
  return [...by.values()].sort((a, b) => b.volume - a.volume || a.text.localeCompare(b.text))
}

async function ideasFor(customer: string, seed: Record<string, unknown>, places: Place[], token: string): Promise<any[]> {
  const body = await ads(`customers/${customer}:generateKeywordIdeas`, {
    language: ENGLISH,
    geoTargetConstants: places.map((p) => p.id),
    includeAdultKeywords: false,
    keywordPlanNetwork: 'GOOGLE_SEARCH',
    keywordAnnotation: ['KEYWORD_CONCEPT'],
    historicalMetricsOptions: { includeAverageCpc: true },
    pageSize: 1000,
    ...seed,
  }, token)
  return body?.results || []
}

export async function serve(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return json({}, 200)
  let body: { client_id?: string; seeds?: string[]; locations?: string[]; url?: string; save?: boolean }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body' }, 400)
  }
  if (!body.client_id) return json({ error: 'client_id is required' }, 400)
  const seeds = [...new Set((body.seeds || []).map((s) => String(s).trim().toLowerCase()).filter((s) => s.length > 1))].slice(0, 100)
  const names = parseLocations(...(body.locations || []))
  if (!seeds.length) return json({ error: 'Give at least one seed keyword.' }, 400)
  if (!names.length) return json({ error: 'Give at least one place to target.' }, 400)

  const supabaseUrl = env('SUPABASE_URL')!
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')!
  const db = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }

  try {
    const token = await accessToken()
    const places = await resolvePlaces(names, token)
    if (!places.length) return json({ error: `Google did not recognise any of these places: ${names.join(', ')}. Try a city name plus state.` }, 400)

    // The manager account asks. A client's own id would also work, but most
    // clients do not have one when the plan is built.
    const customer = bareId(env('GOOGLE_ADS_LOGIN_CUSTOMER_ID'))
    if (!customer) return json({ error: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID is not set.' }, 500)

    const calls: Promise<Idea[]>[] = chunk(seeds, SEEDS_PER_CALL).map((part) =>
      ideasFor(customer, { keywordSeed: { keywords: part } }, places, token).then((rs) => rs.map((r) => toIdea(r)).filter(Boolean) as Idea[])
    )
    let urlError = ''
    if (body.url) {
      const url = /^https?:\/\//i.test(body.url) ? body.url : `https://${body.url}`
      calls.push(
        ideasFor(customer, { urlSeed: { url } }, places, token)
          .then((rs) => rs.map((r) => toIdea(r, true)).filter(Boolean) as Idea[])
          .catch((err) => {
            urlError = String(err instanceof Error ? err.message : err)
            return []
          })
      )
    }
    const ideas = mergeIdeas(await Promise.all(calls))

    const plan = {
      client_id: body.client_id,
      seeds,
      locations: places,
      url: body.url || null,
      ideas,
      idea_count: ideas.length,
      generated_at: new Date().toISOString(),
    }
    let planId: string | null = null
    if (body.save !== false) {
      const res = await fetch(`${supabaseUrl}/rest/v1/google_keyword_plans`, {
        method: 'POST',
        headers: { ...db, Prefer: 'return=representation' },
        body: JSON.stringify(plan),
      })
      const rows = await res.json().catch(() => null)
      if (!res.ok) return json({ error: `Could not save the plan: ${rows?.message || res.status}` }, 500)
      planId = rows?.[0]?.id || null
    }
    return json({ ok: true, id: planId, ...plan, ...(urlError ? { url_error: urlError } : {}) })
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err)
    // Explorer access can read accounts but not plan keywords. The page
    // builds the plan from the playbook instead and says how to apply.
    if (/explorer access|apply for basic|basic or standard access/i.test(message)) {
      return json({ error: message, code: 'needs_basic_access' }, 403)
    }
    return json({ error: message }, 500)
  }
}

const deno = (globalThis as { Deno?: { serve?: (h: (req: Request) => Promise<Response>) => void } }).Deno
if (typeof deno?.serve === 'function') deno.serve(serve)
