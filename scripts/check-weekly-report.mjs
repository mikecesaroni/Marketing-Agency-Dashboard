// Self-check for the weekly client report: the week maths, who gets one,
// the numbers, and the sentences a client reads. Run: node scripts/check-weekly-report.mjs
import { readFileSync } from 'node:fs'
import {
  GLOSSARY,
  WHY_RETURN,
  buildWeeklyModel,
  eligibility,
  metrics,
  previousWeek,
  renderWeeklyHtml,
  renderWeeklySubject,
  renderWeeklyText,
  reportWeek,
  summarySentences,
  weekFrom,
} from '../supabase/functions/weekly-report/weekly.ts'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

// ---------------------------------------------------------------- the week
check('on a Monday the report covers last week', reportWeek('2026-10-12'), { from: '2026-10-05', to: '2026-10-11', key: '2026-10-05', label: 'Oct 5 to Oct 11' })
check('midweek it is still the last complete week', reportWeek('2026-10-08'), { from: '2026-09-28', to: '2026-10-04', key: '2026-09-28', label: 'Sep 28 to Oct 4' })
check('on a Sunday the week ending today is not done yet', reportWeek('2026-10-11').to, '2026-10-04')
check('the week before', previousWeek(weekFrom('2026-10-05')).from, '2026-09-28')
check('a week across New Year carries the year', weekFrom('2026-12-28').label, 'Dec 28 to Jan 3, 2027')

// ------------------------------------------------------------- the numbers
check('rates', metrics({ spend: 512.4, leads: 12, impressions: 20000, clicks: 300 }), { spend: 512.4, leads: 12, impressions: 20000, clicks: 300, cpl: 42.7, ctr: 1.5 })
check('no leads, no cost per lead', metrics({ spend: 100, leads: 0, impressions: 0, clicks: 0 }).cpl, 0)

// ------------------------------------------------------------- who gets one
const client = { name: 'Belk Heating and Cooling', archived: false, is_internal: false, weekly_report_enabled: true, report_email: '' }
const metaWeek = [{ ad_id: 'a1', ad_name: 'WC_Summer | 2026-09-28 | AC died? Same-day repair', date: '2026-09-29', spend: 300, leads: 8, impressions: 12000, clicks: 180 }, { ad_id: 'a2', ad_name: 'Other ad', date: '2026-09-30', spend: 212.4, leads: 4, impressions: 8000, clicks: 120 }]
check('eligible with spend and an intake email', eligibility({ client, intake: { contact_email: 'owner@belk.com' }, metaRows: metaWeek }), { ok: true, email: 'owner@belk.com' })
check('the report email wins over the intake email', eligibility({ client: { ...client, report_email: 'boss@belk.com' }, intake: { contact_email: 'owner@belk.com' }, metaRows: metaWeek }).email, 'boss@belk.com')
check('switched off', eligibility({ client: { ...client, weekly_report_enabled: false }, intake: { contact_email: 'o@b.com' }, metaRows: metaWeek }).reason, 'weekly report switched off for this client')
check('no spend, no report', eligibility({ client, intake: { contact_email: 'o@b.com' }, metaRows: [] }).reason, 'no ad spend last week')
check('no email, says where to set one', eligibility({ client, intake: {}, metaRows: metaWeek }).reason.startsWith('no email on file'), true)
check('a bad email is named', eligibility({ client, intake: { contact_email: 'mlopez@pillarhvac' }, metaRows: metaWeek }).reason, 'email is not valid: mlopez@pillarhvac')
check('internal businesses never get one', eligibility({ client: { ...client, is_internal: true }, intake: { contact_email: 'o@b.com' }, metaRows: metaWeek }).ok, false)

// ---------------------------------------------------------------- the model
const week = weekFrom('2026-09-28')
const prevMeta = [{ ad_id: 'a1', ad_name: 'x', date: '2026-09-22', spend: 480, leads: 8, impressions: 15000, clicks: 150 }]
const model = buildWeeklyModel({ client, intake: { average_job_value: 4500 }, week, metaRows: metaWeek, googleRows: [{ campaign_id: 'g1', campaign_name: 'WC_Search', date: '2026-09-29', cost: 100, conversions: 2, impressions: 1000, clicks: 50 }], prevMetaRows: prevMeta })
check('totals across both channels', [model.totals.spend, model.totals.leads, model.totals.impressions, model.totals.cpl, model.totals.ctr], [612.4, 14, 21000, 43.74, 1.67])
check('both channels present', [Boolean(model.channels.meta), Boolean(model.channels.google)], [true, true])
check('deltas against the week before', [model.deltas.leads, model.deltas.spend], [75, 28])
check('the best ad, named without the WC_ bits', model.topAd, { name: 'AC died? Same-day repair', leads: 8, spend: 300, channel: 'Meta' })
check('summary: leads, compared, cost per lead', model.summary[0], 'You got 14 leads last week from $612 in ads, up from 8 the week before.')
check('summary: cost per lead sentence', model.summary[1].startsWith('Each lead cost $43.74, $16.26 less than the week before.'), true)
check('return note uses the average job value', model.returnNote[0], 'For this week: if 3 of the 14 leads become a job at your usual $4,500, that is $13,500 of work from $612 in ads.')

const firstWeek = buildWeeklyModel({ client, intake: {}, week, metaRows: metaWeek })
check('a first week says so', firstWeek.summary[1].startsWith('This is your first full week'), true)
check('no average job value: asks the question instead', firstWeek.returnNote[0].includes('what is that worth to you?'), true)

const dead = buildWeeklyModel({ client, intake: {}, week, metaRows: [{ ad_id: 'a', ad_name: 'x', date: '2026-09-29', spend: 200, leads: 0, impressions: 30000, clicks: 100 }] })
check('no leads: says so plainly and names the likely cause', [dead.summary[0], dead.summary[1].includes('fresh ad')], ['No leads came in last week on $200 of ad spend.', true])
check('no leads: no return example', dead.returnNote, [])

const answered = buildWeeklyModel({ client, intake: {}, week, metaRows: metaWeek, lastAnswer: { jobs_booked: 3, revenue: 9000, week: 'Sep 21 to Sep 27', spend: 480 } })
check('last week answered: the return is shown', answered.returnNote[0], 'Last week you told us the leads became 3 jobs worth $9,000. Against $480 in ads, that is $18.75 back for every $1 spent. That is the number that matters, and it is why we ask every week.')

// ------------------------------------------------------------------ the copy
const html = renderWeeklyHtml(model, { reportUrl: 'https://x/report/abc' })
check('subject', renderWeeklySubject(model), 'Your ads last week (Sep 28 to Oct 4): 14 leads from $612')
check('the email carries the five numbers, the glossary and the return argument', ['Spend', 'Leads', 'Cost per lead', 'Impressions', 'Click rate', 'What each number means', 'The number that matters most', 'Tell us how the leads did'].every((s) => html.includes(s)), true)
check('ad names are escaped', renderWeeklyHtml({ ...model, topAd: { name: '<b>x</b>', leads: 1, spend: 1, channel: 'Meta' } }).includes('&lt;b&gt;x&lt;/b&gt;'), true)
const text = renderWeeklyText(model)
check('plain text version lists the numbers', text.includes('Cost per lead: $43.74') && text.includes('Click rate: 1.67%'), true)
const hype = /\b(delve|leverage|synerg|unlock|supercharge|game.?changer|cutting.edge|robust|seamless|empower|elevate|journey)\b/i
const allCopy = [...WHY_RETURN, ...GLOSSARY.map((g) => g.text), ...model.summary, ...model.returnNote, ...dead.summary, ...firstWeek.summary].join(' ')
check('no hype words anywhere in the copy', hype.test(allCopy), false)
check('no em dashes in client-facing copy', /[—–]/.test(allCopy + renderWeeklyText(model)), false)
check('the glossary covers the five numbers', GLOSSARY.map((g) => g.key), ['impressions', 'ctr', 'leads', 'cpl'])

// The edge function and the app load the same module.
const fn = readFileSync(new URL('../supabase/functions/weekly-report/index.ts', import.meta.url), 'utf8')
const lib = readFileSync(new URL('../src/lib/weeklyReport.js', import.meta.url), 'utf8')
check('both sides import the one shared module', [fn.includes("from './weekly.ts'"), lib.includes("supabase/functions/weekly-report/weekly.ts")], [true, true])

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
