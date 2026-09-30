// Self-check for one client's Google Ads page: picking scorecards, the days
// in the chart, and the campaign, ad group, keyword and search term tables.
// Run: node scripts/check-google-client-report.mjs

import { defaultChannel } from '../src/lib/clientReportKit.js'
import { adGroupsFor, campaignsFor, dateRange, dayTotals, keywordsFor, sortRows, termsFor, togglePick } from '../src/lib/googleClientReport.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

check('picking a second card keeps both', togglePick(['clicks'], 'spend'), ['clicks', 'spend'])
check('picking a third drops the oldest', togglePick(['clicks', 'spend'], 'ctr'), ['spend', 'ctr'])
check('unpicking one of two leaves the other', togglePick(['clicks', 'spend'], 'clicks'), ['spend'])
check('the last card cannot be unpicked, so there is always a chart', togglePick(['spend'], 'spend'), ['spend'])

check('every day in the window, month end included', dateRange('2026-09-28', '2026-10-02'), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])
check('a backwards window is empty', dateRange('2026-10-02', '2026-09-28'), [])

const C = { id: 'mcl', name: 'MCL Construction' }
const CAMP = [
  { client_id: 'mcl', date: '2026-09-22', campaign_id: '1', campaign_name: 'Campaign #1', campaign_type: 'SEARCH', campaign_status: 'ENABLED', impressions: 9, clicks: 1, cost: 0.03, conversions: 0 },
  { client_id: 'mcl', date: '2026-09-24', campaign_id: '1', campaign_name: 'Campaign #1', campaign_type: 'SEARCH', campaign_status: 'ENABLED', impressions: 40, clicks: 1, cost: 0.05, conversions: 1 },
  { client_id: 'mcl', date: '2026-09-24', campaign_id: '2', campaign_name: 'PMax', campaign_type: 'PERFORMANCE_MAX', campaign_status: 'PAUSED', impressions: 60, clicks: 3, cost: 9, conversions: 0 },
  { client_id: 'mcl', date: '2026-09-01', campaign_id: '1', campaign_name: 'Old', campaign_type: 'SEARCH', campaign_status: 'ENABLED', impressions: 999, clicks: 99, cost: 99, conversions: 9 },
]
{
  const d = dayTotals(CAMP, '2026-09-22', '2026-09-24')
  check('a row per day, quiet days as zeros, days summed across campaigns',
    d.map((x) => [x.date, x.clicks, x.impressions, x.spend]), [['2026-09-22', 1, 9, 0.03], ['2026-09-23', 0, 0, 0], ['2026-09-24', 4, 100, 9.05]])
  check('each day carries its own rates', [d[2].ctr, d[2].cpc, d[2].cpl], [4, 2.26, 9.05])
}
{
  const c = campaignsFor(C, CAMP, '2026-09-20', '2026-09-30')
  check('campaigns in the window, biggest spend first, named by type', c.map((x) => [x.name, x.type, x.status, x.spend]), [['PMax', 'Performance Max', 'PAUSED', 9], ['Campaign #1', 'Search', 'ENABLED', 0.08]])
}

const KW = [
  { client_id: 'mcl', date: '2026-09-22', campaign_name: 'Campaign #1', ad_group_id: 'a', ad_group_name: 'Roofing', criterion_id: 'k1', keyword_text: 'roof repair', match_type: 'PHRASE', impressions: 50, clicks: 10, cost: 40, conversions: 0 },
  { client_id: 'mcl', date: '2026-09-23', campaign_name: 'Campaign #1', ad_group_id: 'a', ad_group_name: 'Roofing', criterion_id: 'k2', keyword_text: 'new roof', match_type: 'EXACT', impressions: 20, clicks: 4, cost: 20, conversions: 1 },
  { client_id: 'mcl', date: '2026-09-23', campaign_name: 'Campaign #1', ad_group_id: 'b', ad_group_name: 'Siding', criterion_id: 'k3', keyword_text: 'siding', match_type: 'BROAD', impressions: 10, clicks: 1, cost: 2, conversions: 0 },
]
{
  const g = adGroupsFor(KW, '2026-09-20', '2026-09-30')
  check('ad groups add their keywords up', g.map((x) => [x.name, x.keywords, x.clicks, x.spend, x.leads]), [['Roofing', 2, 14, 60, 1], ['Siding', 1, 1, 2, 0]])
  const k = keywordsFor(KW, '2026-09-20')
  check('keywords carry the rates the table shows', k.find((x) => x.keyword === 'roof repair')?.ctr, 20)
}

const TERMS = [
  { client_id: 'mcl', date: '2026-09-22', search_term: 'Roof Repair Near Me', keyword_text: 'roof repair', status: 'NONE', impressions: 10, clicks: 3, cost: 12, conversions: 1 },
  { client_id: 'mcl', date: '2026-09-23', search_term: 'roof repair near me', keyword_text: 'roof repair', status: 'NONE', impressions: 5, clicks: 1, cost: 3, conversions: 0 },
  { client_id: 'mcl', date: '2026-09-23', search_term: 'roofing jobs hiring', keyword_text: 'roof repair', status: 'NONE', impressions: 8, clicks: 4, cost: 30, conversions: 0 },
  { client_id: 'mcl', date: '2026-09-23', search_term: 'new roof', keyword_text: 'new roof', status: 'ADDED', impressions: 4, clicks: 1, cost: 5, conversions: 0 },
]
{
  const t = termsFor(TERMS, '2026-09-20', '2026-09-30')
  check('terms merge regardless of case, biggest spend first', t.map((x) => [x.term, x.spend, x.clicks]), [['roofing jobs hiring', 30, 4], ['roof repair near me', 15, 4], ['new roof', 5, 1]])
  check('a job-seeker search is flagged to block, a keyword already added is marked added',
    [t[0].block, t[2].status, t[1].block], ['certain', 'added', ''])
}

{
  const rows = [{ n: 'b', v: 2 }, { n: 'a', v: 3 }, { n: 'c', v: null }]
  check('numbers sort biggest first by default, blanks last', sortRows(rows, 'v').map((r) => r.n), ['a', 'b', 'c'])
  check('text sorts A to Z by default', sortRows(rows, 'n').map((r) => r.n), ['a', 'b', 'c'])
  check('and flips when asked', sortRows(rows, 'v', 'asc').map((r) => r.n), ['b', 'a', 'c'])
}

check('the shared client ad page opens on Meta when there is an ad account, else Google Ads',
  [defaultChannel({ meta_ad_account_id: '123', google_ads_customer_id: '5192851350' }), defaultChannel({ google_ads_customer_id: '519-285-1350' }), defaultChannel({}), defaultChannel(null)],
  ['meta', 'google', 'meta', 'meta'])

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
