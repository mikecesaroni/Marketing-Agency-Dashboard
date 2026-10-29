// Self-check for the Clients list's channel badges: which channels a client's
// package owes, and where each stands. Run: node scripts/check-channel-status.mjs
//
// The rule: THE WHOLE CHAIN AND UP OWE META AND GOOGLE BOTH; MAINTENANCE IS
// ONE CHANNEL, META UNLESS THE CLIENT IS ON GOOGLE; A LIVE CHANNEL OUTSIDE
// THE PACKAGE IS SHOWN AND SAYS SO.

import { channelOf, channelStatus, missingChannel } from '../src/lib/channelStatus.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}
const states = (client, opts) => channelStatus(client, opts).map((c) => `${c.key}:${c.state}${c.extra ? '+' : ''}`)

// --- the Whole Chain and up: both channels ----------------------------------------
check('Whole Chain with nothing connected: Meta and Google both missing', states({ tier: 2 }), ['meta:missing', 'google:missing'])
check('Whole Chain, Meta live, Google Ads in but no campaign: live and connected', states({ tier: 2, meta_ad_account_id: '1', meta_page_id: '2', meta_ads_active: true, google_ads_customer_id: '123-456-7890' }), ['meta:live', 'google:connected'])
check('Whole Chain, a campaign running: Google live, Search', channelOf({ tier: 2, google_ads_customer_id: '1234567890' }, 'google', { googleCampaigns: 2 }).detail, 'Google live: Search')
check('Local Services live alone is Google live', channelOf({ tier: 2, lsa_active: true }, 'google').detail, 'Google live: Local Services')
check('both say both', channelOf({ tier: 3, google_ads_customer_id: '1234567890', lsa_active: true }, 'google', { googleCampaigns: 1 }).detail, 'Google live: Search and Local Services')
check('Google refused us: its own state', states({ tier: 2, google_ads_customer_id: '1234567890', google_ads_sync_error: 'PERMISSION_DENIED: USER_PERMISSION_DENIED' }), ['meta:missing', 'google:refused'])
check('Meta ad account in, Page missing: connected, and the detail says what is missing', channelOf({ tier: 2, meta_ad_account_id: '1' }, 'meta'), { key: 'meta', label: 'Meta', state: 'connected', detail: 'Ad account connected, Facebook Page still missing', extra: false })

// --- Maintenance: one channel ------------------------------------------------------
check('Maintenance with nothing connected: Meta only', states({ tier: 1 }), ['meta:missing'])
check('Maintenance on Meta: Google is not on the row, whatever stray fields say', states({ tier: 1, meta_ad_account_id: '1', meta_page_id: '2', google_ads_customer_id: '1234567890', lsa_budget_per_day: 20 }), ['meta:connected'])
check('Maintenance, no Meta account, a Google Ads id: Google only', states({ tier: 1, google_ads_customer_id: '1234567890' }), ['google:connected'])
check('Maintenance on Local Services with no Meta account: Google live', states({ tier: 1, lsa_active: true }), ['google:live'])
check('Maintenance that left Meta for Google (MCL): Google live, Meta off the row', states({ tier: 1, meta_ad_account_id: '1', meta_page_id: '2', meta_ads_active: false, google_ads_customer_id: '1234567890' }, { googleCampaigns: 2 }), ['google:live'])
check('Maintenance live on Meta AND running Google: Google shown as live, marked outside the package', channelStatus({ tier: 1, meta_ad_account_id: '1', meta_ads_active: true, google_ads_customer_id: '1234567890' }, { googleCampaigns: 1 }).map((c) => [c.key, c.state, c.extra, c.detail]), [['meta', 'live', false, 'Meta ads live'], ['google', 'live', true, 'Google live: Search (not in their package)']])
check('a $1,500 fee with no tier set reads as Maintenance', states({ monthly_fee: 1500, meta_ad_account_id: '1' }), ['meta:connected'])

// --- no package yet: what is there ------------------------------------------------
check('no package, nothing connected: Meta', states({}), ['meta:missing'])
check('no package, a Google Ads id: Meta and Google', states({ google_ads_customer_id: '1234567890' }), ['meta:missing', 'google:connected'])

// --- the filter ----------------------------------------------------------------------
check('missing a channel: an owed channel with no account, or refused', [missingChannel({ tier: 2, meta_ad_account_id: '1' }), missingChannel({ tier: 2, meta_ad_account_id: '1', google_ads_customer_id: '1234567890' }), missingChannel({ tier: 2, meta_ad_account_id: '1', google_ads_customer_id: '1234567890', google_ads_sync_error: 'PERMISSION_DENIED' }), missingChannel({ tier: 1, meta_ad_account_id: '1' })], [true, false, true, false])
check('a live channel outside the package never counts as missing anything', missingChannel({ tier: 1, meta_ad_account_id: '1', meta_ads_active: true, lsa_active: true }), false)

if (failures) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll channel status checks passed')
