import { supabase } from './supabaseClient'
import { readFunctionError } from './functionError'

// What the publish form offers. Kept in step with the OBJECTIVES map in the
// meta-publish Edge Function — the function is the one that enforces it, this
// is only what the picker shows and why.
export const OBJECTIVES = [
  {
    value: 'LEADS_FORM',
    label: 'Leads (instant form)',
    hint: 'The form opens inside Facebook and Meta prefills name, phone and email. Still needs the client’s website on the creative — see below.',
    needsPixel: false,
    needsForm: true,
    // Counter-intuitive, and it cost three rejected ads to learn. Nobody ever
    // follows this link -- the button opens the form in place -- but Meta
    // rejects a lead ad whose creative points anywhere on facebook.com:
    // "Lead Generation Ads should always link to external content". Verified
    // by validating the same creative twice, once with the Page URL and once
    // with a real site: the Page URL fails, the site passes.
    needsLink: true,
  },
  {
    value: 'TRAFFIC',
    label: 'Traffic',
    hint: 'Sends people to the website. Works with no pixel.',
    needsPixel: false,
    needsForm: false,
    needsLink: true,
  },
  {
    value: 'LEADS_WEBSITE',
    label: 'Leads (website)',
    hint: 'Optimises towards the pixel’s Lead event. Needs a pixel ID and a landing page.',
    needsPixel: true,
    needsForm: false,
    needsLink: true,
  },
]

/**
 * The fields an instant form can ask for.
 *
 * The standard ones are prefilled from the viewer's Facebook profile, which is
 * the whole reason these convert: most people submit without typing anything.
 * Every custom question is a real question and costs completions, so the form
 * builder nudges towards few.
 */
export const FORM_QUESTIONS = [
  { type: 'FULL_NAME', label: 'Full name', prefilled: true },
  { type: 'PHONE', label: 'Phone number', prefilled: true },
  { type: 'EMAIL', label: 'Email', prefilled: true },
  { type: 'STREET_ADDRESS', label: 'Street address', prefilled: true },
  { type: 'CITY', label: 'City', prefilled: true },
  { type: 'ZIP', label: 'ZIP code', prefilled: true },
]

// What a home-services form asks by default. Name and phone are what actually
// gets someone called back; email is the fallback when nobody picks up.
export const DEFAULT_FORM_QUESTIONS = ['FULL_NAME', 'PHONE', 'EMAIL']

// Meta's enum, narrowed to the ones that make sense for a home-services ad.
// BOOK_TRAVEL is not a typo: it is the long-standing enum Meta renders as
// "Book Now" on the button.
export const CTA_OPTIONS = [
  { value: 'LEARN_MORE', label: 'Learn More' },
  { value: 'GET_QUOTE', label: 'Get Quote' },
  { value: 'BOOK_TRAVEL', label: 'Book Now' },
  { value: 'CALL_NOW', label: 'Call Now' },
  { value: 'CONTACT_US', label: 'Contact Us' },
  { value: 'GET_OFFER', label: 'Get Offer' },
  { value: 'SIGN_UP', label: 'Sign Up' },
  { value: 'SHOP_NOW', label: 'Shop Now' },
]

// Declared on every campaign. Getting this wrong is a policy violation rather
// than an API error, so it is asked rather than defaulted silently — though for
// the trades work this CRM runs, None is the honest answer.
export const SPECIAL_AD_CATEGORIES = [
  { value: '', label: 'None — standard ad' },
  { value: 'HOUSING', label: 'Housing' },
  { value: 'EMPLOYMENT', label: 'Employment' },
  { value: 'CREDIT', label: 'Credit' },
  { value: 'ISSUES_ELECTIONS_POLITICS', label: 'Social issues, elections or politics' },
]

// Meta's default when a city is added with no radius, and the band it accepts.
//
// The floor is not ours -- Meta rejects the whole ad set with "The geographical
// radius you selected isn't within the specified bounds" for anything under ten
// miles. Verified by sweeping a validate-only ad set from 1 to 51 miles against
// a real city key: 1-9 fail, 10-50 pass, 51 fails. So a tighter circle than 10
// cannot be sent at all, and letting one be typed only produces that error at
// publish time, after the campaign has already been created.
export const MIN_RADIUS_MILES = 10
export const DEFAULT_RADIUS_MILES = 25
export const MAX_RADIUS_MILES = 50

// Pulls any radius into the band Meta accepts.
export function clampRadius(miles) {
  const n = Number(miles)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RADIUS_MILES
  return Math.min(Math.max(Math.round(n), MIN_RADIUS_MILES), MAX_RADIUS_MILES)
}

// Each city is a live geo lookup against Meta, so a long list is a lot of round
// trips before the form is even usable. Eight is well past what a home services
// client actually targets, and anything beyond it is a list to prune by hand.
const MAX_PREFILL_CITIES = 8

/**
 * The daily budget the client already agreed to, in dollars.
 *
 * Asked on the intake form and then retyped into the publish form every time,
 * which is both a wasted step and a chance to fat-finger a number that spends
 * real money. The intake is the more specific answer; the client record is what
 * the CRM has been running on.
 */
export function budgetFromIntake(intake, client) {
  const candidates = [intake?.meta_ad_budget_per_day, client?.meta_budget_per_day]
  for (const raw of candidates) {
    const n = Number(String(raw ?? '').replace(/[^\d.]/g, ''))
    if (Number.isFinite(n) && n > 0) return String(n)
  }
  return ''
}

/**
 * The client's website, for the creative's link.
 *
 * Asked on the intake form and then retyped into the publish form every time,
 * which is the same wasted step the budget had. It matters more here than it
 * looks: a lead ad is REJECTED without an external URL, so an empty field is
 * not a cosmetic gap, it is a publish that fails at the last step.
 *
 * The client record wins when it has one -- that value was set deliberately in
 * the CRM, and it is the one already pointed at a working page. The intake is
 * the fallback for a client nobody has filled that in for yet.
 */
export function websiteFromIntake(intake, client) {
  // The booking page comes last but it does count: a client with no marketing
  // site but a live scheduling page still has somewhere real to point, and a
  // lead ad is rejected without one.
  for (const raw of [client?.website_url, intake?.website, intake?.booking_url]) {
    const url = tidyUrl(raw)
    if (url) return url
  }
  return ''
}

// "we dont have one", "n/a", "-". People answer the question even when the
// answer is no, and any of these sent to Meta is a rejected ad rather than an
// empty field somebody notices and fills in.
const NOT_A_URL = /^(n\/?a|none|no|nope|tbd|na|-+|\.+)$/i

/**
 * Makes what somebody typed into something Meta will accept, or nothing.
 *
 * Scheme included, because "summitwaterpros.com" is what people write and a
 * bare domain is not a URL as far as the API is concerned.
 */
function tidyUrl(raw) {
  const text = String(raw ?? '').trim()
  if (!text || NOT_A_URL.test(text)) return ''

  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`
  try {
    const url = new URL(withScheme)
    // A hostname with no dot is a typo or a note to self, not a domain.
    if (!url.hostname.includes('.')) return ''
    return url.toString()
  } catch {
    return ''
  }
}

/**
 * Reads a radius out of the intake's own words.
 *
 * People write it into the free-text box: "40 mile radius Raleigh", "30 mile
 * radius from garden city". That is the number the client actually asked for,
 * and defaulting to 25 while it sits right there in the text ignores an answer
 * we already have.
 *
 * A range takes the lower end. "40-50 mile radius" is somebody being loose, and
 * the smaller circle stays closer to where they really work.
 *
 * A client who writes "5 mile radius" is asking for something Meta will not
 * accept, so it comes back as the ten-mile floor rather than as a number that
 * fails at publish.
 */
export function radiusFromText(text) {
  const found = String(text || '').match(/(\d{1,3})\s*(?:-\s*\d{1,3})?\s*mi(?:le)?s?\b/i)
  if (!found) return null
  const miles = Number(found[1])
  if (!Number.isFinite(miles) || miles < 1) return null
  return clampRadius(miles)
}

// Instruction rather than place name. Left in, the whole phrase goes to Meta's
// geo search and matches nothing: "40 mile radius Raleigh" returns zero results
// where "Raleigh" returns seven.
const NOT_A_PLACE =
  /\b(\d{1,3}\s*(?:-\s*\d{1,3})?\s*mi(?:le)?s?|radius|around|within|from|of|surrounding|areas?)\b/gi

/**
 * Turns the intake's "Cities to Target in Ads" into CANDIDATE locations.
 *
 * It suggests rather than selects, and that is the whole design. Meta's geo
 * search is a fuzzy name match over the entire world: "Long Island" comes back
 * as Long Island, Maine before the New York one, and "garden city" as Garden
 * City, Kansas. Taking the top hit and applying it silently is how an ad set
 * ends up targeting the wrong state while looking like it came straight from
 * the client's own intake, which makes it more trusted rather than less.
 *
 * So every candidate keeps its state in the label, three are offered per term,
 * and a human clicks the right one. The radius parsed out of the text rides
 * along, so the click applies the number the client asked for.
 */
export async function locationsFromIntake(intake) {
  const raw = String(intake?.target_cities || intake?.service_area || '').trim()
  if (!raw) return { entries: [], source: null }

  // Full stops too: "Long Island. 30 mile radius from garden city" is two
  // places on one line, and splitting on commas alone leaves them stuck.
  const terms = raw
    .split(/[\n,;.]+/)
    .map((line) => line.trim())
    .map((line) => ({
      radius: radiusFromText(line),
      query: line.replace(NOT_A_PLACE, ' ').replace(/\s+/g, ' ').trim(),
    }))
    .filter((term) => term.query.length > 1)
    .slice(0, MAX_PREFILL_CITIES)

  // A radius stated once usually governs the whole line, so it carries to any
  // term that did not state its own.
  //
  // The intake now asks for the number outright, and a number somebody typed
  // into a box marked "miles" beats one pulled out of a sentence with a regular
  // expression. The prose reading stays as the fallback for every intake filled
  // in before the field existed.
  const asked = clampRadius(intake?.service_radius_miles)
  const stated = Number.isFinite(Number(intake?.service_radius_miles)) &&
    Number(intake.service_radius_miles) > 0
    ? asked
    : radiusFromText(raw)

  const entries = []
  for (const term of terms) {
    const radius = clampRadius(term.radius ?? stated ?? DEFAULT_RADIUS_MILES)
    try {
      const found = await searchLocations(term.query)
      // Three is enough to show the real one without turning this into a
      // second search box.
      entries.push({ query: term.query, radius, candidates: found.slice(0, 3) })
    } catch {
      entries.push({ query: term.query, radius, candidates: [] })
    }
  }

  return { entries, source: intake?.target_cities ? 'target_cities' : 'service_area' }
}

async function callFunction(body) {
  const { data, error } = await supabase.functions.invoke('meta-publish', { body })

  if (error) {
    const { status, detail } = await readFunctionError(error)
    // No status means no response reached the browser at all: the function is
    // either undeployed or not answering the CORS preflight. Both surface as
    // supabase-js's "Failed to send a request", which names neither.
    if (!status) {
      throw new Error(
        'Could not reach the publish function. It is probably not deployed yet — deploy meta-publish in Supabase and try again.'
      )
    }
    if (status === 404) {
      throw new Error(
        'The publish function is not deployed yet. Deploy meta-publish in Supabase, then try again.'
      )
    }
    if (status === 401 || status === 403) {
      throw new Error('Supabase rejected the request. Check the function is set to allow this key.')
    }
    // Meta's own rejection arrives as a 502 with the field it objected to named
    // in the message. That message is the entire value of this call, so it is
    // never swallowed behind something generic.
    throw new Error(detail || 'Publishing failed.')
  }

  if (data?.error) {
    const err = new Error(data.error)
    // A publish that died partway leaves paused objects in the account. The
    // caller has to be able to say which ones.
    err.partial = data.created || null
    throw err
  }

  return data
}

/**
 * Looks up geo targeting keys.
 *
 * Meta only targets keys it issued itself, which is why the location picker
 * cannot be a free-text box: "Rochester" means nothing to the API, the key it
 * returns for Rochester does.
 */
export async function searchLocations(query) {
  const data = await callFunction({ action: 'search_locations', query })
  return data?.locations || []
}

// Existing campaigns in the client's account, so a second ad can join one
// rather than starting a fresh campaign per creative.
export async function listCampaigns(clientId) {
  const data = await callFunction({ action: 'list_campaigns', client_id: clientId })
  return data?.campaigns || []
}

/**
 * Ad sets inside one campaign, so a new creative can go into one that is
 * already built rather than into a new one beside it.
 *
 * This is what lets the chat and the Studio meet: the chat puts up a campaign
 * and an ad set with the budget and targeting, and the Studio drops the
 * creative straight into it. It is also how a second image gets tested against
 * the first inside a single ad set, which is the only way the comparison means
 * anything — two ad sets is two auctions.
 */
export async function listAdsets(clientId, campaignId) {
  const data = await callFunction({
    action: 'list_adsets',
    client_id: clientId,
    campaign_id: campaignId,
  })
  return data?.adsets || []
}

/**
 * Works out which Facebook Page and pixel this client advertises with.
 *
 * The token can already see both, so nobody should be copying IDs out of
 * Business Settings. The Page is ranked by how many of the account's existing
 * creatives already post as it, which is a far better signal than what is
 * merely assignable.
 */
export async function discoverAssets(clientId) {
  return callFunction({ action: 'discover_assets', client_id: clientId })
}

/**
 * Instant forms already on the client's Facebook Page.
 *
 * Worth reusing rather than making a new one per ad: a form owns its leads, so
 * five near-identical forms means five places to go looking for them.
 */
export async function listLeadForms(clientId) {
  const data = await callFunction({ action: 'list_lead_forms', client_id: clientId })
  return data?.forms || []
}

/**
 * Builds a new instant form on the Page, from the CRM.
 *
 * `questions` is a list of {type} for standard fields and {type:'CUSTOM',label}
 * for anything asked in the client's own words.
 */
export async function createLeadForm({
  clientId,
  formName,
  questions,
  privacyPolicyUrl,
  followUpUrl,
  thankYouMessage,
}) {
  return callFunction({
    action: 'create_lead_form',
    client_id: clientId,
    form_name: formName,
    questions,
    privacy_policy_url: privacyPolicyUrl,
    follow_up_url: followUpUrl,
    thank_you_message: thankYouMessage,
  })
}

/**
 * Pauses one live ad in the client's account.
 *
 * The Ad Doctor's kill verdicts call this when clicked. It is the only write
 * to an existing Meta object in the whole CRM: spend-reducing, reversible in
 * Ads Manager, and always behind a human click - never a schedule.
 */
export async function pauseAd(clientId, adId) {
  return callFunction({ action: 'pause_ad', client_id: clientId, ad_id: adId })
}

/**
 * Creates campaign -> ad set -> creative -> ad, all PAUSED.
 *
 * Nothing this creates can spend money. The last step is deliberately not
 * automated: somebody opens Ads Manager and switches it on.
 */
export async function publishAd(payload) {
  return callFunction({ action: 'publish', ...payload })
}

/**
 * Several creatives into ONE ad set, in one call.
 *
 * What a launch actually looks like: four statics, three sizes each. Publishing
 * them one at a time built four ad sets, which splits the budget four ways and
 * gives each a quarter of the data to learn from — so the test that was
 * supposed to compare four hooks instead compares four under-fed ad sets. Here
 * the campaign and ad set are made once and every ad lands inside.
 *
 * `ads` carries its own copy per creative, because four hooks that share one
 * primary text are not four hooks.
 *
 * The response is per ad: one rejected creative does not lose the other three,
 * and each is recorded the moment it exists.
 */
export async function publishAdBatch({ ads, ...shared }) {
  return callFunction({ action: 'publish_batch', ads, ...shared })
}

// How many creatives one publish will take. Mirrors MAX_BATCH_ADS in the Edge
// Function, which is the one that enforces it.
export const MAX_BATCH_ADS = 8

/**
 * Every artboard a saved set has, keyed by size, ready to send as one ad.
 *
 * The Studio renders each ad at three ratios and publishing used to throw two
 * away — one publish, one image, so covering feed and Stories meant two
 * separate ads. Meta can hold all three in a single ad and serve the right one
 * per placement, so this hands over the whole set.
 */
export function imagesFromSet(set) {
  return Object.fromEntries((set.ordered || []).map(({ size, file }) => [size.key, file.url]))
}

// What has already been sent to Meta, so the Studio can say so rather than
// letting the same creative be published twice by accident.
export async function fetchPublishedAds(clientId) {
  const { data, error } = await supabase
    .from('published_ads')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export function dollarsToCents(value) {
  const n = Number(String(value).replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

// One line describing what the publish will create, for the review step. The
// point is that nothing is a surprise: budget, destination and reach read back
// before the button is pressed rather than after.
export function summarisePlan({
  objective,
  dailyBudget,
  locations,
  campaignName,
  reuseCampaign,
  formName,
  // How many creatives, and how many sizes each carries. One ad per creative
  // regardless: the sizes ride inside it, one per placement.
  adCount = 1,
  sizeCount = 1,
  // Set when publishing into an ad set that already exists, in which case the
  // budget and targeting below are not ours to state — they are its.
  reuseAdset = null,
}) {
  const obj = OBJECTIVES.find((o) => o.value === objective)
  const form = obj?.needsForm && formName ? ` Leads go to the "${formName}" form.` : ''
  const count = adCount === 1 ? '1 ad' : `${adCount} ads`
  const sizes = sizeCount > 1 ? `, each carrying ${sizeCount} sizes across placements` : ''

  // Reusing an ad set: everything about budget and targeting was decided when
  // it was built, so claiming a budget here would be inventing one.
  if (reuseAdset) {
    const live = reuseAdset.live ? ' That ad set is live, so switch each ad on only when you mean it.' : ''
    return `${count}${sizes} into the existing ad set "${reuseAdset.name}", which keeps its own budget and targeting. Created paused.${form}${live}`
  }

  const where = locations.length === 1 ? locations[0].label : `${locations.length} locations`
  const campaign = reuseCampaign ? 'an existing campaign' : `a new campaign, "${campaignName}"`
  const sharing = adCount > 1 ? ' sharing one ad set' : ''
  return `${count}${sizes}${sharing} in ${campaign}, $${dailyBudget}/day, targeting ${where}. ${
    obj?.label || objective
  }. Created paused.${form}`
}

/**
 * The age band to target, from the intake.
 *
 * Every ad set this CRM has built has gone out at 25-65, for every client,
 * because nobody was ever asked. A roof replacement and a drain unclog are not
 * the same audience, and the wrong band spends the first week of learning on
 * people who were never going to book.
 *
 * Meta's own bounds are 18 and 65, where 65 means "65 and over" rather than a
 * ceiling, so a client who says "60 plus" gets 65 and the right thing happens.
 */
export const META_AGE_MIN = 18
export const META_AGE_MAX = 65

export function ageFromIntake(intake) {
  const clamp = (v, fallback) => {
    const n = Number(v)
    if (!Number.isFinite(n) || n <= 0) return fallback
    return Math.min(Math.max(Math.round(n), META_AGE_MIN), META_AGE_MAX)
  }

  let min = clamp(intake?.customer_age_min, 25)
  let max = clamp(intake?.customer_age_max, 65)
  // Somebody typing the boxes the wrong way round should not produce an ad set
  // that targets nobody.
  if (min > max) [min, max] = [max, min]
  return { min: String(min), max: String(max) }
}
