// Where each client stands on Meta and Google, for the Clients list ("make
// the Clients tab so we can easily see if a client is connected to Meta and
// Google, keeping in mind their tiers").
//
// Which channels are shown follows the package, the same rule as the launch
// pipeline (nextSteps.js): the Whole Chain and up owe Meta and Google both;
// Maintenance is ONE channel, Meta unless the client has no Meta ad account
// and is on Google already (or switched Meta off while Google runs); a
// client with no package yet shows Meta, and Google when anything of
// Google's is on the row. A channel that is live but not in the package is
// shown too, and says so: a Maintenance client running both is a billing
// conversation, not a secret.
//
// Pure: scripts/check-channel-status.mjs runs it in Node.

import { tierOf } from './clientTiers.js'
import { isAccessError } from './googleAdsId.js'

/** live: ads running · connected: account in, not live · refused: Google has not let us in · missing: no account */
export const CHANNEL_STATES = ['live', 'connected', 'refused', 'missing']

/**
 * client: a clients row; googleCampaigns: campaigns the Google sync saw
 * running (pipelineRows.js counts them). Returns one entry per channel to
 * show, in order: { key, label, state, detail, extra } where extra marks a
 * live channel the package does not owe.
 */
export function channelStatus(client = {}, { googleCampaigns = 0 } = {}) {
  const { tier } = tierOf(client)
  const metaAccount = Boolean(client.meta_ad_account_id)
  const metaPage = Boolean(client.meta_page_id)
  const metaLive = Boolean(client.meta_ads_active)
  const googleId = String(client.google_ads_customer_id || '').replace(/\D/g, '')
  const refused = Boolean(googleId) && isAccessError(client.google_ads_sync_error)
  const googleConnected = Boolean(googleId) && !refused
  const searchLive = googleConnected && Number(googleCampaigns) > 0
  const lsaLive = Boolean(client.lsa_active)
  const googleLive = searchLive || lsaLive

  // Maintenance on Google: Meta never connected and Google in, or Meta
  // switched off while Google runs (MCL).
  const onGoogle = tier === 1 && !metaLive && ((!metaAccount && (Boolean(googleId) || lsaLive)) || googleLive)
  const owed = tier >= 2 ? ['meta', 'google'] : tier === 1 ? [onGoogle ? 'google' : 'meta'] : ['meta', ...(googleId || lsaLive ? ['google'] : [])]

  const meta = {
    key: 'meta',
    label: 'Meta',
    state: metaLive ? 'live' : metaAccount ? 'connected' : 'missing',
    detail: metaLive
      ? 'Meta ads live'
      : metaAccount
        ? metaPage
          ? 'Ad account and Page connected, ads not live yet'
          : 'Ad account connected, Facebook Page still missing'
        : 'No Meta ad account connected',
  }
  const parts = [searchLive ? 'Search' : '', lsaLive ? 'Local Services' : ''].filter(Boolean)
  const google = {
    key: 'google',
    label: 'Google',
    state: googleLive ? 'live' : refused ? 'refused' : googleConnected ? 'connected' : 'missing',
    detail: googleLive
      ? `Google live: ${parts.join(' and ')}`
      : refused
        ? 'Google Ads id saved, but Google has not let us in yet'
        : googleConnected
          ? 'Google Ads account connected, no campaign running yet'
          : 'No Google Ads account connected',
  }
  const all = { meta, google }
  const out = owed.map((k) => ({ ...all[k], extra: false }))
  for (const k of ['meta', 'google']) {
    if (!owed.includes(k) && all[k].state === 'live') out.push({ ...all[k], extra: true, detail: `${all[k].detail} (not in their package)` })
  }
  return out
}

/** True when a channel the package owes has no account, or Google has refused us. */
export function missingChannel(client, opts) {
  return channelStatus(client, opts).some((c) => !c.extra && (c.state === 'missing' || c.state === 'refused'))
}

/** The channel's entry on the list, or null when it is not shown. */
export function channelOf(client, key, opts) {
  return channelStatus(client, opts).find((c) => c.key === key) || null
}
