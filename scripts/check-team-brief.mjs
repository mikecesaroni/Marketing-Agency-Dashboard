// Self-check for the team brief and the Slack alerts: what goes in the
// morning brief, the subject, the three renderings, which flags become
// alerts, and the diff against what was already posted.
// Run: node scripts/check-team-brief.mjs
//
// The rule: THE CHANNEL HEARS IT ONCE, THE MOMENT IT APPEARS, AND ONLY WHEN
// WAITING COSTS MONEY OR A DAY. The morning brief is the whole picture in
// one short message; the alerts are the changes that cannot wait.

import { CLEAR_WORTHY, IMMEDIATE, accountConnectedSlack, alertKeys, alertsSlack, briefHtml, briefSections, briefSlack, briefSubject, briefText, buildBrief, clientAddedSlack, diffAlerts, firstName, formSubmittedSlack, liveClientIds, setupNext, setupStrip, taskAssignedSlack, taskDoneSlack } from '../src/lib/teamBrief.js'
import { buildWeeklyStatus, reportWeeks } from '../src/lib/weeklyStatus.js'
import { nextSteps } from '../src/lib/nextSteps.js'
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
  mk('d', 'Drain Kings', { drop: { hasMeta: true, state: 'ready', behind: false, daysSince: 2, waiting: [{ path: 'd/clip2.mp4', name: 'clip2.mp4', at: '2026-10-20T09:00:00Z', by: 'Kyle', ready: true }, { path: 'd/clip1.mp4', name: 'clip1.mp4', at: '2026-10-19T09:00:00Z', by: '', ready: false, note: 'post a day after clip2' }] }, flags: [{ key: 'clip-waiting', severity: 'blue', label: '2 new clips waiting to go out' }], leads: { leads7: 3, leads14: 9, spend7: 200, spend14: 400 } }),
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
check('low leads takes a client out of running clean and into attention, amber', (() => {
  const b = buildBrief({ statusRows: [mk('l', 'Low Co', { flags: [{ key: 'low-leads', severity: 'amber', label: 'Only 2 leads this week', detail: '$350 spent over 7 days for $175 a lead.', href: '/client/l#ad-performance' }], leads: { leads7: 2, leads14: 5, spend7: 350, spend14: 700 } })], day: TODAY })
  return [b.green.map((g) => g.client.name), b.attention.map((a) => [a.client.name, a.severity, a.label])]
})(), [[], [['Low Co', 'amber', 'Only 2 leads this week']]])
check('running clean counts a client live on Google with Meta off', buildBrief({ statusRows: [mk('m', 'MCL', { client: { id: 'm', name: 'MCL', meta_ads_active: false, paused_at: null, archived: false, is_internal: false }, result: { launched: true, next: null, live: { meta: false, google: true, lsa: false } }, leads: { leads7: 5, leads14: 8, spend7: 300, spend14: 600 } })], day: TODAY }).green.map((g) => g.client.name), ['MCL'])
check('blue flags are not attention', brief.attention.some((a) => a.key === 'kpis'), false)
check("every waiting clip, newest first, naming the editor, whether it is in Meta and the editor's note", brief.clips.map((c) => c.label), ['clip2.mp4 from Kyle', 'clip1.mp4, not in Meta yet · “post a day after clip2”'])
check("a clip alert carries the editor's note too", alertKeys(rows).find((k) => k.key === 'd:clip:d/clip1.mp4')?.label, 'New edit dropped in: clip1.mp4, not in Meta yet · “post a day after clip2”')
check('running clean: live with no ad flag, leads this week and the week before', brief.green.map((g) => [g.client.name, g.leads7, g.before]), [['Acme Heating', 8, 5], ['Drain Kings', 3, 6]])
check('onboarding names the next step, whose move, and how long they have had it', brief.onboarding.map((o) => o.label), ['Meta ad account and Page connected (their move, 9 days)'])
check('the counts', brief.counts, { clients: 4, red: 1, amber: 0, toCall: 1, clips: 2, green: 2, greenLeads: 11, onboarding: 1, onboardingOurs: 0, onboardingTheirs: 1, paused: 0 })

// --- where each onboarding client is: the setup strip --------------------------------
// ("See where we are at with clients: if their ad accounts are connected,
// live yet, the form submitted or sent, knowing the tiers.")
{
  const ctx = (client, over = {}) => ({ client: { id: 'w', name: 'Whole Co', setup_fee: 0, ...client }, intake: null, link: over.link ?? null, deliverables: over.deliverables || [], payments: [], callSteps: over.callSteps || [], counts: over.counts || {}, overrides: [], today: TODAY })
  const row = (result, client, tier) => mk(client.id, client.name, { client: { paused_at: null, archived: false, is_internal: false, ...client }, result, tier })
  // A Whole Chain client eleven days in: form back, Meta in, Google asked for nine days ago.
  const whole = nextSteps(ctx({ tier: 2, meta_ad_account_id: '1', meta_page_id: '2' }, { link: { created_at: '2026-10-11', intake_submitted_at: '2026-10-12', ghl_submitted_at: '2026-10-12' } }))
  check('the strip: the form, each account the package needs, GHL, the ads, and what is live', setupStrip(whole), 'form ✓ · Meta acct ✓ · Google acct ⏳ 9d · GHL ○ · ads ○ · live: Meta ○, Google ○, LSA ○')
  const wb = buildBrief({ statusRows: [row(whole, { id: 'w', name: 'Whole Co', meta_ads_active: false, date_added: '2026-10-09' }, 2)], day: TODAY, appUrl: 'https://crm.example' })
  check('the onboarding line: the package and the day, the strip, then the next move', [wb.onboarding[0].tag, wb.onboarding[0].label], ['Meta and Google, day 12', 'form ✓ · Meta acct ✓ · Google acct ⏳ 9d · GHL ○ · ads ○ · live: Meta ○, Google ○, LSA ○ · next: Onboarding call done'])
  check('the heading says whose move, the name links, the tag follows it', briefSlack(wb).blocks.find((b) => b.text?.text?.startsWith('*Onboarding')).text.text, '*Onboarding (1): 1 on us*\n⚪ <https://crm.example/client/w|Whole Co> (Meta and Google, day 12): form ✓ · Meta acct ✓ · Google acct ⏳ 9d · GHL ○ · ads ○ · live: Meta ○, Google ○, LSA ○ · next: Onboarding call done')
  check('plain text carries the tag too', briefText(wb).includes('⚪ Whole Co (Meta and Google, day 12): form ✓'), true)
  // Nobody has written to them yet: the form is ours to send, no wait is counted.
  const fresh = nextSteps(ctx({ tier: 2, meta_ad_account_id: '1', meta_page_id: '2', google_ads_customer_id: '1234567890' }))
  check('a client not written to yet: "form not sent", accounts in, nothing waiting', setupStrip(fresh), 'form not sent · Meta acct ✓ · Google acct ✓ · GHL details ⏳ · ads ○ · live: Meta ○, Google ○, LSA ○')
  // Live on Meta, Google still to connect: still on the list, and the next move is the Google chase, not the past customer list.
  const metaOn = nextSteps(ctx({ tier: 2, meta_ad_account_id: '1', meta_page_id: '2', meta_ads_active: true, ghl_active: true, drive_folder_id: 'f' }, { link: { created_at: '2026-08-21', intake_submitted_at: '2026-08-22', ghl_submitted_at: '2026-08-22' }, callSteps: [{ step_key: 'x' }], counts: { savedAds: 3, publishedAds: 2 } }))
  check('launched on Meta with Google to come: the strip says so', setupStrip(metaOn), 'form ✓ · Meta acct ✓ · Google acct ⏳ 60d · GHL ✓ · ads ✓ · live: Meta ✓, Google ○, LSA ○')
  check('...and the next move is the channel still to come', setupNext(metaOn).key, 'google-ads-access')
  const mb = buildBrief({ statusRows: [row(metaOn, { id: 'm', name: 'Meta On', meta_ads_active: true, date_added: '2026-08-20' }, 2)], day: TODAY })
  check('...so a Whole Chain client live on Meta is in onboarding AND running clean', [mb.onboarding.map((o) => [o.tag, o.label]), mb.green.map((g) => g.client.name), briefSections(mb).find((s) => s.key === 'onboarding').title], [[['Meta and Google, day 62', 'form ✓ · Meta acct ✓ · Google acct ⏳ 60d · GHL ✓ · ads ✓ · live: Meta ✓, Google ○, LSA ○ · next: Google Ads access (their move, 60 days)']], ['Meta On'], 'Onboarding (1): 1 on the client'])
  // Maintenance is one channel: on Google, no Meta marks at all.
  const gOnly = nextSteps(ctx({ tier: 1, google_ads_customer_id: '1234567890', lsa_active: true }))
  check('a Maintenance client on Google: no Meta marks, Google and LSA only', setupStrip(gOnly), 'form not sent · Google acct ✓ · GHL details ⏳ · live: Google ○, LSA ✓')
  // Maintenance live on Meta with nothing else owed: off the list.
  const done = nextSteps(ctx({ tier: 1, meta_ad_account_id: '1', meta_page_id: '2', meta_ads_active: true }))
  check('a Maintenance client live on Meta is not in onboarding', buildBrief({ statusRows: [row(done, { id: 'd', name: 'Done Co', meta_ads_active: true }, 1)], day: TODAY }).onboarding.length, 0)
  check('no steps on the row: the old next-step line, no strip', setupStrip({ launched: false, next: { title: 'x' } }), '')
  // Order: our moves first, then the ones still to launch, then the longest wait.
  const ob = buildBrief({ statusRows: [row(metaOn, { id: 'm', name: 'Meta On', meta_ads_active: true }, 2), row(whole, { id: 'w', name: 'Whole Co', meta_ads_active: false }, 2), row(gOnly, { id: 'g', name: 'Google Co', meta_ads_active: false }, 1)], day: TODAY })
  check('our moves first, then still to launch, then the longest wait', ob.onboarding.map((o) => o.client.name), ['Whole Co', 'Google Co', 'Meta On'])
}

// Paused clients: one line with how long, nothing else about them.
{
  const pausedRow = mk('p', 'Pause Co', { client: { id: 'p', name: 'Pause Co', meta_ads_active: true, paused_at: '2026-10-03T14:00:00Z', archived: false, is_internal: false }, flags: [{ key: 'paused', severity: 'blue', label: 'On pause' }, { key: 'payment', severity: 'red', label: 'Card failing' }], result: { launched: false, next: { title: 'Setup fee paid', owner: 'client', waitingDays: 40 } } })
  const withPause = buildBrief({ statusRows: [...rows, pausedRow], day: TODAY, appUrl: 'https://crm.example/' })
  check('a paused client is one line, oldest pause first, with the date and the days', briefSections(withPause).find((s) => s.key === 'paused'), { key: 'paused', title: 'On pause (1)', lines: [{ emoji: '⏸️', text: 'Pause Co (since Oct 3, 17 days)', href: '/status' }] })
  check('...and is in nothing else: not attention, not onboarding, not green', [withPause.attention.some((a) => a.client.id === 'p'), withPause.onboarding.some((o) => o.client.id === 'p'), withPause.green.some((g) => g.client.id === 'p'), withPause.counts.paused], [false, false, false, 1])
  check('...and the plain text carries the line', briefText(withPause).includes('ON PAUSE (1)\n⏸️ Pause Co (since Oct 3, 17 days)'), true)
  const today = mk('t', 'Today Co', { client: { id: 't', name: 'Today Co', meta_ads_active: true, paused_at: `${TODAY}T15:00:00Z`, archived: false, is_internal: false } })
  check('paused today says so instead of "0 days"', briefSections(buildBrief({ statusRows: [today], day: TODAY })).find((s) => s.key === 'paused').lines[0].text, 'Today Co (paused today)')
}
check('the subject', briefSubject(brief), 'Morning brief · Tuesday, Oct 20 · 1 to call, 2 clips to publish, 2 running clean')
check('the sections in order', briefSections(brief).map((s) => s.title), ['Needs attention (1)', 'To publish (2)', 'Running clean (2), leads this week', 'Onboarding (1): 1 on the client'])

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
check('slack on Monday carries the weekly totals and the full report link', [mondaySlack.blocks.some((b) => b.text?.text?.includes('*Weekly status · Oct 14 to 20*')), mondaySlack.blocks.some((b) => b.elements?.[0]?.text?.includes('/weekly|Weekly status in the CRM'))], [true, true])
check('text on Monday carries the weekly status', briefText(monday).includes('WEEKLY STATUS · Oct 14 to 20'), true)
check('html on Monday too', briefHtml(monday).includes('Weekly status · Oct 14 to 20'), true)

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
// The Tito's case: the alert vanished because the client was paused, not
// because the ads came back. Closed in the log, not announced.
check('live clients: on Meta, not paused, not archived, not internal', [...liveClientIds(noisy)].sort(), ['a', 'b', 'd', 'g'])
const pausedAcme = noisy.map((r) => (r.client.id === 'a' ? { ...r, client: { ...r.client, paused_at: '2026-10-20T10:00:00Z' }, flags: [{ key: 'paused', severity: 'blue', label: 'On pause' }] } : r))
const quiet = diffAlerts(alertKeys(pausedAcme), open, { live: liveClientIds(pausedAcme) })
check('a paused client\'s open alerts close without "ads delivering again"', [quiet.gone.map((g) => g.key), quiet.cleared.map((c) => c.key)], [['a:ads-off', 'a:video-stale', 'd:clip:d/old.mp4'], []])
check('...while a live client\'s ads coming back is still said', diffAlerts(keys, open, { live: liveClientIds(noisy) }).cleared.map((c) => c.key), ['a:ads-off'])
const post = alertsSlack(diff, { appUrl: 'https://crm.example' })
check('the alerts post: new then cleared, each client a link, one line each', [post.blocks.length, post.blocks[0].text.text, post.blocks[1].text.text], [2, '*New (3)*\n🎬 <https://crm.example/content|Drain Kings>: New edit dropped in: clip2.mp4 from Kyle\n💳 <https://crm.example/client/g|Gaps LLC>: Card failing\n📹 <https://crm.example/client/g|Gaps LLC>: No new video or ad in 12 days', '*Cleared*\n✅ <https://crm.example/client/a|Acme Heating>: ads delivering again (was "Meta ads stopped: 4 days without spend")'])
check('the notification line names the first few', post.text, 'Drain Kings: New edit dropped in: clip2.mp4 from Kyle · Gaps LLC: Card failing · Gaps LLC: No new video or ad in 12 days')
check('nothing new, nothing cleared: nothing posted', alertsSlack({ fresh: [], cleared: [] }), null)
check('only cleared still posts', alertsSlack({ fresh: [], cleared: open.slice(1, 2) }).text, 'Acme Heating: ads delivering again')

// --- a new client ---------------------------------------------------------------------
const added = clientAddedSlack({ id: 'n1', name: 'New & Co', tier: 2, monthly_fee: 2500, setup_fee: 0 }, { appUrl: 'https://crm.example/', by: 'ethan@example.com' })
check('new client: the notification line names the tier and the price', added.text, 'New client: New & Co, Meta and Google')
check('new client: the post links the client, names the package, the price and who added them, by first name', added.blocks[0].text.text, '🎉 *New client added to the agency*\n<https://crm.example/client/n1|New &amp; Co>: The Whole Chain Marketing ($2,500/mo) · added by Ethan')
check('first name: from a name, a full name, an email, a dotted email, nothing', ['Ethan', 'Mary Jo Smith', 'ethan@horizonhvacinc.com', 'mary.jo+crm@example.com', '', null].map(firstName), ['Ethan', 'Mary', 'Ethan', 'Mary', '', ''])
check('new client: a profile name wins over the email it came with', clientAddedSlack({ id: 'n4', name: 'Co', tier: 1 }, { by: 'Josh' }).blocks[0].text.text.endsWith('· added by Josh'), true)
check('new client: an ad account picked on the form rides along in the same post', clientAddedSlack({ id: 'n5', name: 'Co', tier: 1, meta_ad_account_id: '123456' }, { by: 'Josh' }).blocks[0].text.text.endsWith('· added by Josh\n🔗 Meta ad account 123456 connected'), true)

// --- an ad account connected ----------------------------------------------------------
const meta = accountConnectedSlack({ id: 'c9', name: 'Acme & Sons' }, { channel: 'meta', account: { id: '123456', name: 'Acme Ads' }, appUrl: 'https://crm.example', by: 'ken@workingclassgroup.com' })
check('account connected: Meta, by name and id, who by first name, linking the Meta panel', [meta.text, meta.blocks[0].text.text], ['Ad account connected: Acme & Sons, Meta ad account Acme Ads (123456)', '🔗 *Ad account connected*\n<https://crm.example/client/c9#meta|Acme &amp; Sons>: Meta ad account *Acme Ads* (123456) · by Ken'])
const google = accountConnectedSlack({ id: 'c9', name: 'Acme' }, { channel: 'google', account: { id: '1234567890' }, appUrl: 'https://crm.example' })
check('account connected: Google, the id dashed, no name needed', [google.text, google.blocks[0].text.text], ['Ad account connected: Acme, Google Ads account 123-456-7890', '🔗 *Ad account connected*\n<https://crm.example/client/c9#google|Acme>: Google Ads account 123-456-7890'])
check('account connected: a Meta account the CRM has no name for is the id alone', accountConnectedSlack({ id: 'c9', name: 'Acme' }, { channel: 'meta', account: { id: '777' } }).blocks[0].text.text.endsWith('Acme: Meta ad account 777'), true)

// --- a form filled in ------------------------------------------------------------------
const forms = formSubmittedSlack([{ client: { id: 'f1', name: 'Acme & Sons' }, form: 'intake', at: '2026-10-28T14:00:00Z' }, { client: { id: 'f2', name: 'Belk' }, form: 'ghl', at: '2026-10-28T15:00:00Z' }], { appUrl: 'https://crm.example/' })
check('forms in: one line each, the client linked, the form named in words', [forms.text, forms.blocks[0].text.text], ['Acme &amp; Sons filled in their onboarding form · Belk sent back their GHL account details', '*Forms in (2)*\n📝 <https://crm.example/client/f1|Acme &amp; Sons> filled in their onboarding form\n📝 <https://crm.example/client/f2|Belk> sent back their GHL account details'])
check('one form is a singular title', formSubmittedSlack([{ client: { id: 'f1', name: 'Acme' }, form: 'intake' }]).blocks[0].text.text.startsWith('*Form in*\n'), true)
check('no forms, no message', formSubmittedSlack([]), null)

// --- a task ticked done ---------------------------------------------------------------
const done = taskDoneSlack({ task: { id: 't1', title: 'Build the <GHL> template' }, client: { id: 'c1', name: 'Acme & Sons' }, list: { name: 'Onboarding' }, by: 'Mike Jones', appUrl: 'https://crm.example' })
check('task done: who, what, for whom, on which list, linked', [done.text, done.blocks[0].text.text], ['Mike finished: Build the <GHL> template (Acme & Sons · Onboarding)', '✅ *Mike* finished: <https://crm.example/tasks|Build the &lt;GHL&gt; template> · <https://crm.example/client/c1|Acme &amp; Sons> · Onboarding'])
check('task done: no client, no list, no name still reads', taskDoneSlack({ task: { id: 't2', title: 'Call the printer' } }).text, 'Someone finished: Call the printer')

// --- a task given to someone else -----------------------------------------------------
const given = taskAssignedSlack({ task: { id: 't3', title: 'Chase the <photos>', due_date: '2026-11-03' }, client: { id: 'c1', name: 'Acme & Sons' }, list: { name: 'Onboarding' }, by: 'Ethan', to: ['Mike'], appUrl: 'https://crm.example' })
check('task given: who, to whom, what, where and when, linked', [given.text, given.blocks[0].text.text], ['Ethan gave Mike a task: Chase the <photos> (Acme & Sons · Onboarding · due Nov 3)', '📋 *Ethan* gave *Mike* a task: <https://crm.example/tasks|Chase the &lt;photos&gt;> · <https://crm.example/client/c1|Acme &amp; Sons> · Onboarding · due Nov 3'])
check('task given to two people reads as a pair', taskAssignedSlack({ task: { id: 't4', title: 'Shoot list' }, by: 'Ethan', to: ['Mike', 'Josh'] }).text, 'Ethan gave Mike and Josh a task: Shoot list')
check('task given, nothing known: still a sentence', taskAssignedSlack({ task: { title: 'Call back' } }).text, 'Someone gave someone a task: Call back')
check('new client: the top tier carries its setup fee', clientAddedSlack({ id: 'n2', name: 'Top Co', tier: 3, monthly_fee: 3500, setup_fee: 500 }).blocks[0].text.text.includes('Runs Without You Marketing ($3,500/mo, $500 setup)'), true)
check('new client: no tier picked still posts, with the fee', clientAddedSlack({ id: 'n3', name: 'Odd Co', tier: null, monthly_fee: 1200 }).text, 'New client: Odd Co, $1,200/mo')

console.log(failures === 0 ? '\nAll team brief checks pass' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
