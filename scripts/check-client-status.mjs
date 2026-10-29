// Self-check for the Client status board: the packages, the flags and the
// buckets. Run: node scripts/check-client-status.mjs
//
// The rule: A FLAG IS A REASON TO ACT TODAY. Red means something is broken
// or owed (ads off, no leads while spending, no new ad in ten days, money
// overdue), amber means a chase is overdue, blue is our own housekeeping.
// A client needs a call when anything red or amber is on them.

import { TIERS, tierBadgeLabel, tierFromFee, tierLabel, tierOf } from '../src/lib/clientTiers.js'
import { bucketRows, clientFlags, clientStatus, leadTotals, statusOrder } from '../src/lib/clientStatus.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

const TODAY = '2026-10-20'
const keysOf = (flags) => flags.map((f) => f.key)

// --- the packages --------------------------------------------------------------
check('three packages at $1,500, $2,500 and $3,500', TIERS.map((t) => [t.tier, t.price]), [[1, 1500], [2, 2500], [3, 3500]])
check('the fee says the package, within $100; anything else is unknown', [tierFromFee(1500), tierFromFee(2450), tierFromFee(3500), tierFromFee(998), tierFromFee(0), tierFromFee('x')], [1, 2, 3, 0, 0, 0])
check('a set tier wins over the fee; a fee alone is a guess; nothing is tier 0', [tierOf({ tier: 1, monthly_fee: 3500 }), tierOf({ monthly_fee: 2500 }), tierOf({ monthly_fee: 998 }), tierOf({})], [{ tier: 1, guessed: false }, { tier: 2, guessed: true }, { tier: 0, guessed: false }, { tier: 0, guessed: false }])
check('labels', [tierLabel(2), tierLabel(0)], ['Meta and Google', 'No tier yet'])

// --- leads from the ad days ------------------------------------------------------
const days = [
  { date: '2026-10-19', leads: 2, spend: 40 },
  { date: '2026-10-14', leads: 0, spend: 40 },
  { date: '2026-10-10', leads: 3, spend: 40 },
  { date: '2026-10-01', leads: 9, spend: 400 },
]
check('seven and fourteen day totals, the days with spend, the last lead date, older days ignored', leadTotals(days, TODAY), { leads7: 2, leads14: 5, spend7: 80, spend14: 120, spendDays7: 2, lastLeadDate: '2026-10-19' })

// --- the flags -------------------------------------------------------------------
const live = { id: 'c1', name: 'Acme', tier: 1, meta_ads_active: true, paused_at: null }
const running = { steps: [{ key: 'weekly-kpis', done: true }], ours: [], theirs: [], launched: true }
const quiet = () => clientFlags({ client: live, result: running, drop: { hasMeta: true, state: 'done', lastAdAt: '2026-10-15', daysSince: 5 }, leads: leadTotals(days, TODAY), payments: [], counts: { kpisThisWeek: 1 }, today: TODAY })
check('a running client with leads, a fresh ad and KPIs logged has no flags', quiet(), [])

const noLeads = clientFlags({ client: live, result: running, leads: leadTotals([{ date: '2026-10-19', leads: 0, spend: 300 }, { date: '2026-10-11', leads: 1, spend: 300 }], TODAY), counts: { kpisThisWeek: 1 }, today: TODAY })
check('spending with no lead for nine days is red', noLeads.map((f) => [f.key, f.severity]), [['no-leads', 'red']])
check('and says how long and how much', noLeads[0].label === 'No leads for 9 days' && noLeads[0].detail.includes('$600'), true)
check('no spend at all is not a leads flag (that is the ads-off alert)', keysOf(clientFlags({ client: live, result: running, leads: leadTotals([], TODAY), counts: { kpisThisWeek: 1 }, today: TODAY })), [])

// Low leads: a full week of ads for two leads or fewer is amber for the
// morning ("the clients only getting 1 or 2 leads a week in the running
// clean, flag those as needs attention").
const week = (leadsOn = {}) => Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${String(19 - i).padStart(2, '0')}`, leads: leadsOn[19 - i] || 0, spend: 50 }))
const low = clientFlags({ client: live, result: running, leads: leadTotals(week({ 19: 1, 16: 1 }), TODAY), counts: { kpisThisWeek: 1 }, today: TODAY })
check('two leads on seven days of spend is amber, with the spend and the cost per lead', low.map((f) => [f.key, f.severity, f.label]), [['low-leads', 'amber', 'Only 2 leads this week']])
// Six days inside the window: the seventh back is eight days old today.
check('...and the detail says so', low[0].detail.includes('$300 spent over 6 days for $150 a lead'), true)
check('one lead reads singular', clientFlags({ client: live, result: running, leads: leadTotals(week({ 18: 1 }), TODAY), counts: { kpisThisWeek: 1 }, today: TODAY })[0].label, 'Only 1 lead this week')
check('three leads is clean', keysOf(clientFlags({ client: live, result: running, leads: leadTotals(week({ 19: 1, 17: 1, 15: 1 }), TODAY), counts: { kpisThisWeek: 1 }, today: TODAY })), [])
check('two leads on three days of spend (live since Thursday) is not a bad week', keysOf(clientFlags({ client: live, result: running, leads: leadTotals(week({ 19: 1, 18: 1 }).slice(0, 3), TODAY), counts: { kpisThisWeek: 1 }, today: TODAY })), [])
check('no leads at all is the red flag alone, not both', keysOf(clientFlags({ client: live, result: running, leads: leadTotals(week(), TODAY), counts: { kpisThisWeek: 1 }, today: TODAY })), ['no-leads'])
check('a paused client is not flagged for low leads', keysOf(clientFlags({ client: { ...live, paused_at: '2026-10-01T00:00:00Z' }, result: running, leads: leadTotals(week({ 19: 1 }), TODAY), counts: { kpisThisWeek: 1 }, today: TODAY })), ['paused'])

const alertFlags = clientFlags({ client: live, result: running, alert: { kind: 'quiet', quietDays: 4, detail: 'Nothing has spent since 2026-10-16.' }, leads: leadTotals(days, TODAY), counts: { kpisThisWeek: 1 }, today: TODAY })
check('the delivery alert is a red flag, and beats the leads flag', alertFlags.map((f) => [f.key, f.severity, f.label]), [['ads-off', 'red', 'Meta ads stopped: 4 days without spend']])
check('a disabled account is its own red flag', keysOf(clientFlags({ client: live, result: running, alert: { kind: 'account', headline: 'Ad account disabled', detail: 'x' }, counts: { kpisThisWeek: 1 }, today: TODAY })), ['account'])

const staleVideo = clientFlags({ client: live, result: running, drop: { hasMeta: true, state: 'stale', lastAdAt: '2026-10-05T10:00:00Z', daysSince: 15, lastAdName: 'Fall tune-up' }, leads: leadTotals(days, TODAY), counts: { kpisThisWeek: 1 }, today: TODAY })
check('no new ad in ten days is red, with the last one named', staleVideo.map((f) => [f.key, f.severity, f.label]), [['video-stale', 'red', 'No new video or ad in 15 days']])
check('a new clip waiting is blue, and a stale client with a clip waiting is still stale', keysOf(clientFlags({ client: live, result: running, drop: { hasMeta: true, state: 'ready', behind: true, lastAdAt: '2026-10-05', daysSince: 15, waiting: [{ at: '2026-10-19' }] }, leads: leadTotals(days, TODAY), counts: { kpisThisWeek: 1 }, today: TODAY })), ['video-stale', 'clip-waiting'])
check('no ad yet on a client whose Meta ads are not live is onboarding, not a flag', keysOf(clientFlags({ client: { ...live, meta_ads_active: false }, result: { steps: [], ours: [], theirs: [], launched: false }, drop: { hasMeta: true, state: 'never', behind: true, lastAdAt: null, daysSince: null, waiting: [] }, leads: leadTotals([], TODAY), counts: {}, today: TODAY })), [])
// MCL: live on Google, off Meta. No video promise (that is Meta's), but
// spending with no leads is still a call.
const googleOnly = { steps: [], ours: [], theirs: [], launched: true, live: { meta: false, google: true, lsa: false }, leftMeta: true }
check('live on Google only: no Meta video flag, however stale', keysOf(clientFlags({ client: { ...live, meta_ads_active: false }, result: googleOnly, drop: { hasMeta: true, state: 'stale', behind: true, lastAdAt: '2026-09-01', daysSince: 40, waiting: [] }, leads: leadTotals([], TODAY), counts: { kpisThisWeek: 1 }, today: TODAY })), [])
check('live on Google only: spend with no leads is still a flag', keysOf(clientFlags({ client: { ...live, meta_ads_active: false }, result: googleOnly, leads: leadTotals([{ date: TODAY, leads: 0, spend: 300 }], TODAY), counts: { kpisThisWeek: 1 }, today: TODAY })), ['no-leads'])
check('a paused client is not stale and not chased for leads', keysOf(clientFlags({ client: { ...live, paused_at: '2026-10-01T00:00:00Z' }, result: running, drop: { hasMeta: true, state: 'paused', lastAdAt: '2026-09-01', daysSince: 49 }, leads: leadTotals([], TODAY), counts: { kpisThisWeek: 0 }, today: TODAY })), ['paused'])
check('a paused client with a failing card and an open chase is just paused: their invoices fail by design', keysOf(clientFlags({ client: { ...live, paused_at: '2026-09-25T00:00:00Z', monthly_fee: 998, tier: null }, result: { steps: [], ours: [], theirs: [{ key: 'photos', title: 'Photos', waitingDays: 30 }], launched: true }, drop: { hasMeta: true, state: 'paused', lastAdAt: '2026-09-01', daysSince: 49 }, leads: leadTotals([], TODAY), payments: [{ payment_type: 'monthly', status: 'overdue', due_date: '2026-09-30', amount: 998, failure_count: 9 }], counts: { kpisThisWeek: 0 }, today: TODAY })), ['paused'])

const money = clientFlags({ client: live, result: running, leads: leadTotals(days, TODAY), payments: [{ payment_type: 'monthly', status: 'pending', due_date: '2026-10-10', amount: 1500 }, { payment_type: 'monthly', status: 'paid', due_date: '2026-09-10', amount: 1500 }], counts: { kpisThisWeek: 1 }, today: TODAY })
check('an unpaid invoice past its date is red and says the amount', money.map((f) => [f.key, f.label]), [['payment', 'Payment overdue: $1,500']])
check('a failing card is red too', clientFlags({ client: live, result: running, leads: leadTotals(days, TODAY), payments: [{ payment_type: 'monthly', status: 'pending', due_date: '2026-11-10', amount: 1500, failure_count: 2 }], counts: { kpisThisWeek: 1 }, today: TODAY })[0].label, 'Card failing')

const waiting = clientFlags({ client: { ...live, meta_ads_active: false }, result: { steps: [], ours: [], theirs: [{ key: 'meta-access', title: 'Meta ad account and Page connected', waitingDays: 9 }, { key: 'photos', title: 'Photos and logo shared', waitingDays: 2 }], launched: false }, counts: {}, today: TODAY })
check('waiting on the client a week or more is amber, naming the steps that are', waiting.map((f) => [f.key, f.severity, f.label, f.detail]), [['waiting', 'amber', 'Waiting on them 9 days', 'Meta ad account and Page connected']])
check('under a week is not a flag', keysOf(clientFlags({ client: { ...live, meta_ads_active: false }, result: { steps: [], ours: [], theirs: [{ key: 'photos', title: 'Photos', waitingDays: 6 }], launched: false }, counts: {}, today: TODAY })), [])

check('a Google sync error is amber on the Whole Chain and up, and nothing on Maintenance', [keysOf(clientFlags({ client: { ...live, tier: 2, google_ads_customer_id: '1', google_ads_sync_error: 'PERMISSION_DENIED' }, result: running, leads: leadTotals(days, TODAY), counts: { kpisThisWeek: 1 }, today: TODAY })), keysOf(clientFlags({ client: { ...live, tier: 1, google_ads_customer_id: '1', google_ads_sync_error: 'x' }, result: running, leads: leadTotals(days, TODAY), counts: { kpisThisWeek: 1 }, today: TODAY }))], [['google-sync'], []])
check('KPIs not logged is blue, and only once live', [keysOf(clientFlags({ client: live, result: running, leads: leadTotals(days, TODAY), counts: { kpisThisWeek: 0 }, today: TODAY })), keysOf(clientFlags({ client: { ...live, meta_ads_active: false }, result: { steps: [], ours: [], theirs: [], launched: false }, counts: { kpisThisWeek: 0 }, today: TODAY }))], [['kpis'], []])
check('no package is blue; a package read from the fee is the package, no flag', [clientFlags({ client: { id: 'x', name: 'N' }, result: { steps: [], ours: [], theirs: [] }, counts: {}, today: TODAY }).map((f) => [f.key, f.label]), clientFlags({ client: { id: 'x', name: 'N', monthly_fee: 2500 }, result: { steps: [], ours: [], theirs: [] }, counts: {}, today: TODAY }).map((f) => f.label)], [[['tier', 'No package set']], []])
check('the short names say what the package is', [tierLabel(1), tierLabel(2), tierLabel(3)], ['$1,500 plan', 'Meta and Google', '$3,500 plan'])
check('the Clients list badge adds the price where the name has none', [tierBadgeLabel(1), tierBadgeLabel(2), tierBadgeLabel(3), tierBadgeLabel(0)], ['$1,500 plan', 'Meta and Google $2,500 plan', '$3,500 plan', 'No tier yet'])

const everything = clientFlags({ client: { ...live, monthly_fee: 1500, tier: null }, result: { steps: [], ours: [], theirs: [{ key: 'google-ads-access', title: 'Google Ads access', waitingDays: 20 }], launched: true }, drop: { hasMeta: true, state: 'stale', lastAdAt: '2026-10-01', daysSince: 19 }, leads: leadTotals([{ date: '2026-10-19', leads: 0, spend: 100 }], TODAY), payments: [{ payment_type: 'monthly', status: 'overdue', due_date: '2026-10-01', amount: 1500 }], counts: { kpisThisWeek: 0 }, today: TODAY })
check('worst first: red, then amber, then blue (a fee that says the package adds no flag)', everything.map((f) => f.severity), ['red', 'red', 'red', 'amber', 'blue'])

// --- the rows and the buckets --------------------------------------------------
const row = (client, extra = {}) => clientStatus({ client, result: running, leads: leadTotals(days, TODAY), counts: { kpisThisWeek: 1 }, today: TODAY, ...extra })
const a = row({ id: 'a', name: 'Alpha', tier: 2 })
const b = row({ id: 'b', name: 'Bravo', tier: 2 }, { alert: { kind: 'quiet', quietDays: 3, detail: '' } })
const c = row({ id: 'c', name: 'Charlie', monthly_fee: 3500 })
const d = row({ id: 'd', name: 'Delta' })
check('a row says whether a call is needed', [a.needsContact, b.needsContact, c.needsContact, d.needsContact], [false, true, false, false])
check('the buckets are the packages, with the unknowns in their own', Object.fromEntries(Object.entries(bucketRows([a, b, c, d])).map(([k, v]) => [k, v.map((r) => r.client.name)])), { 0: ['Delta'], 1: [], 2: ['Bravo', 'Alpha'], 3: ['Charlie'] })
check('inside a bucket the red ones lead', [a, b].sort(statusOrder).map((r) => r.client.name), ['Bravo', 'Alpha'])

console.log(failures === 0 ? '\nAll client status checks pass' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
