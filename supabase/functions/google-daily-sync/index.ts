// Google Search ads -> the CRM, nightly.
//
// Three queries per client, because they answer three different questions and
// only one of them is safe to show a client:
//
//   campaign          -> the true daily totals. This is what becomes the
//                        weekly_kpis roll-up, because it counts EVERY campaign
//                        type. Keyword totals would quietly under-report the
//                        moment anyone adds a Performance Max or display
//                        campaign, and the client's report would be wrong in a
//                        direction nobody would notice.
//   keyword_view      -> what we bid on, and what it cost.
//   search_term_view  -> what people actually typed.
//
// The last two NEVER reconcile and that is Google, not a bug here. Google
// withholds the search term on a large share of impressions and clicks, so
// search-term cost is always less than keyword cost for the same day. They are
// stored in separate tables so nothing can sum them together and produce a
// number that cannot be explained.
//
// ACCESS, as of September 2026. Developer tokens were sunset on 2026-09-09 and
// no longer carry the access level: the level now attaches to the Google Cloud
// project that issued the OAuth credentials. The developer-token header is
// currently optional and ignored, and Google has said a future major version
// will reject it, so it is sent ONLY if the secret happens to be set. Nothing
// here depends on it.
//
// Secrets:
//   GOOGLE_ADS_CLIENT_ID          OAuth client from the Cloud project
//   GOOGLE_ADS_CLIENT_SECRET
//   GOOGLE_ADS_REFRESH_TOKEN      offline token for a user who can see the accounts
//   GOOGLE_ADS_LOGIN_CUSTOMER_ID  the manager (MCC) id, digits only
//   GOOGLE_ADS_API_VERSION        optional, defaults below
//   GOOGLE_ADS_DEVELOPER_TOKEN    optional, legacy, ignored by Google now
//
// See docs/google-ads.md for how each of those is obtained.

const TOKEN_URL = 'https://oauth2.googleapis.com/token'

// Overridable by secret on purpose. Google ships a major version every few
// months and retires old ones on a schedule; when this one is turned off the
// fix is a secret, not a deploy, so whoever is on call can do it.
const DEFAULT_API_VERSION = 'v22'

// How far back each run re-reads. Conversions keep landing against the day of
// the CLICK for a long time after it — a call that comes in on Thursday from
// Monday's click is recorded on Monday — so a one-shot sync of yesterday would
// permanently understate conversions. Re-reading two weeks every night costs
// nothing and makes the numbers settle on their own.
const LOOKBACK_DAYS = 14

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mondayOf(d: Date): Date {
  const out = new Date(d)
  // getDay() is 0 for Sunday, so Sunday has to go BACK six days rather than
  // forward one. Getting this wrong puts Sunday's spend in next week.
  const shift = (out.getDay() + 6) % 7
  out.setDate(out.getDate() - shift)
  out.setHours(0, 0, 0, 0)
  return out
}

/** Google's int64 fields arrive as STRINGS in REST JSON. Number() or they concatenate. */
function num(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** Micros are millionths. 1_230_000 is $1.23. */
function fromMicros(v: unknown): number {
  return num(v) / 1_000_000
}

/** Digits only. A customer id pasted from the Google UI carries dashes and the API rejects it. */
function bareId(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '')
}

let cachedToken: { token: string; expiresAt: number } | null = null

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token

  const clientId = Deno.env.get('GOOGLE_ADS_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_ADS_CLIENT_SECRET')
  const refreshToken = Deno.env.get('GOOGLE_ADS_REFRESH_TOKEN')

  const missing = [
    !clientId && 'GOOGLE_ADS_CLIENT_ID',
    !clientSecret && 'GOOGLE_ADS_CLIENT_SECRET',
    !refreshToken && 'GOOGLE_ADS_REFRESH_TOKEN',
  ].filter(Boolean)
  if (missing.length) {
    throw new Error(
      `Not set on this project: ${missing.join(', ')}. Add them under Project Settings > Edge Functions > Secrets. See docs/google-ads.md.`
    )
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: refreshToken!,
      grant_type: 'refresh_token',
    }),
  })
  const body = await res.json()
  if (!res.ok || !body.access_token) {
    // invalid_grant here is nearly always one of three things and the message
    // says so, because the generic version sends people to re-check secrets
    // that were fine.
    const reason = body.error_description || body.error || res.status
    throw new Error(
      `Google refused the refresh token (${reason}). That usually means the token was revoked, the OAuth consent screen is still in Testing mode (those tokens expire after 7 days), or the secret was truncated when it was pasted.`
    )
  }

  cachedToken = { token: body.access_token, expiresAt: Date.now() + num(body.expires_in || 3600) * 1000 }
  return cachedToken.token
}

/**
 * One GAQL query against one customer, following pageToken to the end.
 *
 * `search` rather than `searchStream`: streaming returns a JSON array of
 * response chunks that has to be assembled anyway, and paged search fails in
 * an obvious way rather than truncating quietly.
 */
async function gaql(customerId: string, query: string, token: string): Promise<any[]> {
  const version = Deno.env.get('GOOGLE_ADS_API_VERSION') || DEFAULT_API_VERSION
  const loginCustomerId = bareId(Deno.env.get('GOOGLE_ADS_LOGIN_CUSTOMER_ID'))
  const devToken = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN')

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  // The manager account is how one credential reaches every client account.
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId
  // Optional and ignored since the 2026-09-09 sunset; sent only if present so
  // an older project that still has one keeps working.
  if (devToken) headers['developer-token'] = devToken

  const out: any[] = []
  let pageToken: string | undefined
  // A guard, not a limit anyone should hit: 10k rows a page, so this is
  // 500k rows for one client for one window. Reaching it means the query is
  // wrong, and looping forever on a bad nextPageToken is worse than stopping.
  for (let page = 0; page < 50; page++) {
    const res = await fetch(
      `https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:search`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, pageSize: 10000, ...(pageToken ? { pageToken } : {}) }),
      }
    )
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      const detail =
        body?.error?.message ||
        body?.[0]?.error?.message ||
        `Google Ads API returned ${res.status}`
      if (res.status === 404) {
        throw new Error(
          `${detail} — customer ${customerId} was not found under the manager account, or API version ${version} has been retired. If it is the version, set GOOGLE_ADS_API_VERSION to the current one; no deploy needed.`
        )
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `${detail} — the credentials reached Google but were refused for customer ${customerId}. Check that the account is linked to manager ${loginCustomerId || '(not set)'} and that the Cloud project is on Explorer access or higher, not Test.`
        )
      }
      throw new Error(detail)
    }
    for (const r of body?.results || []) out.push(r)
    pageToken = body?.nextPageToken
    if (!pageToken) break
  }
  return out
}

const KEYWORD_QUERY = (since: string, until: string) => `
  SELECT segments.date, campaign.id, campaign.name, ad_group.id, ad_group.name,
         ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
         ad_group_criterion.keyword.match_type, ad_group_criterion.status,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM keyword_view
  WHERE segments.date BETWEEN '${since}' AND '${until}'
    AND metrics.impressions > 0
`

const SEARCH_TERM_QUERY = (since: string, until: string) => `
  SELECT segments.date, campaign.id, campaign.name, ad_group.id, ad_group.name,
         search_term_view.search_term, search_term_view.status,
         segments.keyword.info.text, segments.keyword.info.match_type,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions
  FROM search_term_view
  WHERE segments.date BETWEEN '${since}' AND '${until}'
`

// Campaign grain, every campaign type, for the client-facing roll-up.
const CAMPAIGN_QUERY = (since: string, until: string) => `
  SELECT segments.date, metrics.cost_micros, metrics.clicks,
         metrics.impressions, metrics.conversions
  FROM campaign
  WHERE segments.date BETWEEN '${since}' AND '${until}'
`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  let body: Record<string, any> = {}
  try {
    body = await req.json()
  } catch {
    // A cron POST with no body is normal.
  }

  // CONNECTION CHECK: {check: true}. Proves the four secrets work before any
  // client has a customer id, which is the state the setup sits in for a
  // while: the token exchange, then the accounts this login can see, then
  // the accounts linked under the manager. Each failure names its step.
  if (body.check) {
    try {
      const version = Deno.env.get('GOOGLE_ADS_API_VERSION') || DEFAULT_API_VERSION
      const manager = bareId(Deno.env.get('GOOGLE_ADS_LOGIN_CUSTOMER_ID'))
      const token = await accessToken()
      const acc = await fetch(`https://googleads.googleapis.com/${version}/customers:listAccessibleCustomers`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const accBody = await acc.json().catch(() => null)
      if (!acc.ok) {
        const detail = accBody?.error?.message || accBody?.[0]?.error?.message || `Google Ads API returned ${acc.status}`
        return json(
          {
            ok: false,
            step: 'list accessible customers',
            error: `${detail}. The login works but the Google Ads API refused it: the Cloud project is probably still on Test access (needs Explorer), or the API is not enabled on the project that issued the OAuth client.`,
            api_version: version,
          },
          502
        )
      }
      const accessible = (accBody?.resourceNames || []).map((r: string) => r.replace('customers/', ''))
      let linked: { id: string; name: string; manager: boolean }[] = []
      let linkedError = ''
      if (manager) {
        try {
          const rows = await gaql(
            manager,
            'SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.level FROM customer_client WHERE customer_client.level <= 1',
            token
          )
          linked = rows
            .map((r: any) => r.customerClient)
            .filter((c: any) => c && String(c.id) !== manager)
            .map((c: any) => ({ id: String(c.id), name: c.descriptiveName || '', manager: Boolean(c.manager) }))
        } catch (err) {
          linkedError = String(err instanceof Error ? err.message : err)
        }
      }
      return json({
        ok: true,
        token: 'ok',
        api_version: version,
        manager: manager || null,
        manager_visible: manager ? accessible.includes(manager) : null,
        accessible_customers: accessible,
        linked_accounts: linked,
        ...(linkedError ? { linked_error: linkedError } : {}),
        ...(!manager ? { note: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID is not set; the sync needs it to reach client accounts through the manager.' } : {}),
      })
    } catch (err) {
      return json({ ok: false, step: 'refresh token', error: String(err instanceof Error ? err.message : err) }, 502)
    }
  }

  const days = Math.max(1, Math.min(90, num(body.days) || LOOKBACK_DAYS))
  const until = new Date()
  const since = new Date()
  since.setDate(since.getDate() - (days - 1))
  const sinceStr = toDateString(since)
  const untilStr = toDateString(until)

  try {
    const filter = body.client_id ? `&id=eq.${encodeURIComponent(String(body.client_id))}` : ''
    const clientsRes = await fetch(
      `${supabaseUrl}/rest/v1/clients?select=id,name,google_ads_customer_id` +
        `&google_ads_customer_id=not.is.null&archived=eq.false${filter}`,
      { headers: db }
    )
    const clients = await clientsRes.json()
    if (!clientsRes.ok) return json({ error: 'Could not read clients', detail: clients }, 500)
    if (!clients.length) {
      return json({
        ok: true,
        note:
          'No client has google_ads_customer_id set, so there was nothing to sync. Put the 10-digit customer id on the client and it will be picked up on the next run.',
        window: { since: sinceStr, until: untilStr },
        results: [],
      })
    }

    const token = await accessToken()
    const results: Record<string, unknown>[] = []

    for (const client of clients) {
      const customerId = bareId(client.google_ads_customer_id)
      if (!customerId) {
        results.push({ client: client.name, error: 'google_ads_customer_id has no digits in it.' })
        continue
      }

      // One client's revoked link must not stop the rest of the run.
      try {
        const [keywords, terms, campaigns] = await Promise.all([
          gaql(customerId, KEYWORD_QUERY(sinceStr, untilStr), token),
          gaql(customerId, SEARCH_TERM_QUERY(sinceStr, untilStr), token),
          gaql(customerId, CAMPAIGN_QUERY(sinceStr, untilStr), token),
        ])

        const keywordRows = keywords.map((r: any) => ({
          client_id: client.id,
          date: r.segments?.date,
          customer_id: customerId,
          campaign_id: String(r.campaign?.id ?? ''),
          campaign_name: r.campaign?.name ?? null,
          ad_group_id: String(r.adGroup?.id ?? ''),
          ad_group_name: r.adGroup?.name ?? null,
          criterion_id: String(r.adGroupCriterion?.criterionId ?? ''),
          keyword_text: r.adGroupCriterion?.keyword?.text ?? null,
          match_type: r.adGroupCriterion?.keyword?.matchType ?? null,
          status: r.adGroupCriterion?.status ?? null,
          impressions: num(r.metrics?.impressions),
          clicks: num(r.metrics?.clicks),
          cost: fromMicros(r.metrics?.costMicros),
          conversions: num(r.metrics?.conversions),
          conversion_value: num(r.metrics?.conversionsValue),
        }))

        const termRows = terms.map((r: any) => ({
          client_id: client.id,
          date: r.segments?.date,
          customer_id: customerId,
          campaign_id: String(r.campaign?.id ?? ''),
          campaign_name: r.campaign?.name ?? null,
          ad_group_id: String(r.adGroup?.id ?? ''),
          // Capped because this is half of a btree unique key and Postgres
          // rejects an index entry over ~2700 bytes. A search term that long
          // is a scrape, not a person.
          search_term: String(r.searchTermView?.searchTerm ?? '').slice(0, 500),
          keyword_text: r.segments?.keyword?.info?.text ?? null,
          match_type: r.segments?.keyword?.info?.matchType ?? null,
          status: r.searchTermView?.status ?? null,
          impressions: num(r.metrics?.impressions),
          clicks: num(r.metrics?.clicks),
          cost: fromMicros(r.metrics?.costMicros),
          conversions: num(r.metrics?.conversions),
        }))

        // The unique key is (client, date, ad_group, criterion) and Google can
        // return the same keyword twice in a window when something about it
        // changed mid-flight. Postgres refuses a batch that conflicts with
        // ITSELF -- "ON CONFLICT DO UPDATE cannot affect row a second time" --
        // so the batch is deduplicated before it is sent, summing the metrics
        // rather than letting one row win.
        const dedupe = (rows: any[], key: (r: any) => string) => {
          const byKey = new Map<string, any>()
          for (const row of rows) {
            if (!row.date) continue
            const k = key(row)
            const seen = byKey.get(k)
            if (!seen) {
              byKey.set(k, row)
              continue
            }
            seen.impressions += row.impressions
            seen.clicks += row.clicks
            seen.cost += row.cost
            seen.conversions += row.conversions
            if ('conversion_value' in seen) seen.conversion_value += row.conversion_value
          }
          return [...byKey.values()]
        }

        const keywordsOut = dedupe(keywordRows, (r) => `${r.date}|${r.ad_group_id}|${r.criterion_id}`)
        const termsOut = dedupe(termRows, (r) => `${r.date}|${r.ad_group_id}|${r.search_term}`)

        const write = async (table: string, rows: any[], conflict: string) => {
          if (!rows.length) return
          // Chunked: one client-fortnight of search terms is routinely
          // thousands of rows and a single body large enough to be refused.
          for (let i = 0; i < rows.length; i += 500) {
            const res = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=${conflict}`, {
              method: 'POST',
              headers: { ...db, Prefer: 'resolution=merge-duplicates,return=minimal' },
              body: JSON.stringify(rows.slice(i, i + 500)),
            })
            if (!res.ok) throw new Error(`${table}: ${await res.text()}`)
          }
        }

        await write('google_keyword_daily', keywordsOut, 'client_id,date,ad_group_id,criterion_id')
        await write('google_search_term_daily', termsOut, 'client_id,date,ad_group_id,search_term')

        // THE ROLL-UP, from campaign grain so every campaign type is counted.
        const weeks = new Map<string, { spend: number; leads: number }>()
        for (const r of campaigns) {
          const date = r.segments?.date
          if (!date) continue
          const [y, m, d] = String(date).split('-').map(Number)
          const weekOf = toDateString(mondayOf(new Date(y, m - 1, d)))
          const bucket = weeks.get(weekOf) || { spend: 0, leads: 0 }
          bucket.spend += fromMicros(r.metrics?.costMicros)
          bucket.leads += num(r.metrics?.conversions)
          weeks.set(weekOf, bucket)
        }

        const kpiRows = [...weeks.entries()].map(([week_of, v]) => ({
          client_id: client.id,
          week_of,
          channel: 'Google Search',
          ad_spend: Number(v.spend.toFixed(2)),
          // weekly_kpis.leads is an integer; conversions are fractional when
          // Google credits a partial conversion, and an unrounded value would
          // be refused by the column.
          leads: Math.round(v.leads),
          notes: 'Synced from Google Ads',
        }))

        if (kpiRows.length) {
          const res = await fetch(
            `${supabaseUrl}/rest/v1/weekly_kpis?on_conflict=client_id,week_of,channel`,
            {
              method: 'POST',
              headers: { ...db, Prefer: 'resolution=merge-duplicates,return=minimal' },
              body: JSON.stringify(kpiRows),
            }
          )
          if (!res.ok) throw new Error(`weekly_kpis: ${await res.text()}`)
        }

        results.push({
          client: client.name,
          customer_id: customerId,
          keywords: keywordsOut.length,
          search_terms: termsOut.length,
          weeks: kpiRows.length,
          spend: Number(kpiRows.reduce((s, r) => s + r.ad_spend, 0).toFixed(2)),
          leads: kpiRows.reduce((s, r) => s + r.leads, 0),
        })
      } catch (err) {
        results.push({
          client: client.name,
          customer_id: customerId,
          error: String(err instanceof Error ? err.message : err),
        })
      }
    }

    return json({ ok: true, window: { since: sinceStr, until: untilStr }, results })
  } catch (err) {
    return json({ error: String(err instanceof Error ? err.message : err) }, 500)
  }
})
