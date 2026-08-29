import { supabase } from './supabaseClient'
import { readFunctionError } from './functionError'

/**
 * Where a client's ads actually ran.
 *
 * ad_daily says how an ad did; ad_platform_daily says how it did on Instagram
 * Stories versus the Facebook feed. Sparse by nature -- Meta only reports a
 * surface something was delivered on -- so a client running feed-only returns a
 * handful of rows rather than a grid of zeroes.
 */
export async function fetchPlatformRows({ clientId, adId, since }) {
  let q = supabase
    .from('ad_platform_daily')
    .select('ad_id, date, platform, position, spend, impressions, clicks, leads')
    .order('date', { ascending: true })

  if (clientId) q = q.eq('client_id', clientId)
  if (adId) q = q.eq('ad_id', adId)
  if (since) q = q.gte('date', since)

  const { data, error } = await q
  if (error) throw error
  return data || []
}

// How the platforms are named to a person. Meta's own vocabulary is stored;
// this is only what gets printed.
const PLATFORM_LABELS = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  audience_network: 'Audience Network',
  messenger: 'Messenger',
  threads: 'Threads',
  unknown: 'Unattributed',
}

// Facebook and Instagram are the two anybody makes decisions about. Everything
// else is a rounding error in practice -- Audience Network and Threads together
// were under two percent of spend across every client -- and giving each its
// own colour would spend the reader's attention on nothing. They fold into
// Other, which keeps the chart inside the three series that validate cleanly.
const HEADLINE = ['facebook', 'instagram']

export function platformLabel(key) {
  return PLATFORM_LABELS[key] || key
}

/**
 * Rolls raw rows up per platform, largest first, with the tail folded in.
 *
 * `metric` decides what the shares are of: spend answers "where is the money
 * going", impressions "where are they seeing it", leads "where is it working".
 * They give genuinely different pictures, which is why it is a parameter rather
 * than a decision baked in here.
 */
export function byPlatform(rows, metric = 'spend') {
  const totals = new Map()
  for (const r of rows) {
    const key = HEADLINE.includes(r.platform) ? r.platform : 'other'
    const prev = totals.get(key) || { key, spend: 0, impressions: 0, clicks: 0, leads: 0 }
    prev.spend += Number(r.spend) || 0
    prev.impressions += Number(r.impressions) || 0
    prev.clicks += Number(r.clicks) || 0
    prev.leads += Number(r.leads) || 0
    totals.set(key, prev)
  }

  const list = [...totals.values()]
  const sum = list.reduce((t, p) => t + p[metric], 0)

  return list
    .map((p) => ({
      ...p,
      label: p.key === 'other' ? 'Other' : platformLabel(p.key),
      value: p[metric],
      share: sum > 0 ? p[metric] / sum : 0,
      costPerLead: p.leads > 0 ? p.spend / p.leads : 0,
    }))
    // Largest first, but Other is always last however big it is: it is a
    // remainder rather than a competitor, and sorting it into the middle would
    // imply it is one.
    .sort((a, b) => (a.key === 'other' ? 1 : b.key === 'other' ? -1 : b.value - a.value))
}

/**
 * The same rows by placement rather than platform -- feed, reels, stories.
 *
 * Kept to the top few because there are around nineteen placements and the
 * tail is all fractions of a percent. This is the answer to "is anyone
 * actually seeing the Stories crop".
 */
export function byPosition(rows, metric = 'spend', limit = 6) {
  const totals = new Map()
  for (const r of rows) {
    const key = `${r.platform}·${r.position}`
    const prev = totals.get(key) || { key, platform: r.platform, position: r.position, spend: 0, impressions: 0, clicks: 0, leads: 0 }
    prev.spend += Number(r.spend) || 0
    prev.impressions += Number(r.impressions) || 0
    prev.clicks += Number(r.clicks) || 0
    prev.leads += Number(r.leads) || 0
    totals.set(key, prev)
  }

  const list = [...totals.values()].sort((a, b) => b[metric] - a[metric])
  const sum = list.reduce((t, p) => t + p[metric], 0)

  return list.slice(0, limit).map((p) => ({
    ...p,
    label: `${platformLabel(p.platform)} · ${prettyPosition(p.position)}`,
    value: p[metric],
    share: sum > 0 ? p[metric] / sum : 0,
  }))
}

// facebook_reels -> Reels, right_hand_column -> Right hand column. The platform
// is already printed beside it, so repeating it in the placement is noise.
function prettyPosition(raw) {
  const cleaned = String(raw || '')
    .replace(/^(facebook|instagram|messenger|threads|an)_/, '')
    .replace(/_/g, ' ')
    .trim()
  if (!cleaned) return 'Unknown'
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

/**
 * What one ad looks like, straight from Meta.
 *
 * Never cached: the preview and image URLs Meta hands back are signed and go
 * stale, so a stored one is a broken image waiting to happen.
 */
export async function fetchAdPreview(clientId, adId) {
  const { data, error } = await supabase.functions.invoke('meta-manage', {
    body: { action: 'ad_preview', client_id: clientId, ad_id: adId },
  })

  if (error) {
    const { status, detail } = await readFunctionError(error)
    if (status === 404) {
      throw new Error('The meta-manage function is not deployed yet.')
    }
    throw new Error(detail || 'Could not load the ad preview.')
  }
  if (data?.error) throw new Error(data.error)
  return data
}
