// Builds a top-of-funnel and retargeting pair, in one call.
//
// WHY THIS IS ITS OWN FUNCTION. meta-publish ships one ad from the Studio and
// meta-manage is the chat's open-ended editor; both are working paths that
// spend money, and both are large. This does one narrow thing -- stand up the
// campaign and ad set skeleton with the right audiences attached -- and then
// gets out of the way. Creatives go into these ad sets afterwards through the
// ordinary publish flow, which already knows how to publish into an ad set
// that exists and now takes several at once.
//
// THE STRUCTURE, and the reason for it:
//
//   Top of funnel   one ad set, EXCLUDING leads, form openers and engagers.
//   Retargeting     one ad set per warm audience, each EXCLUDING leads.
//
// The exclusion on the top-of-funnel side is the entire point. Without it the
// two campaigns bid against each other in the same auction for the same
// people: the client pays twice to reach them, prospecting numbers are
// flattered by warm traffic they did not earn, and retargeting numbers are
// diluted by people who would have converted anyway. Everybody remembers to
// include engagers in retargeting; nearly everybody forgets to exclude them
// from prospecting.
//
// Everything is created PAUSED. Nothing here starts spending.
//
// Actions:
//   list_audiences {client_id}          -> the saved audiences on the account
//   create_funnel  {client_id, adsets:[...], ...} -> campaigns + ad sets
//
// Secrets: META_ACCESS_TOKEN.

const META_API_VERSION = 'v21.0'
const GRAPH = `https://graph.facebook.com/${META_API_VERSION}`

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Meta refuses an ad set below this, and well under it is nearly always a
// budget typed in dollars where cents were meant.
const MIN_DAILY_BUDGET_CENTS = 100

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

function actId(raw: unknown): string {
  const id = String(raw ?? '').trim()
  return id.startsWith('act_') ? id : `act_${id.replace(/\D/g, '')}`
}

function graphError(step: string, body: Record<string, any>, status: number): Error {
  const err = body?.error || {}
  const parts = [err.error_user_title, err.error_user_msg || err.message].filter(Boolean)
  return new Error(`${step}: ${parts.length ? parts.join(' - ') : `Meta returned ${status}`}`)
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

// Meta's write endpoints are form-encoded; nested structures go in as JSON
// strings, which is why objects are stringified rather than flattened.
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

  const res = await fetch(`${GRAPH}/${path}`, { method: 'POST', body: form })
  const body = await res.json()
  if (!res.ok) throw graphError(step, body, res.status)
  return body
}

function buildGeo(locations: any[]) {
  const geo: Record<string, unknown[]> = {}
  for (const loc of locations || []) {
    if (loc?.type === 'city') {
      ;(geo.cities ||= []).push({
        key: String(loc.key),
        radius: Math.min(50, Math.max(1, Number(loc.radius) || 25)),
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
  return geo
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)

  const token = Deno.env.get('META_ACCESS_TOKEN')
  if (!token) {
    return json(
      { error: 'META_ACCESS_TOKEN is not set on this project. Add it under Project Settings > Edge Functions > Secrets.' },
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

  const clientId = String(body.client_id || '').trim()
  if (!clientId) return json({ error: 'client_id is required.' }, 400)

  try {
    const client = await fetch(
      `${supabaseUrl}/rest/v1/clients?id=eq.${encodeURIComponent(clientId)}` +
        `&select=id,name,meta_ad_account_id,meta_page_id,meta_pixel_id`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    )
      .then((r) => r.json())
      .then((rows) => rows?.[0])

    if (!client) return json({ error: 'That client was not found.' }, 400)
    if (!client.meta_ad_account_id) {
      return json({ error: `${client.name} has no Meta ad account set in the CRM.` }, 400)
    }

    const account = actId(client.meta_ad_account_id)
    const action = String(body.action || 'list_audiences')

    // -----------------------------------------------------------------------
    // LIST AUDIENCES
    //
    // Read-only, deliberately. Building an engagement audience means choosing
    // event sources and a retention window that are the client's decision, and
    // one built wrong is worse than none: it silently narrows or widens who
    // gets paid for and nothing on the ad set says so. They are made once per
    // client in Ads Manager; this finds them and uses them.
    // -----------------------------------------------------------------------
    if (action === 'list_audiences') {
      // `rule` is not readable on every subtype and asking for a field the
      // account will not serve fails the WHOLE call, so it is requested
      // separately and its absence is not an error.
      const base =
        'id,name,subtype,description,approximate_count_lower_bound,delivery_status,operation_status,retention_days,time_created'
      let found: any
      try {
        found = await graphGet(`${account}/customaudiences`, { fields: `${base},rule`, limit: '200' }, token)
      } catch {
        found = await graphGet(`${account}/customaudiences`, { fields: base, limit: '200' }, token)
      }

      return json({
        audiences: (found.data || []).map((a: any) => ({
          id: a.id,
          name: a.name,
          subtype: a.subtype || null,
          description: a.description || null,
          // Meta will not deliver to an audience it considers too small, so
          // the picker has to be able to say so rather than let somebody build
          // a retargeting ad set around one that cannot serve.
          size: a.approximate_count_lower_bound ?? null,
          ready: a.delivery_status?.code === 200,
          status: a.delivery_status?.description || a.operation_status?.description || null,
          retention_days: a.retention_days ?? null,
          rule: a.rule ?? null,
        })),
      })
    }

    // -----------------------------------------------------------------------
    // CREATE FUNNEL
    // -----------------------------------------------------------------------
    if (action === 'create_funnel') {
      const plan: any[] = Array.isArray(body.adsets) ? body.adsets : []
      if (plan.length === 0) return json({ error: 'adsets is required and must not be empty.' }, 400)

      const geo = buildGeo(body.locations || [])
      if (Object.keys(geo).length === 0) {
        return json({ error: 'At least one location is required.' }, 400)
      }

      const ageMin = Number(body.age_min) || 25
      const ageMax = Number(body.age_max) || 65
      const suffix = String(body.name_suffix || new Date().toISOString().slice(0, 10))

      // A form ad set is promoted against the Page that hosts the form. This
      // is not optional: an ad set optimising for LEAD_GENERATION without one
      // accepts no ads at all, and Meta treats a promoted object as immutable
      // once the ad set exists, so there is no repairing it afterwards.
      if (!client.meta_page_id) {
        return json(
          { error: `${client.name} has no Facebook Page set in the CRM, and a lead ad set has to name the Page hosting the form. Set the Page on the client first.` },
          400
        )
      }

      // Campaigns first, one per distinct stage in the plan.
      const stages = [...new Set(plan.map((a) => String(a.stage || 'tof')))]
      const campaigns: Record<string, { id: string; name: string }> = {}
      const created: any[] = []

      for (const stage of stages) {
        const label = stage === 'retarget' ? 'Retargeting' : 'Top of funnel'
        const name = `${client.name} — ${label} — ${suffix}`
        const campaign = await graphPost(
          `${account}/campaigns`,
          {
            name,
            objective: 'OUTCOME_LEADS',
            status: 'PAUSED',
            special_ad_categories: JSON.stringify(body.special_ad_categories || []),
            // Budget sits on the AD SETS, not here. A campaign budget would
            // let Meta move money between the warm and cold ad sets, and it
            // always moves it to the warm one -- which is cheaper per lead and
            // also the one that runs out of people. Prospecting would quietly
            // stop, and the account would look like it was working right up
            // until the retargeting pool dried up.
          },
          token,
          `create the ${label.toLowerCase()} campaign`
        )
        campaigns[stage] = { id: String(campaign.id), name }
        created.push({ kind: 'campaign', stage, id: String(campaign.id), name })
      }

      // Then the ad sets.
      for (const spec of plan) {
        const stage = String(spec.stage || 'tof')
        const campaign = campaigns[stage]
        const include = [...new Set((spec.include || []).map((x: any) => String(x)).filter(Boolean))]
        const exclude = [...new Set((spec.exclude || []).map((x: any) => String(x)).filter(Boolean))]

        // An id in both lists is refused rather than sent. Meta resolves that
        // by excluding, so the ad set would deliver to nobody, report no error
        // and simply never spend -- which takes days to notice and reads like
        // a delivery problem rather than a targeting one.
        const both = include.filter((id) => exclude.includes(id))
        if (both.length > 0) {
          return json(
            { error: `"${spec.name}" has audience ${both.join(', ')} in both its include and exclude lists. Meta would resolve that by excluding, so it would deliver to nobody and never say why.` },
            400
          )
        }

        const budget = Math.round(Number(spec.budget_cents) || 0)
        if (budget < MIN_DAILY_BUDGET_CENTS) {
          return json(
            { error: `"${spec.name}" has a daily budget of ${budget} cents. Meta's minimum is ${MIN_DAILY_BUDGET_CENTS}; a number this low is usually dollars entered where cents were meant.` },
            400
          )
        }

        const adset = await graphPost(
          `${account}/adsets`,
          {
            name: `${spec.name} — ${suffix}`,
            campaign_id: campaign.id,
            daily_budget: budget,
            billing_event: 'IMPRESSIONS',
            optimization_goal: 'LEAD_GENERATION',
            bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
            destination_type: 'ON_AD',
            promoted_object: { page_id: String(client.meta_page_id) },
            targeting: {
              geo_locations: geo,
              age_min: ageMin,
              age_max: ageMax,
              ...(include.length ? { custom_audiences: include.map((id) => ({ id })) } : {}),
              ...(exclude.length ? { excluded_custom_audiences: exclude.map((id) => ({ id })) } : {}),
              // NO location_types. Meta retired the field in September 2026 and
              // refuses any ad set carrying it (#1870194).
              //
              // advantage_audience stays OFF, and it matters more here than
              // anywhere else: with it on, Meta treats an included audience as
              // a suggestion and delivers outside it when it likes, which
              // turns a retargeting ad set back into a cold one without saying
              // so -- and quietly undoes the separation this whole structure
              // exists to create.
              targeting_automation: { advantage_audience: 0 },
            },
            status: 'PAUSED',
          },
          token,
          `create the "${spec.name}" ad set`
        )

        created.push({
          kind: 'adset',
          stage,
          key: spec.key || null,
          id: String(adset.id),
          name: `${spec.name} — ${suffix}`,
          campaign_id: campaign.id,
          include,
          exclude,
          budget_cents: budget,
        })
      }

      return json({
        ok: true,
        created,
        campaigns: Object.entries(campaigns).map(([stage, c]) => ({ stage, ...c })),
        adsets: created.filter((c) => c.kind === 'adset'),
        ads_manager_url: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${account.replace('act_', '')}`,
        note: 'Everything was created paused. Publish creatives into these ad sets from the Ad Studio, then switch them on in Ads Manager.',
      })
    }

    return json({ error: `Unknown action "${action}".` }, 400)
  } catch (err) {
    return json({ error: String(err instanceof Error ? err.message : err) }, 500)
  }
})
