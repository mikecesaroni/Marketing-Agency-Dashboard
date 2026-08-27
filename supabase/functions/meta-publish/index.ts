// Publish a composited ad straight into a Meta ad account.
//
// This is the Graph API, not the MCP server. mcp.facebook.com/ads is built
// around an interactive OAuth browser login that an Edge Function cannot
// perform; the Graph API takes the System User token directly and is the same
// engine Ads Manager itself drives. See docs/meta-connection.md.
//
// The safety story, and the reason this is a button rather than a chat tool:
//
//   * Everything created here is PAUSED. Campaign, ad set and ad all carry
//     status=PAUSED, so nothing can spend money until a human opens Ads
//     Manager and switches it on. That is Meta's own guidance for automated
//     tooling, and rapid unattended ad creation is one of the patterns that
//     gets accounts flagged.
//   * One call creates one ad. There is no loop and no batch.
//   * Nothing existing is ever modified or deleted. The only write to an
//     object that already exists is attaching a new ad set to a campaign the
//     caller explicitly picked.
//
// Secrets: META_ACCESS_TOKEN (same System User token the KPI sync uses).
//
// Actions, sent as {"action": "..."} in the body:
//
//   search_locations  {query}                 -> Meta's geo targeting keys
//   list_campaigns    {client_id}             -> existing campaigns, to reuse
//   publish           {client_id, ...}        -> campaign/adset/creative/ad

const META_API_VERSION = 'v21.0'
const GRAPH = `https://graph.facebook.com/${META_API_VERSION}`

// Meta will not create an ad set below this. Well under it is almost always a
// typo — a budget entered in dollars where cents were meant.
const MIN_DAILY_BUDGET_CENTS = 100

type Objective = 'OUTCOME_TRAFFIC' | 'OUTCOME_LEADS'

// Each objective needs a matching optimisation goal and, for conversions, a
// promoted object. Getting this combination wrong is the single most common
// way an ad set create fails, so the valid pairings live here rather than
// being assembled ad hoc at the call site.
const OBJECTIVES: Record<
  Objective,
  { optimization_goal: string; billing_event: string; needs_pixel: boolean; label: string }
> = {
  OUTCOME_TRAFFIC: {
    optimization_goal: 'LANDING_PAGE_VIEWS',
    billing_event: 'IMPRESSIONS',
    needs_pixel: false,
    label: 'Traffic',
  },
  OUTCOME_LEADS: {
    // Optimising against the pixel's Lead event. The lead-form flavour of this
    // objective lives on the Page rather than the ad account and is its own
    // build; this is the website-lead path.
    optimization_goal: 'OFFSITE_CONVERSIONS',
    billing_event: 'IMPRESSIONS',
    needs_pixel: true,
    label: 'Leads (website)',
  },
}

// Meta rejects anything outside its own enum, and the wrong one is a rejected
// creative rather than a soft failure.
const CTA_TYPES = new Set([
  // 'Book Now' on the button; the enum keeps its original travel-era name.
  'BOOK_TRAVEL',
  'BOOK_NOW',
  'CALL_NOW',
  'CONTACT_US',
  'DOWNLOAD',
  'GET_OFFER',
  'GET_QUOTE',
  'LEARN_MORE',
  'MESSAGE_PAGE',
  'NO_BUTTON',
  'SHOP_NOW',
  'SIGN_UP',
  'SUBSCRIBE',
])

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

// Meta's errors are the useful part of this integration — they say exactly
// which field was wrong. Flattening them to "request failed" is how you end up
// guessing, so the message, the subcode and the user-facing title all survive.
class GraphError extends Error {
  detail: Record<string, unknown>
  constructor(message: string, detail: Record<string, unknown>) {
    super(message)
    this.detail = detail
  }
}

function graphError(step: string, body: Record<string, any>, status: number): GraphError {
  const err = body?.error || {}
  const parts = [err.error_user_title, err.error_user_msg || err.message].filter(Boolean)
  const message = parts.length ? parts.join(' — ') : `Meta returned ${status} on ${step}`
  return new GraphError(`${step}: ${message}`, {
    step,
    status,
    code: err.code,
    subcode: err.error_subcode,
    type: err.type,
    trace: err.fbtrace_id,
  })
}

async function graphGet(path: string, params: Record<string, string>, token: string) {
  const url = new URL(`${GRAPH}/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('access_token', token)

  const res = await fetch(url)
  const body = await res.json()
  if (!res.ok) throw graphError(path, body, res.status)
  return body
}

// Every create goes through here. Meta's write endpoints take form-encoded
// bodies; nested structures (targeting, object_story_spec) go in as JSON
// strings, which is why objects are stringified rather than flattened.
async function graphPost(path: string, params: Record<string, unknown>, token: string, step: string) {
  const form = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    form.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
  }
  form.set('access_token', token)

  const res = await fetch(`${GRAPH}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  })
  const body = await res.json()
  if (!res.ok) throw graphError(step, body, res.status)
  return body
}

/**
 * Gets the composited PNG into the ad account and returns its image hash.
 *
 * The bytes are re-uploaded rather than handed over as a URL. Meta can fetch a
 * picture URL itself, but then the ad's image is a live dependency on the
 * Supabase bucket staying public forever; an image_hash is a copy that lives in
 * the ad account and cannot break later.
 */
async function uploadImage(accountId: string, imageUrl: string, token: string): Promise<string> {
  const res = await fetch(imageUrl)
  if (!res.ok) {
    throw new GraphError(
      `Could not read the ad image from storage (${res.status}). The file may have been deleted from the bucket.`,
      { step: 'fetch image', status: res.status, url: imageUrl }
    )
  }
  const blob = await res.blob()

  const form = new FormData()
  form.append('source', blob, 'ad.png')
  form.append('access_token', token)

  const upload = await fetch(`${GRAPH}/${accountId}/adimages`, { method: 'POST', body: form })
  const body = await upload.json()
  if (!upload.ok) throw graphError('upload image', body, upload.status)

  // Keyed by the field name the file was sent under, so read the first entry
  // rather than assuming Meta echoes 'source' back.
  const first = Object.values(body?.images || {})[0] as { hash?: string } | undefined
  if (!first?.hash) {
    throw new GraphError('Meta accepted the image but returned no hash.', { step: 'upload image', body })
  }
  return first.hash
}

// Ad account IDs are stored bare in the CRM; every Graph path wants act_.
function actId(raw: string): string {
  return raw.startsWith('act_') ? raw : `act_${raw}`
}

/**
 * Builds the targeting spec.
 *
 * Locations arrive as the rows Meta's own geo search returned, so the keys are
 * already the ones the API expects — the shape below is only about sorting them
 * into the right bucket, since cities take a radius and regions and postcodes
 * do not.
 */
function buildTargeting(locations: any[], ageMin?: number, ageMax?: number) {
  const geo: Record<string, unknown[]> = {}

  for (const loc of locations || []) {
    if (loc?.type === 'city') {
      ;(geo.cities ||= []).push({
        key: String(loc.key),
        // Meta's own default when a city is added without one. Capped at 50,
        // which is its hard limit.
        radius: Math.min(Number(loc.radius) || 25, 50),
        distance_unit: 'mile',
      })
    } else if (loc?.type === 'region') {
      ;(geo.regions ||= []).push({ key: String(loc.key) })
    } else if (loc?.type === 'zip') {
      ;(geo.zips ||= []).push({ key: String(loc.key) })
    } else if (loc?.type === 'country') {
      ;(geo.countries ||= []).push(String(loc.country_code || loc.key))
    }
  }

  return {
    geo_locations: geo,
    age_min: ageMin ?? 25,
    age_max: ageMax ?? 65,
    // Both feeds and both story surfaces. Left to Meta's own placement
    // selection beyond that: hand-picking placements on a brand new ad set
    // starves the learning phase.
    targeting_automation: { advantage_audience: 0 },
  }
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)

  const token = Deno.env.get('META_ACCESS_TOKEN')
  if (!token) {
    return json(
      {
        error:
          'META_ACCESS_TOKEN is not set on this project. Add it under Project Settings > Edge Functions > Secrets. See docs/meta-connection.md.',
      },
      500
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }

  const action = body.action || 'publish'

  // Tracks what exists in the ad account as the publish chain progresses. If a
  // later step fails, these come back with the error: everything is PAUSED and
  // therefore harmless, but the user still needs to know a half-built campaign
  // is sitting in Ads Manager rather than discovering it next week.
  const created: Record<string, string> = {}

  try {
    // -----------------------------------------------------------------------
    // Geo search. Feeds the location picker: Meta will only target keys it
    // issued itself, so the picker cannot be a free-text box.
    // -----------------------------------------------------------------------
    if (action === 'search_locations') {
      const query = String(body.query || '').trim()
      if (query.length < 2) return json({ locations: [] })

      const found = await graphGet(
        'search',
        {
          type: 'adgeolocation',
          location_types: JSON.stringify(['city', 'region', 'zip']),
          q: query,
          limit: '25',
        },
        token
      )

      const locations = (found.data || []).map((row: any) => ({
        key: row.key,
        type: row.type,
        name: row.name,
        region: row.region || '',
        country_code: row.country_code || '',
        country_name: row.country_name || '',
        // What the picker shows: "Rochester, New York, United States".
        label: [row.name, row.region, row.country_name].filter(Boolean).join(', '),
      }))

      return json({ locations })
    }

    // Every remaining action is scoped to one client.
    const clientId = body.client_id
    if (!clientId) return json({ error: 'client_id is required.' }, 400)

    const clientRes = await fetch(
      `${supabaseUrl}/rest/v1/clients?select=id,name,meta_ad_account_id,meta_page_id,meta_pixel_id,website_url&id=eq.${encodeURIComponent(clientId)}`,
      { headers: dbHeaders }
    )
    const client = (await clientRes.json())?.[0]
    if (!client) return json({ error: 'That client was not found.' }, 404)
    if (!client.meta_ad_account_id) {
      return json(
        { error: `${client.name} has no Meta ad account connected. Set one on the client page first.` },
        400
      )
    }

    const account = actId(client.meta_ad_account_id)

    // -----------------------------------------------------------------------
    // Existing campaigns, so a second ad can join the first one's campaign
    // rather than littering the account with a campaign per creative.
    // -----------------------------------------------------------------------
    if (action === 'list_campaigns') {
      // The budget fields matter: a campaign running campaign-budget
      // optimisation owns the budget itself and rejects an ad set that brings
      // its own. Better to grey it out in the picker than to fail on publish.
      const found = await graphGet(
        `${account}/campaigns`,
        {
          fields: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget',
          limit: '50',
        },
        token
      )
      const campaigns = (found.data || []).map((c: any) => ({
        ...c,
        campaign_budget: Boolean(c.daily_budget || c.lifetime_budget),
      }))
      return json({ campaigns })
    }

    if (action !== 'publish') return json({ error: `Unknown action "${action}".` }, 400)

    // -----------------------------------------------------------------------
    // Publish.
    // -----------------------------------------------------------------------
    const {
      image_url: imageUrl,
      objective = 'OUTCOME_TRAFFIC',
      campaign_id: existingCampaignId,
      campaign_name: campaignName,
      adset_name: adsetName,
      ad_name: adName,
      daily_budget_cents: dailyBudgetCents,
      locations = [],
      age_min: ageMin,
      age_max: ageMax,
      primary_text: primaryText,
      headline,
      description,
      cta = 'LEARN_MORE',
      link_url: linkUrlIn,
      special_ad_categories: specialAdCategories = [],
      start_time: startTime,
      stamp,
      size_key: sizeKey,
      published_by: publishedBy,
    } = body

    const spec = OBJECTIVES[objective as Objective]
    if (!spec) {
      return json({ error: `Unsupported objective "${objective}".` }, 400)
    }
    if (!client.meta_page_id) {
      return json(
        {
          error: `${client.name} has no Facebook Page ID set. An ad creative is a Page post, so Meta will not accept one without it. Add it on the client's Meta card.`,
        },
        400
      )
    }
    if (!imageUrl) return json({ error: 'No ad image was given to publish.' }, 400)
    if (!primaryText) return json({ error: 'Primary text is required — it is the copy above the image.' }, 400)

    const linkUrl = linkUrlIn || client.website_url
    if (!linkUrl) {
      return json(
        { error: `No landing page URL. Set one on ${client.name}'s Meta card, or type one on the publish form.` },
        400
      )
    }
    if (spec.needs_pixel && !client.meta_pixel_id) {
      return json(
        {
          error: `Optimising for leads needs a pixel: Meta has to be told which conversion event to chase. Add ${client.name}'s pixel ID, or publish this as a Traffic campaign instead.`,
        },
        400
      )
    }
    const budget = Math.round(Number(dailyBudgetCents) || 0)
    if (budget < MIN_DAILY_BUDGET_CENTS) {
      return json({ error: `Daily budget must be at least $${(MIN_DAILY_BUDGET_CENTS / 100).toFixed(2)}.` }, 400)
    }
    if (!Array.isArray(locations) || locations.length === 0) {
      return json({ error: 'Pick at least one location to target.' }, 400)
    }
    const ctaType = String(cta).toUpperCase()
    if (!CTA_TYPES.has(ctaType)) {
      return json({ error: `"${cta}" is not a call-to-action Meta accepts.` }, 400)
    }

    // 1. Campaign. Reused when one was picked, so a client's ads can share a
    //    campaign and its learning rather than each starting cold.
    let campaignId = existingCampaignId
    if (campaignId) {
      created.campaign_id = campaignId
    } else {
      const campaign = await graphPost(
        `${account}/campaigns`,
        {
          name: campaignName || `${client.name} — ${spec.label}`,
          objective,
          status: 'PAUSED',
          // Required by Meta on every campaign create. Housing, employment,
          // credit and social-issue ads have targeting restrictions, and
          // declaring the wrong thing is a policy violation rather than an
          // error, so it is asked rather than assumed.
          special_ad_categories: specialAdCategories,
        },
        token,
        'create campaign'
      )
      campaignId = campaign.id
      created.campaign_id = campaign.id
    }

    // 2. Ad set — budget, schedule and, the point of the exercise, targeting.
    const adset = await graphPost(
      `${account}/adsets`,
      {
        name: adsetName || `${client.name} — ${new Date().toISOString().slice(0, 10)}`,
        campaign_id: campaignId,
        daily_budget: budget,
        billing_event: spec.billing_event,
        optimization_goal: spec.optimization_goal,
        // No bid cap. A cap on a brand new ad set with no delivery history
        // mostly just stops it delivering at all.
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        targeting: buildTargeting(locations, ageMin, ageMax),
        promoted_object: spec.needs_pixel
          ? { pixel_id: client.meta_pixel_id, custom_event_type: 'LEAD' }
          : undefined,
        // Stated rather than left to default. OUTCOME_LEADS can also mean an
        // instant form, a phone call or a Messenger thread, and which one is
        // meant changes what else the ad set needs.
        destination_type: spec.needs_pixel ? 'WEBSITE' : undefined,
        start_time: startTime || undefined,
        status: 'PAUSED',
      },
      token,
      'create ad set'
    )
    created.adset_id = adset.id

    // 3. The image, uploaded into the account so the ad does not depend on the
    //    bucket URL surviving.
    const imageHash = await uploadImage(account, imageUrl, token)
    created.image_hash = imageHash

    // 4. Creative.
    const creative = await graphPost(
      `${account}/adcreatives`,
      {
        name: `${adName || client.name} — creative`,
        object_story_spec: {
          page_id: client.meta_page_id,
          link_data: {
            link: linkUrl,
            message: primaryText,
            name: headline || undefined,
            description: description || undefined,
            image_hash: imageHash,
            call_to_action: { type: ctaType, value: { link: linkUrl } },
          },
        },
        // Opt out of Meta's automatic image and text tweaks. The whole point of
        // the Studio is a deliberately composited frame with the copy placed
        // inside the safe area; letting Meta crop it or rewrite the headline
        // undoes that.
        degrees_of_freedom_spec: {
          creative_features_spec: { standard_enhancements: { enroll_status: 'OPT_OUT' } },
        },
      },
      token,
      'create creative'
    )
    created.creative_id = creative.id

    // 5. The ad itself.
    const ad = await graphPost(
      `${account}/ads`,
      {
        name: adName || `${client.name} — ${new Date().toISOString().slice(0, 10)}`,
        adset_id: adset.id,
        creative: { creative_id: creative.id },
        status: 'PAUSED',
      },
      token,
      'create ad'
    )
    created.ad_id = ad.id

    // Recorded after the fact. A failed insert here does not undo a real ad
    // that now exists in the account, so it is reported alongside success
    // rather than turned into a failure.
    let recorded = true
    try {
      const insert = await fetch(`${supabaseUrl}/rest/v1/published_ads`, {
        method: 'POST',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          client_id: clientId,
          stamp: stamp ? String(stamp) : null,
          size_key: sizeKey || null,
          ad_account_id: client.meta_ad_account_id,
          campaign_id: campaignId,
          campaign_name: campaignName || null,
          adset_id: adset.id,
          adset_name: adsetName || null,
          creative_id: creative.id,
          ad_id: ad.id,
          ad_name: adName || null,
          objective,
          daily_budget_cents: budget,
          locations,
          status: 'PAUSED',
          published_by: publishedBy || null,
        }),
      })
      recorded = insert.ok
    } catch {
      recorded = false
    }

    return json({
      ok: true,
      status: 'PAUSED',
      recorded,
      ...created,
      campaign_id: campaignId,
      // Deep link to the new ad set in Ads Manager, which is where the human
      // approval step actually happens.
      ads_manager_url: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${client.meta_ad_account_id}&selected_adset_ids=${adset.id}`,
    })
  } catch (err) {
    // Nothing is rolled back. Deleting objects is itself a destructive write,
    // and a paused half-campaign costs nothing sitting there — whereas an
    // automatic delete that misfires is unrecoverable. Hand back what exists
    // and let the human decide.
    const partial = Object.keys(created).length > 0 ? { created } : {}

    if (err instanceof GraphError) {
      return json({ error: err.message, detail: err.detail, ...partial }, 502)
    }
    return json({ error: String(err instanceof Error ? err.message : err), ...partial }, 500)
  }
})
