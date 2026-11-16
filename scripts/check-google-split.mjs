// Self-check for Google as one channel on the Performance page: Search and
// pay per lead. Run: node scripts/check-google-split.mjs
//
// 2026-11-17: "we need to account for the pay per lead being merged over to
// Google Ads ... make it so Google is all one and we can see search ad data
// and pay per lead data." The card must never show pay per lead as a dead
// row of zeros: it says who runs it, who is set up and quiet, and who is
// still to connect.

import { readFileSync } from 'node:fs'
import { pplByClient, pplWho } from '../src/lib/googleSplit.js'
import { isLsaCampaign, lsaClientReport } from '../src/lib/lsaReport.js'
import { mergeDaily, GOOGLE_PARTS, CHANNELS } from '../src/lib/channels.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

// --- which campaigns are pay per lead ------------------------------------------------
check('the standalone LSA type, the sync\'s PAY_PER_LEAD and the pay-per-lead PMax name; not plain PMax', [isLsaCampaign('LOCAL_SERVICES', 'x'), isLsaCampaign('PAY_PER_LEAD', 'Anything'), isLsaCampaign('PERFORMANCE_MAX', 'Pay-per-lead-PMax-HOMETOWN ROOFING'), isLsaCampaign('PERFORMANCE_MAX', 'Campaign #1')], [true, true, true, false])

// --- who --------------------------------------------------------------------------------
const clients = [
  { id: 'l', name: 'Luccia', lsa_active: true, lsa_campaigns: [{ id: '1', name: 'LocalServicesCampaign:SystemGenerated', status: 'ENABLED', account: '783' }] },
  { id: 'h', name: 'Hometown Roofing', lsa_active: false, lsa_campaigns: [{ id: '2', name: 'Pay-per-lead-PMax-HOMETOWN ROOFING', status: 'PAUSED', account: '719' }] },
  { id: 'r', name: 'Reliable', lsa_active: true, lsa_campaigns: null, paused_at: '2026-10-01' },
  { id: 'c', name: 'Comfort', lsa_active: true, lsa_campaigns: null },
  { id: 's', name: 'Supreme', lsa_active: false, lsa_campaigns: [{ id: '3', status: 'ENABLED', account: '350' }] },
  { id: 'x', name: 'Horizon', is_internal: true, lsa_campaigns: [{ id: '4', status: 'ENABLED', account: '219' }] },
]
const rows = [{ client_id: 's', cost: 40, conversions: 1, clients: { name: 'Supreme' } }]
const w = pplWho({ clients, campaignRows: rows, handRows: [{ client_id: 'z', ad_spend: 100, clients: { name: 'Hand Co' } }] })
check('running: spend in the range, synced or by hand; set up: a campaign held and nothing spent, paused when every one is; to connect: marked live with no campaign, never a paused client or our own', w, {
  running: ['Hand Co', 'Supreme'],
  setUp: [{ name: 'Hometown Roofing', paused: true }, { name: 'Luccia', paused: false }],
  toConnect: ['Comfort'],
})
check('nothing at all is three empty lists, not an error', pplWho(), { running: [], setUp: [], toConnect: [] })

// --- per client --------------------------------------------------------------------------
const by = pplByClient({
  campaignRows: [{ client_id: 'a', cost: 100, conversions: 3, clients: { name: 'A' } }, { client_id: 'b', cost: 50, conversions: 2, clients: { name: 'B' } }],
  leadRows: [{ client_id: 'a' }, { client_id: 'a' }],
})
check('per client: leads are the lead rows where the client has any, else the campaign conversions', [...by.entries()].map(([id, p]) => [id, p.spend, p.leads]), [['a', 100, 2], ['b', 50, 2]])

// --- a set-up campaign reads as connected on the pay-per-lead report ------------------------
const report = lsaClientReport({ clients: clients.filter((c) => !c.is_internal), campaignRows: [], leads: [], handRows: [], since: '2026-11-01', until: '2026-11-16' })
const st = Object.fromEntries(report.map((r) => [r.name, [r.state, r.campaignsPaused, r.campaigns.length]]))
check('a client with a pay-per-lead campaign and no spend is connected, with whether it is paused; marked live with nothing found is marked', [st.Luccia, st['Hometown Roofing'], st.Comfort], [['connected', false, 1], ['connected', true, 1], ['marked', false, 0]])

// --- the stacked chart and the names ---------------------------------------------------------
const merged = mergeDaily([{ date: 'd1', spend: 10 }], [{ date: 'd1', spend: 5 }], 'spend', [{ date: 'd1', spend: 3 }])
check('the daily stack carries pay per lead on top when given, and the total counts it', merged, [{ date: 'd1', meta: 10, google: 5, lsa: 3, total: 18 }])
check('...and two series stay two', mergeDaily([{ date: 'd1', spend: 10 }], [{ date: 'd1', spend: 5 }], 'spend'), [{ date: 'd1', meta: 10, google: 5, total: 15 }])
check('the names: Google split into Search and pay per lead; LSA called what it is now', [GOOGLE_PARTS.google, GOOGLE_PARTS.lsa, CHANNELS.lsa.long], ['Google Search', 'Google pay per lead', 'Google pay per lead (LSA)'])

// --- the page wiring ---------------------------------------------------------------------------
const page = read('src/pages/ReportsPage.jsx')
check('the Performance page shows one Google card with both parts, the three-part daily stack, and counts pay-per-lead leads from the lead rows', [page.includes('<GoogleCard card={googleCard} />'), page.includes("data-google-part=\"search\""), page.includes("data-google-part=\"pay-per-lead\""), page.includes("keys={['meta', 'google', 'lsa']}"), page.includes(".from('lsa_leads')"), page.includes('lsaKpis(dayRows, leadRows)')], [true, true, true, true, true, true])
check('...and an empty pay-per-lead half says who, not zeros', [page.includes('No client ran pay per lead in this range.'), page.includes('Set up, not spending:'), page.includes('Marked LSA, not found in Google Ads yet:')], [true, true, true])
const sync = read('supabase/functions/google-daily-sync/index.ts')
check('the sync reads every campaign that is not removed, marks pay per lead, keeps them on the client and reads leads even with no spend', [sync.includes("FROM campaign WHERE campaign.status != 'REMOVED'"), sync.includes("'PAY_PER_LEAD'"), sync.includes('lsaPatch.lsa_campaigns'), sync.includes('if (lsaRows.length || pplIds.size) lsaAccounts.add(customerId)')], [true, true, true, true])
check('...and a client keeps no rows from an account that is not theirs', [sync.includes('customer_id=not.in.('), sync.includes("notes=eq.${encodeURIComponent('Synced from Google Ads')}")], [true, true])

if (failures) {
  console.log(`\n${failures} FAILED`)
  process.exit(1)
}
console.log('\nAll Google split checks passed.')
