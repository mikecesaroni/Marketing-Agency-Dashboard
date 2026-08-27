import { supabase } from './supabaseClient'
import { readFunctionError } from './functionError'

// What the publish form offers. Kept in step with the OBJECTIVES map in the
// meta-publish Edge Function — the function is the one that enforces it, this
// is only what the picker shows and why.
export const OBJECTIVES = [
  {
    value: 'OUTCOME_TRAFFIC',
    label: 'Traffic',
    hint: 'Sends people to the website. Works with no pixel.',
    needsPixel: false,
  },
  {
    value: 'OUTCOME_LEADS',
    label: 'Leads (website)',
    hint: 'Optimises towards the pixel’s Lead event. Needs a pixel ID on the client.',
    needsPixel: true,
  },
]

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

// Meta's default when a city is added with no radius, and its hard ceiling.
export const DEFAULT_RADIUS_MILES = 25
export const MAX_RADIUS_MILES = 50

async function callFunction(body) {
  const { data, error } = await supabase.functions.invoke('meta-publish', { body })

  if (error) {
    const { status, detail } = await readFunctionError(error)
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
 * Creates campaign -> ad set -> creative -> ad, all PAUSED.
 *
 * Nothing this creates can spend money. The last step is deliberately not
 * automated: somebody opens Ads Manager and switches it on.
 */
export async function publishAd(payload) {
  return callFunction({ action: 'publish', ...payload })
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
export function summarisePlan({ objective, dailyBudget, locations, campaignName, reuseCampaign }) {
  const obj = OBJECTIVES.find((o) => o.value === objective)
  const where = locations.length === 1 ? locations[0].label : `${locations.length} locations`
  const campaign = reuseCampaign ? 'an existing campaign' : `a new campaign, "${campaignName}"`
  return `${obj?.label || objective} ad in ${campaign}, $${dailyBudget}/day, targeting ${where}. Created paused.`
}
