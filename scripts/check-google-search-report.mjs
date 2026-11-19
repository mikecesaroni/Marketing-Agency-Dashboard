// Self-check for the Google Search report's numbers.
// Run: node scripts/check-google-search-report.mjs
//
// The page adds up three tables that must never be added to each other. The
// fixtures here are one small agency: two connected clients, one waiting,
// one internal business, with a Search campaign and a Performance Max
// campaign so the campaign total is visibly more than the keyword total.

import {
  campaignReport,
  clientReport,
  connection,
  dailyRows,
  inRange,
  keywordsAcross,
  kpis,
  lastSynced,
  negativesAcross,
  prettyType,
  spendByType,
} from '../src/lib/googleSearchReport.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

const CLIENTS = [
  { id: 'belk', name: 'Belk Heating and Cooling', google_ads_customer_id: '1111111111', archived: false, is_internal: false, paused_at: null },
  { id: 'pillar', name: 'Pillar HVAC', google_ads_customer_id: '2222222222', archived: false, is_internal: false, paused_at: null },
  { id: 'tito', name: 'Tito’s Appliances', google_ads_customer_id: null, archived: false, is_internal: false, paused_at: null },
  { id: 'gone', name: 'Churned Ltd', google_ads_customer_id: '8888888888', archived: true, is_internal: false, paused_at: null },
]

const camp = (client_id, date, campaign_id, over = {}) => ({
  client_id, date, campaign_id, campaign_name: `${campaign_id} name`, campaign_type: 'SEARCH', campaign_status: 'ENABLED',
  impressions: 1000, clicks: 50, cost: 100, conversions: 2, conversion_value: 800, synced_at: `${date}T08:10:00Z`, ...over,
})
const CAMPAIGNS = [
  camp('belk', '2026-09-20', 'c1'),
  camp('belk', '2026-09-21', 'c1', { conversions: 0, cost: 50, clicks: 20, impressions: 400 }),
  camp('belk', '2026-09-21', 'pmax', { campaign_type: 'PERFORMANCE_MAX', cost: 150, clicks: 30, impressions: 3000, conversions: 1, conversion_value: 500 }),
  camp('pillar', '2026-09-21', 'c2', { cost: 200, clicks: 80, impressions: 2000, conversions: 5, conversion_value: 2500, campaign_status: 'PAUSED' }),
  camp('gone', '2026-09-21', 'g1', { cost: 999 }),
  camp('belk', '2026-09-01', 'c1', { cost: 1000 }), // outside the window
]
const kw = (client_id, date, criterion_id, over = {}) => ({
  client_id, date, ad_group_id: 'ag', criterion_id, keyword_text: `kw ${criterion_id}`, match_type: 'BROAD', campaign_name: 'c', status: 'ENABLED',
  impressions: 100, clicks: 10, cost: 10, conversions: 0, conversion_value: 0, ...over,
})
const KEYWORDS = [
  kw('belk', '2026-09-21', 'dead', { cost: 80, clicks: 25 }), // waste
  kw('belk', '2026-09-21', 'win', { cost: 60, conversions: 3 }), // winner
  kw('pillar', '2026-09-21', 'meh', { cost: 5 }), // young
]
const TERMS = [
  { client_id: 'belk', date: '2026-09-21', ad_group_id: 'ag', search_term: 'hvac jobs near me', status: 'NONE', clicks: 4, impressions: 40, cost: 12, conversions: 0 },
  { client_id: 'pillar', date: '2026-09-21', ad_group_id: 'ag', search_term: 'ac repair', status: 'NONE', clicks: 30, impressions: 300, cost: 40, conversions: 0 },
]
const SINCE = '2026-09-15'
const UNTIL = '2026-09-28'

// --- the KPI arithmetic ------------------------------------------------------
check('kpis add every metric and derive the rates',
  kpis([camp('x', '2026-09-21', 'a'), camp('x', '2026-09-21', 'b', { cost: 100, clicks: 50, impressions: 1000, conversions: 0, conversion_value: 0 })]),
  { spend: 200, leads: 2, clicks: 100, impressions: 2000, value: 800, cpl: 100, cpc: 2, ctr: 5, convRate: 2, roas: 4 })
check('no leads means cpl 0, not Infinity', kpis([camp('x', '2026-09-21', 'a', { conversions: 0 })]).cpl, 0)
check('nothing in is zeros out', kpis([]), { spend: 0, leads: 0, clicks: 0, impressions: 0, value: 0, cpl: 0, cpc: 0, ctr: 0, convRate: 0, roas: 0 })
check('inRange keeps both ends', inRange(CAMPAIGNS, '2026-09-20', '2026-09-21').length, 5)

// --- who is connected -------------------------------------------------------
{
  const c = connection(CLIENTS)
  check('connection leaves the archived out',
    [c.total, c.connected.map((x) => x.id), c.waiting.map((x) => x.id)], [3, ['belk', 'pillar'], ['tito']])
}
{
  // An ID Google refuses is not "connected": it is its own state, because
  // the fix is on the client's side, not ours.
  const refused = [...CLIENTS, { id: 'locked', name: 'Locked Out Plumbing', google_ads_customer_id: '3333333333', google_ads_sync_error: 'The caller does not have permission', archived: false, is_internal: false }]
  const c = connection(refused)
  check('an ID Google refuses is counted as no access, not connected',
    [c.connected.map((x) => x.id), c.noAccess.map((x) => x.id), c.total], [['belk', 'pillar'], ['locked'], 4])
  const rows = clientReport({ clients: refused, campaignRows: CAMPAIGNS, keywordRows: [], termRows: [], since: SINCE, until: UNTIL })
  check('the client table puts no-access after live, before not connected',
    rows.map((r) => [r.id, r.state]), [['belk', 'live'], ['pillar', 'live'], ['locked', 'no-access'], ['tito', 'not-connected']])
  const recovered = clientReport({
    clients: [{ ...CLIENTS[0], google_ads_sync_error: 'old refusal' }], campaignRows: CAMPAIGNS, keywordRows: [], termRows: [], since: SINCE, until: UNTIL,
  })
  check('data in the window beats a stale error', recovered[0].state, 'live')
  // MCL, Sep 29: Google let us in, but our weekly roll-up table refused the
  // "Google Search" channel. That is connected, not "Google refused us".
  const saveFail = [{ id: 'mcl', name: 'MCL Construction', google_ads_customer_id: '5192851350', google_ads_sync_error: 'weekly_kpis: {"code":"23514","message":"new row violates check constraint"}', archived: false, is_internal: false }]
  const sc = connection(saveFail)
  check('a failed save after Google let us in still counts as connected', [sc.connected.map((x) => x.id), sc.noAccess.length], [['mcl'], 0])
  check('and with no spend yet it reads no data, not no access',
    clientReport({ clients: saveFail, campaignRows: [], keywordRows: [], termRows: [], since: SINCE, until: UNTIL })[0].state, 'no-data')
}
check('last synced is the newest stamp', lastSynced(CAMPAIGNS), '2026-09-21T08:10:00Z')
check('last synced with nothing is null', lastSynced([]), null)

// --- per client --------------------------------------------------------------
{
  const rows = clientReport({ clients: CLIENTS, campaignRows: CAMPAIGNS, keywordRows: KEYWORDS, termRows: TERMS, since: SINCE, until: UNTIL })
  check('order: live by spend, then no data, then not connected; archived left out',
    rows.map((r) => [r.id, r.state]), [['belk', 'live'], ['pillar', 'live'], ['tito', 'not-connected']])
  const belk = rows[0]
  check('a client total is campaign grain, so Performance Max is in it',
    [belk.spend, belk.leads, belk.clicks, belk.impressions, belk.campaigns, belk.activeCampaigns], [300, 3, 100, 4400, 2, 2])
  check('and the window is honoured', belk.spend < 1000, true)
  check('waste and blockable ride alongside, never added in',
    [belk.deadKeywords, belk.wasted, belk.winners, belk.blockable, belk.savable], [1, 80, 1, 1, 12])
  check('last date is the newest campaign day', belk.lastDate, '2026-09-21')
  const pillar = rows[1]
  check('a paused campaign is counted but not active', [pillar.campaigns, pillar.activeCampaigns], [1, 0])
  check('a not-connected client carries zeros and no data', [rows[2].hasData, rows[2].spend], [false, 0])
}

// --- per campaign ------------------------------------------------------------
{
  const rows = campaignReport(CAMPAIGNS, CLIENTS, SINCE, UNTIL)
  check('campaigns biggest first, archived left out',
    rows.map((r) => [r.clientName, r.campaignId, r.spend]),
    [['Pillar HVAC', 'c2', 200], ['Belk Heating and Cooling', 'c1', 150], ['Belk Heating and Cooling', 'pmax', 150]])
  check('type and status read as words', [rows[2].type, rows[0].status], ['Performance Max', 'PAUSED'])
}
// --- our own businesses count (2026-11-19) -----------------------------------
// "On the live KPIs make it part of the total numbers": one of our own
// businesses is on the connection list, a row and a campaign like any
// client, and its spend is in every total. It was left out until then.
{
  const OURS = { id: 'horizon', name: 'Horizon HVAC', google_ads_customer_id: '9999999999', archived: false, is_internal: true, paused_at: null }
  const all = [...CLIENTS, OURS]
  const campaigns = [...CAMPAIGNS, camp('horizon', '2026-09-21', 'h1', { cost: 999 })]
  check('our own business is on the connection list', [connection(all).total, connection(all).connected.map((x) => x.id)], [4, ['belk', 'horizon', 'pillar']])
  check('...a row in the client table, biggest spend first', clientReport({ clients: all, campaignRows: campaigns, keywordRows: [], termRows: [], since: SINCE, until: UNTIL }).map((r) => [r.id, r.state, r.spend]).slice(0, 2), [['horizon', 'live', 999], ['belk', 'live', 300]])
  check('...in the campaigns', campaignReport(campaigns, all, SINCE, UNTIL).map((r) => [r.clientName, r.campaignId, r.spend])[0], ['Horizon HVAC', 'h1', 999])
  check('...and in where the money goes', spendByType(campaigns, all, SINCE, UNTIL).find((t) => t.type === 'Search').spend, 1349)
}
check('prettyType handles the unknown', [prettyType('SEARCH'), prettyType('SOMETHING_NEW'), prettyType('')], ['Search', 'Something new', ''])

// --- where the money goes ----------------------------------------------------
check('spend by type shares add to the client total',
  spendByType(CAMPAIGNS, CLIENTS, SINCE, UNTIL), [{ type: 'Search', spend: 350, share: 70 }, { type: 'Performance Max', spend: 150, share: 30 }])

// --- the act-on lists --------------------------------------------------------
check('keywords across clients name the client',
  keywordsAcross(KEYWORDS, CLIENTS, SINCE).map((k) => [k.clientName, k.keyword, k.verdict]),
  [['Belk Heating and Cooling', 'kw dead', 'waste'], ['Pillar HVAC', 'kw meh', 'young'], ['Belk Heating and Cooling', 'kw win', 'winner']])
check('negatives across clients, certain first',
  negativesAcross(TERMS, CLIENTS, SINCE).map((t) => [t.clientName, t.term, t.certain]),
  [['Belk Heating and Cooling', 'hvac jobs near me', true], ['Pillar HVAC', 'ac repair', false]])

// --- the chart feed ----------------------------------------------------------
check('daily rows carry cost as spend and conversions as leads',
  dailyRows([camp('x', '2026-09-21', 'a')]), [{ date: '2026-09-21', spend: 100, leads: 2, clicks: 50, impressions: 1000 }])

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
