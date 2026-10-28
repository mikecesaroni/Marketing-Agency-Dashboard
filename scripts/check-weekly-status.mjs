// Self-check for the weekly executive status: the weeks, the totals, the
// trend rules, how the ads stand, whether a new ad is needed, the key
// points, the order and the plain-text report.
// Run: node scripts/check-weekly-status.mjs
//
// The rule: WORST FIRST, BIG POINTS ONLY. Ads off, then a down trend, then a
// new ad needed, then the rest, and never more than three points a client.

import { adStatusOf, agencyTotals, buildWeeklyStatus, creativeOf, keyPoints, reportWeeks, trendOf, weekTotals, weeklyLine, weeklyText } from '../src/lib/weeklyStatus.js'
import { addDays, mondayOf, weekRangeLabel } from '../src/lib/dates.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

// --- dates -----------------------------------------------------------------------
check('Monday of a Wednesday, a Sunday and a Monday', [mondayOf('2026-10-21'), mondayOf('2026-10-25'), mondayOf('2026-10-19')], ['2026-10-19', '2026-10-19', '2026-10-19'])
check('the report window is the last 7 days up to and including today, with three 7-day windows before it', reportWeeks('2026-10-21'), ['2026-09-24', '2026-10-01', '2026-10-08', '2026-10-15'])
check('on a Monday it is the 7 days through that Monday, not a calendar week', reportWeeks('2026-10-19')[3], '2026-10-13')
check('weeksBack moves 7 days earlier', reportWeeks('2026-10-21', 1)[3], '2026-10-08')
check('the week label, inside a month and across one', [weekRangeLabel('2026-10-12'), weekRangeLabel('2026-10-26')], ['Oct 12 to 18', 'Oct 26 to Nov 1'])
check('addDays across a year end', addDays('2026-12-30', 3), '2027-01-02')

// --- totals ----------------------------------------------------------------------
const days = [
  { date: '2026-10-11', leads: 9, spend: 100 }, // the Sunday before: out
  { date: '2026-10-12', leads: 2, spend: 40 },
  { date: '2026-10-18', leads: 3, spend: 60 },
  { date: '2026-10-19', leads: 7, spend: 10 }, // the Monday after: out
]
check('a week is Monday to Sunday inclusive', weekTotals(days, '2026-10-12'), { week: '2026-10-12', spend: 100, leads: 5, cpl: 20 })
check('no leads is a zero cost per lead, not a division', weekTotals([{ date: '2026-10-13', leads: 0, spend: 50 }], '2026-10-12').cpl, 0)

// --- the trend -------------------------------------------------------------------
const w = (leads, spend = 100) => ({ spend, leads, cpl: leads > 0 ? spend / leads : 0 })
check('nothing spent for two weeks is no trend', trendOf([w(0, 0), w(0, 0), w(0, 0), w(0, 0)]).key, 'none')
check('spending with no leads two weeks running is down', trendOf([w(3), w(2), w(0), w(0)]), { key: 'down', label: 'Down', why: 'No leads two weeks running' })
check('leads up a fifth on the week is up', trendOf([w(5), w(5), w(5), w(6)]).key, 'up')
check('leads up a fifth, and why', trendOf([w(5), w(5), w(5), w(6)]).why, 'Leads up 20% on the week')
check('leads down a fifth is down', trendOf([w(5), w(5), w(10), w(8)]), { key: 'down', label: 'Down', why: 'Leads down 20% on the week' })
check('three weeks rising is up, however small the steps', trendOf([w(1), w(2), w(3), w(4)]).why, 'Leads up three weeks running')
check('three weeks falling is down', trendOf([w(6), w(5), w(4), w(3)]).why, 'Leads down three weeks running')
check('leads after none is up', trendOf([w(0), w(0), w(0), w(3)]).why, '3 leads after none the week before')
check('one lead after none is steady, not a trend', trendOf([w(0), w(0), w(0), w(1)]).key, 'flat')
check('same leads, cost per lead down a fifth, is up', trendOf([w(5), w(5), w(5, 100), w(5, 70)]).why, 'Cost per lead down 30%')
check('same leads, cost per lead up a quarter, is down', trendOf([w(5), w(5), w(5, 100), w(5, 130)]).why, 'Cost per lead up 30%')
check('a small move is steady', trendOf([w(10), w(10), w(10), w(11)]), { key: 'flat', label: 'Steady', why: '' })

// --- how the ads stand ------------------------------------------------------------
const live = { id: 'a', name: 'Acme', meta_ads_active: true, paused_at: null }
const row = (over = {}) => ({ client: live, flags: [], result: { launched: true, next: null }, drop: null, leads: { spend14: 0 }, ...over })
check('spending and no flag is running', adStatusOf(row(), w(5)).key, 'running')
check('a disabled account', adStatusOf(row({ flags: [{ key: 'account', severity: 'red', label: 'Ad account disabled' }] }), w(0, 0)).label, 'Account disabled')
check('ads gone quiet', adStatusOf(row({ flags: [{ key: 'ads-off', severity: 'red', label: 'Meta ads stopped: 3 days without spend' }] }), w(0, 0)), { key: 'quiet', label: 'Ads stopped', tone: 'red', detail: 'Meta ads stopped: 3 days without spend' })
check('paused beats everything', adStatusOf(row({ client: { ...live, paused_at: '2026-10-01' }, flags: [{ key: 'account' }] }), w(0, 0)).key, 'paused')
check('not live and not launched is onboarding', adStatusOf(row({ client: { ...live, meta_ads_active: false }, result: { launched: false } }), w(0, 0)).label, 'Onboarding')
check('live somewhere but nothing spent last week is no spend, not off', adStatusOf(row({ client: { ...live, meta_ads_active: false } }), w(0, 0)).label, 'No spend last week')
check('been through Meta and switched everything off is not running', adStatusOf(row({ client: { ...live, meta_ads_active: false }, result: { launched: false, published: true } }), w(0, 0)).label, 'Not running')
check('a Google-only client with spend is running', adStatusOf(row({ client: { ...live, meta_ads_active: false }, result: { launched: true, live: { meta: false, google: true, lsa: false } } }), w(300, 4)).label, 'Running')
check('live with nothing spent last week', adStatusOf(row(), w(0, 0)).key, 'nospend')

// --- a new ad needed? --------------------------------------------------------------
check('no Meta account: nothing to say', creativeOf(row({ drop: { hasMeta: false } })).key, 'none')
check('ten days without an ad needs one', creativeOf(row({ drop: { hasMeta: true, state: 'stale', behind: true, daysSince: 15, waiting: [] } })), { key: 'need', label: 'New ad needed: 15 days', tone: 'red', needAd: true })
check('never an ad needs one', creativeOf(row({ drop: { hasMeta: true, state: 'never', behind: true, daysSince: null, waiting: [] } })).label, 'No ad yet')
check('never an ad on a client not live yet is nothing: they are onboarding', creativeOf(row({ client: { ...live, meta_ads_active: false }, drop: { hasMeta: true, state: 'never', behind: true, daysSince: null, waiting: [] } })).key, 'none')
check('a clip waiting, and not behind', creativeOf(row({ drop: { hasMeta: true, state: 'ready', behind: false, daysSince: 3, waiting: [{ at: 'x' }] } })), { key: 'clip', label: '1 clip waiting to publish', tone: 'purple', needAd: false })
check('a clip waiting while behind is still a new ad needed', creativeOf(row({ drop: { hasMeta: true, state: 'ready', behind: true, daysSince: 12, waiting: [{ at: 'x' }, { at: 'y' }] } })), { key: 'clip', label: '2 clips waiting, 12 days since an ad', tone: 'red', needAd: true })
check('fresh', creativeOf(row({ drop: { hasMeta: true, state: 'done', behind: false, daysSince: 4, waiting: [] } })).label, 'New ad 4d ago')

// --- the key points ------------------------------------------------------------------
const pts = (over, ads, creative, trend, now = w(5), prev = w(4)) => keyPoints({ row: row(over), ads, creative, trend, now, prev })
check('a clean running client says so', pts({}, { key: 'running' }, { key: 'fresh' }, { key: 'flat', why: '' }, w(0, 0), w(0, 0)), ['Running clean'])
check('steady with leads names the numbers', pts({}, { key: 'running' }, { key: 'fresh' }, { key: 'flat', why: '' }, w(5, 100), w(4)), ['5 leads at $20 each, about the same as the week before'])
check('ads off leads, then the stale ad, three at most', pts({ flags: [{ key: 'ads-off', label: 'Meta ads stopped: 3 days without spend' }, { key: 'payment', label: 'Payment overdue: $1,500' }], drop: { daysSince: 15 } }, { key: 'quiet' }, { key: 'need', label: 'New ad needed: 15 days' }, { key: 'down', why: 'Leads down 40% on the week' }), ['Meta ads stopped: 3 days without spend', 'Leads down 40% on the week', 'No new ad in 15 days'])
check('no leads while spending says the money, and does not repeat the down trend', pts({ flags: [{ key: 'no-leads', label: 'No leads for 9 days' }], leads: { spend14: 620 } }, { key: 'running' }, { key: 'fresh' }, { key: 'down', why: 'No leads two weeks running' }), ['No leads for 9 days, $620 spent in two weeks'])
check('onboarding names the next step', pts({ result: { launched: false, next: { title: 'Meta ad account and Page connected' } } }, { key: 'onboarding', label: 'Onboarding' }, { key: 'none' }, { key: 'none', why: '' }, w(0, 0), w(0, 0)), ['Next: Meta ad account and Page connected'])
check('a clip waiting is a point', pts({ drop: { daysSince: 2 } }, { key: 'running' }, { key: 'clip', label: '1 clip waiting to publish', needAd: false }, { key: 'up', why: 'Leads up 50% on the week' }), ['Leads up 50% on the week', 'A clip is waiting to publish'])
check('a chase on a running client is not a point', pts({ flags: [{ key: 'waiting', label: 'Waiting on them 47 days', detail: 'GHL account details sent back' }] }, { key: 'running' }, { key: 'fresh' }, { key: 'flat', why: '' }, w(0, 0), w(0, 0)), ['Running clean'])
check('a chase while onboarding is the point', pts({ flags: [{ key: 'waiting', label: 'Waiting on them 12 days', detail: 'Onboarding form filled in' }], result: { launched: false, next: { title: 'Onboarding form filled in' } } }, { key: 'onboarding', label: 'Onboarding' }, { key: 'none' }, { key: 'none', why: '' }, w(0, 0), w(0, 0)), ['Waiting on them 12 days: Onboarding form filled in'])

// --- the whole report -------------------------------------------------------------
const TODAY = '2026-10-21'
const mk = (id, name, over = {}) => ({ client: { id, name, meta_ads_active: true, paused_at: null, archived: false, is_internal: false }, flags: [], result: { launched: true, next: null }, drop: { hasMeta: true, state: 'done', behind: false, daysSince: 3, waiting: [] }, leads: { spend14: 0 }, needsContact: false, tier: 1, ...over })
const dayRows = (id, perWeek) => reportWeeks(TODAY).flatMap((monday, i) => [{ client_id: id, date: addDays(monday, 2), leads: perWeek[i][0], spend: perWeek[i][1] }])
const statusRows = [
  mk('up', 'Upward Plumbing', { tier: 2 }),
  mk('off', 'Quiet HVAC', { flags: [{ key: 'ads-off', severity: 'red', label: 'Meta ads stopped: 4 days without spend' }], needsContact: true }),
  mk('stale', 'Stale Electric', { drop: { hasMeta: true, state: 'stale', behind: true, daysSince: 14, waiting: [] }, flags: [{ key: 'video-stale', severity: 'red', label: 'No new video or ad in 14 days' }], needsContact: true }),
  mk('new', 'New Roofing', { client: { id: 'new', name: 'New Roofing', meta_ads_active: false, archived: false, is_internal: false }, result: { launched: false, next: { title: 'Onboarding call booked' } }, drop: { hasMeta: false }, tier: 0 }),
  mk('down', 'Down Drains'),
  mk('gone', 'Archived Co', { client: { id: 'gone', name: 'Archived Co', archived: true } }),
]
const metaRows = [
  ...dayRows('up', [[2, 100], [3, 100], [5, 100], [8, 100]]),
  ...dayRows('off', [[4, 100], [4, 100], [2, 60], [0, 0]]),
  ...dayRows('stale', [[5, 100], [5, 100], [5, 100], [4, 100]]),
  ...dayRows('down', [[10, 200], [10, 200], [10, 200], [6, 200]]),
]
const googleRows = [{ client_id: 'up', date: addDays(reportWeeks(TODAY)[3], 4), conversions: 2, cost: 50 }]
const lsaRows = [{ client_id: 'stale', week_of: reportWeeks(TODAY)[3], leads: 1, ad_spend: 10 }]
const report = buildWeeklyStatus({ statusRows, metaRows, googleRows, lsaRows, day: TODAY })
check('the report window and its label: the 7 days through today', [report.week, report.label, report.prevLabel], ['2026-10-15', 'Oct 15 to 21', 'Oct 8 to 14'])
check('archived clients are left out', report.rows.length, 5)
check('worst first: ads off, the down trend, the stale one, onboarding, then the win', report.rows.map((r) => r.client.id), ['off', 'down', 'stale', 'new', 'up'])
const up = report.rows.find((r) => r.client.id === 'up')
check('Google conversions count as leads, with their cost', [up.now.leads, up.now.spend], [10, 150])
check('four weeks of totals, oldest first', up.weeks.map((x) => x.leads), [2, 3, 5, 10])
check('three weeks rising reads as up', up.trend.why, 'Leads up three weeks running')
check('the change week over week', Math.round(up.change.leads), 100)
const stale = report.rows.find((r) => r.client.id === 'stale')
check('an LSA week logged by hand counts in its week', [stale.now.leads, stale.now.spend], [5, 110])
check('stale needs an ad and says so', [stale.creative.needAd, stale.points], [true, ['5 leads at $22 each, about the same as the week before', 'No new ad in 14 days']])
const off = report.rows.find((r) => r.client.id === 'off')
check('ads off: status, no spend, the alert as the point', [off.ads.key, off.now.spend, off.points[0]], ['quiet', 0, 'Meta ads stopped: 4 days without spend'])
check('the totals across the book (the quiet client fell three weeks, so it counts as down too)', [report.totals.spend, report.totals.leads, report.totals.running, report.totals.up, report.totals.down, report.totals.needAds, report.totals.adsOff], [460, 21, 3, 1, 2, 1, 1])
check('the agency cost per lead and its change', [Math.round(report.totals.cpl), Math.round(report.totals.change.cpl)], [22, 5])
check('a line per client', weeklyLine(up), 'Upward Plumbing: Running · $150 (up 50%), 10 leads (up 100%) at $15 (down 25%) · up · New ad 3d ago. Leads up three weeks running.')
const text = weeklyText(report, { appUrl: 'https://crm.example' })
check('the text leads with the window and the totals', text.split('\n')[0], 'WEEKLY STATUS · Oct 15 to 21')
check('the text groups the clients', ['NEEDS A DECISION (3)', 'NOT RUNNING YET (1)', 'TRENDING UP (1)', 'https://crm.example/weekly'].every((s) => text.includes(s)), true)
check('agencyTotals on nothing', agencyTotals([]).clients, 0)

console.log(failures === 0 ? '\nAll weekly status checks pass' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
