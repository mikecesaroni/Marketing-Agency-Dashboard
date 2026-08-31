// Is Meta actually going to run this client's ads?
//
// Split out from sync-meta-kpis deliberately. This is one cheap field read per
// account, it has nothing to do with aggregating insights, and it must not be
// entangled with that function's error handling — losing a day of spend and
// leads because an account-status call failed would be a bad trade. Keeping it
// separate also means the sync, which carries all the performance data, never
// had to be reopened to add this.
//
// WHY THIS EXISTS: Summit Water Pros' card payment failed, Meta left the ad
// account unsettled over an unpaid $3.04, and the ads stopped. Nothing in the
// CRM said so — the client was still flagged meta_ads_active, the dashboard
// still counted them among the live accounts, and the only evidence was an
// absence: spend that stopped arriving. They paid for ads that did not run.
//
// Secrets: META_ACCESS_TOKEN.
//
// Scheduled from Postgres alongside the KPI sync; see supabase/meta-sync.sql.
// Takes no body. {"client_id":"..."} limits it to one client.

const META_API_VERSION = 'v21.0'

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

/**
 * account_status 1 is ACTIVE. Anything else means ads are not delivering.
 *
 * The balance is fetched with it because it is the actual instruction: "ad
 * account unsettled" sends someone digging through Meta, while "unsettled,
 * $3.04 outstanding" is a thing to go and pay. Meta returns it as a string in
 * the account currency's minor unit, so it is divided by 100 here.
 *
 * disable_reason is only set when Meta actively DISABLES an account. Reading
 * the live accounts showed 0 on one that was merely unsettled, so the status
 * has to carry the explanation and the reason is extra detail when present.
 */
async function accountHealth(adAccountId: string, token: string) {
  const account = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
  const res = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${account}` +
      `?fields=account_status,disable_reason,balance&access_token=${encodeURIComponent(token)}`
  )
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error?.message || `Meta API returned ${res.status}`)

  const num = (v: unknown) => {
    if (v === null || v === undefined) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const balance = num(body.balance)
  return {
    meta_account_status: num(body.account_status),
    meta_disable_reason: num(body.disable_reason),
    meta_account_balance: balance === null ? null : balance / 100,
    meta_account_checked_at: new Date().toISOString(),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)

  const token = Deno.env.get('META_ACCESS_TOKEN')
  if (!token) {
    return json(
      {
        error:
          'META_ACCESS_TOKEN is not set on this project. Add it under Project Settings > Edge Functions > Secrets.',
      },
      500
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  let onlyClient: string | undefined
  try {
    const body = await req.json()
    if (body?.client_id) onlyClient = String(body.client_id)
  } catch {
    // No body is the normal case for the scheduled run.
  }

  const filter = onlyClient ? `&id=eq.${encodeURIComponent(onlyClient)}` : ''
  const res = await fetch(
    `${supabaseUrl}/rest/v1/clients?select=id,name,meta_ad_account_id` +
      `&meta_ad_account_id=not.is.null&archived=eq.false${filter}`,
    { headers }
  )
  if (!res.ok) {
    return json({ error: 'Could not read clients', detail: await res.text() }, 500)
  }
  const clients = (await res.json()) as { id: string; name: string; meta_ad_account_id: string }[]

  const checked: { client: string; status: number | null; balance: number | null }[] = []
  const failed: { client: string; error: string }[] = []

  for (const client of clients) {
    try {
      const health = await accountHealth(client.meta_ad_account_id, token)
      const write = await fetch(`${supabaseUrl}/rest/v1/clients?id=eq.${client.id}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify(health),
      })
      if (!write.ok) throw new Error(await write.text())
      checked.push({
        client: client.name,
        status: health.meta_account_status,
        balance: health.meta_account_balance,
      })
    } catch (err) {
      // One unreachable account must not stop the rest being checked. A client
      // whose row is left stale keeps its previous status, which is a better
      // failure than the whole run reporting nothing.
      failed.push({ client: client.name, error: String(err instanceof Error ? err.message : err) })
    }
  }

  // Anything not ACTIVE, so the response itself is readable in the cron log
  // rather than needing a query to interpret.
  const notDelivering = checked.filter((c) => c.status !== 1)

  return json({
    checked: checked.length,
    not_delivering: notDelivering,
    failed,
  })
})
