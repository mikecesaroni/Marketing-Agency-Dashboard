// Can this ad set actually accept ads?
//
// Belk's publish put five ads into an ad set and all five came back with "Ad
// Set with Promoted Object Is Required". The ad set optimised for
// LEAD_GENERATION under an OUTCOME_LEADS campaign but named nothing to
// promote, and destination_type was UNDEFINED. Meta will not accept an ad into
// that, so every creative in the batch was doomed before the first image was
// uploaded.
//
// The ad set came from the CRM's own chat prompt, not from Ads Manager:
// meta-manage's create_adset only set promoted_object when the caller happened
// to pass promoted_page_id, while its default optimization_goal is
// LEAD_GENERATION -- which requires one. That is fixed there, at the source.
//
// IT CANNOT REPAIR, AND THAT IS NOT A CHOICE. The first version of this tried
// to add the missing promoted object. Meta refuses:
//
//   Invalid Promoted Object Update -- The update to the promoted object that
//   you have specified is invalid. The promoted object is immutable for most
//   cases.
//
// So a broken ad set stays broken and has to be replaced. All this can do is
// say so BEFORE a batch of creatives is uploaded into it -- which is the whole
// value, since the alternative is what happened to Belk: five ads built, five
// ads rejected, five identical error messages. A refusal carries copy_from, the
// budget and targeting of the ad set being abandoned, so rebuilding it does not
// mean a trip to Ads Manager with a notepad.
//
// A separate function rather than a change to meta-publish because that file is
// 70KB of ad-creating code and this does not belong inside it. It is called
// first, from the publish panel.
//
// Secrets: META_ACCESS_TOKEN.
//
// Body: {client_id, adset_id}

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

const bareId = (v: unknown) => String(v || '').replace(/^act_/i, '')

async function graphGet(path: string, fields: string, token: string) {
  const res = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${path}` +
      `?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`
  )
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error?.message || `Meta API returned ${res.status}`)
  return body
}

/**
 * What an ad set optimising this way has to promote.
 *
 * Same mapping the publisher uses when it creates one: a form lead is promoted
 * against the Page hosting the form, a website lead against the pixel that
 * reports it, and plain traffic promotes nothing.
 */
function needsFor(optimizationGoal: string, destinationType: string) {
  const goal = optimizationGoal.toUpperCase()
  const dest = destinationType.toUpperCase()

  if (goal === 'LEAD_GENERATION' || dest === 'ON_AD') {
    return { kind: 'form' as const, destination: 'ON_AD' }
  }
  if (goal === 'OFFSITE_CONVERSIONS') {
    return { kind: 'pixel' as const, destination: 'WEBSITE' }
  }
  return { kind: 'none' as const, destination: '' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({}, 200)

  const token = Deno.env.get('META_ACCESS_TOKEN')
  if (!token) return json({ error: 'META_ACCESS_TOKEN is not set on this project.' }, 500)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }

  const clientId = String(body.client_id || '')
  const adsetId = String(body.adset_id || '')
  if (!clientId || !adsetId) return json({ error: 'client_id and adset_id are required.' }, 400)

  const res = await fetch(
    `${supabaseUrl}/rest/v1/clients?id=eq.${encodeURIComponent(clientId)}` +
      `&select=id,name,meta_ad_account_id,meta_page_id,meta_pixel_id&limit=1`,
    { headers }
  )
  const client = ((await res.json()) || [])[0]
  if (!client) return json({ error: 'That client was not found.' }, 404)

  try {
    const adset = await graphGet(
      adsetId,
      'id,name,account_id,campaign_id,optimization_goal,destination_type,promoted_object,status,' +
        'daily_budget,lifetime_budget,start_time,targeting',
      token
    )

    // The ad set ID comes from the browser and the System User token can write
    // to every client's account, so this has to be checked here too rather than
    // relying on the publisher's own guard further down the line.
    if (bareId(adset?.account_id) !== bareId(client.meta_ad_account_id)) {
      return json(
        {
          error: `That ad set does not belong to ${client.name}'s ad account. Pick one from the list rather than pasting an ID.`,
        },
        400
      )
    }

    const need = needsFor(adset.optimization_goal || '', adset.destination_type || '')
    const hasPromoted =
      adset.promoted_object && Object.keys(adset.promoted_object).length > 0

    const report: Record<string, unknown> = {
      adset_id: adset.id,
      adset_name: adset.name,
      optimization_goal: adset.optimization_goal || null,
      destination_type: adset.destination_type || null,
      needs: need.kind,
      had_promoted_object: Boolean(hasPromoted),
    }

    if (need.kind === 'none' || hasPromoted) {
      return json({ ...report, ok: true })
    }

    // Named so the message can say what to make instead, rather than leaving
    // somebody to work out which Page or pixel was missing.
    const promotes =
      need.kind === 'form'
        ? client.meta_page_id
          ? `the Page ${client.meta_page_id}`
          : 'a Facebook Page, which is not set on this client'
        : client.meta_pixel_id
          ? `the pixel ${client.meta_pixel_id}`
          : 'a pixel, which is not set on this client'

    // Rebuilding is the only way out, so the numbers to rebuild with come back
    // with the refusal. Otherwise the next step is a trip to Ads Manager to
    // copy a budget and a list of radii by hand, which is where mistakes are.
    const copyFrom = {
      daily_budget: adset.daily_budget ? Number(adset.daily_budget) : null,
      lifetime_budget: adset.lifetime_budget ? Number(adset.lifetime_budget) : null,
      start_time: adset.start_time || null,
      age_min: adset.targeting?.age_min ?? null,
      age_max: adset.targeting?.age_max ?? null,
      geo_locations: adset.targeting?.geo_locations || null,
    }

    return json(
      {
        ...report,
        ok: false,
        copy_from: copyFrom,
        error:
          `"${adset.name}" cannot take any ads. It optimises for ` +
          `${adset.optimization_goal} but names nothing to promote, and Meta treats an ad ` +
          `set's promoted object as immutable — so it cannot be added now. Every ad ` +
          `published into it will be rejected with "Ad Set with Promoted Object Is Required".` +
          `\n\nMake a new ad set instead: the CRM sets the promoted object on the ones it ` +
          `creates, and would promote ${promotes}. Copy across the budget and targeting from ` +
          `this one, then publish into the new ad set.`,
      },
      400
    )
  } catch (err) {
    return json({ error: String(err instanceof Error ? err.message : err) }, 500)
  }
})
