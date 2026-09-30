// Self-check for the Meta report's numbers.
// Run: node scripts/check-meta-report.mjs
//
// Fixtures: two clients with Meta, one without, one of ours, one archived.
// An image ad and a video ad, so hook rate is only counted where there is
// video; one ad spending with no leads, one cheap winner.

import {
  AD_RULES,
  adsToActOn,
  inRange,
  metaCampaignReport,
  metaClientReport,
  metaConnection,
  pixelState,
  metaKpis,
  platformSplit,
} from '../src/lib/metaReport.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

const CLIENTS = [
  { id: 'belk', name: 'Belk Heating and Cooling', meta_ad_account_id: '111', archived: false, is_internal: false },
  { id: 'pillar', name: 'Pillar HVAC', meta_ad_account_id: 'act_222', archived: false, is_internal: false, paused_at: '2026-09-20T00:00:00Z' },
  { id: 'tito', name: 'Tito’s Appliances', meta_ad_account_id: null, archived: false, is_internal: false },
  { id: 'ours', name: 'Horizon HVAC', meta_ad_account_id: '999', archived: false, is_internal: true },
  { id: 'gone', name: 'Summit Water Pros', meta_ad_account_id: '888', archived: true, is_internal: false },
]
const row = (client_id, date, ad_id, over = {}) => ({
  client_id, date, ad_id, ad_name: `${ad_id} ad`, campaign_id: `${client_id}-c`, campaign_name: `${client_id} campaign`, effective_status: 'ACTIVE',
  spend: 50, leads: 2, impressions: 5000, clicks: 100, video_2s_views: null, ...over,
})
const ROWS = [
  row('belk', '2026-09-20', 'img'), // image ad: no video field
  row('belk', '2026-09-21', 'vid', { video_2s_views: 1500 }),
  row('belk', '2026-09-21', 'dead', { spend: 90, leads: 0, clicks: 40 }),
  row('pillar', '2026-09-21', 'win', { spend: 60, leads: 6, effective_status: 'PAUSED' }),
  row('ours', '2026-09-21', 'x', { spend: 999 }),
  row('gone', '2026-09-21', 'y', { spend: 999 }),
  row('belk', '2026-08-01', 'img', { spend: 5000 }), // outside the window
]
const SINCE = '2026-09-15'
const UNTIL = '2026-09-28'

// --- the arithmetic -------------------------------------------------------
check('kpis add up and derive every rate',
  metaKpis([row('x', 'd', 'a'), row('x', 'd', 'b', { spend: 150, leads: 0, impressions: 5000, clicks: 100 })]),
  { spend: 200, leads: 2, impressions: 10000, clicks: 200, cpl: 100, ctr: 2, cpc: 1, cpm: 20, convRate: 1, hookRate: 0 })
check('hook rate counts video rows only, so an image ad does not drag it down',
  metaKpis([row('x', 'd', 'img'), row('x', 'd', 'vid', { video_2s_views: 1500 })]).hookRate, 30)
check('nothing in is zeros, never Infinity',
  metaKpis([]), { spend: 0, leads: 0, impressions: 0, clicks: 0, cpl: 0, ctr: 0, cpc: 0, cpm: 0, convRate: 0, hookRate: 0 })
check('inRange keeps both ends', inRange(ROWS, '2026-09-20', '2026-09-21').length, 6)

// --- who has an account ---------------------------------------------------
{
  const c = metaConnection(CLIENTS)
  check('connection: clients only, act_ prefix counts, ours and archived left out',
    [c.total, c.connected.map((x) => x.id), c.missing.map((x) => x.id)], [3, ['belk', 'pillar'], ['tito']])
}

// --- per client -------------------------------------------------------------
{
  const rows = metaClientReport({ clients: CLIENTS, rows: ROWS, since: SINCE, until: UNTIL })
  check('order: spending first by spend, no account last, ours and archived out',
    rows.map((r) => [r.id, r.state]), [['belk', 'live'], ['pillar', 'live'], ['tito', 'no-account']])
  const belk = rows[0]
  check('a client total honours the window', [belk.spend, belk.leads, belk.ads, belk.liveAds], [190, 4, 3, 3])
  check('a paused ad is counted in spend but not as live', [rows[1].ads, rows[1].liveAds, rows[1].paused], [1, 0, true])
  check('a client with an account and no spend reads no-spend',
    metaClientReport({ clients: [CLIENTS[0]], rows: [], since: SINCE }).map((r) => r.state), ['no-spend'])
}

// --- per campaign -----------------------------------------------------------
check('campaigns biggest first, ours and archived out',
  metaCampaignReport(ROWS, CLIENTS, SINCE, UNTIL).map((c) => [c.clientName, c.spend, c.ads, c.liveAds]),
  [['Belk Heating and Cooling', 190, 3, 3], ['Pillar HVAC', 60, 1, 0]])

// --- ads to act on ----------------------------------------------------------
{
  // Blended: $250 spend, 10 leads, $25 a lead. Dead: $90 and none. Winner:
  // 6 leads at $10, under 0.75 x $25. The $50-for-2 ads sit at the average.
  const ads = adsToActOn(ROWS, CLIENTS, { since: SINCE, until: UNTIL })
  check('dead first, then winners; average ads are not listed',
    ads.map((a) => [a.adId, a.verdict]), [['dead', 'dead'], ['win', 'winner']])
  check('each says why in plain words', ads[0].why, '$90 and no leads')
  check('a paused winner says it is not live', ads[1].live, false)
  const pricey = adsToActOn([...ROWS, row('belk', '2026-09-22', 'pricey', { spend: 200, leads: 1 })], CLIENTS, { since: SINCE, until: UNTIL })
  check('an ad at over twice the average is expensive', pricey.find((a) => a.adId === 'pricey')?.verdict, 'expensive')
  check('under the minimum spend nothing is judged',
    adsToActOn([row('belk', '2026-09-21', 'tiny', { spend: AD_RULES.minSpendToJudge - 1, leads: 0 })], CLIENTS, { since: SINCE }).length, 0)
}

// --- placements -------------------------------------------------------------
{
  const P = [
    { client_id: 'belk', date: '2026-09-21', platform: 'facebook', spend: 150, leads: 5, impressions: 10000, clicks: 200 },
    { client_id: 'belk', date: '2026-09-21', platform: 'instagram', spend: 50, leads: 1, impressions: 5000, clicks: 50 },
    { client_id: 'belk', date: '2026-09-21', platform: 'audience_network', spend: 0, leads: 0, impressions: 10, clicks: 0 },
    { client_id: 'ours', date: '2026-09-21', platform: 'facebook', spend: 999, leads: 1, impressions: 1, clicks: 1 },
  ]
  check('platforms by spend, named, with share and cost per lead; empty ones and ours out',
    platformSplit(P, CLIENTS, SINCE, UNTIL).map((p) => [p.label, p.spend, p.share, p.cpl]),
    [['Facebook', 150, 75, 30], ['Instagram', 50, 25, 50]])
}

// --- pixels ------------------------------------------------------------------
{
  const P = [
    { id: 'rel', name: 'Reliable', meta_ad_account_id: '2985507794986286', meta_pixel_id: '1702027560797350' },
    { id: 'pil', name: 'Pillar HVAC', meta_ad_account_id: '1751786542754391', meta_pixel_id: null },
    { id: 'luc', name: 'Luccia', meta_ad_account_id: null, meta_pixel_id: null },
    { id: 'old', name: 'Archived', meta_ad_account_id: '1', meta_pixel_id: null, archived: true },
  ]
  check('pixel state per client: on file, missing, or no ad account to report to',
    P.slice(0, 3).map(pixelState), ['on-file', 'missing', 'no-account'])
  const c = metaConnection(P)
  check('pixels count only clients with an ad account, archived left out',
    [c.withPixel.map((x) => x.id), c.noPixel.map((x) => x.id)], [['rel'], ['pil']])
  const rows = metaClientReport({ clients: P, rows: [], since: '2026-09-01' })
  check('the client table carries the pixel', rows.map((r) => [r.id, r.pixel, r.pixelId]), [['pil', 'missing', ''], ['rel', 'on-file', '1702027560797350'], ['luc', 'no-account', '']])
}

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
