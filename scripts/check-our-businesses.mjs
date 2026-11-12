// Self-check for the "My businesses" rows on the Reports page: our own
// businesses with their Meta and Google numbers and the Google Ads
// connection, never a client, never in a total.
// Run: node scripts/check-our-businesses.mjs

import { ourBusinessRows } from '../src/lib/ourBusinesses.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

const hvac = { id: 'h', name: 'Horizon HVAC', is_internal: true, archived: false, google_ads_customer_id: '1234567890', google_ads_sync_error: null }
const water = { id: 'w', name: 'Horizon Water Co', is_internal: true, archived: false, google_ads_customer_id: null, google_ads_sync_error: null }
const client = { id: 'c', name: 'Belk', is_internal: false, archived: false, google_ads_customer_id: '2222222222' }
const gone = { id: 'g', name: 'Old Co', is_internal: true, archived: true }
const emb = (c) => ({ name: c.name, is_internal: c.is_internal, archived: c.archived })
const meta = [
  { client_id: 'h', date: '2026-11-05', spend: 40, leads: 2, clients: emb(hvac) },
  { client_id: 'h', date: '2026-10-01', spend: 99, leads: 9, clients: emb(hvac) },
  { client_id: 'c', date: '2026-11-05', spend: 500, leads: 5, clients: emb(client) },
  { client_id: 'w', date: '2026-11-06', spend: 10, leads: 0, clients: emb(water) },
]
const google = [
  { client_id: 'h', date: '2026-11-06', cost: 60, conversions: 3, clients: emb(hvac) },
  { client_id: 'h', date: '2026-10-02', cost: 70, conversions: 1, clients: emb(hvac) },
  { client_id: 'c', date: '2026-11-06', cost: 300, conversions: 2, clients: emb(client) },
  // Horizon HVAC's Local Services campaign, in the same account and table: LSA, not Google Search.
  { client_id: 'h', date: '2026-11-07', cost: 25, conversions: 1, campaign_type: 'LOCAL_SERVICES', campaign_name: 'LocalServicesCampaign:SystemGenerated:1', clients: emb(hvac) },
  { client_id: 'h', date: '2026-11-08', cost: 15, conversions: 1, campaign_type: 'PERFORMANCE_MAX', campaign_name: 'Pay-per-lead-PMax-HORIZON HVAC Inc', clients: emb(hvac) },
]
const rows = ourBusinessRows({ clients: [hvac, water, client, gone], metaRows: meta, googleRows: google, windowStart: '2026-11-01' })

check('one row per internal business, biggest spend first; a client and an archived business are not rows', rows.map((r) => r.name), ['Horizon HVAC', 'Horizon Water Co'])
check('the Meta and Google numbers for the window only', rows.map((r) => [r.metaSpend, r.metaLeads, r.googleSpend, r.googleLeads]), [[40, 2, 60, 3], [10, 0, 0, 0]])
check('cost per lead per channel, zero with no leads', rows.map((r) => [r.metaCpl, r.googleCpl]), [[20, 20], [0, 0]])
check('the Local Services campaigns are LSA on the row, not Google Search ("why is Google LSA blank on the KPIs page")', rows.map((r) => [r.lsaSpend, r.lsaLeads, r.lsaCpl]), [[40, 2, 20], [0, 0, 0]])
check('whether Google Ads is connected, with the id as digits and the client row for the connect box', rows.map((r) => [r.googleConnected, r.googleId, r.client?.id]), [[true, '1234567890', 'h'], [false, '', 'w']])
check('a business with nothing spent still has a row: that is where the connect box lives', ourBusinessRows({ clients: [water] }).map((r) => [r.name, r.metaSpend, r.googleConnected]), [['Horizon Water Co', 0, false]])
check('a row from the ad rows alone, before the clients list has loaded', ourBusinessRows({ metaRows: meta.filter((r) => r.client_id === 'w') }).map((r) => [r.name, r.metaSpend, r.client]), [['Horizon Water Co', 10, null]])
check('the sync error rides along for the box', ourBusinessRows({ clients: [{ ...water, google_ads_customer_id: '1', google_ads_sync_error: 'PERMISSION_DENIED' }] })[0].googleError, 'PERMISSION_DENIED')
check('no window: everything counts', ourBusinessRows({ clients: [hvac], metaRows: meta })[0].metaSpend, 139)

if (failures) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
