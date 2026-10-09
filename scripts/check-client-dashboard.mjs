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
  latestReport,
  lsaFor,
  mondayOf,
  newToken,
  pctChange,
  previewFrame,
  rates,
  returnStory,
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

// ------------------------------------------------------------------- the ads
check('ad names lose the WC_ bits', [cleanAdName('WC_Summer | 2026-10-08 | AC died? Same-day'), cleanAdName('Plain name'), cleanAdName('')], ['AC died? Same-day', 'Plain name', 'Untitled ad'])
const ads = [
  { key: 'a', name: 'WC_Summer | x | Hook A', channel: 'meta', w: 30, spend: 100, leads: 4, impressions: 1000, clicks: 30 },
  { key: 'a', name: 'WC_Summer | x | Hook A', channel: 'meta', w: 7, spend: 30, leads: 1, impressions: 300, clicks: 9 },
  { key: 'g', name: 'Search', channel: 'google', w: 30, spend: 50, leads: 4, impressions: 200, clicks: 20 },
  { key: 'z', name: 'Nothing ran', channel: 'meta', w: 30, spend: 0, leads: 0, impressions: 0, clicks: 0 },
]
const list = adsFor(ads, 30)
check('ads for the range, most leads then cheapest first, nothing-ran dropped', list.map((a) => a.name), ['Search', 'Hook A'])
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
check('return story from the answered weeks', returnStory([{ spend: 480, revenue: 9000, jobs_booked: 3 }, { spend: 300, revenue: 0, jobs_booked: 0 }, { spend: 200, revenue: 1000, jobs_booked: 1 }]), { answered: 2, spend: 680, revenue: 10000, jobs: 4, back: 14.71 })
check('no answers yet', returnStory([]).answered, 0)
check('the newest report with a link', latestReport([{ week_start: '2026-10-05', token: null }, { week_start: '2026-09-28', token: 'abc' }]).token, 'abc')
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
check('the email links to the dashboard', html.includes('open your dashboard') && html.includes('https://x/dashboard/d'), true)
check('no dashboard, no link', renderWeeklyHtml(model, { reportUrl: 'https://x/report/r' }).includes('open your dashboard'), false)
check('the text version carries it too', renderWeeklyText(model, { reportUrl: 'https://x/report/r', dashboardUrl: 'https://x/dashboard/d' }).includes('https://x/dashboard/d'), true)

// The page and the panel load the one module.
const page = readFileSync(new URL('../src/pages/ClientDashboardPage.jsx', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/components/ClientDashboardsPanel.jsx', import.meta.url), 'utf8')
check('page and panel import the lib', [page.includes("from '../lib/clientDashboard'"), panel.includes("from '../lib/clientDashboard'")], [true, true])
check('the page reads through the RPC only', page.includes("rpc('client_dashboard_load'") && !page.includes(".from('"), true)

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
