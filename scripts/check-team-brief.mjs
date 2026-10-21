// Self-check for the team brief and the Slack alerts: what goes in the
// morning brief, the subject, the three renderings, which flags become
// alerts, and the diff against what was already posted.
// Run: node scripts/check-team-brief.mjs
//
// The rule: THE CHANNEL HEARS IT ONCE, THE MOMENT IT APPEARS, AND ONLY WHEN
// WAITING COSTS MONEY OR A DAY. The morning brief is the whole picture in
// one short message; the alerts are the changes that cannot wait.

import { CLEAR_WORTHY, IMMEDIATE, alertKeys, alertsSlack, briefHtml, briefSections, briefSlack, briefSubject, briefText, buildBrief, diffAlerts } from '../src/lib/teamBrief.js'
import { buildWeeklyStatus, reportWeeks } from '../src/lib/weeklyStatus.js'
import { addDays } from '../src/lib/dates.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

const TODAY = '2026-10-20'
const mk = (id, name, over = {}) => ({
  client: { id, name, meta_ads_active: true, paused_at: null, archived: false, is_internal: false },
  flags: [],
  result: { launched: true, next: null },
  drop: { hasMeta: true, state: 'done', behind: false, daysSince: 3, waiting: [] },
  leads: { leads7: 0, leads14: 0, spend7: 0, spend14: 0 },
  needsContact: false,
  tier: 1,
  ...over,
})
const rows = [
  mk('a', 'Acme Heating', { leads: { leads7: 8, leads14: 13, spend7: 410, spend14: 800 } }),
  mk('b', 'Belk Plumbing', { flags: [{ key: 'ads-off', severity: 'red', label: 'Meta ads stopped: 3 days without spend', detail: 'Nothing has spent since 2026-10-17.', href: '/client/b#meta' }, { key: 'kpis', severity: 'blue', label: 'KPIs not logged this week' }], needsContact: true }),
  mk('c', 'Cool Air', { flags: [{ key: 'waiting', severity: 'amber', label: 'Waiting on them 9 days', detail: 'Meta ad account and Page connected' }], needsContact: true, client: { id: 'c', name: 'Cool Air', meta_ads_active: false, archived: false, is_internal: false }, result: { launched: false, next: { title: 'Meta ad account and Page connected', owner: 'client', waitingDays: 9 } } }),
  mk('d', 'Drain Kings', { drop: { hasMeta: true, state: 'ready', behind: false, daysSince: 2, waiting: [{ path: 'd/clip2.mp4', name: 'clip2.mp4', at: '2026-10-20T09:00:00Z', by: 'Kyle', ready: true }, { path: 'd/clip1.mp4', name: 'clip1.mp4', at: '2026-10-19T09:00:00Z', by: '', ready: false }] }, flags: [{ key: 'clip-waiting', severity: 'blue', label: '2 new clips waiting to go out' }], leads: { leads7: 3, leads14: 9, spend7: 200, spend14: 400 } }),
  mk('e', 'Ex Co', { client: { id: 'e', name: 'Ex Co', archived: true } }),
  mk('f', 'Us Internal', { client: { id: 'f', name: 'Us Internal', is_internal: true } }),
]

// --- the quiet rules ---------------------------------------------------------------
check('only ads off, the account, ten days without an ad, and a card failing post the moment they appear', [...IMMEDIATE].sort(), ['account', 'ads-off', 'payment', 'video-stale'])
check('only the ads coming back is worth a cleared line', [...CLEAR_WORTHY].sort(), ['account', 'ads-off'])

// --- the brief ---------------------------------------------------------------------
const brief = buildBrief({ statusRows: rows, day: TODAY, appUrl: 'https://crm.example/' })
check('archived and internal are left out', brief.counts.clients, 4)
check('the day in words', brief.label, 'Tuesday, Oct 20')
check('attention: the ad flags only; a chase is not one', brief.attention.map((a) => [a.client.name, a.severity, a.key]), [['Belk Plumbing', 'red', 'ads-off']])
check('blue flags are not attention', brief.attention.some((a) => a.key === 'kpis'), false)
check('every waiting clip, newest first, naming the editor and whether it is in Meta', brief.clips.map((c) => c.label), ['clip2.mp4 from Kyle', 'clip1.mp4, not in Meta yet'])
check('running clean: live with no ad flag, leads this week and the week before', brief.green.map((g) => [g.client.name, g.leads7, g.before]), [['Acme Heating', 8, 5], ['Drain Kings', 3, 6]])
check('onboarding names the next step, whose move, and how long they have had it', brief.onboarding.map((o) => o.label), ['Meta ad account and Page connected (their move, 9 days)'])
check('the counts', brief.counts, { clients: 4, red: 1, amber: 0, toCall: 1, clips: 2, green: 2, greenLeads: 11, onboarding: 1 })
check('the subject', briefSubject(brief), 'Morning brief · Tuesday, Oct 20 · 1 to call, 2 clips to publish, 2 running clean')
check('the sections in order', briefSections(brief).map((s) => s.title), ['Needs attention (1)', 'To publish (2)', 'Running clean (2), leads this week', 'Onboarding (1)'])

// Money is not in the brief at all: a card failing is said once, when it
// happens (the alerts); an overdue invoice is the Payments page's business.
const moneyRows = [
  mk('m1', 'Belk Plumbing', { flags: [{ key: 'payment', severity: 'red', label: 'Payment overdue: $2,500' }], needsContact: true, leads: { leads7: 4, leads14: 7, spend7: 100, spend14: 200 } }),
  mk('m2', 'MBD Washing', { flags: [{ key: 'payment', severity: 'red', label: 'Card failing', href: '/payments' }], needsContact: true }),
  mk('m3', 'MCL Construction', { flags: [{ key: 'payment', severity: 'red', label: 'Card failing', href: '/payments' }, { key: 'waiting', severity: 'amber', label: 'Waiting on them 33 days', detail: 'Photos' }], needsContact: true }),
  mk('m4', 'Pillar HVAC', { flags: [{ key: 'payment', severity: 'red', label: 'Payment overdue: $998' }], needsContact: true }),
]
const moneyBrief = buildBrief({ statusRows: moneyRows, day: TODAY })
check('no payments anywhere in the brief', [briefText(moneyBrief).includes('overdue'), briefText(moneyBrief).includes('Card failing'), briefSections(moneyBrief).some((s) => s.key === 'money')], [false, false, false])
check('a client behind on money still counts as running clean when the ads are', moneyBrief.green.map((g) => g.client.name), ['Belk Plumbing', 'MBD Washing', 'MCL Construction', 'Pillar HVAC'])
check('a chase on a running client is nowhere in the brief', briefText(moneyBrief).includes('Waiting on them'), false)
check('the subject does not count money', briefSubject(moneyBrief), 'Morning brief · Tuesday, Oct 20 · 4 running clean')
check('nothing to flag but money leads with the all-clear', briefSections(moneyBrief)[0].title, 'Nothing needs attention')
check('a card failing is an alert, once; an overdue invoice is not', alertKeys(moneyRows).map((k) => [k.key, k.label]), [['m2:payment', 'Card failing'], ['m3:payment', 'Card failing']])
check('a card that stops failing clears quietly', diffAlerts([], [{ key: 'm2:payment', kind: 'payment', label: 'Card failing', client_id: 'm2', client_name: 'MBD Washing' }]), { fresh: [], gone: [{ key: 'm2:payment', kind: 'payment', label: 'Card failing', client_id: 'm2', client_name: 'MBD Washing' }], cleared: [] })
check('the card alert line', alertsSlack({ fresh: alertKeys(moneyRows).slice(0, 1), cleared: [] }, { appUrl: 'https://crm.example' }).blocks[0].text.text, '*New*\n💳 <https://crm.example/payments|MBD Washing>: Card failing')
check('running clean is ONE line, names and leads with an arrow for the week', briefSections(brief)[2].lines, [{ emoji: '🟢', text: 'Acme Heating 8↑, Drain Kings 3↓', href: '/status' }])
check('no explanations: a flag line is the label alone', briefSections(brief)[0].lines[0], { emoji: '🔴', client: { id: 'b', name: 'Belk Plumbing' }, text: 'Meta ads stopped: 3 days without spend', href: '/client/b#meta' })
check('the trailing slash on the app url is dropped', brief.appUrl, 'https://crm.example')

const text = briefText(brief)
check('plain text: the heading, a flag line, a clip line, a link', ['MORNING BRIEF · Tuesday, Oct 20', '🔴 Belk Plumbing: Meta ads stopped: 3 days without spend', '🎬 Drain Kings: clip2.mp4 from Kyle', 'https://crm.example/status'].every((s) => text.includes(s)), true)
check('plain text is short: under twenty lines for four clients', text.split('\n').length <= 20, true)

const slack = briefSlack(brief)
check('slack: a header block, a section per group, the links to the CRM', [slack.blocks[0].type, slack.blocks[0].text.text, slack.blocks.filter((b) => b.type === 'section').length, slack.blocks[slack.blocks.length - 1].type], ['header', '☀️ Morning brief · Tuesday, Oct 20', 4, 'context'])
check('slack: client names are links to their page, the flag to its place', slack.blocks[1].text.text.includes('<https://crm.example/client/b#meta|Belk Plumbing>: Meta ads stopped: 3 days without spend'), true)
check('slack: the notification line is the subject', slack.text, briefSubject(brief))
check('slack: no section over 3000 characters', slack.blocks.every((b) => !b.text || b.text.text.length <= 3000), true)
const long = buildBrief({ statusRows: Array.from({ length: 60 }, (_, i) => mk(`k${i}`, `Client number ${i} with a long name`, { flags: [{ key: 'no-leads', severity: 'red', label: 'No leads for 9 days' }], needsContact: true })), day: TODAY, appUrl: 'https://crm.example' })
check('slack: sixty flags are chunked into several sections, none over the cap', [briefSlack(long).blocks.filter((b) => b.type === 'section').length > 1, briefSlack(long).blocks.every((b) => !b.text || b.text.text.length <= 3000)], [true, true])

const html = briefHtml(brief)
check('html: a document with the sections and a link to the client', ['<!doctype html>', 'Needs attention (1)', 'href="https://crm.example/client/b#meta"', 'clip2.mp4 from Kyle'].every((s) => html.includes(s)), true)
check('html escapes what it prints', briefHtml(buildBrief({ statusRows: [mk('x', 'Bad <script>', { flags: [{ key: 'payment', severity: 'red', label: 'Card failing & more' }], needsContact: true })], day: TODAY })).includes('&lt;script&gt;'), true)

const empty = buildBrief({ statusRows: [mk('a', 'Acme', { client: { id: 'a', name: 'Acme', meta_ads_active: false, archived: false }, result: { launched: true } })], day: TODAY })
check('nothing to flag says so first', briefSections(empty)[0].title, 'Nothing needs attention')

// --- Monday: the weekly status rides along ----------------------------------------------
const weeks = reportWeeks(TODAY)
const metaRows = weeks.flatMap((m, i) => [{ client_id: 'a', date: addDays(m, 1), leads: [2, 3, 5, 8][i], spend: 100 }])
const weekly = buildWeeklyStatus({ statusRows: rows, metaRows, day: TODAY })
const monday = buildBrief({ statusRows: rows, weekly, day: TODAY, appUrl: 'https://crm.example' })
check('a Monday brief is named so', briefSubject(monday).startsWith('Monday brief and weekly status'), true)
const mondaySlack = briefSlack(monday)
check('slack on Monday carries the weekly totals and the full report link', [mondaySlack.blocks.some((b) => b.text?.text?.includes('*Weekly status · Oct 13 to 19*')), mondaySlack.blocks.some((b) => b.elements?.[0]?.text?.includes('/weekly|Weekly status in the CRM'))], [true, true])
check('text on Monday carries the weekly status', briefText(monday).includes('WEEKLY STATUS · Oct 13 to 19'), true)
check('html on Monday too', briefHtml(monday).includes('Weekly status · Oct 13 to 19'), true)

// --- the alerts ----------------------------------------------------------------------
const noisy = [...rows, mk('g', 'Gaps LLC', { flags: [{ key: 'no-leads', severity: 'red', label: 'No leads for 9 days' }, { key: 'payment', severity: 'red', label: 'Card failing' }, { key: 'video-stale', severity: 'red', label: 'No new video or ad in 12 days' }], needsContact: true })]
const keys = alertKeys(noisy)
check('alert keys: ads off, a card failing and ten days stale by key, each clip by its path; no leads, chases and blue flags wait for the morning', keys.map((k) => k.key), ['b:ads-off', 'd:clip:d/clip2.mp4', 'd:clip:d/clip1.mp4', 'g:payment', 'g:video-stale'])
check('a clip alert says who dropped it and whether it is in Meta', keys.find((k) => k.key === 'd:clip:d/clip2.mp4'), { key: 'd:clip:d/clip2.mp4', client: { id: 'd', name: 'Drain Kings' }, kind: 'clip', label: 'New edit dropped in: clip2.mp4 from Kyle', detail: '', href: '/content' })
check('only the account flag keeps its detail (the balance owed is the instruction)', [keys.find((k) => k.kind === 'ads-off').detail, alertKeys([mk('h', 'H', { flags: [{ key: 'account', severity: 'red', label: 'Ad account disabled', detail: '$3.04 outstanding on the account.' }] })])[0].detail], ['', '$3.04 outstanding on the account.'])
const open = [
  { key: 'b:ads-off', kind: 'ads-off', label: 'Meta ads stopped: 1 day without spend', client_id: 'b', client_name: 'Belk Plumbing' },
  { key: 'a:ads-off', kind: 'ads-off', label: 'Meta ads stopped: 4 days without spend', client_id: 'a', client_name: 'Acme Heating' },
  { key: 'a:video-stale', kind: 'video-stale', label: 'No new video or ad in 11 days', client_id: 'a', client_name: 'Acme Heating' },
  { key: 'd:clip:d/clip1.mp4', kind: 'clip', label: 'New edit dropped in: clip1.mp4', client_id: 'd', client_name: 'Drain Kings' },
  { key: 'd:clip:d/old.mp4', kind: 'clip', label: 'New edit dropped in: old.mp4', client_id: 'd', client_name: 'Drain Kings' },
]
const diff = diffAlerts(keys, open)
check('fresh: what is live and was not open (the still-open ads-off is not repeated)', diff.fresh.map((f) => f.key), ['d:clip:d/clip2.mp4', 'g:payment', 'g:video-stale'])
check('gone: every open key that is no longer live, to close in the log', diff.gone.map((g) => g.key), ['a:ads-off', 'a:video-stale', 'd:clip:d/old.mp4'])
check('cleared: only the ads coming back is said out loud', diff.cleared.map((c) => c.key), ['a:ads-off'])
const post = alertsSlack(diff, { appUrl: 'https://crm.example' })
check('the alerts post: new then cleared, each client a link, one line each', [post.blocks.length, post.blocks[0].text.text, post.blocks[1].text.text], [2, '*New (3)*\n🎬 <https://crm.example/content|Drain Kings>: New edit dropped in: clip2.mp4 from Kyle\n💳 <https://crm.example/client/g|Gaps LLC>: Card failing\n📹 <https://crm.example/client/g|Gaps LLC>: No new video or ad in 12 days', '*Cleared*\n✅ <https://crm.example/client/a|Acme Heating>: ads delivering again (was "Meta ads stopped: 4 days without spend")'])
check('the notification line names the first few', post.text, 'Drain Kings: New edit dropped in: clip2.mp4 from Kyle · Gaps LLC: Card failing · Gaps LLC: No new video or ad in 12 days')
check('nothing new, nothing cleared: nothing posted', alertsSlack({ fresh: [], cleared: [] }), null)
check('only cleared still posts', alertsSlack({ fresh: [], cleared: open.slice(1, 2) }).text, 'Acme Heating: ads delivering again')

console.log(failures === 0 ? '\nAll team brief checks pass' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
