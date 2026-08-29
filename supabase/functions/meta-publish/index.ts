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
//     gets accounts flagged. This holds even when the new ad is dropped into
//     an ad set that is already running: the ad set keeps delivering whatever
//     it was delivering, and the new ad sits switched off inside it.
//   * A call creates at most MAX_BATCH_ADS ads, all into one ad set, all from
//     creatives a human composed and saved. It was one ad per call until
//     launching a client meant four statics and three sizes each; what stops
//     this being unattended ad generation is not the count but that every
//     image already exists in the bucket, the objects are all paused, and a
//     person pressed the button. There is no retry loop and no schedule.
//   * The only writes to existing objects are attaching a new ad set to a
//     campaign the caller explicitly picked, attaching a new ad to an ad set
//     the caller explicitly picked, and PAUSING an ad the Ad Doctor flagged.
//     All three are additive or spend-reducing: nothing already in the account
//     changes shape. Pausing is the one modification allowed because it only
//     ever reduces spend and is fully reversible in Ads Manager - and it still
//     happens behind a human click, never on a schedule.
//
// Secrets: META_ACCESS_TOKEN (same System User token the KPI sync uses).
//
// Actions, sent as {"action": "..."} in the body:
//
//   search_locations  {query}                 -> Meta's geo targeting keys
//   list_campaigns    {client_id}             -> existing campaigns, to reuse
//   list_adsets       {client_id, campaign_id}-> existing ad sets, to reuse
//   discover_assets   {client_id}             -> the Page and pixel to use
//   list_lead_forms   {client_id}             -> instant forms on the Page
//   create_lead_form  {client_id, ...}        -> a new instant form
//   publish           {client_id, ...}        -> campaign/adset/creative/ad
//   publish_batch     {client_id, ads:[...]}  -> several ads into ONE ad set
//   pause_ad          {client_id, ad_id}      -> sets one ad to PAUSED
//
// Either publish action takes dry_run:true to have Meta check the creative
// payload and save nothing.

const META_API_VERSION = 'v21.0'
const GRAPH = `https://graph.facebook.com/${META_API_VERSION}`

// Meta will not create an ad set below this. Well under it is almost always a
// typo — a budget entered in dollars where cents were meant.
const MIN_DAILY_BUDGET_CENTS = 100

// How many creatives one batch may publish. Each one is three image uploads, a
// creative and an ad — roughly eight seconds — and an Edge Function does not
// run forever. Eight is comfortably inside the limit and well past the four or
// five a launch actually needs. Each ad is recorded the moment it exists, so
// even a run that is cut short leaves an accurate trail rather than a mystery.
const MAX_BATCH_ADS = 8

// "Select an Instagram account or a Facebook Page to represent your business on
// Instagram." Raised at ad creation when a per-placement creative is used and
// the client has no Instagram identity for the placements the ad set delivers
// to. A plain single-image ad never hits it, which is why it went unnoticed
// until all three sizes went into one ad.
const IG_IDENTITY_SUBCODE = 1772103

type Objective = 'TRAFFIC' | 'LEADS_WEBSITE' | 'LEADS_FORM'

type ObjectiveSpec = {
  // What the CAMPAIGN is created with. Two of the three share OUTCOME_LEADS
  // and differ only at the ad set, which is exactly why these are keyed by an
  // internal name rather than by Meta's objective enum.
  campaign_objective: string
  optimization_goal: string
  billing_event: string
  destination_type?: string
  needs_pixel: boolean
  needs_form: boolean
  label: string
}

// Each objective needs a matching optimisation goal and, depending on where
// the lead lands, a promoted object. Getting this combination wrong is the
// single most common way an ad set create fails, so the valid pairings live
// here rather than being assembled ad hoc at the call site.
const OBJECTIVES: Record<Objective, ObjectiveSpec> = {
  TRAFFIC: {
    campaign_objective: 'OUTCOME_TRAFFIC',
    optimization_goal: 'LANDING_PAGE_VIEWS',
    billing_event: 'IMPRESSIONS',
    needs_pixel: false,
    needs_form: false,
    label: 'Traffic',
  },
  LEADS_WEBSITE: {
    // Optimising against the pixel's Lead event, with the form on the
    // advertiser's own site.
    campaign_objective: 'OUTCOME_LEADS',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    billing_event: 'IMPRESSIONS',
    destination_type: 'WEBSITE',
    needs_pixel: true,
    needs_form: false,
    label: 'Leads (website)',
  },
  LEADS_FORM: {
    // The form opens inside Facebook and Meta prefills what it knows, so
    // there is no landing page and no page load to lose people at. The form
    // itself lives on the Page, not the ad account.
    campaign_objective: 'OUTCOME_LEADS',
    optimization_goal: 'LEAD_GENERATION',
    billing_event: 'IMPRESSIONS',
    destination_type: 'ON_AD',
    needs_pixel: false,
    needs_form: true,
    label: 'Leads (instant form)',
  },
}

// The first deployment sent Meta's raw enum. Nothing has been published with
// it yet, but accepting both costs one lookup and means an older cached bundle
// cannot start failing mid-session.
const OBJECTIVE_ALIASES: Record<string, Objective> = {
  OUTCOME_TRAFFIC: 'TRAFFIC',
  OUTCOME_LEADS: 'LEADS_WEBSITE',
}

/**
 * Reads an existing ad set back into one of the three objectives above.
 *
 * When an ad is published into an ad set that already exists, the objective is
 * not the caller's to choose — it was fixed when the campaign was created, and
 * the ad set's optimisation goal is what actually decides the shape of the
 * creative. An instant-form ad set needs a creative whose button carries a
 * lead_gen_form_id; a traffic ad set needs one that carries a link. Sending
 * the wrong one is a rejected creative, so this reads the truth off the ad set
 * rather than trusting what the form was left set to.
 *
 * LEAD_GENERATION is the goal on an instant-form ad set; ON_AD is the
 * destination that says the form opens inside Facebook. Either one alone is
 * enough to know a form is required.
 */
function adsetObjective(adset: Record<string, any>): Objective {
  const goal = String(adset?.optimization_goal || '').toUpperCase()
  const destination = String(adset?.destination_type || '').toUpperCase()

  if (goal === 'LEAD_GENERATION' || destination === 'ON_AD') return 'LEADS_FORM'
  if (goal === 'OFFSITE_CONVERSIONS') return 'LEADS_WEBSITE'
  return 'TRAFFIC'
}

// Standard fields Meta prefills from the viewer's profile, plus CUSTOM for
// anything asked in the advertiser's own words. Prefilled answers are why an
// instant form converts: most people submit without typing anything.
const STANDARD_QUESTIONS = new Set([
  'FULL_NAME',
  'FIRST_NAME',
  'LAST_NAME',
  'EMAIL',
  'PHONE',
  'STREET_ADDRESS',
  'CITY',
  'STATE',
  'ZIP',
  'POST_CODE',
  'COUNTRY',
  'COMPANY_NAME',
  'JOB_TITLE',
])

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
async function graphPost(
  path: string,
  params: Record<string, unknown>,
  token: string,
  step: string,
  method = 'POST'
) {
  const form = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    form.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
  }
  form.set('access_token', token)

  const res = await fetch(`${GRAPH}/${path}`, {
    method,
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
 * Trades the System User token for a Page token.
 *
 * Lead forms are a Page resource, not an ad account one, and Page endpoints
 * will not take a user-level token.
 *
 * This asks /me/accounts rather than the Page directly, and the difference is
 * the whole feature. Reading access_token off /{page-id} needs
 * pages_read_engagement; this System User token does not have it, so that call
 * fails, the catch below hands back the original token, and Meta then rejects
 * the form call with "(#190) This method must be called with a Page Access
 * Token" — an error about the wrong thing entirely, at a later step, which is
 * exactly how it went unnoticed. /me/accounts needs only pages_show_list, which
 * the token does have, and returns the same access_token for every Page the
 * system user has a role on.
 *
 * The direct read stays as a second attempt: on a setup that does carry
 * pages_read_engagement it works, and on one where the Page is reachable but
 * not enumerable it is the only thing that does.
 */
async function pageToken(pageId: string, token: string): Promise<string> {
  try {
    const owned = await graphGet('me/accounts', { fields: 'id,access_token', limit: '100' }, token)
    const match = (owned?.data || []).find((p: any) => String(p.id) === String(pageId))
    if (match?.access_token) return match.access_token
  } catch {
    // Not fatal on its own — the direct read below may still work.
  }

  try {
    const res = await graphGet(pageId, { fields: 'access_token' }, token)
    return res?.access_token || token
  } catch {
    // Handing back the System User token means the caller fails with #190
    // rather than something that names the Page. Better than refusing outright:
    // some setups do accept it, and a working call beats a pre-emptive no.
    return token
  }
}

/**
 * Turns the CRM's question list into the shape Meta's form builder expects.
 *
 * Standard types are prefilled from the viewer's profile, which is the entire
 * reason an instant form converts — most people submit without typing. A
 * custom question is a real question and costs completions, so the UI keeps
 * them to a minimum.
 */
function buildQuestions(questions: any[]): Record<string, string>[] {
  const built: Record<string, string>[] = []

  for (const q of questions || []) {
    const type = String(q?.type || '').toUpperCase()
    if (STANDARD_QUESTIONS.has(type)) {
      built.push({ type })
    } else if (type === 'CUSTOM' && q?.label) {
      built.push({
        type: 'CUSTOM',
        label: String(q.label),
        // Meta keys the answer by this, and it is what shows up in the CSV
        // export, so it has to be stable and free of punctuation.
        key: String(q.key || q.label)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 60),
      })
    }
  }

  return built
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
        radius: clampRadius(loc.radius),
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

/**
 * Which placements each artboard is actually shaped for.
 *
 * The Studio renders every ad at three aspect ratios, and until now publishing
 * threw two of them away: one publish sent one image, so covering feed and
 * Stories meant two separate ads, which means two sets of results to read and
 * a budget split across them. Meta's answer is placement asset customization —
 * one ad holding all three images, each mapped to the placements it fits.
 *
 * `feed` is deliberately absent: it is the default rule, so it catches every
 * placement the two entries below do not claim. That matters because the rules
 * have to cover everything the ad set can deliver to, and new placements keep
 * appearing — a default rule cannot go stale, an exhaustive list can.
 */
const PLACEMENTS: Record<string, Record<string, string[]>> = {
  // 9:16. Both story surfaces and both reels surfaces, which since Meta's 2026
  // unification share one safe area.
  story: {
    publisher_platforms: ['facebook', 'instagram'],
    facebook_positions: ['story', 'facebook_reels'],
    instagram_positions: ['story', 'reels'],
  },
  // 1:1. The placements that crop a tall image badly or refuse it outright —
  // right column is the strict one, it has never accepted vertical.
  square: {
    publisher_platforms: ['facebook', 'instagram'],
    facebook_positions: ['right_hand_column', 'marketplace', 'search'],
    instagram_positions: ['explore', 'explore_home'],
  },
}

// Which image stands in as the default rule, best first. 4:5 is Meta's own
// recommendation for feed and is the least bad thing to show anywhere else.
const DEFAULT_SIZE_ORDER = ['feed', 'square', 'story']

type CreativeInput = {
  name: string
  pageId: string
  linkUrl: string
  primaryText: string
  headline?: string
  description?: string
  ctaType: string
  spec: ObjectiveSpec
  leadFormId?: string
  // size_key -> image hash, in the ad account.
  hashes: Record<string, string>
}

/**
 * Opting out of Meta's automatic image and text tweaks.
 *
 * The whole point of the Studio is a deliberately composited frame with the
 * copy placed inside the safe area; letting Meta crop it or rewrite the
 * headline undoes that.
 *
 * This used to be one `standard_enhancements` flag. Meta deprecated it, and the
 * deprecation is a hard rejection rather than a warning — every creative sent
 * with it comes back "Creative should not include standard enhancements",
 * which means publishing was failing outright until this changed. The
 * replacement is per-feature, so each tweak we do not want is named.
 */
const NO_ENHANCEMENTS = {
  creative_features_spec: {
    image_touchups: { enroll_status: 'OPT_OUT' },
    text_generation: { enroll_status: 'OPT_OUT' },
    image_brightness_and_contrast: { enroll_status: 'OPT_OUT' },
  },
}

/**
 * Builds the POST body for one ad creative.
 *
 * Two shapes come out of here, and which one depends only on how many sizes
 * were saved:
 *
 *   * One image — the plain object_story_spec creative. Unchanged from before
 *     this function existed, and the fallback whenever there is nothing to
 *     customise between placements.
 *   * Two or three — asset_feed_spec with one customisation rule per size, so
 *     a single ad serves the right crop to each placement.
 *
 * The copy is the same in both, and in the multi-image shape it is declared
 * once and referenced by label from every rule rather than repeated per rule.
 */
function creativeParams(input: CreativeInput): Record<string, unknown> {
  const { hashes, spec, leadFormId, linkUrl, primaryText, headline, description, ctaType } = input
  const sizeKeys = Object.keys(hashes)

  // Single image: the long-proven path, and the one lead-form ads have always
  // published through.
  if (sizeKeys.length <= 1) {
    return {
      name: input.name,
      object_story_spec: {
        page_id: input.pageId,
        link_data: {
          link: linkUrl,
          message: primaryText,
          name: headline || undefined,
          description: description || undefined,
          image_hash: hashes[sizeKeys[0]],
          // The form id on the CTA is what makes this a lead ad: tapping the
          // button opens the form in place instead of following the link.
          call_to_action: {
            type: ctaType,
            value: spec.needs_form ? { lead_gen_form_id: leadFormId } : { link: linkUrl },
          },
        },
      },
      degrees_of_freedom_spec: NO_ENHANCEMENTS,
    }
  }

  // The default rule's image. Whichever of feed/square/story is present and
  // highest in DEFAULT_SIZE_ORDER; there is always one, because two or more
  // sizes got us here.
  const defaultSize = DEFAULT_SIZE_ORDER.find((k) => hashes[k]) as string

  const images = sizeKeys.map((key) => ({
    hash: hashes[key],
    adlabels: [{ name: `img_${key}` }],
  }))

  const rules: Record<string, unknown>[] = []
  for (const key of sizeKeys) {
    // The default goes last, after every rule that claims specific placements,
    // so it is unambiguous which one is the catch-all.
    if (key === defaultSize) continue
    if (!PLACEMENTS[key]) continue
    rules.push({
      customization_spec: PLACEMENTS[key],
      image_label: { name: `img_${key}` },
      body_label: { name: 'body' },
      title_label: headline ? { name: 'title' } : undefined,
      description_label: description ? { name: 'desc' } : undefined,
      link_url_label: { name: 'link' },
    })
  }
  // The default rule, and Meta is exacting about its shape: `customization_spec`
  // must be PRESENT and EMPTY, `is_default` must be true, and it must come last
  // — "Default Asset Customization Rule (with lowest priority) with empty
  // customization_spec is required". Omitting the key, filling it in, or moving
  // the flag inside it all fail, and two of those fail with a generic "something
  // went wrong" that names nothing. Verified against the live API.
  rules.push({
    customization_spec: {},
    is_default: true,
    image_label: { name: `img_${defaultSize}` },
    body_label: { name: 'body' },
    title_label: headline ? { name: 'title' } : undefined,
    description_label: description ? { name: 'desc' } : undefined,
    link_url_label: { name: 'link' },
  })

  return {
    name: input.name,
    // In this shape object_story_spec carries the Page and nothing else: the
    // link, copy and image all move into the feed spec, and Meta rejects the
    // creative if they are declared in both places.
    object_story_spec: { page_id: input.pageId },
    asset_feed_spec: {
      ad_formats: ['SINGLE_IMAGE'],
      images,
      bodies: [{ text: primaryText, adlabels: [{ name: 'body' }] }],
      titles: headline ? [{ text: headline, adlabels: [{ name: 'title' }] }] : undefined,
      descriptions: description ? [{ text: description, adlabels: [{ name: 'desc' }] }] : undefined,
      link_urls: [{ website_url: linkUrl, adlabels: [{ name: 'link' }] }],
      call_to_action_types: [ctaType],
      // A form ad's destination is the form itself rather than a URL. In the
      // single-image shape this rides on the CTA; asset_feed_spec has no room
      // for a value there, so it goes in its own list.
      onsite_destinations: spec.needs_form ? [{ lead_gen_form_id: leadFormId }] : undefined,
      asset_customization_rules: rules,
    },
    degrees_of_freedom_spec: NO_ENHANCEMENTS,
  }
}

type BuildAdInput = {
  account: string
  token: string
  client: Record<string, any>
  spec: ObjectiveSpec
  linkUrl: string
  leadFormId?: string
  ctaType: string
  adsetId: string
  // size_key -> public bucket URL. One entry publishes a plain creative;
  // several publish one ad that serves the right crop per placement.
  images: Record<string, string>
  primaryText: string
  headline?: string
  description?: string
  adName?: string
  // Filled in as each object comes into existence, so a failure halfway can
  // report what is already sitting in the account.
  into?: Record<string, string>
  // Ask Meta to check the creative and throw it away rather than save it.
  // Placement asset customization has a fussy payload and the useful feedback
  // comes from Meta itself, so there has to be a way to get that feedback
  // without leaving half-built objects in a client's real ad account.
  dryRun?: boolean
}

/**
 * Images -> creative -> ad, for one ad.
 *
 * Pulled out of the publish action because the batch path needs exactly the
 * same three steps, once per creative, into the same ad set. Everything it
 * touches is passed in: it creates nothing that outlives the ad set it is
 * given, and it never decides which ad set that is.
 */
async function buildAd(input: BuildAdInput) {
  const entries = Object.entries(input.images).filter(([, url]) => Boolean(url))
  if (entries.length === 0) {
    throw new GraphError('No ad image was given to publish.', { step: 'upload image' })
  }

  // In parallel: three artboards is three round trips to Meta, and they do not
  // depend on each other. Sequentially this is the slowest part of a publish.
  const uploaded = await Promise.all(
    entries.map(async ([key, url]) => [key, await uploadImage(input.account, url, input.token)] as const)
  )
  const hashes = Object.fromEntries(uploaded)
  if (input.into) input.into.image_hash = uploaded[0][1]

  const params = creativeParams({
    name: `${input.adName || input.client.name} — creative`,
    pageId: input.client.meta_page_id,
    linkUrl: input.linkUrl,
    primaryText: input.primaryText,
    headline: input.headline,
    description: input.description,
    ctaType: input.ctaType,
    spec: input.spec,
    leadFormId: input.leadFormId,
    hashes,
  })

  // A dry run stops here: Meta validates the creative and saves nothing, so
  // there is no ad to create and nothing to clean up afterwards.
  if (input.dryRun) {
    await graphPost(
      `${input.account}/adcreatives`,
      { ...params, execution_options: ['validate_only'] },
      input.token,
      'validate creative'
    )
    return {
      creative_id: '',
      ad_id: '',
      image_hashes: hashes,
      sizes: Object.keys(hashes),
      validated: params,
    }
  }

  let creative = await graphPost(
    `${input.account}/adcreatives`,
    params,
    input.token,
    'create creative'
  )
  if (input.into) input.into.creative_id = creative.id

  const adParams = (creativeId: string) => ({
    name: input.adName || `${input.client.name} — ${new Date().toISOString().slice(0, 10)}`,
    adset_id: input.adsetId,
    creative: { creative_id: creativeId },
    // Never anything but PAUSED, including into an ad set that is already
    // running. The ad set keeps delivering what it was delivering; this ad
    // sits switched off inside it until a human turns it on.
    status: 'PAUSED',
  })

  let ad: Record<string, any>
  let fellBack = false
  try {
    ad = await graphPost(`${input.account}/ads`, adParams(creative.id), input.token, 'create ad')
  } catch (err) {
    // A per-placement creative needs an Instagram identity to represent the
    // business wherever the ad set delivers to Instagram, and Meta will not
    // infer one the way it does for a plain single-image ad. Where the client
    // has no Instagram account linked, this is the error — and it arrives at
    // the AD step, after a perfectly valid creative already exists.
    //
    // Failing the whole publish over it would be the wrong trade: the ad the
    // user actually asked for can still be made, just without the per-placement
    // crops. So it falls back to the default size alone and says so, and starts
    // working by itself the day an Instagram account is connected.
    const igIdentity =
      err instanceof GraphError && Number((err.detail as any)?.subcode) === IG_IDENTITY_SUBCODE
    if (!igIdentity || Object.keys(hashes).length <= 1) throw err

    const only = DEFAULT_SIZE_ORDER.find((k) => hashes[k]) || Object.keys(hashes)[0]
    const fallback = creativeParams({
      name: `${input.adName || input.client.name} — creative`,
      pageId: input.client.meta_page_id,
      linkUrl: input.linkUrl,
      primaryText: input.primaryText,
      headline: input.headline,
      description: input.description,
      ctaType: input.ctaType,
      spec: input.spec,
      leadFormId: input.leadFormId,
      hashes: { [only]: hashes[only] },
    })

    const plain = await graphPost(
      `${input.account}/adcreatives`,
      fallback,
      input.token,
      'create creative'
    )
    ad = await graphPost(`${input.account}/ads`, adParams(plain.id), input.token, 'create ad')

    // The per-placement creative was never attached to anything and never will
    // be. Deleting it is safe in a way deleting campaigns and ad sets is not:
    // this call made it seconds ago, no ad references it, so nothing live can
    // come down with it. Left alone it would pile up one orphan per publish.
    await graphPost(String(creative.id), {}, input.token, 'discard creative', 'DELETE').catch(
      () => {}
    )

    creative = plain
    fellBack = true
    if (input.into) input.into.creative_id = plain.id
  }

  if (input.into) input.into.ad_id = ad.id

  return {
    creative_id: creative.id as string,
    ad_id: ad.id as string,
    image_hashes: hashes,
    // What the ad ACTUALLY carries, which after a fallback is one size, not
    // three. This is what gets recorded, so it has to be the truth.
    sizes: fellBack ? [DEFAULT_SIZE_ORDER.find((k) => hashes[k]) as string] : Object.keys(hashes),
    per_placement: Object.keys(hashes).length > 1 && !fellBack,
    needs_instagram: fellBack,
    validated: undefined as Record<string, unknown> | undefined,
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
      `${supabaseUrl}/rest/v1/clients?select=id,name,meta_ad_account_id,meta_page_id,meta_pixel_id,website_url,privacy_policy_url&id=eq.${encodeURIComponent(clientId)}`,
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

    // -----------------------------------------------------------------------
    // Existing ad sets, so a new creative can be dropped into one that is
    // already built — the same ad set the chat made, or a live one that is to
    // be tested against a second image.
    //
    // Scoped to a campaign when one is given. An ad set belongs to exactly one
    // campaign, so picking the campaign first is what makes the list short
    // enough to read.
    // -----------------------------------------------------------------------
    if (action === 'list_adsets') {
      const campaignId = String(body.campaign_id || '').trim()

      const found = await graphGet(
        campaignId ? `${campaignId}/adsets` : `${account}/adsets`,
        {
          // optimization_goal and destination_type are what decide whether the
          // creative needs a lead form; daily_budget and status are what the
          // picker shows so nobody drops an ad into a live $200/day ad set by
          // accident.
          fields:
            'id,name,status,effective_status,account_id,campaign_id,daily_budget,lifetime_budget,optimization_goal,destination_type',
          limit: '100',
        },
        token
      )

      const adsets = (found.data || [])
        // campaign_id arrives in the request, and the token can see every
        // client's account. Filtering by the account this client is actually
        // connected to means a campaign ID from somewhere else lists nothing
        // rather than another client's ad sets.
        .filter((a: any) => actId(String(a.account_id || '')) === account)
        .map((a: any) => ({
          ...a,
          // Read back the same way publish will read it, so the picker and the
          // publish cannot disagree about what kind of ad set this is.
          objective: adsetObjective(a),
          // Live means the new ad lands next to ads that are already spending.
          // Worth saying out loud in the picker.
          live: String(a.effective_status || a.status || '').toUpperCase() === 'ACTIVE',
        }))

      return json({ adsets })
    }

    // -----------------------------------------------------------------------
    // Asset discovery. The token can already see which Page and pixel belong
    // to this ad account, so there is no reason to make anyone copy IDs out of
    // Business Settings by hand.
    // -----------------------------------------------------------------------
    if (action === 'discover_assets') {
      const pages = new Map<string, { id: string; name: string; ads_using: number }>()

      // The strongest signal by far: the Page this account's existing ads
      // already post as. Whatever Business Settings says is assignable, THIS is
      // what the client actually advertises with.
      try {
        const creatives = await graphGet(
          `${account}/adcreatives`,
          { fields: 'object_story_spec{page_id}', limit: '100' },
          token
        )
        for (const c of creatives.data || []) {
          const id = c?.object_story_spec?.page_id
          if (!id) continue
          const seen = pages.get(id)
          pages.set(id, { id, name: '', ads_using: (seen?.ads_using || 0) + 1 })
        }
      } catch {
        // A brand new account has no creatives to learn from. Not an error —
        // the fallback below still finds assignable Pages.
      }

      // Everything the token can manage, so a client with no ads yet still has
      // something to pick from.
      try {
        const owned = await graphGet('me/accounts', { fields: 'id,name', limit: '100' }, token)
        for (const p of owned.data || []) {
          if (!pages.has(p.id)) pages.set(p.id, { id: p.id, name: p.name || '', ads_using: 0 })
        }
      } catch {
        // Some system user tokens cannot enumerate Pages this way. The
        // creative-derived list above is the one that matters.
      }

      // Fill in names for anything discovered from a creative, which only
      // carries the bare ID.
      for (const page of pages.values()) {
        if (page.name) continue
        try {
          const detail = await graphGet(page.id, { fields: 'name' }, token)
          page.name = detail?.name || ''
        } catch {
          // A Page the token can advertise for but not read is still usable.
        }
      }

      let pixels: { id: string; name: string }[] = []
      try {
        const found = await graphGet(`${account}/adspixels`, { fields: 'id,name', limit: '25' }, token)
        pixels = (found.data || []).map((x: any) => ({ id: x.id, name: x.name || '' }))
      } catch {
        // No pixel is a normal state, and only the website-lead objective
        // needs one.
      }

      // Most-used Page first: that is the suggestion, and the count is what
      // justifies it to whoever is looking at the screen.
      const ranked = [...pages.values()].sort((a, b) => b.ads_using - a.ads_using)

      return json({
        pages: ranked,
        pixels,
        suggested_page_id: ranked[0]?.id || null,
        suggested_pixel_id: pixels.length === 1 ? pixels[0].id : null,
      })
    }

    // -----------------------------------------------------------------------
    // Instant forms. Both of these are Page operations, not ad account ones,
    // which is why they take a Page token.
    // -----------------------------------------------------------------------
    if (action === 'list_lead_forms' || action === 'create_lead_form') {
      if (!client.meta_page_id) {
        return json(
          {
            error: `${client.name} has no Facebook Page ID set. Instant forms live on the Page, so there is nowhere to put one yet.`,
          },
          400
        )
      }

      const pToken = await pageToken(client.meta_page_id, token)

      if (action === 'list_lead_forms') {
        // leads_count is the reason to reuse a form rather than make a new one
        // per ad: a form owns its leads, and five near-identical forms means
        // five places to go looking for them.
        const found = await graphGet(
          `${client.meta_page_id}/leadgen_forms`,
          { fields: 'id,name,status,leads_count,created_time', limit: '50' },
          pToken
        )
        return json({ forms: found.data || [] })
      }

      const questions = buildQuestions(body.questions)
      if (questions.length === 0) {
        return json({ error: 'A form needs at least one question.' }, 400)
      }

      const privacyUrl = body.privacy_policy_url || client.privacy_policy_url
      if (!privacyUrl) {
        return json(
          {
            error: `Meta requires a privacy policy URL on every instant form. Add one for ${client.name} on their Meta card, or type one on the form.`,
          },
          400
        )
      }

      const form = await graphPost(
        `${client.meta_page_id}/leadgen_forms`,
        {
          name: body.form_name || `${client.name} — enquiries`,
          questions,
          privacy_policy: { url: privacyUrl, link_text: 'Privacy Policy' },
          // Where the thank-you screen's button goes. Meta wants somewhere to
          // send people after they submit; the client's own site is the
          // natural answer, and the privacy page is a valid fallback.
          follow_up_action_url: body.follow_up_url || client.website_url || privacyUrl,
          locale: 'EN_US',
          // The form is only reachable from the ad, so there is no reason to
          // hide it from people the ad was not targeted at.
          block_display_for_non_targeted_viewer: false,
          ...(body.thank_you_message
            ? {
                thank_you_page: {
                  title: 'Thanks — we got it',
                  body: body.thank_you_message,
                  button_type: 'VIEW_WEBSITE',
                  website_url: body.follow_up_url || client.website_url || privacyUrl,
                },
              }
            : {}),
        },
        pToken,
        'create instant form'
      )

      return json({ ok: true, form_id: form.id, name: body.form_name || null })
    }

    // -----------------------------------------------------------------------
    // Pause one ad. The Ad Doctor's kill verdicts land here when somebody
    // clicks them. Spend-reducing and reversible - the safe direction.
    // -----------------------------------------------------------------------
    if (action === 'pause_ad') {
      const adId = String(body.ad_id || '').trim()
      if (!adId) return json({ error: 'ad_id is required.' }, 400)

      await graphPost(adId, { status: 'PAUSED' }, token, 'pause ad')

      // Reflected locally so the CRM shows it paused now rather than after
      // tomorrow's sync. Best effort - Meta already did the real thing.
      await fetch(
        `${supabaseUrl}/rest/v1/ad_daily?client_id=eq.${encodeURIComponent(clientId)}&ad_id=eq.${encodeURIComponent(adId)}`,
        {
          method: 'PATCH',
          headers: { ...dbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ effective_status: 'PAUSED' }),
        }
      ).catch(() => {})

      return json({ ok: true, ad_id: adId, status: 'PAUSED' })
    }

    if (action !== 'publish' && action !== 'publish_batch') {
      return json({ error: `Unknown action "${action}".` }, 400)
    }

    // -----------------------------------------------------------------------
    // Publish.
    //
    // Two entry points, one path. `publish` sends one creative at the top
    // level; `publish_batch` sends an `ads` array. Everything below the point
    // where they are normalised into one list is shared, which is the whole
    // reason batching is worth having: the campaign and ad set are resolved
    // once and every creative lands in that same ad set, rather than four
    // separate publishes building four ad sets that split the budget and each
    // learn from a quarter of the data.
    // -----------------------------------------------------------------------
    const batch = action === 'publish_batch'
    const {
      image_url: imageUrl,
      // {square: url, feed: url, story: url} — every artboard the Studio saved
      // for this creative, so one ad can serve the right one per placement.
      images,
      objective = 'OUTCOME_TRAFFIC',
      campaign_id: existingCampaignId,
      campaign_name: campaignName,
      // Publishes into an ad set that already exists instead of building one.
      // The point of it: the chat can put up a campaign and an ad set with the
      // right budget and targeting, and the Studio's creative then lands in
      // that exact ad set rather than in a second one beside it. Also how a
      // second image gets tested against the first inside one ad set.
      adset_id: targetAdsetId,
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
      lead_form_id: leadFormId,
      lead_form_name: leadFormName,
      special_ad_categories: specialAdCategories = [],
      start_time: startTime,
      stamp,
      size_key: sizeKey,
      published_by: publishedBy,
    } = body

    // One ad, or a list of them, normalised to the same shape. Copy lives on
    // the ad rather than on the call: four statics in a launch are four
    // different hooks, and making them share one primary text would defeat the
    // point of testing them against each other. The top-level copy is the
    // fallback for anything an ad leaves out.
    type AdInput = {
      stamp?: string
      size_key?: string
      images?: Record<string, string>
      image_url?: string
      primary_text?: string
      headline?: string
      description?: string
      cta?: string
      ad_name?: string
      link_url?: string
      lead_form_id?: string
      lead_form_name?: string
    }

    const adInputs: AdInput[] = batch
      ? Array.isArray(body.ads)
        ? body.ads
        : []
      : [
          {
            stamp,
            size_key: sizeKey,
            images,
            image_url: imageUrl,
            primary_text: primaryText,
            headline,
            description,
            cta,
            ad_name: adName,
            link_url: linkUrlIn,
            lead_form_id: leadFormId,
            lead_form_name: leadFormName,
          },
        ]

    if (adInputs.length === 0) {
      return json({ error: 'No ads to publish — pick at least one saved creative.' }, 400)
    }
    if (adInputs.length > MAX_BATCH_ADS) {
      return json(
        {
          error: `That is ${adInputs.length} ads in one go; ${MAX_BATCH_ADS} is the most one publish will do. Send the rest as a second batch into the same ad set.`,
        },
        400
      )
    }

    const reuseAdsetId = String(targetAdsetId || '').trim()

    // Publishing into an existing ad set means the ad set decides the
    // objective, the budget and the targeting — all three were settled when it
    // was built, and none of them are this call's to change. So it is read
    // first, and what it says overrides whatever the form was left set to.
    let existingAdset: Record<string, any> | null = null
    if (reuseAdsetId) {
      existingAdset = await graphGet(
        reuseAdsetId,
        {
          fields:
            'id,name,status,effective_status,account_id,campaign_id,daily_budget,lifetime_budget,optimization_goal,destination_type',
        },
        token
      )

      // The ad set ID comes from the request, and the System User token can
      // write to every client's account. Without this check, a wrong or
      // tampered ID would publish one client's creative into another client's
      // ad set — and spend their budget on it.
      if (actId(String(existingAdset?.account_id || '')) !== account) {
        return json(
          {
            error: `That ad set does not belong to ${client.name}'s ad account. Pick one from the list rather than pasting an ID.`,
          },
          400
        )
      }
    }

    const objectiveKey = existingAdset
      ? adsetObjective(existingAdset)
      : ((OBJECTIVE_ALIASES[objective] || objective) as Objective)
    const spec = OBJECTIVES[objectiveKey]
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
    // Every ad resolved and checked before ANY of them is created. The
    // alternative is discovering that the fourth creative has no copy once
    // three real ads are already sitting in the account.
    const ads = adInputs.map((a) => ({
      stamp: a.stamp ?? stamp,
      size_key: a.size_key ?? sizeKey,
      // Whatever sizes this creative saved. A single image_url still works and
      // becomes a one-entry map.
      images:
        a.images && typeof a.images === 'object' && Object.keys(a.images).length > 0
          ? (a.images as Record<string, string>)
          : a.image_url
            ? { [String(a.size_key || sizeKey || 'feed')]: a.image_url }
            : {},
      primary_text: a.primary_text ?? primaryText,
      headline: a.headline ?? headline,
      description: a.description ?? description,
      cta: String(a.cta || cta).toUpperCase(),
      ad_name: a.ad_name ?? adName,
      lead_form_id: a.lead_form_id ?? leadFormId,
      lead_form_name: a.lead_form_name ?? leadFormName,
      // An instant form has no landing page: the form opens inside Facebook,
      // and the creative's link is never followed. Meta still wants the field
      // populated, so it points at the advertiser's own Page.
      link_url: spec.needs_form
        ? `https://www.facebook.com/${client.meta_page_id}`
        : a.link_url || linkUrlIn || client.website_url,
    }))

    for (const [i, a] of ads.entries()) {
      // Named so a rejected batch says which creative to go and fix.
      const which = batch ? `Ad ${i + 1}${a.ad_name ? ` ("${a.ad_name}")` : ''}` : 'This ad'

      if (Object.keys(a.images).length === 0) {
        return json({ error: `${which} has no image to publish.` }, 400)
      }
      if (!a.primary_text) {
        return json(
          { error: `${which} has no primary text — that is the copy above the image.` },
          400
        )
      }
      if (!CTA_TYPES.has(a.cta)) {
        return json({ error: `"${a.cta}" is not a call-to-action Meta accepts.` }, 400)
      }
      if (!spec.needs_form && !a.link_url) {
        return json(
          {
            error: `${which} has no landing page URL. Set one on ${client.name}'s Meta card, or type one on the publish form.`,
          },
          400
        )
      }
      if (spec.needs_form && !a.lead_form_id) {
        return json(
          { error: `${which} needs an instant form — pick or create one before publishing.` },
          400
        )
      }
    }
    // Budget, targeting and the pixel are properties of an ad set. When one is
    // being reused they are already set on it and are not asked for, so these
    // three checks would reject a perfectly valid publish. The lead-form check
    // above stays either way: the form ID lives on the CREATIVE, so a form ad
    // set still needs one supplied here.
    if (!existingAdset && !body.dry_run) {
      if (spec.needs_pixel && !client.meta_pixel_id) {
        return json(
          {
            error: `Optimising for leads needs a pixel: Meta has to be told which conversion event to chase. Add ${client.name}'s pixel ID, or publish this as a Traffic campaign instead.`,
          },
          400
        )
      }
      if (Math.round(Number(dailyBudgetCents) || 0) < MIN_DAILY_BUDGET_CENTS) {
        return json({ error: `Daily budget must be at least $${(MIN_DAILY_BUDGET_CENTS / 100).toFixed(2)}.` }, 400)
      }
      if (!Array.isArray(locations) || locations.length === 0) {
        return json({ error: 'Pick at least one location to target.' }, 400)
      }
    }
    const budget = Math.round(Number(dailyBudgetCents) || 0)

    // A dry run checks the creative payload against Meta and returns its
    // verdict without creating a campaign, an ad set, a creative or an ad.
    // Placement asset customization is the reason this exists: the rules have
    // to be right, and the only authority on that is Meta.
    if (body.dry_run) {
      const checks = []
      for (const [i, a] of ads.entries()) {
        try {
          const built = await buildAd({
            account,
            token,
            client,
            spec,
            linkUrl: a.link_url,
            leadFormId: a.lead_form_id,
            ctaType: a.cta,
            adsetId: '',
            images: a.images,
            primaryText: a.primary_text,
            headline: a.headline,
            description: a.description,
            adName: a.ad_name,
            dryRun: true,
          })
          checks.push({ ok: true, ad: i + 1, sizes: built.sizes, sent: built.validated })
        } catch (err) {
          checks.push({
            ok: false,
            ad: i + 1,
            error: err instanceof Error ? err.message : String(err),
            detail: err instanceof GraphError ? err.detail : undefined,
          })
        }
      }
      return json({ ok: checks.every((c) => c.ok), dry_run: true, objective: objectiveKey, checks })
    }

    // 1. Campaign. Reused when one was picked, so a client's ads can share a
    //    campaign and its learning rather than each starting cold. An existing
    //    ad set brings its own campaign with it and settles the question.
    //
    //    Note what does NOT go into `created`: it is the list of objects this
    //    call brought into existence, and it is what the UI offers to clean up
    //    after a half-failed publish. A campaign or ad set that was already
    //    there must never appear in it — deleting those would take live ads
    //    down with them.
    let campaignId = existingAdset ? String(existingAdset.campaign_id) : existingCampaignId
    if (campaignId) {
      // Already exists, whether picked directly or inherited from the ad set.
    } else {
      const campaign = await graphPost(
        `${account}/campaigns`,
        {
          name: campaignName || `${client.name} — ${spec.label}`,
          objective: spec.campaign_objective,
          status: 'PAUSED',
          // Required by Meta on every campaign create. Housing, employment,
          // credit and social-issue ads have targeting restrictions, and
          // declaring the wrong thing is a policy violation rather than an
          // error, so it is asked rather than assumed.
          special_ad_categories: specialAdCategories,
          // Meta now refuses to create a campaign that carries no campaign
          // budget unless this is stated outright, either way.
          //
          // False, and not really a choice: true asks the ad sets to lend each
          // other a fifth of their budgets, which Meta will only accept
          // alongside a campaign-level bid strategy this does not set, so it
          // fails with "cannot enable ad set budget sharing without bid
          // strategy". False also happens to be the honest answer here — the
          // budget typed into the publish form is the budget that ad set gets.
          is_adset_budget_sharing_enabled: false,
        },
        token,
        'create campaign'
      )
      campaignId = campaign.id
      created.campaign_id = campaign.id
    }

    // 2. Ad set — budget, schedule and, the point of the exercise, targeting.
    //    Skipped entirely when publishing into one that already exists: that ad
    //    set's budget and targeting are the ones that were wanted, and writing
    //    to them here would silently retarget something already delivering.
    let adsetId: string
    if (existingAdset) {
      adsetId = String(existingAdset.id)
    } else {
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
          // A website lead is promoted against the pixel that reports it; a
          // form lead is promoted against the Page that hosts the form.
          promoted_object: spec.needs_pixel
            ? { pixel_id: client.meta_pixel_id, custom_event_type: 'LEAD' }
            : spec.needs_form
              ? { page_id: client.meta_page_id }
              : undefined,
          // Stated rather than left to default. OUTCOME_LEADS covers instant
          // forms, website forms, phone calls and Messenger threads, and which
          // one is meant changes what else the ad set needs.
          destination_type: spec.destination_type,
          start_time: startTime || undefined,
          status: 'PAUSED',
        },
        token,
        'create ad set'
      )
      adsetId = adset.id
      created.adset_id = adset.id
    }

    // 3-5. Images, creative, ad — once per creative, all into the ad set
    //      resolved above. Each creative's saved sizes go into ONE ad rather
    //      than one ad per size: see creativeParams.
    //
    //      Recorded as each ad comes into existence rather than all at the end.
    //      A batch is a long invocation, and if it is cut short the account
    //      still contains whatever was made — so the CRM has to know about each
    //      ad the moment it is real, not once the last one finishes.
    const record = async (a: (typeof ads)[number], built: { creative_id: string; ad_id: string; sizes: string[] }) => {
      try {
        const insert = await fetch(`${supabaseUrl}/rest/v1/published_ads`, {
          method: 'POST',
          headers: { ...dbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({
            client_id: clientId,
            stamp: a.stamp ? String(a.stamp) : null,
            // Every size this ad carries, not one of them. Comma-joined so it
            // still reads as a size in the one-image case and the column does
            // not have to change type.
            size_key: built.sizes.join(',') || null,
            ad_account_id: client.meta_ad_account_id,
            campaign_id: campaignId,
            campaign_name: campaignName || null,
            adset_id: adsetId,
            // When the ad set was reused, its real name and real budget are the
            // truthful record — the form's ad set fields were not even shown.
            adset_name: existingAdset ? existingAdset.name || null : adsetName || null,
            creative_id: built.creative_id,
            ad_id: built.ad_id,
            ad_name: a.ad_name || null,
            objective: objectiveKey,
            daily_budget_cents: existingAdset ? Number(existingAdset.daily_budget) || null : budget,
            // Targeting belongs to the reused ad set and was not sent, so there
            // is nothing honest to record here. Null, not an empty list, which
            // would read as "targeted nowhere".
            locations: existingAdset ? null : locations,
            lead_form_id: a.lead_form_id || null,
            lead_form_name: a.lead_form_name || null,
            status: 'PAUSED',
            published_by: publishedBy || null,
          }),
        })
        return insert.ok
      } catch {
        // A failed insert does not undo a real ad that now exists in the
        // account, so it is reported alongside success rather than turned into
        // a failure.
        return false
      }
    }

    const results: Record<string, unknown>[] = []
    for (const [i, a] of ads.entries()) {
      // Only the single-ad path writes into `created`: in a batch the
      // half-finished-object story is per ad and lives in `results`, and a
      // shared accumulator would attribute one ad's creative to another.
      const progress: Record<string, string> = batch ? {} : created
      try {
        const built = await buildAd({
          account,
          token,
          client,
          spec,
          linkUrl: a.link_url,
          leadFormId: a.lead_form_id,
          ctaType: a.cta,
          adsetId,
          images: a.images,
          primaryText: a.primary_text,
          headline: a.headline,
          description: a.description,
          adName: a.ad_name,
          into: progress,
        })
        results.push({
          ok: true,
          stamp: a.stamp ?? null,
          ad_name: a.ad_name ?? null,
          creative_id: built.creative_id,
          ad_id: built.ad_id,
          sizes: built.sizes,
          // Whether this ad really does serve a different crop per placement,
          // and if not, why not. A publish that quietly dropped two of three
          // sizes must not read as an unqualified success.
          per_placement: built.per_placement,
          needs_instagram: built.needs_instagram,
          recorded: await record(a, built),
        })
      } catch (err) {
        // One bad creative must not cost the other three. In a batch the
        // failure is collected and the loop carries on; on a single publish
        // there is nothing to carry on to, so it rethrows into the handler
        // below and keeps the error shape the Studio already expects.
        if (!batch) throw err
        results.push({
          ok: false,
          stamp: a.stamp ?? null,
          ad_name: a.ad_name ?? `Ad ${i + 1}`,
          error: err instanceof Error ? err.message : String(err),
          detail: err instanceof GraphError ? err.detail : undefined,
          // What this ad left behind before it failed, so it can be cleaned up.
          created: Object.keys(progress).length > 0 ? progress : undefined,
        })
      }
    }

    const succeeded = results.filter((r) => r.ok)

    return json({
      // A batch where every ad failed is a failed publish, even though the ad
      // set may have been created. Saying ok:true there would be a lie the UI
      // would repeat.
      ok: succeeded.length > 0,
      status: 'PAUSED',
      recorded: succeeded.every((r) => r.recorded !== false),
      // Set when any ad had to drop back to one image because the client has no
      // Instagram identity. The Studio says so rather than letting someone
      // believe their Stories crop went live.
      needs_instagram: succeeded.some((r) => r.needs_instagram),
      ...created,
      campaign_id: campaignId,
      adset_id: adsetId,
      ...(batch
        ? { results, published: succeeded.length, failed: results.length - succeeded.length }
        : {}),
      // Whether the ad landed in something that already existed. The success
      // screen says a very different thing in that case: the ad set may
      // already be live, so only the new ad is switched off.
      reused_adset: Boolean(existingAdset),
      adset_live:
        String(existingAdset?.effective_status || existingAdset?.status || '').toUpperCase() ===
        'ACTIVE',
      // Deep link to the new ad set in Ads Manager, which is where the human
      // approval step actually happens.
      ads_manager_url: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${client.meta_ad_account_id}&selected_adset_ids=${adsetId}`,
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
