// Weekly Meta Ads -> weekly_kpis sync.
//
// Runs on Supabase's servers, not in the browser, so the Meta access token
// stays a secret. Scheduled from Postgres (see supabase/meta-sync.sql), and can
// also be invoked by hand with {"week_of":"YYYY-MM-DD"} to backfill one week.
//
// Deploy:  supabase functions deploy sync-meta-kpis
// Secrets: supabase secrets set META_ACCESS_TOKEN=...

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

// The CRM keys every KPI row to the Monday of its week, so the sync has to use
// the same Monday-to-Sunday boundaries or the numbers land on the wrong row.
function weekRange(weekOf?: string): { since: string; until: string; week_of: string } {
  let monday: Date
  if (weekOf) {
    const [y, m, d] = weekOf.split('-').map(Number)
    monday = mondayOf(new Date(y, m - 1, d))
  } else {
    // Default to the last week that has actually finished — syncing the current
    // week mid-week would store a partial number and look like a drop.
    monday = mondayOf(new Date())
    monday.setDate(monday.getDate() - 7)
  }
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  return { since: toDateString(monday), until: toDateString(sunday), week_of: toDateString(monday) }
}

function leadsFrom(insight: Insight): number {
  for (const type of LEAD_ACTION_TYPES) {
    const match = insight.actions?.find((a) => a.action_type === type)
    if (match) return Math.round(Number(match.value) || 0)
  }
  return 0
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

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const metaToken = Deno.env.get('META_ACCESS_TOKEN')

  if (!metaToken) {
    return new Response(
      JSON.stringify({ error: 'META_ACCESS_TOKEN is not set on this project' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  let requestedWeek: string | undefined
  try {
    const body = await req.json()
    requestedWeek = body?.week_of
  } catch {
    // No body is the normal case for the scheduled run.
  }

  const { since, until, week_of } = weekRange(requestedWeek)

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  const clientsRes = await fetch(
    `${supabaseUrl}/rest/v1/clients?select=id,name,meta_ad_account_id&meta_ad_account_id=not.is.null&status=neq.churned`,
    { headers }
  )
  const clients = await clientsRes.json()

  if (!clientsRes.ok) {
    return new Response(JSON.stringify({ error: 'Could not read clients', detail: clients }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const rows: Record<string, unknown>[] = []
  const results: { client: string; spend?: number; leads?: number; error?: string }[] = []

  for (const client of clients) {
    // One client's bad token or revoked account access shouldn't stop the rest
    // of the run — record it and carry on.
    try {
      const insight = await fetchMetaInsight(client.meta_ad_account_id, metaToken, since, until)
      const spend = Number(insight?.spend ?? 0)
      const leads = insight ? leadsFrom(insight) : 0

      rows.push({
        client_id: client.id,
        week_of,
        channel: 'Meta',
        ad_spend: spend,
        leads,
        notes: 'Synced from Meta Ads',
      })
      results.push({ client: client.name, spend, leads })
    } catch (err) {
      results.push({ client: client.name, error: String(err instanceof Error ? err.message : err) })
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
      return new Response(JSON.stringify({ error: 'Upsert failed', detail, week_of }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  return new Response(
    JSON.stringify({ week_of, range: { since, until }, synced: rows.length, results }, null, 2),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
