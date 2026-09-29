// Self-check for one client's Meta page: the days in the chart and the
// campaign, ad set, ad and placement tables.
// Run: node scripts/check-meta-client-report.mjs

import { adSetsFor, adsFor, metaCampaignsFor, metaDayTotals, placementsFor } from '../src/lib/metaClientReport.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

const C = { id: 'belk', name: 'Belk Heating and Cooling' }
const row = (date, ad, set, camp, status, spend, leads, impressions, clicks, video) => ({
  client_id: 'belk', date, ad_id: ad, ad_name: `Ad ${ad}`, adset_id: set, adset_name: `Set ${set}`, campaign_id: camp, campaign_name: `Camp ${camp}`,
  effective_status: status, spend, leads, impressions, clicks, ...(video ? { video_2s_views: video[0], video_p100: video[1] } : {}),
})
const ROWS = [
  row('2026-09-22', 'a1', 's1', 'c1', 'ACTIVE', 50, 4, 5000, 60, [1500, 150]),
  row('2026-09-24', 'a1', 's1', 'c1', 'ACTIVE', 50, 4, 5000, 40, [1000, 100]),
  row('2026-09-24', 'a2', 's1', 'c1', 'PAUSED', 90, 0, 6000, 30, null),
  row('2026-09-23', 'a3', 's2', 'c2', 'ACTIVE', 40, 1, 2000, 10, null),
  row('2026-08-01', 'a1', 's1', 'c1', 'ACTIVE', 999, 99, 1, 1, null),
]

{
  const d = metaDayTotals(ROWS, '2026-09-22', '2026-09-24')
  check('a row per day, quiet days as zeros, ads summed', d.map((x) => [x.date, x.spend, x.leads]), [['2026-09-22', 50, 4], ['2026-09-23', 40, 1], ['2026-09-24', 140, 4]])
  check('each day carries its own rates', [d[2].cpl, d[2].cpm, d[2].ctr], [35, 12.73, 0.64])
}
{
  const c = metaCampaignsFor(C, ROWS, '2026-09-20', '2026-09-30')
  check('campaigns in the window, biggest spend first, live ads out of total', c.map((x) => [x.name, x.spend, x.liveAds, x.ads]), [['Camp c1', 190, 1, 2], ['Camp c2', 40, 1, 1]])
}
{
  const s = adSetsFor(ROWS, '2026-09-20', '2026-09-30')
  check('ad sets add their ads up', s.map((x) => [x.name, x.campaign, x.spend, x.leads]), [['Set s1', 'Camp c1', 190, 8], ['Set s2', 'Camp c2', 40, 1]])
}
{
  const a = adsFor(C, ROWS, '2026-09-20', '2026-09-30')
  check('every ad, biggest spend first', a.map((x) => x.id), ['a1', 'a2', 'a3'])
  check('a paused ad that spent $90 with no leads is flagged', [a[1].live, a[1].status, a[1].verdict], [false, 'PAUSED', 'dead'])
  check('video ads get hook and hold, image ads do not', [a[0].isVideo, a[0].hookRate, a[0].holdRate, a[2].isVideo], [true, 25, 10, false])
}
{
  const P = [
    { client_id: 'belk', date: '2026-09-23', platform: 'facebook', spend: 60, leads: 3, impressions: 3000, clicks: 30 },
    { client_id: 'belk', date: '2026-09-23', platform: 'instagram', spend: 40, leads: 1, impressions: 2000, clicks: 10 },
    { client_id: 'other', date: '2026-09-23', platform: 'facebook', spend: 500, leads: 9, impressions: 1, clicks: 1 },
  ]
  check('placements are this client only, with share of spend', placementsFor(C, P, '2026-09-20', '2026-09-30').map((x) => [x.label, x.spend, x.share, x.cpl]), [['Facebook', 60, 60, 20], ['Instagram', 40, 40, 40]])
}

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
