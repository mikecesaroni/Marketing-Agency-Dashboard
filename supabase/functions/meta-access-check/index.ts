// What has each client ACTUALLY granted us on Meta?
//
// "They only gave me half of what I need" was the complaint, and until this
// existed the only way to find out was to try to build something and watch it
// fail. Meta will say directly: the business's client_pages and
// client_ad_accounts edges each report permitted_tasks, so the exact permission
// level on every asset any client has shared is readable.
//
// Pointed at the live account for the first time it found one client's Page
// shared as ANALYZE and ADVERTISE only -- no CREATE_CONTENT -- against another
// client's ten tasks. Shared, listed as a partner, looks finished from both
// ends, and cannot be published from. That had been sitting there unnoticed.
//
// DELIBERATELY READ-ONLY. It touches nothing, writes nothing and asks Meta for
// nothing on the client's behalf. Requesting access from here is not possible
// anyway: POST client_ad_accounts comes back "(#3) Application does not have
// the capability to make this API call", so the ad account has to be granted by
// the client whatever we do. Reading back what landed is the part that works,
// and it is the part that actually saves the chasing.
//
// The verdicts are NOT here. This returns the granted lists and the CRM's
// mapping, and src/lib/metaAccess.js decides what the combination means, so
// that logic can be tested without a network -- see
// scripts/check-meta-access.mjs.
//
// Secrets: META_ACCESS_TOKEN. Business ID comes from app_settings.
//
// Takes no body.

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
 * Every asset on one edge, paged and bounded.
 *
 * The bound is not defensive tidiness: an agency with a lot of clients pages
 * through several times, and a paging bug on Meta's side must not become an
 * unbounded loop inside an Edge Function.
 */
async function allGranted(
  businessId: string,
  edge: string,
  fields: string,
  token: string
): Promise<Record<string, unknown>[]> {
  const found: Record<string, unknown>[] = []
  let after: string | undefined

  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({
      fields,
      limit: '100',
      access_token: token,
      ...(after ? { after } : {}),
    })
    const res = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${businessId}/${edge}?${qs}`
    )
    const body = await res.json()
    if (!res.ok) {
      throw new Error(body?.error?.message || `Meta returned ${res.status} for ${edge}`)
    }

    for (const row of body.data || []) found.push(row)

    after = body.paging?.cursors?.after
    if (!body.paging?.next || !after) break
  }

  return found
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)

  const token = Deno.env.get('META_ACCESS_TOKEN')
  if (!token) return json({ error: 'META_ACCESS_TOKEN is not set on this project.' }, 500)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }

  // Stored rather than hard-coded, same as the setup message uses: reading the
  // wrong business would report every client as having granted nothing, which
  // is a frightening and completely wrong answer.
  const settingRes = await fetch(
    `${supabaseUrl}/rest/v1/app_settings?key=eq.meta_business_id&select=value&limit=1`,
    { headers }
  )
  const businessId = String(((await settingRes.json()) || [])[0]?.value || '').trim()
  if (!businessId) {
    return json(
      {
        error:
          'No Meta business ID is saved. Add it as app_settings.meta_business_id — it is in Business Settings > Business Info.',
      },
      400
    )
  }

  const clientsRes = await fetch(
    `${supabaseUrl}/rest/v1/clients?select=id,name,meta_ad_account_id,meta_page_id` +
      `&archived=eq.false&is_internal=eq.false&order=name`,
    { headers }
  )
  if (!clientsRes.ok) {
    return json({ error: 'Could not read clients', detail: await clientsRes.text() }, 500)
  }
  const clients = await clientsRes.json()

  try {
    // Fetched together: one is useless without the other, and a client who
    // shared the Page but not the ad account is exactly the case worth seeing.
    const [pages, adAccounts] = await Promise.all([
      allGranted(businessId, 'client_pages', 'id,name,permitted_tasks', token),
      allGranted(
        businessId,
        'client_ad_accounts',
        'id,name,account_status,permitted_tasks',
        token
      ),
    ])

    return json({
      business_id: businessId,
      checked_at: new Date().toISOString(),
      clients,
      pages,
      ad_accounts: adAccounts,
    })
  } catch (err) {
    return json({ error: String(err instanceof Error ? err.message : err) }, 502)
  }
})
