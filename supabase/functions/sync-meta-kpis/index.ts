// Daily Meta Ads -> weekly_kpis sync.
//
// Runs on Supabase's servers, not in the browser, so the Meta access token
// stays a secret. Scheduled from Postgres (see supabase/meta-sync.sql), and can
// also be invoked with {"week_of":"YYYY-MM-DD"} to backfill one week or
// {"client_id":"..."} to refresh a single client.
//
// Secrets: META_ACCESS_TOKEN must be set on the project.

const META_API_VERSION = 'v21.0'

// Meta reports leads under several action types and they overlap — a website
// lead can arrive both as 'lead' and as 'offsite_conversion.fb_pixel_lead'.
// Take the first type that's present rather than summing them, otherwise every
// lead gets counted twice.
const LEAD_ACTION_TYPES = [
  'lead',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
]

type Insight = {
  spend?: string
  actions?: { action_type: string; value: string }[]
}

function toDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function mondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  d.setHours(0, 0, 0, 0)
  return d
}

// The CRM keys every KPI row to the Monday of its week. Each week is fetched as
// its own full Monday-to-Sunday range, so a week is never written from partial
// coverage.
function weekRange(weekOf: string): { since: string; until: string; week_of: string } {
  const [y, m, d] = weekOf.split('-').map(Number)
  const monday = mondayOf(new Date(y, m - 1, d))
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  return { since: toDateString(monday), until: toDateString(sunday), week_of: toDateString(monday) }
}

// Which weeks a run covers.
//
// Running daily, the current week has to be included or the numbers would sit
// stale until Monday — but it's still in progress, so each run overwrites it
// with the running total rather than adding to it (the upsert handles that).
//
// Last week is re-synced too because Meta keeps attributing conversions for
// days after they happen: a lead from Sunday can land in the data on Tuesday,
// and a one-shot Monday sync would never see it.
function weeksToSync(weekOf?: string): string[] {
  if (weekOf) return [weekOf]

  const thisMonday = mondayOf(new Date())
  const lastMonday = new Date(thisMonday)
  lastMonday.setDate(lastMonday.getDate() - 7)
  return [toDateString(lastMonday), toDateString(thisMonday)]
}

function leadsFrom(insight: Insight): number {
  for (const type of LEAD_ACTION_TYPES) {
    const match = insight.actions?.find((a) => a.action_type === type)
    if (match) return Math.round(Number(match.value) || 0)
  }
  return 0
}

// Per-ad daily rows. A separate call from the account-level one because it
// needs level=ad and a daily time_increment, and the two answer different
// questions: account totals drive the CRM's weekly KPIs, these drive the
// per-ad breakdown.
async function fetchAdDaily(
  adAccountId: string,
  token: string,
  since: string,
  until: string
): Promise<Record<string, unknown>[]> {
  const account = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${account}/insights`)
  url.searchParams.set(
    'fields',
    // effective_status is deliberately NOT here. It is a field on the ad
    // object, not on ads-insights, and asking for it makes Meta reject the
    // whole request with "(#100) effective_status is not valid for fields
    // param" -- which cost every per-ad row for the account, not just the
    // status. It comes from fetchAdStatuses() below instead.
    'ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name,spend,impressions,reach,clicks,actions,video_play_actions,video_thruplay_watched_actions,video_avg_time_watched_actions'
  )
  url.searchParams.set('level', 'ad')
  url.searchParams.set('time_increment', '1')
  url.searchParams.set('time_range', JSON.stringify({ since, until }))
  url.searchParams.set('limit', '500')
  url.searchParams.set('access_token', token)

  const res = await fetch(url)
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error?.message || `Meta API returned ${res.status}`)
  return body.data || []
}

/**
 * Live/paused status per ad, keyed by ad id.
 *
 * A separate call because insights and the ad object are different edges:
 * insights reports what an ad DID over a date range, the ad object reports what
 * it IS right now. effective_status only exists on the second.
 *
 * Paged, because an account with a long history can hold more ads than one page
 * returns, and a silently truncated map would mark old ads as unknown rather
 * than paused.
 */
async function fetchAdStatuses(
  adAccountId: string,
  token: string
): Promise<Map<string, string>> {
  const account = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
  const statuses = new Map<string, string>()

  let url: string | null =
    `https://graph.facebook.com/${META_API_VERSION}/${account}/ads` +
    `?fields=id,effective_status&limit=500&access_token=${encodeURIComponent(token)}`

  // Bounded rather than while(true): a paging bug on Meta's side should not
  // turn into an unbounded loop inside an Edge Function.
  for (let page = 0; page < 20 && url; page++) {
    const res = await fetch(url)
    const body = await res.json()
    if (!res.ok) throw new Error(body?.error?.message || `Meta API returned ${res.status}`)

    for (const ad of body.data || []) {
      if (ad?.id && ad?.effective_status) statuses.set(String(ad.id), String(ad.effective_status))
    }
    url = body.paging?.next || null
  }

  return statuses
}

// Meta returns these as [{ action_type, value }] arrays even when there is only
// ever one entry.
function firstActionValue(list: unknown): number | null {
  if (!Array.isArray(list) || list.length === 0) return null
  const v = Number((list[0] as { value?: string })?.value)
  return Number.isFinite(v) ? v : null
}

async function fetchMetaInsight(
  adAccountId: string,
  token: string,
  since: string,
  until: string
): Promise<Insight | null> {
  // Ad account IDs are stored bare; Meta's API wants the act_ prefix.
  const account = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${account}/insights`)
  url.searchParams.set('fields', 'spend,actions')
  url.searchParams.set('level', 'account')
  url.searchParams.set('time_range', JSON.stringify({ since, until }))
  url.searchParams.set('access_token', token)

  const res = await fetch(url)
  const body = await res.json()

  if (!res.ok) {
    throw new Error(body?.error?.message || `Meta API returned ${res.status}`)
  }
  // An account with no delivery that week returns an empty data array, which is
  // a real answer (zero spend), not a failure.
  return body.data?.[0] ?? null
}

// The browser sends Authorization and content-type on an invoke, which makes
// it a preflighted request. Without these headers the preflight has nothing to
// approve and the call never leaves the browser — surfacing as supabase-js's
// "Failed to send a request to the Edge Function", which reads like a network
// fault rather than a missing header. The scheduled pg_cron run never hit this,
// which is why the nightly sync worked while the "Sync now" button did not.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const metaToken = Deno.env.get('META_ACCESS_TOKEN')

  if (!metaToken) {
    return json(
      {
        error:
          'META_ACCESS_TOKEN is not set on this project. Add it under Project Settings > Edge Functions > Secrets.',
      },
      500
    )
  }

  let requestedWeek: string | undefined
  let requestedClientId: string | undefined
  try {
    const body = await req.json()
    requestedWeek = body?.week_of
    // The app's per-client "Sync now" button passes a client_id so one client
    // can be refreshed without waiting on every other account's API calls.
    requestedClientId = body?.client_id
  } catch {
    // No body is the normal case for the scheduled run.
  }

  const weeks = weeksToSync(requestedWeek)

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  const clientFilter = requestedClientId ? `&id=eq.${encodeURIComponent(requestedClientId)}` : ''
  const clientsRes = await fetch(
    `${supabaseUrl}/rest/v1/clients?select=id,name,meta_ad_account_id,meta_ads_active&meta_ad_account_id=not.is.null&archived=eq.false${clientFilter}`,
    { headers }
  )
  const clients = await clientsRes.json()

  if (!clientsRes.ok) {
    return json({ error: 'Could not read clients', detail: clients }, 500)
  }

  const rows: Record<string, unknown>[] = []
  const results: {
    client: string
    week?: string
    spend?: number
    leads?: number
    error?: string
  }[] = []
  const spendingClientIds = new Set<string>()

  for (const weekOf of weeks) {
    const { since, until, week_of } = weekRange(weekOf)

    for (const client of clients) {
      // One client's bad token or revoked account access shouldn't stop the
      // rest of the run — record it and carry on.
      try {
        const insight = await fetchMetaInsight(client.meta_ad_account_id, metaToken, since, until)
        const spend = Number(insight?.spend ?? 0)
        const leads = insight ? leadsFrom(insight) : 0

        if (spend > 0) spendingClientIds.add(client.id)

        rows.push({
          client_id: client.id,
          week_of,
          channel: 'Meta',
          ad_spend: spend,
          leads,
          notes: 'Synced from Meta Ads',
        })
        results.push({ client: client.name, week: week_of, spend, leads })
      } catch (err) {
        results.push({
          client: client.name,
          week: week_of,
          error: String(err instanceof Error ? err.message : err),
        })
      }
    }
  }

  if (rows.length > 0) {
    // merge-duplicates makes re-running the same week overwrite rather than
    // pile up duplicate rows. It relies on the unique index created in
    // supabase/meta-sync.sql.
    const upsert = await fetch(`${supabaseUrl}/rest/v1/weekly_kpis?on_conflict=client_id,week_of,channel`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    })

    if (!upsert.ok) {
      const detail = await upsert.text()
      return json({ error: 'Upsert failed', detail, weeks }, 500)
    }
  }

  // Per-ad detail for the same window, written to ad_daily.
  const adRows: Record<string, unknown>[] = []
  const firstWeek = weekRange(weeks[0])
  const lastWeek = weekRange(weeks[weeks.length - 1])

  for (const client of clients) {
    try {
      const days = await fetchAdDaily(
        client.meta_ad_account_id,
        metaToken,
        firstWeek.since,
        lastWeek.until
      )

      // Non-fatal on purpose. Spend and leads per ad are the expensive thing to
      // lose; a missing status only costs the live/paused split. Failing the
      // whole client over it is what the original bug did.
      let statuses = new Map<string, string>()
      try {
        statuses = await fetchAdStatuses(client.meta_ad_account_id, metaToken)
      } catch (err) {
        results.push({
          client: client.name,
          error: `ad statuses: ${String(err instanceof Error ? err.message : err)} (spend and leads still synced)`,
        })
      }

      for (const d of days) {
        const row = d as Record<string, string | unknown>
        const actions = (row.actions as { action_type: string; value: string }[]) || []

        adRows.push({
          client_id: client.id,
          ad_id: row.ad_id,
          ad_name: row.ad_name,
          campaign_id: row.campaign_id,
          campaign_name: row.campaign_name,
          adset_id: row.adset_id,
          adset_name: row.adset_name,
          // Drives the live/paused split in the CRM. Point-in-time, so it is
          // refreshed on every row the sync touches rather than written once.
          //
          // null when the ad is not in the account's current ad list -- it was
          // deleted since it spent -- or when the status call failed above. The
          // key is always present rather than conditionally omitted: PostgREST
          // takes the union of keys across a bulk upsert and fills the gaps with
          // DEFAULT anyway, so a mixed batch would write null regardless. The
          // next successful sync puts the real status back.
          effective_status: statuses.get(String(row.ad_id)) ?? null,
          date: row.date_start,
          spend: Number(row.spend ?? 0),
          impressions: Number(row.impressions ?? 0),
          reach: Number(row.reach ?? 0),
          clicks: Number(row.clicks ?? 0),
          // Same first-match-wins rule as the account-level totals, so per-ad
          // leads add up to the weekly KPI instead of reading zero on accounts
          // that only report the grouped action type.
          leads: leadsFrom({ actions }),
          video_plays: firstActionValue(row.video_play_actions),
          video_thruplays: firstActionValue(row.video_thruplay_watched_actions),
          video_avg_watch_seconds: firstActionValue(row.video_avg_time_watched_actions),
        })
      }
    } catch (err) {
      results.push({
        client: client.name,
        error: `ad detail: ${String(err instanceof Error ? err.message : err)}`,
      })
    }
  }

  if (adRows.length > 0) {
    await fetch(`${supabaseUrl}/rest/v1/ad_daily?on_conflict=client_id,ad_id,date`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(adRows),
    })
  }

  // A client with recorded spend is demonstrably running ads, so flip the flag
  // rather than making someone tick it by hand. Never flipped back off — a
  // quiet week is not the same as a campaign being switched off.
  const toActivate = clients.filter(
    (c: { id: string; meta_ads_active: boolean }) =>
      !c.meta_ads_active && spendingClientIds.has(c.id)
  )
  for (const client of toActivate) {
    await fetch(`${supabaseUrl}/rest/v1/clients?id=eq.${client.id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ meta_ads_active: true }),
    })
  }

  return json({
    weeks,
    synced: rows.length,
    ad_rows: adRows.length,
    marked_live: toActivate.map((c) => c.name),
    results,
  })
})
