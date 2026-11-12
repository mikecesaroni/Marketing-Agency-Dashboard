// Self-check for the Local Services report rules. Run: node scripts/check-lsa-report.mjs
//
// The page is only useful if "live" means spending, "connected" means an
// account the sync can read, and the charged-lead numbers come from the
// lead rows and never from a guess.

import { isLsaCampaign, leadStats, lsaClientReport, lsaConnection, lsaDailyRows, lsaKpis, lsaRows, recentLeads, stoppedWhy } from '../src/lib/lsaReport.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

// --- which campaigns are Local Services -----------------------------------------
check('the standalone type, and the pay-per-lead Performance Max shape; not plain PMax, not Search', [isLsaCampaign('LOCAL_SERVICES', 'LocalServicesCampaign:SystemGenerated:0006'), isLsaCampaign('PERFORMANCE_MAX', 'Pay-per-lead-PMax-HORIZON HVAC Inc'), isLsaCampaign('performance_max', 'Local Services leads'), isLsaCampaign('PERFORMANCE_MAX', 'Campaign #1'), isLsaCampaign('SEARCH', 'LSA Search')], [true, true, true, false, false])

// --- the rows ---------------------------------------------------------------------
const row = (date, cost, conversions, over = {}) => ({ client_id: 'h', customer_id: '2193411105', date, campaign_id: 'c1', campaign_name: 'LocalServicesCampaign:SystemGenerated:0006', campaign_type: 'LOCAL_SERVICES', cost, conversions, clicks: 10, impressions: 100, ...over })
const rows = [
  row('2026-11-10', 120, 2),
  row('2026-11-11', 80, 1),
  row('2026-11-11', 50, 1, { campaign_id: 's1', campaign_name: 'Search', campaign_type: 'SEARCH' }),
  row('2026-11-03', 200, 3),
  row('2026-11-11', 40, 0, { client_id: 'b', customer_id: '999', campaign_id: 'p1', campaign_name: 'Pay-per-lead-PMax-Belk', campaign_type: 'PERFORMANCE_MAX' }),
  row('2026-11-06', 60, 1, { client_id: 's', customer_id: '555', campaign_id: 'c2', campaign_status: 'PAUSED' }),
  row('2026-11-10', 0, 0, { client_id: 's', customer_id: '555', campaign_id: 'c2', campaign_status: 'PAUSED' }),
]
check('only the Local Services rows', lsaRows(rows).map((r) => r.campaign_id), ['c1', 'c1', 'c1', 'p1', 'c2', 'c2'])

const lead = (id, over = {}) => ({ client_id: 'h', lead_id: id, lead_type: 'PHONE_CALL', lead_status: 'NEW', lead_charged: true, credit_state: null, created_at_google: '2026-11-11 10:00:00', created_date: '2026-11-11', ...over })
const leads = [lead('1'), lead('2', { lead_type: 'MESSAGE', lead_status: 'BOOKED' }), lead('3', { lead_charged: false, credit_state: 'CREDITED', lead_status: 'DECLINED', created_at_google: '2026-11-10 09:00:00', created_date: '2026-11-10' }), lead('4', { lead_type: 'BOOKING', created_date: '2026-11-03', created_at_google: '2026-11-03 08:00:00' })]
check('lead stats: every lead, the charged, the booked, the credited, by kind', leadStats(leads), { leads: 4, charged: 3, booked: 1, credited: 1, calls: 2, messages: 1, bookings: 1 })

// --- the KPIs ------------------------------------------------------------------
const h = lsaRows(rows).filter((r) => r.client_id === 'h')
check('with lead rows: leads are the leads, charged from the rows, cost per charged lead the number that matters', lsaKpis(h, leads), { spend: 400, days: 3, leads: 4, fromLeadRows: true, charged: 3, booked: 1, credited: 1, calls: 2, messages: 1, bookings: 1, cpl: 100, cpcl: 133.33 })
check('without lead rows: leads fall back to the campaign conversions, nothing charged is claimed', lsaKpis(h, []), { spend: 400, days: 3, leads: 6, fromLeadRows: false, charged: 0, booked: 0, credited: 0, calls: 0, messages: 0, bookings: 0, cpl: 66.67, cpcl: 0 })
check('daily rows: spend by day, leads from the lead rows by the day they came in', lsaDailyRows(h, leads).map((d) => [d.date, d.spend, d.leads]), [['2026-11-10', 120, 1], ['2026-11-11', 80, 2], ['2026-11-03', 200, 1]])
check('...and from conversions with no lead rows', lsaDailyRows(h, []).map((d) => [d.date, d.leads]), [['2026-11-10', 2], ['2026-11-11', 1], ['2026-11-03', 3]])

// --- every client -----------------------------------------------------------------
const clients = [
  { id: 'h', name: 'Horizon', google_ads_customer_id: '2193411105', lsa_customer_id: null, lsa_active: false, tier: 2 },
  { id: 'b', name: 'Belk', google_ads_customer_id: '111', lsa_customer_id: '999', lsa_active: true, tier: 2 },
  { id: 'q', name: 'Quiet Co', google_ads_customer_id: '222', lsa_customer_id: '333', lsa_active: false, tier: 2 },
  { id: 'm', name: 'Marked Co', google_ads_customer_id: null, lsa_customer_id: null, lsa_active: true, tier: 1 },
  { id: 'w', name: 'Hand Co', google_ads_customer_id: null, lsa_customer_id: null, lsa_active: true, tier: 1 },
  { id: 'n', name: 'New Co', google_ads_customer_id: null, lsa_customer_id: null, lsa_active: false, tier: 2 },
  { id: 'p', name: 'Paused Co', google_ads_customer_id: '444', lsa_customer_id: null, lsa_active: true, tier: 2, paused_at: '2026-10-01' },
  { id: 's', name: 'Stopped Co', google_ads_customer_id: '555', lsa_customer_id: null, lsa_active: true, tier: 2 },
  { id: 'x', name: 'Us', is_internal: true },
]
const hand = [{ client_id: 'w', week_of: '2026-11-09', ad_spend: 300, leads: 5 }, { client_id: 'w', week_of: '2026-10-05', ad_spend: 250, leads: 4 }]
const report = lsaClientReport({ clients, campaignRows: rows, leads, handRows: hand, since: '2026-11-05', until: '2026-11-11' })
check('states in order: live, stopped, connected and quiet, logged by hand, marked live with nothing connected, not connected, paused; internal left out', report.map((r) => [r.name, r.state]), [['Horizon', 'live'], ['Belk', 'live'], ['Stopped Co', 'stopped'], ['Quiet Co', 'connected'], ['Hand Co', 'by-hand'], ['Marked Co', 'marked'], ['New Co', 'not-connected'], ['Paused Co', 'paused']])
const stopped = report.find((r) => r.name === 'Stopped Co')
check('a client whose Local Services campaigns are paused in Google is stopped, not live, with the range\'s spend and the last day it spent', [stopped.stoppedWhy, stopped.spend, stopped.lastDate, stopped.quietDays], ['paused', 60, '2026-11-06', 5])

// --- stopped: paused in Google, or quiet for a week ------------------------------------
const quietRows = [row('2026-11-05', 90, 1, { client_id: 'z', campaign_status: 'ENABLED' })]
const quietClients = [{ id: 'z', name: 'Quiet Spend', google_ads_customer_id: '2193411105', tier: 2 }]
const quietAt = (today) => lsaClientReport({ clients: quietClients, campaignRows: quietRows, leads: [], handRows: [], since: '2026-11-01', until: '2026-11-12', today }).map((r) => [r.state, r.stoppedWhy, r.quietDays])
check('an enabled campaign with no spend for seven days reads stopped (quiet); six days is still live', [quietAt('2026-11-12'), quietAt('2026-11-11')], [[['stopped', 'quiet', 7]], [['live', '', 6]]])
check('why: every campaign paused or removed on its newest row; one still enabled is not paused', [
  stoppedWhy([row('2026-11-01', 1, 0, { campaign_status: 'ENABLED' }), row('2026-11-09', 0, 0, { campaign_status: 'PAUSED' })], '2026-11-01', '2026-11-03'),
  stoppedWhy([row('2026-11-09', 0, 0, { campaign_status: 'REMOVED' }), row('2026-11-09', 0, 0, { campaign_id: 'c9', campaign_status: 'PAUSED' })], '2026-11-01', '2026-11-03'),
  stoppedWhy([row('2026-11-09', 1, 0, { campaign_status: 'ENABLED' }), row('2026-11-09', 1, 0, { campaign_id: 'c9', campaign_status: 'PAUSED' })], '2026-11-01', '2026-11-03'),
  stoppedWhy([], '2026-11-01', '2026-11-08'),
], ['paused', 'paused', '', 'quiet'])
const horizon = report.find((r) => r.name === 'Horizon')
check('a client whose Local Services lives in their Search account says so, with the window\'s numbers', [horizon.inSearchAccount, horizon.account, horizon.spend, horizon.leads, horizon.charged, horizon.cpcl, horizon.lastDate, horizon.lastLead], [true, '2193411105', 200, 3, 2, 100, '2026-11-11', '2026-11-11 10:00:00'])
check('a separate Local Services account is named, and reads as its own', [report.find((r) => r.name === 'Belk').account, report.find((r) => r.name === 'Belk').inSearchAccount], ['999', false])
check('hand-logged weeks inside the window ride on the row, the older week left out', report.find((r) => r.name === 'Hand Co').hand, { spend: 300, leads: 5, weeks: 1 })
check('the connection counts', lsaConnection(report), { live: 2, stopped: 1, connected: 1, byHand: 1, marked: 1, notConnected: 1, paused: 1, total: 8 })

// --- the recent leads ----------------------------------------------------------------
check('recent leads newest first, naming the client, the kind and the status, charged or credited', recentLeads(leads, clients, 2).map((l) => [l.clientName, l.kind, l.status, l.charged, l.credited, l.at]), [['Horizon', 'Call', 'New', true, false, '2026-11-11 10:00:00'], ['Horizon', 'Message', 'Booked', true, false, '2026-11-11 10:00:00']])

if (failures) {
  console.log(`\n${failures} FAILED`)
  process.exit(1)
}
console.log('\nAll Local Services report checks passed.')
