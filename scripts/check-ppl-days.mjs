// Self-check for Google pay per lead in the morning numbers.
// Run: node scripts/check-ppl-days.mjs
//
// 2026-11-19: "so is the CRM able to track leads from Google LSA / pay per
// lead? and include that in numbers from the morning brief".

import { readFileSync } from 'node:fs'
import { googleAdDays, ourLeadRows, payPerLeadWeek } from '../src/lib/pplDays.js'
import { payPerLeadFromRows, statusFromRows } from '../src/lib/statusRows.js'
import { leadTotals } from '../src/lib/clientStatus.js'
import { briefSections, briefText, buildBrief, payPerLeadWords } from '../src/lib/teamBrief.js'
import { buildWeeklyStatus } from '../src/lib/weeklyStatus.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const TODAY = '2026-11-19'
const g = (client_id, date, campaign_type, campaign_name, cost, conversions, campaign_id = `${client_id}-${campaign_type}`) => ({ client_id, campaign_id, date, campaign_type, campaign_name, cost, conversions })
const lead = (client_id, created_date, lead_charged = true) => ({ client_id, created_date, lead_charged })

// --- the ad days ------------------------------------------------------------------------------
const googleRows = [
  g('a', '2026-11-18', 'SEARCH', 'WC_Search_HVAC', 50, 2),
  // Pay per lead with lead records: 3 conversions by Google's attribution, 2 leads on record.
  g('a', '2026-11-18', 'PAY_PER_LEAD', 'Pay-per-lead-PMax-A', 120, 3),
  // Pay per lead with no lead records at all: the conversions stand.
  g('b', '2026-11-17', 'LOCAL_SERVICES', 'LocalServicesCampaign:SystemGenerated:1', 80, 2),
]
const leadRows = [lead('a', '2026-11-18'), lead('a', '2026-11-17', false)]
const days = googleAdDays(googleRows, leadRows)
check('a Search day keeps its conversions; a pay-per-lead day keeps its spend and gives its leads to the lead records', days.filter((d) => d.client_id === 'a').map((d) => [d.date, d.leads, d.spend, Boolean(d.ppl), Boolean(d.lead), Boolean(d.charged)]), [['2026-11-18', 2, 50, false, false, false], ['2026-11-18', 0, 120, true, false, false], ['2026-11-18', 1, 0, true, true, true], ['2026-11-17', 1, 0, true, true, false]])
check('...and a client with no lead records keeps the campaign conversions', days.filter((d) => d.client_id === 'b').map((d) => [d.leads, d.spend, Boolean(d.ppl)]), [[2, 80, true]])
const totals = leadTotals(days.filter((d) => d.client_id === 'a'), TODAY)
check('so a client\'s week is Search conversions plus pay-per-lead leads, never both for one campaign', [totals.leads7, totals.spend7], [4, 170])
check('nothing is no days', googleAdDays(), [])

// --- a client's own campaign from before we connected stays out, leads and all -------------------
const legacy = [{ client_id: 'c', channel: 'google', campaign_id: 'c-old' }]
const withOld = [g('c', '2026-11-18', 'LOCAL_SERVICES', 'x', 40, 1, 'c-old'), g('d', '2026-11-18', 'LOCAL_SERVICES', 'x', 40, 1, 'd-new')]
check('lead records of a client whose only pay-per-lead campaign is their own old one are not ours; another client\'s are', ourLeadRows([lead('c', '2026-11-18'), lead('d', '2026-11-18'), lead('e', '2026-11-18')], withOld, legacy).map((l) => l.client_id), ['d', 'e'])
check('...with no legacy campaigns every lead record counts', ourLeadRows([lead('c', '2026-11-18')], withOld, []).length, 1)

// --- the week, per business ----------------------------------------------------------------------
const week = payPerLeadWeek({
  days: googleAdDays(
    [...googleRows, g('h', '2026-11-16', 'PAY_PER_LEAD', 'Pay-per-lead-PMax-H', 300, 4), g('a', '2026-11-05', 'PAY_PER_LEAD', 'Pay-per-lead-PMax-A', 999, 9), g('z', '2026-11-18', 'SEARCH', 'WC_Search', 70, 5)],
    [...leadRows, lead('h', '2026-11-16'), lead('h', '2026-11-15'), lead('h', '2026-11-14', false), lead('a', '2026-11-04')]
  ),
  clients: [{ id: 'a', name: 'Acme Heating' }, { id: 'b', name: 'Belk Cooling' }, { id: 'z', name: 'Search Only' }],
  ours: [{ id: 'h', name: 'Horizon HVAC' }],
  today: TODAY,
})
check('the last seven days per business: leads, charged and spend; clients first, ours marked; Search-only and older days left out', week, [
  { id: 'a', name: 'Acme Heating', ours: false, leads: 2, charged: 1, spend: 120, fromLeadRows: true },
  { id: 'b', name: 'Belk Cooling', ours: false, leads: 2, charged: 0, spend: 80, fromLeadRows: false },
  { id: 'h', name: 'Horizon HVAC', ours: true, leads: 3, charged: 2, spend: 300, fromLeadRows: true },
])
check('in words: charged only when the leads are lead records, cost per charged lead when there is spend', [payPerLeadWords(week[0]), payPerLeadWords(week[1]), payPerLeadWords(week[2]), payPerLeadWords({ leads: 1, charged: 0, spend: 0, fromLeadRows: true })], ['2 leads (1 charged) · $120 spent · $120 per charged lead', '2 leads · $80 spent', '3 leads (2 charged) · $300 spent · $150 per charged lead', '1 lead (0 charged)'])
check('nobody running pay per lead is an empty list', payPerLeadWeek({ days: googleAdDays([g('z', '2026-11-18', 'SEARCH', 'WC_Search', 70, 5)], []), clients: [{ id: 'z', name: 'Z' }], today: TODAY }), [])

// --- through the status rows and into the brief ---------------------------------------------------
const client = (id, name, extra = {}) => ({ id, name, archived: false, is_internal: false, meta_ads_active: true, ...extra })
const raw = {
  day: TODAY,
  pipeline: { clients: [client('a', 'Acme Heating'), client('p', 'Paused Co', { paused_at: '2026-11-01T00:00:00Z' })], intakes: [], links: [], ghl: [], deliverables: [], payments: [], calls: [], files: [], saved: [], published: [], kpis: [], reports: [], overrides: [], googleRows: [], legacy: [] },
  legacy: [],
  metaRows: [{ client_id: 'a', campaign_id: 'm1', date: '2026-11-18', leads: 3, spend: 60 }],
  googleRows: [...googleRows, g('h', '2026-11-16', 'PAY_PER_LEAD', 'Pay-per-lead-PMax-H', 300, 4), g('p', '2026-11-18', 'PAY_PER_LEAD', 'Pay-per-lead-PMax-P', 10, 1)],
  lsaLeads: [...leadRows, lead('h', '2026-11-16')],
  ours: [{ id: 'h', name: 'Horizon HVAC' }],
}
const rows = statusFromRows(raw)
const acme = rows.find((r) => r.client.id === 'a')
check('the status row\'s leads this week are Meta + Search conversions + pay-per-lead lead records', [acme.leads.leads7, acme.leads.spend7], [7, 230])
const ppl = payPerLeadFromRows(raw)
check('the brief\'s pay-per-lead list: the clients in the brief (a paused client left out), then our own businesses', ppl.map((p) => [p.name, p.ours, p.leads, p.charged, p.spend]), [['Acme Heating', false, 2, 1, 120], ['Horizon HVAC', true, 1, 1, 300]])
const model = buildBrief({ statusRows: rows, day: TODAY, appUrl: 'https://crm.example', payPerLead: ppl })
const section = briefSections(model).find((s) => s.key === 'ppl')
check('the brief gets a section of its own, one line a business, ours tagged, linking to the pay-per-lead report', [section.title, section.lines.map((l) => [l.client.name, l.tag || '', l.text, l.href])], ['Google pay per lead (LSA), last 7 days', [['Acme Heating', '', '2 leads (1 charged) · $120 spent · $120 per charged lead', '/reports/lsa'], ['Horizon HVAC', 'ours', '1 lead (1 charged) · $300 spent · $300 per charged lead', '/reports/lsa']]])
check('...and it reads in the text of the brief', briefText(model).includes('GOOGLE PAY PER LEAD (LSA), LAST 7 DAYS\n📞 Acme Heating: 2 leads (1 charged) · $120 spent · $120 per charged lead\n📞 Horizon HVAC (ours): 1 lead (1 charged) · $300 spent · $300 per charged lead'), true)
check('with nobody on pay per lead the brief has no such section', briefSections(buildBrief({ statusRows: rows, day: TODAY })).some((s) => s.key === 'ppl'), false)

// --- the Monday status counts them the same way ------------------------------------------------------
const weekly = buildWeeklyStatus({
  statusRows: rows,
  metaRows: [],
  googleRows: [g('a', '2026-11-14', 'PAY_PER_LEAD', 'Pay-per-lead-PMax-A', 200, 9), g('a', '2026-11-14', 'SEARCH', 'WC_Search', 100, 1)],
  leadRows: [lead('a', '2026-11-14'), lead('a', '2026-11-15')],
  day: TODAY,
})
const wa = weekly.rows.find((r) => r.client.id === 'a')
check('the last seven days on the Monday status: Search conversions plus the lead records, not the pay-per-lead conversions', [wa.now.leads, wa.now.spend], [3, 300])

// --- the wiring ----------------------------------------------------------------------------------------
const statusSrc = read('src/lib/statusRows.js')
const weeklySrc = read('src/lib/weeklyRows.js')
const fn = read('supabase/functions/team-digest/index.ts')
check('the lead records and the campaign type are read for the board, the brief and the Monday status', [statusSrc.includes(".from('lsa_leads').select('id, client_id, created_date, lead_charged')"), statusSrc.includes('campaign_type, campaign_name, date, conversions, cost'), weeklySrc.includes(".from('lsa_leads')"), weeklySrc.includes('campaign_type, campaign_name')], [true, true, true, true])
check('the brief function passes the pay-per-lead week in, and the bundle carries the builder', [fn.includes('payPerLead: payPerLeadFromRows(statusRaw)'), read('supabase/functions/team-digest/model.entry.js').includes('payPerLeadFromRows')], [true, true])

if (failures) {
  console.log(`\n${failures} FAILED`)
  process.exit(1)
}
console.log('\nAll pay-per-lead day checks passed.')
