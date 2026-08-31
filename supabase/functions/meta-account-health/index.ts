// Keeps the Meta wiring current, so nobody has to do it by hand.
//
// Three jobs, all "things about Meta accounts that go stale silently":
//
//   1. REFRESH THE PICKABLE ACCOUNT LIST. The browser has no Meta credentials,
//      so the ad-account dropdown reads a cached table. Nothing had ever
//      written that table -- seven rows went in by hand in August and it froze
//      there, which is why Belk, Pillar and Reliable were connected to accounts
//      the dropdown could not offer.
//
//   2. FILL IN THE PAGE AND PIXEL. They were behind a "Detect from Meta"
//      button, which is a button whose only job is to ask Meta something Meta
//      already knows. Any client with an ad account and no Page gets one.
//
//   3. READ THE ACCOUNT STATUS. Summit Water Pros' card payment failed, Meta
//      left the account unsettled over an unpaid $3.04, and the ads stopped.
//      Nothing in the CRM said so -- the client was still flagged
//      meta_ads_active and the only evidence was an absence: spend that
//      stopped arriving.
//
// Deliberately separate from sync-meta-kpis. These are cheap account-level
// reads with nothing to do with aggregating insights, and losing a day of spend
// and leads because one of them failed would be a bad trade.
//
// Secrets: META_ACCESS_TOKEN.
//
// Scheduled from Postgres; see supabase/ad-delivery-alerts.sql. Takes no body.
// {"client_id":"..."} limits jobs 2 and 3 to one client.

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

async function graph(path: string, params: Record<string, string>, token: string) {
  const qs = new URLSearchParams({ ...params, access_token: token })
  const res = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${path}?${qs}`)
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error?.message || `Meta API returned ${res.status}`)
  return body
}

const bareId = (v: unknown) => String(v || '').replace(/^act_/i, '')

/**
 * Every ad account the token can see, for the dropdown.
 *
 * Paged and bounded: a paging bug on Meta's side should not become an
 * unbounded loop inside an Edge Function.
 */
async function allAdAccounts(token: string) {
  const found: { ad_account_id: string; name: string; business_name: string | null }[] = []
  let after: string | undefined

  for (let page = 0; page < 20; page++) {
    const body = await graph(
      'me/adaccounts',
      {
        fields: 'account_id,id,name,business{name}',
        limit: '100',
        ...(after ? { after } : {}),
      },
      token
    )
    for (const a of body.data || []) {
      const id = bareId(a.account_id || a.id)
      if (id) found.push({ ad_account_id: id, name: a.name || '', business_name: a.business?.name || null })
    }
    after = body.paging?.cursors?.after
    if (!body.paging?.next || !after) break
  }

  return found
}

/**
 * The Page and pixel this ad account actually advertises with.
 *
 * Same reasoning as the Detect button it replaces: the Page on the account's
 * existing creatives is far stronger evidence than whatever Business Settings
 * says is assignable, because it is what the client is really running ads as.
 */
async function suggestAssets(adAccountId: string, token: string) {
  const account = `act_${bareId(adAccountId)}`
  const counts = new Map<string, number>()

  try {
    const creatives = await graph(
      `${account}/adcreatives`,
      { fields: 'object_story_spec{page_id}', limit: '100' },
      token
    )
    for (const c of creatives.data || []) {
      const id = c?.object_story_spec?.page_id
      if (id) counts.set(id, (counts.get(id) || 0) + 1)
    }
  } catch {
    // A brand new account has no creatives to learn from.
  }

  let pageId: string | null = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null

  // Nothing running yet: fall back to a Page the token manages, but only when
  // there is exactly one. Picking arbitrarily from several would quietly wire a
  // client to the wrong Page, which is worse than leaving it blank.
  if (!pageId) {
    try {
      const owned = await graph('me/accounts', { fields: 'id', limit: '25' }, token)
      const list = owned.data || []
      if (list.length === 1) pageId = list[0].id
    } catch {
      // Some system user tokens cannot enumerate Pages. Not an error.
    }
  }

  // Same rule for the pixel: one is an answer, several is a choice.
  let pixelId: string | null = null
  try {
    const found = await graph(`${account}/adspixels`, { fields: 'id', limit: '25' }, token)
    const list = found.data || []
    if (list.length === 1) pixelId = list[0].id
  } catch {
    // No pixel is a normal state.
  }

  return { pageId, pixelId }
}

/**
 * account_status 1 is ACTIVE. Anything else means ads are not delivering.
 *
 * The balance comes with it because it is the actual instruction: "ad account
 * unsettled" sends someone digging through Ads Manager, while "unsettled,
 * $3.04 outstanding" is a thing to go and pay. Meta returns it as a string in
 * the account currency's minor unit.
 *
 * disable_reason is only set when Meta actively DISABLES an account. Reading
 * the live accounts showed 0 on one that was merely unsettled, so the status
 * carries the explanation and the reason is extra detail when present.
 */
async function accountHealth(adAccountId: string, token: string) {
  const body = await graph(
    `act_${bareId(adAccountId)}`,
    { fields: 'account_status,disable_reason,balance' },
    token
  )
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

  const result: Record<string, unknown> = {}

  // --- 1. the dropdown's account list ------------------------------------
  try {
    const accounts = await allAdAccounts(token)
    if (accounts.length > 0) {
      const write = await fetch(
        `${supabaseUrl}/rest/v1/meta_ad_accounts?on_conflict=ad_account_id`,
        {
          method: 'POST',
          headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(
            accounts.map((a) => ({ ...a, synced_at: new Date().toISOString() }))
          ),
        }
      )
      if (!write.ok) throw new Error(await write.text())
    }
    result.ad_accounts_cached = accounts.length

    // Drop cached accounts Meta no longer shows us, so the dropdown stops
    // offering options that cannot be synced. Two rules make this safe:
    //
    //   * only when the refresh actually returned something. An empty list is
    //     far more likely to be a token or paging problem than the agency
    //     losing every ad account at once, and pruning on it would empty the
    //     dropdown completely.
    //   * never an account a client is connected to. That row is what resolves
    //     the account's name on the client card, and a client pointing at an
    //     account we have lost access to is a problem to surface rather than
    //     to hide by deleting the evidence.
    if (accounts.length > 0) {
      const connected = await fetch(
        `${supabaseUrl}/rest/v1/clients?select=meta_ad_account_id&meta_ad_account_id=not.is.null`,
        { headers }
      )
      const inUse = new Set(
        ((await connected.json()) || []).map((c: { meta_ad_account_id: string }) =>
          bareId(c.meta_ad_account_id)
        )
      )
      const keep = new Set([...accounts.map((a) => a.ad_account_id), ...inUse])

      const cached = await fetch(`${supabaseUrl}/rest/v1/meta_ad_accounts?select=ad_account_id`, {
        headers,
      })
      const stale = ((await cached.json()) || [])
        .map((r: { ad_account_id: string }) => r.ad_account_id)
        .filter((id: string) => !keep.has(id))

      if (stale.length > 0) {
        await fetch(
          `${supabaseUrl}/rest/v1/meta_ad_accounts?ad_account_id=in.(${stale
            .map((id: string) => encodeURIComponent(id))
            .join(',')})`,
          { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' } }
        )
      }
      result.ad_accounts_pruned = stale
    }
  } catch (err) {
    result.ad_accounts_error = String(err instanceof Error ? err.message : err)
  }

  // --- 2 and 3, per connected client -------------------------------------
  const filter = onlyClient ? `&id=eq.${encodeURIComponent(onlyClient)}` : ''
  const res = await fetch(
    `${supabaseUrl}/rest/v1/clients?select=id,name,meta_ad_account_id,meta_page_id,meta_pixel_id` +
      `&meta_ad_account_id=not.is.null&archived=eq.false${filter}`,
    { headers }
  )
  if (!res.ok) {
    return json({ ...result, error: 'Could not read clients', detail: await res.text() }, 500)
  }
  const clients = (await res.json()) as {
    id: string
    name: string
    meta_ad_account_id: string
    meta_page_id: string | null
    meta_pixel_id: string | null
  }[]

  const checked: { client: string; status: number | null; balance: number | null }[] = []
  const filled: { client: string; page_id?: string; pixel_id?: string }[] = []
  const failed: { client: string; error: string }[] = []

  for (const client of clients) {
    const patch: Record<string, unknown> = {}

    try {
      Object.assign(patch, await accountHealth(client.meta_ad_account_id, token))
      checked.push({
        client: client.name,
        status: patch.meta_account_status as number | null,
        balance: patch.meta_account_balance as number | null,
      })
    } catch (err) {
      failed.push({
        client: client.name,
        error: `status: ${String(err instanceof Error ? err.message : err)}`,
      })
    }

    // Only ever fills blanks. A Page already set is somebody's decision, and
    // overwriting it from a guess would be worse than never detecting at all.
    if (!client.meta_page_id || !client.meta_pixel_id) {
      try {
        const { pageId, pixelId } = await suggestAssets(client.meta_ad_account_id, token)
        const found: { client: string; page_id?: string; pixel_id?: string } = {
          client: client.name,
        }
        if (!client.meta_page_id && pageId) {
          patch.meta_page_id = pageId
          found.page_id = pageId
        }
        if (!client.meta_pixel_id && pixelId) {
          patch.meta_pixel_id = pixelId
          found.pixel_id = pixelId
        }
        if (found.page_id || found.pixel_id) filled.push(found)
      } catch (err) {
        failed.push({
          client: client.name,
          error: `assets: ${String(err instanceof Error ? err.message : err)}`,
        })
      }
    }

    if (Object.keys(patch).length === 0) continue

    try {
      const write = await fetch(`${supabaseUrl}/rest/v1/clients?id=eq.${client.id}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
      })
      if (!write.ok) throw new Error(await write.text())
    } catch (err) {
      failed.push({
        client: client.name,
        error: `write: ${String(err instanceof Error ? err.message : err)}`,
      })
    }
  }

  return json({
    ...result,
    checked: checked.length,
    // Anything not ACTIVE, so the cron log is readable without a query.
    not_delivering: checked.filter((c) => c.status !== 1),
    filled_in: filled,
    failed,
  })
})
