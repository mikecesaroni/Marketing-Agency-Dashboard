// Read and change a client's live Meta ad account.
//
// This is the surface the CRM chat drives. meta-publish composes and ships ONE
// new ad from the Ad Studio and is deliberately narrow; this is the other half
// -- see what exists, and change it.
//
// Kept as its own function rather than more actions on meta-publish. That one
// is a working path that spends money, its whole design is "one ad, always
// paused, no loops", and bolting an open-ended management API onto it would
// erase the property that makes it easy to reason about. The Graph helpers
// below are duplicated from it on purpose for the same reason.
//
// Secrets: META_ACCESS_TOKEN (the same System User token everything else uses).
//
// Actions:
//   overview   {client_id}                    -> campaigns, ad sets and ads
//   insights   {client_id, level, object_id?} -> spend/leads from Meta directly
//   update     {client_id, level, object_id, ...fields}
//   create_campaign {client_id, name, objective, ...}
//   create_adset    {client_id, campaign_id, name, daily_budget_cents, ...}
//   duplicate_ad    {client_id, ad_id, adset_id, name?}
//   ad_preview      {client_id, ad_id}         -> the creative and rendered previews
//
// What it will NOT do, and why: it cannot delete anything. Meta's own delete is
// effectively irreversible and pausing achieves everything a person actually
// wants from "turn this off" while staying undoable. Ads with new creative are
// also not created here -- that needs a composited image, which is the Ad
// Studio's job.

const META_API_VERSION = 'v21.0'
const GRAPH = `https://graph.facebook.com/${META_API_VERSION}`

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// The three levels every Meta object sits at. Kept as a whitelist so a level
// can never be interpolated into a Graph path from free text.
const LEVELS = new Set(['campaign', 'adset', 'ad'])

// Fields a caller may change, per level. An allowlist rather than passing a
// blob through: it is the difference between "set the budget" and "set
// anything Meta happens to accept on this object".
const EDITABLE: Record<string, Set<string>> = {
  campaign: new Set(['status', 'name', 'daily_budget', 'lifetime_budget', 'spend_cap']),
  adset: new Set([
    'status',
    'name',
    'daily_budget',
    'lifetime_budget',
    'bid_amount',
    'start_time',
    'end_time',
  ]),
  ad: new Set(['status', 'name']),
}

const STATUSES = new Set(['ACTIVE', 'PAUSED'])

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

class GraphError extends Error {
  detail: Record<string, unknown>
  constructor(message: string, detail: Record<string, unknown>) {
    super(message)
    this.detail = detail
  }
}

// Meta's errors name the exact field that was wrong. Flattening them to
// "request failed" is how you end up guessing.
function graphError(step: string, body: Record<string, any>, status: number): GraphError {
  const err = body?.error || {}
  const parts = [err.error_user_title, err.error_user_msg || err.message].filter(Boolean)
  const message = parts.length ? parts.join(' - ') : `Meta returned ${status} on ${step}`
  return new GraphError(`${step}: ${message}`, {
    step,
    status,
    code: err.code,
    subcode: err.error_subcode,
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

// Meta's write endpoints take form-encoded bodies; nested structures go in as
// JSON strings, which is why objects are stringified rather than flattened.
async function graphPost(
  path: string,
  params: Record<string, unknown>,
  token: string,
  step: string
) {
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

const actId = (raw: string) => (raw.startsWith('act_') ? raw : `act_${raw}`)

// Budgets are cents everywhere in this codebase and dollars in every
// conversation, so the conversion happens once, here, rather than being
// remembered at each call site.
function budgetCents(value: unknown, field: string): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n < 100) {
    throw new Error(`${field} must be at least 100 (that is $1.00 — budgets are in cents).`)
  }
  return n
}

/**
 * Pulls a radius into the band Meta accepts.
 *
 * Not a defensive cap. Meta rejects the whole ad set -- "The geographical
 * radius you selected isn't within the specified bounds" -- for anything under
 * ten miles, verified by sweeping a validate-only ad set from 1 to 51 miles
 * against a real city key: 1-9 fail, 10-50 pass, 51 fails. The UI holds the
 * same floor, but a radius can also arrive from the chat or from a saved ad set
 * built before the floor existed, so it is enforced here too, where every
 * request goes through.
 */
const MIN_RADIUS_MILES = 10
const MAX_RADIUS_MILES = 50
const DEFAULT_RADIUS_MILES = 25

function clampRadius(miles: unknown): number {
  const n = Number(miles)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RADIUS_MILES
  return Math.min(Math.max(Math.round(n), MIN_RADIUS_MILES), MAX_RADIUS_MILES)
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

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }

  const action = body.action
  const clientId = body.client_id
  if (!clientId) return json({ error: 'client_id is required.' }, 400)

  try {
    // The ad account comes from the CRM, never from the request. A caller
    // cannot name someone else's account and have this token act on it.
    const res = await fetch(
      `${supabaseUrl}/rest/v1/clients?select=id,name,meta_ad_account_id,meta_page_id,meta_pixel_id` +
        `&id=eq.${encodeURIComponent(clientId)}`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    )
    const client = (await res.json())?.[0]
    if (!client) return json({ error: 'That client was not found.' }, 400)
    if (!client.meta_ad_account_id) {
      return json({ error: `${client.name} has no Meta ad account connected.` }, 400)
    }
    const account = actId(client.meta_ad_account_id)

    // -----------------------------------------------------------------------
    // AD PREVIEW — what the ad actually looks like.
    //
    // Fetched on demand rather than synced, because Meta's creative and
    // preview URLs are signed and expire. Storing one would mean a reports
    // page full of broken images a day later; asking at the moment somebody
    // clicks an ad costs one call and is always right.
    //
    // Three things come back, best first. The rendered preview is the real
    // article — Meta draws the ad as it appears in the feed, chrome and all.
    // image_url is the creative's own image, which is what the Studio
    // composited. thumbnail_url is small and exists for nearly everything, so
    // it is the last resort rather than the first choice.
    // -----------------------------------------------------------------------
    if (action === 'ad_preview') {
      const adId = String(body.ad_id || '').trim()
      if (!adId) return json({ error: 'ad_id is required.' }, 400)

      const ad = await graphGet(
        encodeURIComponent(adId),
        {
          fields:
            'id,name,account_id,effective_status,creative{id,name,thumbnail_url,image_url,body,title}',
        },
        token
      )

      // The ad id arrives in the request and this token can read every
      // client's account, so the account it belongs to is checked against the
      // client the caller named -- the same rule publishing uses.
      if (actId(String(ad?.account_id || '')) !== account) {
        return json({ error: `That ad does not belong to ${client.name}'s ad account.` }, 400)
      }

      // Which surfaces to render. All three verified against the live API on a
      // real ad -- each comes back as an embeddable iframe rather than a login
      // wall. Feed and story are the two the Studio crops differently, so
      // seeing both side by side is the point; desktop is there because it is
      // the one a client is most likely to be shown on a call.
      const FORMATS = [
        { key: 'feed', format: 'MOBILE_FEED_STANDARD' },
        { key: 'story', format: 'INSTAGRAM_STORY' },
        { key: 'desktop', format: 'DESKTOP_FEED_STANDARD' },
      ]

      const previews: Record<string, unknown>[] = []
      for (const f of FORMATS) {
        try {
          const res = await graphGet(
            `${encodeURIComponent(adId)}/previews`,
            { ad_format: f.format },
            token
          )
          const body = (res?.data || [])[0]?.body
          if (body) previews.push({ key: f.key, format: f.format, iframe: body })
        } catch {
          // A format Meta will not render for this creative is not an error,
          // it is one fewer preview. The image below still shows the ad.
        }
      }

      return json({
        ad_id: ad.id,
        name: ad.name,
        status: ad.effective_status,
        creative_id: ad.creative?.id || null,
        image_url: ad.creative?.image_url || null,
        thumbnail_url: ad.creative?.thumbnail_url || null,
        body: ad.creative?.body || null,
        title: ad.creative?.title || null,
        previews,
      })
    }

    // -----------------------------------------------------------------------
    // OVERVIEW — the whole account structure in one call.
    // -----------------------------------------------------------------------
    if (action === 'overview') {
      const [campaigns, adsets, ads] = await Promise.all([
        graphGet(
          `${account}/campaigns`,
          {
            fields:
              'id,name,objective,status,effective_status,daily_budget,lifetime_budget,created_time',
            limit: '100',
          },
          token
        ),
        graphGet(
          `${account}/adsets`,
          {
            fields:
              'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event,start_time,end_time',
            limit: '200',
          },
          token
        ),
        graphGet(
          `${account}/ads`,
          { fields: 'id,name,adset_id,campaign_id,status,effective_status', limit: '300' },
          token
        ),
      ])

      return json({
        client: client.name,
        ad_account: client.meta_ad_account_id,
        campaigns: campaigns.data || [],
        adsets: adsets.data || [],
        ads: ads.data || [],
      })
    }

    // -----------------------------------------------------------------------
    // INSIGHTS — numbers straight from Meta rather than the CRM's nightly copy,
    // so the chat can answer "how did yesterday go" without waiting for a sync.
    // -----------------------------------------------------------------------
    if (action === 'insights') {
      const level = String(body.level || 'campaign')
      if (!LEVELS.has(level)) return json({ error: `Unknown level "${level}".` }, 400)

      const objectId = body.object_id ? String(body.object_id) : ''
      const path = objectId ? `${encodeURIComponent(objectId)}/insights` : `${account}/insights`

      const found = await graphGet(
        path,
        {
          fields: 'campaign_name,adset_name,ad_name,spend,impressions,clicks,actions,ctr,cpc',
          level,
          date_preset: String(body.date_preset || 'last_7d'),
          limit: '200',
        },
        token
      )
      return json({ insights: found.data || [] })
    }

    // -----------------------------------------------------------------------
    // UPDATE — change something that already exists.
    // -----------------------------------------------------------------------
    if (action === 'update') {
      const level = String(body.level || '')
      const objectId = String(body.object_id || '').trim()
      if (!LEVELS.has(level)) return json({ error: `Unknown level "${level}".` }, 400)
      if (!objectId) return json({ error: 'object_id is required.' }, 400)

      const allowed = EDITABLE[level]
      const fields: Record<string, unknown> = {}

      if (body.status !== undefined) {
        const status = String(body.status).toUpperCase()
        if (!STATUSES.has(status)) {
          return json({ error: 'status must be ACTIVE or PAUSED.' }, 400)
        }
        fields.status = status
      }
      if (body.name !== undefined) fields.name = String(body.name)
      if (body.daily_budget_cents !== undefined) {
        fields.daily_budget = budgetCents(body.daily_budget_cents, 'daily_budget_cents')
      }
      if (body.lifetime_budget_cents !== undefined) {
        fields.lifetime_budget = budgetCents(body.lifetime_budget_cents, 'lifetime_budget_cents')
      }
      if (body.bid_amount_cents !== undefined) {
        fields.bid_amount = budgetCents(body.bid_amount_cents, 'bid_amount_cents')
      }
      if (body.start_time !== undefined) fields.start_time = String(body.start_time)
      if (body.end_time !== undefined) fields.end_time = String(body.end_time)

      for (const key of Object.keys(fields)) {
        if (!allowed.has(key)) {
          return json({ error: `${key} cannot be changed on a ${level}.` }, 400)
        }
      }
      if (Object.keys(fields).length === 0) {
        return json({ error: 'Nothing to change — no editable field was given.' }, 400)
      }

      await graphPost(encodeURIComponent(objectId), fields, token, `update ${level}`)

      // Mirror a status change into ad_daily so the CRM shows it now rather
      // than after the next sync. Best effort: Meta already did the real thing,
      // and failing here would misreport a change that did happen.
      if (fields.status && level === 'ad') {
        await fetch(
          `${supabaseUrl}/rest/v1/ad_daily?client_id=eq.${encodeURIComponent(clientId)}&ad_id=eq.${encodeURIComponent(objectId)}`,
          {
            method: 'PATCH',
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({ effective_status: fields.status }),
          }
        ).catch(() => {})
      }

      return json({ ok: true, level, object_id: objectId, changed: fields })
    }

    // -----------------------------------------------------------------------
    // CREATE CAMPAIGN
    // -----------------------------------------------------------------------
    if (action === 'create_campaign') {
      const name = String(body.name || '').trim()
      if (!name) return json({ error: 'name is required.' }, 400)

      const status = String(body.status || 'PAUSED').toUpperCase()
      if (!STATUSES.has(status)) return json({ error: 'status must be ACTIVE or PAUSED.' }, 400)

      const campaign = await graphPost(
        `${account}/campaigns`,
        {
          name,
          objective: String(body.objective || 'OUTCOME_LEADS'),
          status,
          // Required by Meta on every campaign create. Declaring the wrong
          // thing is a policy violation rather than an error, so it is passed
          // through rather than guessed.
          special_ad_categories: body.special_ad_categories || [],
          ...(body.daily_budget_cents !== undefined
            ? { daily_budget: budgetCents(body.daily_budget_cents, 'daily_budget_cents') }
            : {
                // Meta refuses a campaign with no campaign budget unless this
                // is stated outright. Only sent in that case: with a campaign
                // budget above, the budget lives on the campaign and there is
                // nothing for the ad sets to share.
                //
                // False, and barely a choice: true asks the ad sets to lend
                // each other a fifth of their budgets, and Meta only accepts
                // that alongside a campaign-level bid strategy this does not
                // set.
                is_adset_budget_sharing_enabled: false,
              }),
        },
        token,
        'create campaign'
      )

      return json({ ok: true, campaign_id: campaign.id, status })
    }

    // -----------------------------------------------------------------------
    // CREATE AD SET
    // -----------------------------------------------------------------------
    if (action === 'create_adset') {
      const name = String(body.name || '').trim()
      const campaignId = String(body.campaign_id || '').trim()
      if (!name) return json({ error: 'name is required.' }, 400)
      if (!campaignId) return json({ error: 'campaign_id is required.' }, 400)

      const status = String(body.status || 'PAUSED').toUpperCase()
      if (!STATUSES.has(status)) return json({ error: 'status must be ACTIVE or PAUSED.' }, 400)

      const geo: Record<string, unknown[]> = {}
      for (const loc of body.locations || []) {
        if (loc?.type === 'city') {
          ;(geo.cities ||= []).push({
            key: String(loc.key),
            radius: clampRadius(loc.radius),
            distance_unit: 'mile',
          })
        } else if (loc?.type === 'region') {
          ;(geo.regions ||= []).push({ key: String(loc.key) })
        } else if (loc?.type === 'zip') {
          ;(geo.zips ||= []).push({ key: String(loc.key) })
        }
      }
      if (Object.keys(geo).length === 0) {
        return json(
          { error: 'At least one location is required. Use meta-publish search_locations for keys.' },
          400
        )
      }

      // People who LIVE here. Meta defaults to ["home","recent"], and "recent"
      // means anyone recently in the area -- which is how Summit Water Pros got
      // a lead from Sacramento, three hours away. See buildTargeting in
      // meta-publish for the full story; the two builders have to agree or the
      // chat and the Studio would target differently.
      geo.location_types = ['home']

      const goal = String(body.optimization_goal || 'LEAD_GENERATION').toUpperCase()

      // An ad set has to say what it is promoting, and which thing depends on
      // how it optimises: a form lead is promoted against the Page hosting the
      // form, a website lead against the pixel that reports it. Plain traffic
      // promotes nothing.
      //
      // This used to be set only when the caller happened to pass
      // promoted_page_id, while the default goal here is LEAD_GENERATION --
      // which requires one. So the default path built ad sets Meta would not
      // accept a single ad into. Belk's chat-made ad set was one: five ads went
      // in and all five came back "Ad Set with Promoted Object Is Required".
      // Meta treats a promoted object as immutable once the ad set exists, so
      // there is no repairing one later -- it has to be right here.
      const needsForm = goal === 'LEAD_GENERATION'
      const needsPixel = goal === 'OFFSITE_CONVERSIONS'

      const promotedPage = String(body.promoted_page_id || client.meta_page_id || '')
      const promotedPixel = String(body.promoted_pixel_id || client.meta_pixel_id || '')

      // Refused rather than created broken. An ad set that cannot take an ad is
      // worse than no ad set: it looks finished, and the failure only surfaces
      // later against a batch of creatives that were fine.
      if (needsForm && !promotedPage) {
        return json(
          {
            error: `An ad set optimising for LEAD_GENERATION has to name the Page hosting the form, and ${client.name} has no Facebook Page set in the CRM. Set the Page on the client first, or pass promoted_page_id.`,
          },
          400
        )
      }
      if (needsPixel && !promotedPixel) {
        return json(
          {
            error: `An ad set optimising for OFFSITE_CONVERSIONS has to name the pixel that reports the lead, and ${client.name} has no pixel set in the CRM. Set the pixel on the client first, or pass promoted_pixel_id.`,
          },
          400
        )
      }

      const promotedObject = needsForm
        ? { page_id: promotedPage }
        : needsPixel
          ? { pixel_id: promotedPixel, custom_event_type: 'LEAD' }
          : undefined

      // Left unset, Meta records this as UNDEFINED, which is half of what the
      // publisher reads to decide whether a creative needs a form or a link.
      const destinationType = needsForm ? 'ON_AD' : needsPixel ? 'WEBSITE' : undefined

      const adset = await graphPost(
        `${account}/adsets`,
        {
          name,
          campaign_id: campaignId,
          daily_budget: budgetCents(body.daily_budget_cents, 'daily_budget_cents'),
          billing_event: String(body.billing_event || 'IMPRESSIONS'),
          optimization_goal: goal,
          bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
          targeting: {
            geo_locations: geo,
            age_min: Number(body.age_min) || 25,
            age_max: Number(body.age_max) || 65,
            targeting_automation: { advantage_audience: 0 },
          },
          ...(promotedObject ? { promoted_object: promotedObject } : {}),
          ...(destinationType ? { destination_type: destinationType } : {}),
          ...(body.start_time ? { start_time: String(body.start_time) } : {}),
          status,
        },
        token,
        'create ad set'
      )

      return json({
        ok: true,
        adset_id: adset.id,
        status,
        optimization_goal: goal,
        promoted_object: promotedObject ?? null,
        destination_type: destinationType ?? null,
      })
    }

    // -----------------------------------------------------------------------
    // DUPLICATE AD — the one way to make a new ad here.
    //
    // Reuses the existing ad's creative rather than building one, which is what
    // makes it possible without an image: testing the same creative in another
    // ad set is the common ask, and anything genuinely new goes through the
    // Studio where it can be composited.
    // -----------------------------------------------------------------------
    if (action === 'duplicate_ad') {
      const adId = String(body.ad_id || '').trim()
      const adsetId = String(body.adset_id || '').trim()
      if (!adId) return json({ error: 'ad_id is required.' }, 400)
      if (!adsetId) return json({ error: 'adset_id is required.' }, 400)

      const source = await graphGet(
        encodeURIComponent(adId),
        { fields: 'id,name,creative{id}' },
        token
      )
      const creativeId = source?.creative?.id
      if (!creativeId) {
        return json({ error: `Could not read the creative on ad ${adId}.` }, 502)
      }

      const status = String(body.status || 'PAUSED').toUpperCase()
      if (!STATUSES.has(status)) return json({ error: 'status must be ACTIVE or PAUSED.' }, 400)

      const ad = await graphPost(
        `${account}/ads`,
        {
          name: String(body.name || `${source.name} (copy)`),
          adset_id: adsetId,
          creative: { creative_id: creativeId },
          status,
        },
        token,
        'duplicate ad'
      )

      return json({ ok: true, ad_id: ad.id, from_ad_id: adId, status })
    }

    return json({ error: `Unknown action "${action}".` }, 400)
  } catch (err) {
    if (err instanceof GraphError) {
      return json({ error: err.message, detail: err.detail }, 502)
    }
    return json({ error: String(err instanceof Error ? err.message : err) }, 500)
  }
})
