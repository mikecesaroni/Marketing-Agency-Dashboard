// Self-check for the client dashboard: the range maths, the totals, the ads
// list, the return story, and the words under every number.
// Run: node scripts/check-client-dashboard.mjs
import { readFileSync } from 'node:fs'
import {
  METRIC_GUIDE,
  RANGES,
  VERDICT_LEGEND,
  adVerdict,
  adsFor,
  between,
  cleanAdName,
  dailySeries,
  dashboardLink,
  guideFor,
  landingLabel,
  lsaFor,
  mondayOf,
  newToken,
  pctChange,
  perDay,
  previewFrame,
  rates,
  mergeRevenueMonth,
  monthLabel,
  monthToLog,
  parseCount,
  parseMoney,
  revenueEntryProblem,
  revenueLogSummary,
  revenueMonths,
  revenueTotals,
  sumDays,
  windowFor,
} from '../src/lib/clientDashboard.js'
import { buildWeeklyModel, renderWeeklyHtml, renderWeeklyText, weekFrom } from '../supabase/functions/weekly-report/weekly.ts'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

// ------------------------------------------------ the landing page on a card
// "Add in the landing page the ads are using in the KPI dash if the ads are
// landing page ads." The function reads where each creative sends people;
// the card shows it as a link, the way a person reads an address.
check('a landing page reads as host and path, no scheme, www, query or trailing slash', landingLabel('https://www.belknapheating.com/fall-tune-up/?utm_source=fb&utm_medium=paid'), 'belknapheating.com/fall-tune-up')
check('a bare site is just the host', landingLabel('http://belknapheating.com'), 'belknapheating.com')
check('a form id, a blank, a non-address: nothing to show', [landingLabel('1234567890'), landingLabel(''), landingLabel('mailto:x@y.z'), landingLabel(null)], ['', '', '', ''])
check('a long address is cut to fit a card', landingLabel(`https://example.com/${'a'.repeat(200)}`).length, 80)
const dashFn = readFileSync(new URL('../supabase/functions/client-dashboard/index.ts', import.meta.url), 'utf8')
check('the function asks Meta where each creative sends people: the link, the button, the dynamic link_urls', [dashFn.includes('link_data{picture,image_hash,link,call_to_action}'), dashFn.includes('video_data{video_id,image_url,image_hash,call_to_action}'), dashFn.includes('link_urls,call_to_actions')], [true, true, true])
check('an instant form is a form, not a landing page; Facebook-internal links are not one either', [dashFn.includes('lead_gen_form_id'), dashFn.includes("return { landing: null, form: true }"), /facebook\|fb\|instagram\|messenger/.test(dashFn)], [true, true, true])
const dashPage = readFileSync(new URL('../src/pages/ClientDashboardPage.jsx', import.meta.url), 'utf8')
check('the card links the landing page in a new tab and says when the form is inside Facebook instead', [dashPage.includes('data-ad-landing={creative.landing}'), dashPage.includes('Goes to {landingLabel(creative.landing)}'), dashPage.includes('Form opens inside Facebook, no landing page'), dashPage.includes('data-lightbox-landing')], [true, true, true, true])

// --------------------------------------------------------------- the ranges
check('three ranges', RANGES.map((r) => r.value), [7, 30, 90])
check('30 days ending today, and the 30 before', windowFor(30, '2026-10-09'), { days: 30, from: '2026-09-10', to: '2026-10-09', prevFrom: '2026-08-11', prevTo: '2026-09-09' })
check('7 days', windowFor(7, '2026-10-09'), { days: 7, from: '2026-10-03', to: '2026-10-09', prevFrom: '2026-09-26', prevTo: '2026-10-02' })
check('monday of a Friday', mondayOf('2026-10-09'), '2026-10-05')
check('monday of a Sunday is the Monday before', mondayOf('2026-10-11'), '2026-10-05')
check('percent change', [pctChange(14, 8), pctChange(1, 0)], [75, null])

// --------------------------------------------------------------- the numbers
check('rates', rates({ spend: 512.4, leads: 12, impressions: 20000, clicks: 300 }), { spend: 512.4, leads: 12, impressions: 20000, clicks: 300, cpl: 42.7, ctr: 1.5 })
const days = [
  { date: '2026-10-01', meta_spend: 100, meta_leads: 2, meta_impressions: 1000, meta_clicks: 20, google_spend: 50, google_leads: 1, google_impressions: 500, google_clicks: 10 },
  { date: '2026-10-02', meta_spend: 100, meta_leads: 2, meta_impressions: 1000, meta_clicks: 20, google_spend: 0, google_leads: 0, google_impressions: 0, google_clicks: 0 },
  { date: '2026-10-05', meta_spend: 10, meta_leads: 0, meta_impressions: 100, meta_clicks: 1, google_spend: 0, google_leads: 0, google_impressions: 0, google_clicks: 0 },
]
const t = sumDays(between(days, '2026-10-01', '2026-10-02'))
check('totals across both channels', [t.spend, t.leads, t.impressions, t.clicks, t.cpl, t.ctr], [250, 5, 2500, 50, 50, 2])
check('each channel on its own', [t.meta.spend, t.meta.leads, t.google.spend, t.google.leads], [200, 4, 50, 1])
check('between keeps the range only', between(days, '2026-10-02', '2026-10-09').map((d) => d.date), ['2026-10-02', '2026-10-05'])
const series = dailySeries(days, '2026-09-30', '2026-10-02', 'leads')
check('daily series fills the gaps', series, [
  { date: '2026-09-30', meta: 0, google: 0, total: 0 },
  { date: '2026-10-01', meta: 2, google: 1, total: 3 },
  { date: '2026-10-02', meta: 2, google: 0, total: 2 },
])
check('daily series for spend', dailySeries(days, '2026-10-01', '2026-10-01', 'spend')[0].total, 150)
check('spend per day on average', [perDay(900, 30), perDay(100, 7), perDay(0, 0)], [30, 14.29, 0])

// ------------------------------------------------------------------- the ads
check('ad names are shown whole', [cleanAdName('WC_Summer | 2026-10-08 | AC died? Same-day'), cleanAdName('  WC_Pillar · Oct 9 · Offer led '), cleanAdName('')], ['WC_Summer | 2026-10-08 | AC died? Same-day', 'WC_Pillar · Oct 9 · Offer led', 'Untitled ad'])
const ads = [
  { key: 'a', name: 'WC_Summer | x | Hook A', channel: 'meta', w: 30, spend: 100, leads: 4, impressions: 1000, clicks: 30, published_on: '2026-10-09' },
  { key: 'a', name: 'WC_Summer | x | Hook A', channel: 'meta', w: 7, spend: 30, leads: 1, impressions: 300, clicks: 9 },
  { key: 'g', name: 'Search', channel: 'google', w: 30, spend: 50, leads: 4, impressions: 200, clicks: 20 },
  { key: 'z', name: 'Nothing ran', channel: 'meta', w: 30, spend: 0, leads: 0, impressions: 0, clicks: 0 },
]
const list = adsFor(ads, 30)
check('ads for the range, most leads then cheapest first, nothing-ran dropped', list.map((a) => a.name), ['Search', 'WC_Summer | x | Hook A'])
check('the published date travels with the ad', list.map((a) => a.publishedOn), [null, '2026-10-09'])
check('ad rates', [list[0].cpl, list[0].ctr, list[1].cpl], [12.5, 10, 25])
check('ads for 7 days', adsFor(ads, 7).map((a) => a.leads), [1])

// ------------------------------------------------------- which ones work
check('working: leads at or under the average cost', adVerdict({ leads: 4, spend: 100, cpl: 25 }, 40).label, 'Working')
check('working: a touch over the average still counts', adVerdict({ leads: 2, spend: 90, cpl: 45 }, 40).label, 'Working')
check('costly: well over it', adVerdict({ leads: 1, spend: 100, cpl: 100 }, 40).label, 'Costly')
check('fair: a little over', adVerdict({ leads: 2, spend: 100, cpl: 50 }, 40).label, 'Fair')
check('no leads after real spend', adVerdict({ leads: 0, spend: 60, cpl: 0 }, 40).label, 'No leads yet')
check('too early to say', adVerdict({ leads: 0, spend: 12, cpl: 0 }, 40).label, 'Too early')
check('with no average yet, any lead is working', adVerdict({ leads: 1, spend: 90, cpl: 90 }, 0).label, 'Working')
check('every verdict has a sentence', ['working', 'costly', 'fair', 'none', 'early'].every((k) => [adVerdict({ leads: 4, spend: 100, cpl: 25 }, 40), adVerdict({ leads: 1, spend: 100, cpl: 100 }, 40), adVerdict({ leads: 2, spend: 100, cpl: 50 }, 40), adVerdict({ leads: 0, spend: 60, cpl: 0 }, 40), adVerdict({ leads: 0, spend: 12, cpl: 0 }, 40)].some((v) => v.key === k && v.note.length > 20)), true)
check('the legend has no em dash', /[—–]/.test(VERDICT_LEGEND), false)

// ------------------------------------------------------------------- the rest
check('LSA takes the weeks the range touches', lsaFor([{ week_of: '2026-09-28', spend: 100, leads: 3 }, { week_of: '2026-09-21', spend: 50, leads: 1 }], '2026-10-01', '2026-10-09').spend, 100)
// --- the revenue tracker ---------------------------------------------------
// The rule: A MONTH IS LOGGED OR IT IS NOT, AND AN UNLOGGED MONTH NEVER COUNTS
// AGAINST THE CLIENT. Zero jobs is an answer; a month nobody touched is not.
const RAW = [
  { month: '2026-11-01', spend: 662, leads: 13, jobs: null, revenue: null, source: null },
  { month: '2026-10-01', spend: 1335.92, leads: 28, jobs: 4, revenue: 12500.46, source: 'month' },
  { month: '2026-08-01', spend: 2535, leads: 72, jobs: 0, revenue: 0, source: 'month' },
  { month: '2026-07-01', spend: 545, leads: 24, jobs: null, revenue: null, source: null },
  { month: '2026-12-01', spend: 0, leads: 0, jobs: 9, revenue: 9, source: 'month' },
]
const R = revenueMonths(RAW, '2026-11-21')
check('months run newest first from the first month with ads to this one, gaps filled', R.map((r) => r.month), ['2026-11-01', '2026-10-01', '2026-09-01', '2026-08-01', '2026-07-01'])
check('a month that has not started is left out', R.some((r) => r.month === '2026-12-01'), false)
check('this month is marked, and only this month', R.filter((r) => r.current).map((r) => r.month), ['2026-11-01'])
check('a month the ads were off is a row of zeros, not logged', [R[2].spend, R[2].leads, R[2].logged, R[2].revenue], [0, 0, false, null])
check('a logged month carries its return, close rate and value per job', [R[1].back, R[1].closeRate, R[1].perJob], [9.36, 14, 3125.12])
check('zero jobs and $0 is an answer', [R[3].logged, R[3].jobs, R[3].revenue, R[3].back], [true, 0, 0, 0])
check('an unlogged month has no figures at all', [R[0].jobs, R[0].revenue, R[0].back, R[0].closeRate], [null, null, null, null])
check('months are named for an owner', [monthLabel('2026-10-01'), monthLabel('2026-10-01', true), R[1].label], ['October 2026', 'Oct 2026', 'October 2026'])
check('more jobs than counted leads shows no close rate', revenueMonths([{ month: '2026-11-01', spend: 100, leads: 2, jobs: 5, revenue: 900, source: 'month' }], '2026-11-21')[0].closeRate, null)
check('revenue with no ad spend has no return, never a divide by zero', revenueMonths([{ month: '2026-11-01', spend: 0, leads: 0, jobs: 1, revenue: 900, source: 'month' }], '2026-11-21')[0].back, null)
check('weekly answers added up count as logged', revenueMonths([{ month: '2026-11-01', spend: 100, leads: 5, jobs: 2, revenue: 800, source: 'weeks' }], '2026-11-21')[0].logged, true)
check('a client with nothing yet still has this month to log', revenueMonths([], '2026-11-21').map((r) => [r.month, r.current, r.logged]), [['2026-11-01', true, false]])

const T = revenueTotals(R)
check('totals are over logged months only, with the spend for those same months', [T.months, T.revenue, T.spend, T.jobs, T.leads], [2, 12500.46, 3870.92, 4, 100])
check('so the return is not dragged down by a month nobody logged', T.back, 3.23)
check('the best month is the one that made the most', T.best.month, '2026-10-01')
check('nothing logged is no return, not zero', [revenueTotals(revenueMonths([RAW[0]], '2026-11-21')).months, revenueTotals(revenueMonths([RAW[0]], '2026-11-21')).back], [0, null])

check('the month asked about is the newest finished one with leads and no figure', monthToLog(R).month, '2026-07-01')
check('this month is never nagged about', monthToLog(revenueMonths([RAW[0]], '2026-11-21')), null)
check('a month with no ads is not asked about', monthToLog(revenueMonths([RAW[1], { month: '2026-09-01', spend: 0, leads: 0 }], '2026-11-21')), null)
check('last month goes first when it is the one missing', monthToLog(revenueMonths([{ month: '2026-10-01', spend: 50, leads: 3 }, RAW[3]], '2026-11-21')).month, '2026-10-01')

check('money is read the way people type it', [parseMoney('$12,500'), parseMoney('12500.50'), parseMoney('12.5k'), parseMoney(' 0 ')], [12500, 12500.5, 12500, 0])
check('an empty box or a word is not a number', [parseMoney(''), parseMoney('lots'), parseMoney('-5'), parseMoney(null)], [null, null, null, null])
check('jobs are whole numbers', [parseCount('4'), parseCount('0'), parseCount('4.5'), parseCount(''), parseCount('four')], [4, 0, null, null, null])
check('both boxes are needed', [revenueEntryProblem('', '500') !== '', revenueEntryProblem('3', '') !== ''], [true, true])
check('none booked can be saved', revenueEntryProblem('0', '0'), '')
check('revenue with no jobs is asked about', revenueEntryProblem('0', '500') !== '', true)
check('a normal month can be saved', revenueEntryProblem('4', '$12,500'), '')

// What the team sees on a client's card in the CRM.
const LOG = revenueLogSummary([{ month: '2026-09-01', jobs: 6, revenue: 21400 }, { month: '2026-10-01', jobs: 4, revenue: 12500 }], '2026-11-21')
check('a client\'s log adds up, newest month named', [LOG.months, LOG.revenue, LOG.jobs, LOG.latest.label], [2, 33900, 10, 'October 2026'])
check('last month is the one a check-in asks about', [LOG.lastMonthLabel, LOG.lastMonthLogged], ['October 2026', true])
check('last month missing is said', revenueLogSummary([{ month: '2026-09-01', jobs: 6, revenue: 21400 }], '2026-11-21').lastMonthLogged, false)
check('in January last month is December of the year before', revenueLogSummary([], '2027-01-05').lastMonth, '2026-12-01')
check('nothing logged is nothing, not an error', [revenueLogSummary(null, '2026-11-21').months, revenueLogSummary(null, '2026-11-21').latest], [0, null])

const merged = mergeRevenueMonth(RAW, { month: '2026-11-01', jobs: 2, revenue: 4000 })
check('a saved month shows without reloading, keeping its spend and leads', merged.find((m) => m.month === '2026-11-01'), { month: '2026-11-01', spend: 662, leads: 13, jobs: 2, revenue: 4000, source: 'month' })
check('saving does not change the list it was given', RAW[0].source, null)
check('a month the loader never returned is added', mergeRevenueMonth([], { month: '2026-11-15', jobs: 1, revenue: 500 }), [{ month: '2026-11-01', spend: 0, leads: 0, jobs: 1, revenue: 500, source: 'month' }])
check('the link', dashboardLink('tok', 'https://x'), 'https://x/dashboard/tok')
check('a Meta preview snippet becomes an address and a size', previewFrame('<iframe src="https://www.facebook.com/ads/api/preview_iframe.php?d=abc&amp;t=1" width="320" height="690" scrolling="yes"></iframe>'), { src: 'https://www.facebook.com/ads/api/preview_iframe.php?d=abc&t=1', width: 320, height: 690 })
check('the business.facebook.com host Meta really uses is accepted', previewFrame('<iframe src="https://business.facebook.com/ads/api/preview_iframe.php?d=x" width="320" height="690"></iframe>')?.src, 'https://business.facebook.com/ads/api/preview_iframe.php?d=x')
check('a snippet from anywhere else is refused', [previewFrame('<iframe src="https://evil.example/x"></iframe>'), previewFrame('<iframe src="https://facebook.com.evil.example/x"></iframe>'), previewFrame('')], [null, null, null])
check('a new token is 36 hex characters and never the same twice', [/^[0-9a-f]{36}$/.test(newToken()), newToken() !== newToken()], [true, true])

// -------------------------------------------------------------- the words
check('the guide covers the six tiles and the return', METRIC_GUIDE.map((g) => g.key), ['spend', 'leads', 'cpl', 'impressions', 'clicks', 'ctr', 'return'])
check('every entry says what, why, good and what we do', METRIC_GUIDE.every((g) => g.label.length > 2 && [g.what, g.why, g.good, g.we].every((s) => typeof s === 'string' && s.length > 20)), true)
check('guideFor', [guideFor('cpl').label, guideFor('nope')], ['Cost per lead', null])
const copy = METRIC_GUIDE.flatMap((g) => [g.what, g.why, g.good, g.we]).join(' ')
const hype = /\b(delve|leverage|synerg|unlock|supercharge|game.?changer|cutting.edge|robust|seamless|empower|elevate|journey)\b/i
check('no hype words in the guide', hype.test(copy), false)
check('no em dashes in the guide', /[—–]/.test(copy), false)

// ------------------------------------------- the weekly email links to it
const week = weekFrom('2026-09-28')
const model = buildWeeklyModel({ client: { name: 'Belk' }, intake: {}, week, metaRows: [{ ad_id: 'a', ad_name: 'x', date: '2026-09-29', spend: 100, leads: 2, impressions: 1000, clicks: 20 }] })
const html = renderWeeklyHtml(model, { reportUrl: 'https://x/report/r', dashboardUrl: 'https://x/dashboard/d' })
check('the email links to the dashboard', html.includes('open your live KPI dashboard') && html.includes('https://x/dashboard/d'), true)
check('no dashboard, no link', renderWeeklyHtml(model, { reportUrl: 'https://x/report/r' }).includes('open your live KPI dashboard'), false)
check('the text version carries it too', renderWeeklyText(model, { reportUrl: 'https://x/report/r', dashboardUrl: 'https://x/dashboard/d' }).includes('https://x/dashboard/d'), true)

// The page and the panel load the one module.
const page = readFileSync(new URL('../src/pages/ClientDashboardPage.jsx', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/components/ClientDashboardsPanel.jsx', import.meta.url), 'utf8')
check('page and panel import the lib', [page.includes("from '../lib/clientDashboard'"), panel.includes("from '../lib/clientDashboard'")], [true, true])
check('the page reads through the RPC only', page.includes("rpc('client_dashboard_load'") && !page.includes(".from('"), true)

// The one thing a client's page can write, and how.
const tracker = readFileSync(new URL('../src/components/reports/RevenueTracker.jsx', import.meta.url), 'utf8')
const revenueSql = readFileSync(new URL('../supabase/client-revenue-months.sql', import.meta.url), 'utf8')
const loaderSql = readFileSync(new URL('../supabase/client-dashboard.sql', import.meta.url), 'utf8')
check('the tracker is on the page', page.includes('<RevenueTracker'), true)
check('it writes through the one function and touches no table', tracker.includes("rpc('client_revenue_save'") && !tracker.includes(".from('"), true)
check('the function checks the link the way the loader does', /dashboard_token = p_token and length\(p_token\) >= 20 and archived = false/.test(revenueSql), true)
check('a month that has not started cannot be logged', /m > date_trunc\('month', current_date\)::date/.test(revenueSql), true)
check('negative or missing numbers are refused', /p_jobs is null or p_jobs < 0[\s\S]*p_revenue is null or p_revenue < 0/.test(revenueSql), true)
check('only the team can read the table directly', [/for all to authenticated/.test(revenueSql), /to anon/.test(revenueSql.split('create or replace function')[0])], [true, false])
check('the loader returns the months, with no cut-off', /'months', coalesce\(/.test(loaderSql) && /from client_revenue_months where client_id/.test(loaderSql), true)

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
