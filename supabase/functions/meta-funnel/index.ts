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
//   Top of funnel   one campaign with a CAMPAIGN budget, one broad ad set,
//                   EXCLUDING the site visitors, the engagers and the leads.
//   Retargeting     one campaign with a CAMPAIGN budget, one ad set per warm
//                   audience, each EXCLUDING leads.
//
// Modelled on Horizon HVAC and Horizon Water Co read off the live API, not on
// a first guess -- an earlier draft put budget on the ad sets and forced
// advantage_audience off everywhere, and both live accounts do the opposite.
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
//   list_audiences   {client_id}          -> the saved audiences on the account
//   create_audiences {client_id}          -> the four standard audiences, if missing
//   inspect          {client_id}          -> campaigns and ad sets WITH targeting
//   create_funnel    {client_id, adsets:[...], ...} -> campaigns + ad sets
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
    // CREATE AUDIENCES — the four the live accounts run on, built from the
    // exact rule shapes read off Horizon HVAC, not from documentation.
    //
    // Every one of them follows one template, differing only in subtype,
    // event source and event name:
    //
    //   FB_Engagers_365D  ENGAGEMENT   page       page_engaged             365d
    //   IG_Engagers_365D  IG_BUSINESS  ig_business ig_business_profile_all  365d
    //   PageView_180D     WEBSITE      pixel      PageView                 180d
    //   Lead_180D         WEBSITE      pixel      Lead                     180d
    //
    // Idempotent by name: one that already exists is reported and left alone,
    // so this can be run on an account twice and on Horizon without making
    // duplicates. Each is attempted independently -- a client with a Page but
    // no pixel gets the two engager audiences and a clear reason for the two
    // it cannot have, not a failure.
    //
    // The Instagram account is not stored on the client. It is discovered from
    // the Page at creation time, because that is the only place it lives.
    // -----------------------------------------------------------------------
    if (action === 'create_audiences') {
      const YEAR = 365 * 86400
      const HALF_YEAR = 180 * 86400

      const existing = await graphGet(`${account}/customaudiences`, { fields: 'id,name', limit: '200' }, token)
      const byName: Record<string, string> = {}
      for (const a of existing.data || []) byName[String(a.name)] = String(a.id)

      // Read the Page FIRST, and treat not being able to as a finding rather
      // than swallowing it.
      //
      // Found on Reliable: the ad account is shared with the CRM's connection
      // but the Page is not. Meta still lists the Page (the ads reference it)
      // but returns it with a blank name, and creating a Page-engagement
      // audience against it fails with "#2654 Invalid Event Name" -- which
      // says nothing about permissions and sent the search towards the rule
      // shape, which was fine. An earlier version of this caught the Page
      // read error and moved on with igId = '', so the report said "no
      // Instagram linked" when the truth was "cannot see the Page at all".
      //
      // So: a Page that cannot be read means BOTH engager audiences are
      // skipped, with the one reason that fixes it -- the client has to grant
      // Page access, the same way they granted the ad account.
      let igId = ''
      let pageReadable = false
      let pageProblem = ''
      if (client.meta_page_id) {
        try {
          const page = await graphGet(
            String(client.meta_page_id),
            { fields: 'id,name,instagram_business_account' },
            token
          )
          // A Page the token can list but not read comes back with no name.
          pageReadable = Boolean(page?.name)
          igId = pageReadable ? String(page?.instagram_business_account?.id || '') : ''
          if (!pageReadable) {
            pageProblem =
              `the CRM's Meta connection can see this Page exists but cannot read it, which means the ad account was shared but the Page was not. Ask ${client.name} to give the agency Business access to the Page (Business Settings > Pages > Assign partner), then run this again.`
          }
        } catch (err) {
          pageProblem = `the CRM's Meta connection cannot read this Page: ${String(err instanceof Error ? err.message : err)}. The ad account is shared but the Page is not -- ask ${client.name} to assign the agency as a partner on the Page, then run this again.`
        }
      }

      const rule = (type: string, id: string, seconds: number, event: string) =>
        JSON.stringify({
          inclusions: {
            operator: 'or',
            rules: [
              {
                event_sources: [{ type, id: Number(id) }],
                retention_seconds: seconds,
                filter: { operator: 'and', filters: [{ field: 'event', operator: 'eq', value: event }] },
              },
            ],
          },
        })

      const wanted = [
        {
          name: 'FB_Engagers_365D',
          subtype: 'ENGAGEMENT',
          needs: client.meta_page_id && pageReadable,
          missing: !client.meta_page_id ? 'no Facebook Page on the client' : pageProblem,
          rule: () => rule('page', String(client.meta_page_id), YEAR, 'page_engaged'),
          prefill: 'Anyone who engaged with the Facebook Page in the last year.',
        },
        {
          name: 'IG_Engagers_365D',
          subtype: 'IG_BUSINESS',
          needs: igId,
          missing: !client.meta_page_id
            ? 'no Facebook Page on the client'
            : !pageReadable
              ? pageProblem
              : 'the Page has no Instagram business account linked',
          rule: () => rule('ig_business', igId, YEAR, 'ig_business_profile_all'),
          prefill: 'Anyone who engaged with the Instagram profile in the last year.',
        },
        {
          name: 'PageView_180D',
          subtype: 'WEBSITE',
          needs: client.meta_pixel_id,
          missing: 'no pixel on the client -- this one is built from website visits',
          rule: () => rule('pixel', String(client.meta_pixel_id), HALF_YEAR, 'PageView'),
          prefill: 'Anyone the pixel saw on the website in the last 180 days.',
        },
        {
          name: 'Lead_180D',
          subtype: 'WEBSITE',
          needs: client.meta_pixel_id,
          missing: 'no pixel on the client -- this one is built from the Lead event',
          rule: () => rule('pixel', String(client.meta_pixel_id), HALF_YEAR, 'Lead'),
          prefill: 'Anyone the pixel recorded a Lead for in the last 180 days.',
        },
      ]

      const results: any[] = []
      for (const w of wanted) {
        if (byName[w.name]) {
          results.push({ name: w.name, status: 'exists', id: byName[w.name] })
          continue
        }
        if (!w.needs) {
          results.push({ name: w.name, status: 'skipped', reason: w.missing })
          continue
        }
        try {
          const made = await graphPost(
            `${account}/customaudiences`,
            {
              name: w.name,
              subtype: w.subtype,
              description: w.prefill,
              rule: w.rule(),
              // Prefill backfills the audience with people who already
              // qualify, instead of starting from zero on the day it is made.
              prefill: true,
            },
            token,
            `create ${w.name}`
          )
          results.push({ name: w.name, status: 'created', id: String(made.id) })
        } catch (err) {
          results.push({ name: w.name, status: 'failed', reason: String(err instanceof Error ? err.message : err) })
        }
      }

      return json({
        ok: true,
        page_readable: pageReadable,
        page_problem: pageProblem || null,
        instagram_account: igId || null,
        results,
        created: results.filter((r) => r.status === 'created').length,
        note: 'A new engagement audience takes Meta up to an hour to populate, and shows as "not ready" until it does.',
      })
    }

    // -----------------------------------------------------------------------
    // INSPECT — what is actually set up on this account right now.
    //
    // The overview in meta-manage deliberately does not return `targeting`,
    // so it cannot answer the only question that matters here: which ad set
    // includes or excludes whom. Audience ids are resolved to names, because
    // a list of 15-digit ids is not something anybody can check a funnel
    // against.
    // -----------------------------------------------------------------------
    if (action === 'inspect') {
      const [campaigns, adsets, auds] = await Promise.all([
        graphGet(
          `${account}/campaigns`,
          {
            fields:
              'id,name,objective,status,effective_status,daily_budget,lifetime_budget,bid_strategy,created_time',
            limit: '100',
          },
          token
        ),
        graphGet(
          `${account}/adsets`,
          {
            fields:
              'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,' +
              'optimization_goal,billing_event,destination_type,promoted_object,targeting,created_time',
            limit: '200',
          },
          token
        ),
        graphGet(`${account}/customaudiences`, { fields: 'id,name', limit: '200' }, token).catch(
          () => ({ data: [] })
        ),
      ])

      const audName: Record<string, string> = {}
      for (const a of auds.data || []) audName[String(a.id)] = a.name

      const named = (list: any[]) =>
        (list || []).map((x: any) => ({
          id: String(x.id),
          name: audName[String(x.id)] || '(not on this account)',
        }))

      return json({
        client: client.name,
        campaigns: (campaigns.data || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          objective: c.objective,
          status: c.effective_status || c.status,
          // A campaign budget is the thing that quietly starves prospecting,
          // so it is reported even though it is usually null.
          campaign_budget: c.daily_budget || c.lifetime_budget || null,
          created: c.created_time,
        })),
        adsets: (adsets.data || []).map((a: any) => {
          const t = a.targeting || {}
          return {
            id: a.id,
            name: a.name,
            campaign_id: a.campaign_id,
            status: a.effective_status || a.status,
            daily_budget: a.daily_budget || null,
            optimization_goal: a.optimization_goal,
            destination_type: a.destination_type || null,
            promoted_object: a.promoted_object || null,
            include: named(t.custom_audiences),
            exclude: named(t.excluded_custom_audiences),
            age: [t.age_min ?? null, t.age_max ?? null],
            geo: Object.keys(t.geo_locations || {}).filter((k) => k !== 'location_types'),
            // The one setting that silently undoes an included audience.
            advantage_audience: t.targeting_automation?.advantage_audience ?? null,
            created: a.created_time,
          }
        }),
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

      // WHERE THE LEAD LANDS decides the optimisation goal and, with it, what
      // the ad set has to promote. Both live accounts run OFFSITE_CONVERSIONS
      // against the pixel -- these are website-lead campaigns, not instant
      // forms -- so that is the default whenever a pixel is on file.
      //
      // A promoted object is IMMUTABLE once the ad set exists. Getting this
      // wrong is not repairable later, which is why it is checked here rather
      // than discovered when a batch of creatives is refused.
      const goal = String(body.optimization_goal || (client.meta_pixel_id ? 'OFFSITE_CONVERSIONS' : 'LEAD_GENERATION')).toUpperCase()
      const needsPixel = goal === 'OFFSITE_CONVERSIONS'

      if (needsPixel && !client.meta_pixel_id) {
        return json(
          { error: `${client.name} has no Meta pixel set in the CRM, and an ad set optimising for website leads has to name the pixel that reports them. Set the pixel on the client, or pass optimization_goal: "LEAD_GENERATION" to run instant forms instead.` },
          400
        )
      }
      if (!needsPixel && !client.meta_page_id) {
        return json(
          { error: `${client.name} has no Facebook Page set in the CRM, and an instant-form ad set has to name the Page hosting the form. Set the Page on the client first.` },
          400
        )
      }

      // Budgets are per CAMPAIGN, so they arrive keyed by stage.
      const budgets: Record<string, any> = body.budget_cents || {}
      const stages = [...new Set(plan.map((a) => String(a.stage || 'tof')))]

      // EVERYTHING IS VALIDATED BEFORE ANYTHING IS CREATED.
      //
      // This used to check each ad set as it built it, which meant a bad ad
      // set left the campaign it belonged to already created and empty on the
      // client's account. Found the hard way: a test with one audience in both
      // lists was correctly refused and still left a paused, empty campaign on
      // Horizon Water Co. Campaigns cannot be deleted through this function,
      // so the only safe order is to refuse the whole plan up front.
      for (const stage of stages) {
        const cents = Math.round(Number(budgets[stage]) || 0)
        if (cents < MIN_DAILY_BUDGET_CENTS) {
          return json(
            { error: `The ${stage === 'retarget' ? 'retargeting' : 'top of funnel'} campaign has a daily budget of ${cents} cents. Meta's minimum is ${MIN_DAILY_BUDGET_CENTS}; a number this low is usually dollars entered where cents were meant.` },
            400
          )
        }
      }
      for (const spec of plan) {
        const inc = (spec.include || []).map((x: any) => String(x)).filter(Boolean)
        const exc = (spec.exclude || []).map((x: any) => String(x)).filter(Boolean)
        // An id in both lists is refused rather than sent. Meta resolves that
        // by excluding, so the ad set would deliver to nobody, report no error
        // and simply never spend -- which takes days to notice and reads like
        // a delivery problem rather than a targeting one.
        const clash = inc.filter((id: string) => exc.includes(id))
        if (clash.length > 0) {
          return json(
            { error: `"${spec.name}" has audience ${clash.join(', ')} in both its include and exclude lists. Meta would resolve that by excluding, so it would deliver to nobody and never say why.` },
            400
          )
        }
      }

      const stageBudget = (stage: string) => Math.round(Number(budgets[stage]) || 0)

      // Campaigns first, one per distinct stage in the plan.
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
            // Budget sits on the CAMPAIGN, as it does on every live campaign
            // in both accounts. The usual objection -- that Meta will move
            // money to the warm ad set and starve prospecting -- only applies
            // when cold and warm share one campaign. They do not: these are
            // two campaigns with two budgets, so within the retargeting
            // campaign letting Meta choose between engagers and visitors is
            // the wanted behaviour.
            daily_budget: stageBudget(stage),
            bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
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

        // The include/exclude clash was already refused in the validation
        // pass above, before any campaign existed.

        // Per ad set, not global. The live broad ad sets run with it ON and
        // the live retargeting ad sets run with it OFF, and both are right:
        // exclusions are honoured either way, so on a broad ad set with no
        // includes the expansion is free upside -- while on a retargeting ad
        // set it would let Meta deliver outside the very audience the ad set
        // exists to reach.
        const advantage = spec.advantage_audience === 1 ? 1 : 0

        const adset = await graphPost(
          `${account}/adsets`,
          {
            name: `${spec.name} — ${suffix}`,
            campaign_id: campaign.id,
            billing_event: 'IMPRESSIONS',
            optimization_goal: goal,
            // No bid_strategy here: it belongs to the campaign now that the
            // campaign holds the budget, and setting both is refused.
            ...(needsPixel
              ? { promoted_object: { pixel_id: String(client.meta_pixel_id), custom_event_type: 'LEAD' } }
              : { destination_type: 'ON_AD', promoted_object: { page_id: String(client.meta_page_id) } }),
            targeting: {
              geo_locations: geo,
              age_min: ageMin,
              age_max: ageMax,
              ...(include.length ? { custom_audiences: include.map((id) => ({ id })) } : {}),
              ...(exclude.length ? { excluded_custom_audiences: exclude.map((id) => ({ id })) } : {}),
              // NO location_types. Meta retired the field in September 2026 and
              // refuses any ad set carrying it (#1870194).
              targeting_automation: { advantage_audience: advantage },
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
          advantage_audience: advantage,
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
