// Self-check for the team brief and the Slack alerts: what goes in the
// morning brief, the subject, the three renderings, which flags become
// alerts, and the diff against what was already posted.
// Run: node scripts/check-team-brief.mjs
//
// The rule: THE CHANNEL HEARS IT ONCE, THE MOMENT IT APPEARS, AND ONLY WHEN
// WAITING COSTS MONEY OR A DAY. The morning brief is the whole picture in
// one short message; the alerts are the changes that cannot wait.

import { CLEAR_WORTHY, IMMEDIATE, accountConnectedSlack, adsPublishedSlack, alertKeys, alertsSlack, briefHtml, briefSections, briefSlack, briefSubject, briefText, buildBrief, clientAddedSlack, diffAlerts, driveLinkedSlack, firstName, formSubmittedSlack, liveClientIds, setupLine, setupNext, taskAssignedSlack, taskDoneSlack } from '../src/lib/teamBrief.js'
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
check('the learning-phase wording rides through to the brief line', buildBrief({ statusRows: [mk('n', 'New Co', { flags: [{ key: 'low-leads', severity: 'amber', label: 'Only 1 lead this week, still in learning phase (ads started 8 days ago)', detail: '', href: '/client/n#ad-performance' }], leads: { leads7: 1, leads14: 1, spend7: 200, spend14: 200 } })], day: TODAY }).attention.map((a) => a.label), ['Only 1 lead this week, still in learning phase (ads started 8 days ago)'])
check('running clean counts a client live on Google with Meta off', buildBrief({ statusRows: [mk('m', 'MCL', { client: { id: 'm', name: 'MCL', meta_ads_active: false, paused_at: null, archived: false, is_internal: false }, result: { launched: true, next: null, live: { meta: false, google: true, lsa: false } }, leads: { leads7: 5, leads14: 8, spend7: 300, spend14: 600 } })], day: TODAY }).green.map((g) => g.client.name), ['MCL'])
// Local Services is not an onboarding gate ("Dynamic Flow is already
// onboarded", while the line read "get Local Services live" on day 60): a
// client live on Meta and Google is out of setup, LSA open or not. Google
// still open on the Whole Chain keeps them in.
const stepsLive = (lsaDone, googleDone = true) => [
  { key: 'go-live', title: 'Meta ads live', owner: 'us', done: true },
  { key: 'google-publish', title: 'Google campaign published', owner: 'us', done: googleDone },
  { key: 'lsa-live', title: 'Local Services Ads live', owner: 'us', done: lsaDone },
]
const dyn = (lsaDone, googleDone) => mk('dy', 'Dynamic Flow', { tier: 3, client: { id: 'dy', name: 'Dynamic Flow', meta_ads_active: true, date_added: '2026-08-22', drive_folder_id: 'f', paused_at: null, archived: false, is_internal: false }, result: { launched: true, next: lsaDone && googleDone ? null : { key: googleDone ? 'lsa-live' : 'google-publish', title: 'x', owner: 'us' }, steps: stepsLive(lsaDone, googleDone), live: { meta: true, google: googleDone, lsa: lsaDone } }, leads: { leads7: 5, leads14: 9, spend7: 300, spend14: 600 } })
check('Meta and Google live with Local Services still open: onboarded, not on the setup list', buildBrief({ statusRows: [dyn(false, true)], day: TODAY }).onboarding.map((o) => o.client.name), [])
check('...and running clean as before', buildBrief({ statusRows: [dyn(false, true)], day: TODAY }).green.map((g) => g.client.name), ['Dynamic Flow'])
check('Google still to publish on the Whole Chain and up keeps them in setup', buildBrief({ statusRows: [dyn(false, false)], day: TODAY }).onboarding.map((o) => [o.client.name, o.move]), [['Dynamic Flow', 'build and publish the Google campaign']])
check('blue flags are not attention', brief.attention.some((a) => a.key === 'kpis'), false)
check("every waiting clip, newest first, naming the editor, where it is with Meta and the editor's note", brief.clips.map((c) => c.label), ['clip2.mp4 from Kyle · in Meta, ready to publish', 'clip1.mp4 · not in Meta yet · “post a day after clip2”'])
check("a clip alert carries the editor's note too", alertKeys(rows).find((k) => k.key === 'd:clip:d/clip1.mp4')?.label, 'New edit dropped in: clip1.mp4 · not in Meta yet · “post a day after clip2”')
// A dropped static (2026-11-12, "send CRM message when new statics are
// dropped"): under To publish in the brief, and posted once, by its stamp.
const staticRow = mk('s', 'Static Co', { statics: [{ stamp: '100', name: 'tuneup', files: [{ path: 'ads/s/100-feed.png', name: 'tuneup-feed.png', key: 'feed' }, { path: 'ads/s/100-story.png', name: 'tuneup-story.png', key: 'story' }], at: '2026-10-20T08:00:00Z', by: 'Kyle', note: 'run it Friday', dismissed: false }] })
const staticBrief = buildBrief({ statusRows: [staticRow], day: TODAY })
check('a dropped static sits under To publish with its sizes, who dropped it and the note', [staticBrief.clips.map((c) => [c.key, c.label]), staticBrief.counts.clips, staticBrief.counts.statics], [[['static', 'tuneup (2 sizes) from Kyle · ready to publish · “run it Friday”']], 1, 1])
check('...the subject counts it without calling it a clip, and the line carries the picture', [briefSubject(staticBrief).includes('1 to publish'), briefText(staticBrief).includes('🖼️ Static Co: tuneup (2 sizes) from Kyle')], [true, true])
check('a dropped static posts once, by its stamp, at once', alertKeys([staticRow]).map((k) => [k.key, k.kind, k.label]), [['s:static:100', 'static', 'New static dropped in: tuneup (2 sizes) from Kyle · ready to publish · “run it Friday”']])
check('...and says so when there is no Meta account to send it to', alertKeys([mk('s', 'Static Co', { drop: { hasMeta: false, state: 'no-meta', waiting: [] }, statics: [{ stamp: '101', name: 'coupon', files: [{ path: 'ads/s/101-square.png', name: 'coupon.png', key: 'square' }], at: '2026-10-20T08:00:00Z', by: '', note: '', dismissed: false }] })]).map((k) => k.label), ['New static dropped in: coupon · no Meta account to send it to'])
// One of the two sizes missing ("send a CRM message when the drop is missing a size").
const halfRow = mk('s', 'Static Co', { statics: [{ stamp: '102', name: 'coupon', files: [{ path: 'ads/s/102-feed.png', name: 'coupon.png', key: 'feed' }], at: '2026-10-20T08:00:00Z', by: 'Kyle', note: 'run it Friday', dismissed: false }] })
check('a drop with one of the two sizes posts a warning naming the missing size and where it serves', alertKeys([halfRow]).map((k) => [k.key, k.label]), [['s:static:102', '⚠️ Static dropped in with one size: coupon has the 4:5 only, missing the 1080 × 1920 (9:16) for Stories and Reels, from Kyle. Add it on the Content page, or Meta will crop the 4:5 there. “run it Friday”']])
check('...and the brief says which size it lacks in place of the count', buildBrief({ statusRows: [halfRow], day: TODAY }).clips.map((c) => c.label), ['coupon (4:5 only, missing the 1080 × 1920 (9:16) for Stories and Reels) from Kyle · ready to publish · “run it Friday”'])
check('running clean: live with no ad flag, leads this week and the week before', brief.green.map((g) => [g.client.name, g.leads7, g.before]), [['Acme Heating', 8, 5], ['Drain Kings', 3, 6]])
// Ads that started this week read as new, not as a zero.
check('a client whose ads started this week is running clean as "new"', briefSections(buildBrief({ statusRows: [mk('n', 'New Co', { leads: { leads7: 0, leads14: 0, spend7: 10, spend14: 10, spendDays14: 3 } })], day: TODAY })).find((s) => s.key === 'green').lines[0].text, 'New Co 0 (new this week)')
check('onboarding names what we are waiting on and how long they have had it', brief.onboarding.map((o) => [o.label, o.theirs]), [['Meta ad account and Page connected, 9 days', true]])
check('the counts', brief.counts, { clients: 4, red: 1, amber: 0, toCall: 1, clips: 2, statics: 0, green: 2, greenLeads: 11, onboarding: 1, onboardingOurs: 0, onboardingTheirs: 1, paused: 0 })

// --- where each onboarding client is: one plain-words move -----------------------------
// ("We want to know what we need to do, and if everything is connected then
// we need to get videos made or publish them.")
{
  const ctx = (client, over = {}) => ({ client: { id: 'w', name: 'Whole Co', setup_fee: 0, ...client }, intake: null, link: over.link ?? null, deliverables: over.deliverables || [], payments: [], callSteps: over.callSteps || [], counts: over.counts || {}, overrides: [], today: TODAY })
  const row = (result, client, tier, drop) => mk(client.id, client.name, { client: { paused_at: null, archived: false, is_internal: false, ...client }, result, tier, ...(drop ? { drop } : {}) })
  const noClips = { hasMeta: true, state: 'never', behind: false, daysSince: null, waiting: [], clips: 0, total: 0 }
  // A Whole Chain client eleven days in: form back, Meta in, Google asked for nine days ago.
  const whole = nextSteps(ctx({ tier: 2, meta_ad_account_id: '1', meta_page_id: '2' }, { link: { created_at: '2026-10-11', intake_submitted_at: '2026-10-12', ghl_submitted_at: '2026-10-12' } }))
  check('the line: our move in plain words, then only what is still missing, with the days once it is a week', setupLine(whole, {}).text, 'do the onboarding call · still need: Google account (9 days), Drive folder')
  check('...not connected until the form, the accounts the package needs and the Drive folder are in', [setupLine(whole, {}).connected, setupLine(whole, {}).gaps], [false, ['Google account (9 days)', 'Drive folder']])
  const wb = buildBrief({ statusRows: [row(whole, { id: 'w', name: 'Whole Co', meta_ads_active: false, date_added: '2026-10-09' }, 2)], day: TODAY, appUrl: 'https://crm.example' })
  check('the onboarding line: the package and the day, then the move', [wb.onboarding[0].tag, wb.onboarding[0].label], ['Meta and Google, day 12', 'do the onboarding call · still need: Google account (9 days), Drive folder'])
  check('our moves are their own list; the name links, the tag follows it', briefSlack(wb).blocks.find((b) => b.text?.text?.startsWith('*Onboarding')).text.text, '*Onboarding, our move (1)*\n⚪ <https://crm.example/client/w|Whole Co> (Meta and Google, day 12): do the onboarding call · still need: Google account (9 days), Drive folder')
  check('plain text carries the tag too', briefText(wb).includes('⚪ Whole Co (Meta and Google, day 12): do the onboarding call'), true)
  check('the Drive folder we made for them drops off the gaps once linked on the client page', setupLine(whole, { drive_folder_id: '1abc' }).gaps, ['Google account (9 days)'])
  // Nobody has written to them yet: the form is ours to send, and it is the move, not a gap.
  const fresh = nextSteps(ctx({ tier: 2, meta_ad_account_id: '1', meta_page_id: '2', google_ads_customer_id: '1234567890' }))
  check('a client not written to yet: send the form; the accounts are in, GHL details are the gap', setupLine(fresh).text, 'send the onboarding form · still need: GHL details')
  // Everything connected: the videos are the tail, and the move says what to do with them.
  const ready = (over = {}, counts = {}) => nextSteps(ctx({ tier: 2, meta_ad_account_id: '1', meta_page_id: '2', google_ads_customer_id: '1234567890', drive_folder_id: 'f', ...over }, { link: { created_at: '2026-10-11', intake_submitted_at: '2026-10-12', ghl_submitted_at: '2026-10-12' }, callSteps: [{ step_key: 'x' }], counts }))
  const drive = { drive_folder_id: 'f' }
  check('connected, no videos: the line says to get them made', setupLine(ready(), drive, noClips).text, 'build the GHL backend · connected · no videos yet: get them made')
  check('connected, clips dropped in: the line says to publish them', setupLine(ready(), drive, { ...noClips, waiting: [{ path: 'a' }, { path: 'b' }] }).text, 'build the GHL backend · connected · 2 clips waiting to publish')
  check('connected, videos in but nothing out yet', setupLine(ready(), drive, { ...noClips, clips: 3 }).text, 'build the GHL backend · connected · 3 videos in, none published yet')
  check('the ads are the move and there are no videos: get them made first', setupLine(ready({ ghl_active: true }), drive, noClips).text, 'get videos made (send the script link), then build the ads · connected')
  check('the ads are built and clips are waiting: publishing them is the move, ahead of the past customer list', setupLine(ready({ ghl_active: true }, { savedAds: 3 }), drive, { ...noClips, waiting: [{ path: 'a' }] }).text, 'publish the 1 clip waiting · connected')
  check('...even when we were waiting on the client for something else', (() => {
    const l = setupLine(ready({ ghl_active: true }, { savedAds: 3 }), { drive_folder_id: '' }, { ...noClips, waiting: [{ path: 'a' }] })
    return [l.text, l.theirs]
  })(), ['publish the 1 clip waiting · still need: Drive folder', false])
  check('before it is connected the videos stay off the line', setupLine(whole, {}, { ...noClips, clips: 3 }).videos, '')
  // Live on Meta, Google still to connect: still on the list, waiting on them, and the next move is the Google chase, not the past customer list.
  const metaOn = nextSteps(ctx({ tier: 2, meta_ad_account_id: '1', meta_page_id: '2', meta_ads_active: true, ghl_active: true, drive_folder_id: 'f' }, { link: { created_at: '2026-08-21', intake_submitted_at: '2026-08-22', ghl_submitted_at: '2026-08-22' }, callSteps: [{ step_key: 'x' }], counts: { savedAds: 3, publishedAds: 2 } }))
  check('launched on Meta with Google to come: what we wait on, the gap, what is live', setupLine(metaOn, {}).text, 'Google Ads access, 60 days · still need: Drive folder · Meta live')
  check('...and the next move is the channel still to come', setupNext(metaOn).key, 'google-ads-access')
  const mb = buildBrief({ statusRows: [row(metaOn, { id: 'm', name: 'Meta On', meta_ads_active: true, date_added: '2026-08-20' }, 2)], day: TODAY })
  check('...so a Whole Chain client live on Meta is in onboarding (waiting on the client) AND running clean', [mb.onboarding.map((o) => [o.tag, o.label]), mb.green.map((g) => g.client.name), briefSections(mb).find((s) => s.key === 'onboarding-theirs').title], [[['Meta and Google, day 62', 'Google Ads access, 60 days · still need: Drive folder · Meta live']], ['Meta On'], 'Onboarding, waiting on the client (1)'])
  // Maintenance is one channel: on Google, no Meta in the line at all.
  const gOnly = nextSteps(ctx({ tier: 1, google_ads_customer_id: '1234567890', lsa_active: true }))
  // Live on Local Services already, so the move is the channel still to come; the unsent form is a gap, not the move.
  check('a Maintenance client on Google: no Meta, no videos, LSA live, Search to publish', setupLine(gOnly).text, 'build and publish the Google campaign · still need: the form (not sent), GHL details · LSA live')
  // Maintenance live on Meta with nothing else owed: off the list.
  const done = nextSteps(ctx({ tier: 1, meta_ad_account_id: '1', meta_page_id: '2', meta_ads_active: true }))
  check('a Maintenance client live on Meta is not in onboarding', buildBrief({ statusRows: [row(done, { id: 'd', name: 'Done Co', meta_ads_active: true }, 1)], day: TODAY }).onboarding.length, 0)
  check('no steps on the row: the next step alone', setupLine({ launched: false, next: { title: 'x', owner: 'us' } }).text, 'x')
  // Order: our moves first (connected ones at the top), then the ones still to launch, then the longest wait.
  const ob = buildBrief({ statusRows: [row(metaOn, { id: 'm', name: 'Meta On', meta_ads_active: true }, 2), row(whole, { id: 'w', name: 'Whole Co', meta_ads_active: false }, 2), row(gOnly, { id: 'g', name: 'Google Co', meta_ads_active: false }, 1), row(ready(), { id: 'r', name: 'Ready Co', meta_ads_active: false, drive_folder_id: 'f' }, 2, noClips)], day: TODAY })
  check('our moves first, connected at the top, then the longest wait', ob.onboarding.map((o) => o.client.name), ['Ready Co', 'Whole Co', 'Google Co', 'Meta On'])
  check('...and the brief shows them as two lists', briefSections(ob).filter((s) => s.key.startsWith('onboarding')).map((s) => [s.title, s.lines.map((l) => l.emoji)]), [['Onboarding, our move (3)', ['⚪', '⚪', '⚪']], ['Onboarding, waiting on the client (1)', ['⏳']]])
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
check('the sections in order', briefSections(brief).map((s) => s.title), ['Needs attention (1)', 'To publish (2)', 'Running clean (2), leads this week', 'Onboarding, waiting on the client (1)'])

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
check('a clip alert says who dropped it and where it is with Meta', keys.find((k) => k.key === 'd:clip:d/clip2.mp4'), { key: 'd:clip:d/clip2.mp4', client: { id: 'd', name: 'Drain Kings' }, kind: 'clip', label: 'New edit dropped in: clip2.mp4 from Kyle · in Meta, ready to publish', detail: '', href: '/content' })

// A clip is given ten minutes to reach Meta (the sweep sends it and marks it
// ready inside that), so the one line it gets says where it is.
const justNow = new Date('2026-10-20T12:00:00Z')
const dropAt = (minutesAgo, over = {}) => mk('d', 'Drain Kings', { drop: { hasMeta: true, state: 'ready', waiting: [{ path: 'd/new.mp4', name: 'new.mp4', at: new Date(justNow - minutesAgo * 60000).toISOString(), by: 'Kyle', ready: false, meta: 'processing', ...over }] } })
const clipKeys = (row, now = justNow) => alertKeys([row], { now }).map((k) => k.label)
check('three minutes in and still processing: the channel waits', clipKeys(dropAt(3)), [])
check('three minutes in and not sent yet: it waits for the sweep too', clipKeys(dropAt(3, { meta: 'none' })), [])
check('eleven minutes in and still processing: posted, saying so', clipKeys(dropAt(11)), ['New edit dropped in: new.mp4 from Kyle · Meta is still processing it'])
check('ready at one minute: posted at once', clipKeys(dropAt(1, { ready: true, meta: 'ready' })), ['New edit dropped in: new.mp4 from Kyle · in Meta, ready to publish'])
check('refused by Meta: posted at once, so somebody looks', clipKeys(dropAt(1, { meta: 'error' })), ['New edit dropped in: new.mp4 from Kyle · Meta could not process it'])
check('no ad account to send it to: posted at once, saying that', alertKeys([mk('d', 'Drain Kings', { drop: { hasMeta: false, state: 'never', waiting: [{ path: 'd/new.mp4', name: 'new.mp4', at: justNow.toISOString(), by: 'Kyle', ready: false, meta: 'none' }] } })], { now: justNow }).map((k) => k.label), ['New edit dropped in: new.mp4 from Kyle · no Meta account to send it to'])
check('a row from before the state existed reads off ready alone', clipKeys(dropAt(30, { meta: undefined })), ['New edit dropped in: new.mp4 from Kyle · not in Meta yet'])
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
check('the alerts post: new then cleared, each client a link, one line each', [post.blocks.length, post.blocks[0].text.text, post.blocks[1].text.text], [2, '*New (3)*\n🎬 <https://crm.example/content|Drain Kings>: New edit dropped in: clip2.mp4 from Kyle · in Meta, ready to publish\n💳 <https://crm.example/client/g|Gaps LLC>: Card failing\n📹 <https://crm.example/client/g|Gaps LLC>: No new video or ad in 12 days', '*Cleared*\n✅ <https://crm.example/client/a|Acme Heating>: ads delivering again (was "Meta ads stopped: 4 days without spend")'])
check('the notification line names the first few', post.text, 'Drain Kings: New edit dropped in: clip2.mp4 from Kyle · in Meta, ready to publish · Gaps LLC: Card failing · Gaps LLC: No new video or ad in 12 days')
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

// --- a Drive folder linked --------------------------------------------------------------
// ("Send CRM update when Google Drive is linked.")
const drive = driveLinkedSlack([{ client: { id: 'd1', name: 'Acme & Sons' }, folderId: '1AbC_def-9', by: 'ethan@example.com' }], { appUrl: 'https://crm.example/' })
check('drive linked from the CRM: the client, who by first name, the folder to open', [drive.text, drive.blocks[0].text.text], ['Drive folder linked for Acme & Sons by Ethan', '*Drive folder linked*\n📁 <https://crm.example/client/d1|Acme &amp; Sons> · by Ethan · <https://drive.google.com/drive/folders/1AbC_def-9|open the folder>'])
check('nobody known: still a sentence, no "by"', driveLinkedSlack([{ client: { id: 'd3', name: 'Co' }, folderId: 'f' }]).text, 'Drive folder linked for Co')
check('two at once (the sweep): a counted title, one line each', driveLinkedSlack([{ client: { id: 'd1', name: 'A' }, folderId: '1', by: 'Ken' }, { client: { id: 'd2', name: 'B' }, folderId: '2', by: 'Josh' }]).blocks[0].text.text.split('\n').map((l) => l.slice(0, 15)), ['*Drive folders ', '📁 A · by Ken ·', '📁 B · by Josh '])
check('the context points at the video board', drive.blocks[1].elements[0].text, '<https://crm.example/content|Video board> · what they add there shows up in Make Static Ads')
check('no folders, no post', driveLinkedSlack([]), null)
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
// --- ads published to Meta ------------------------------------------------------------
// ("Did you make so when we publish videos it sends a CRM update?")
const pub = adsPublishedSlack({ client: { id: 'c1', name: 'Don Air & Co' }, ads: [{ ad_id: '1', ad_name: 'Don Air 11-02 1-1', video_id: 'v1', campaign_name: 'WC_Fall' }, { ad_id: '2', ad_name: 'Don Air 11-02 2-1', video_id: 'v2', campaign_name: 'WC_Fall' }], by: 'Kyle Smith', appUrl: 'https://crm.example' })
check('ads published: who, how many of what, for whom, named, the campaign, and that they are paused', [pub.text, pub.blocks[0].text.text], ['Kyle published 2 video ads to Meta for Don Air & Co: Don Air 11-02 1-1, Don Air 11-02 2-1 (campaign WC_Fall · paused until switched on in Ads Manager)', '🚀 *Kyle* published *2 video ads* to Meta for <https://crm.example/client/c1#meta|Don Air &amp; Co>: Don Air 11-02 1-1, Don Air 11-02 2-1 · campaign WC_Fall · paused until switched on in Ads Manager'])
check('one image ad reads singular, no campaign known', adsPublishedSlack({ client: { id: 'c1', name: 'Acme' }, ads: [{ ad_id: '9', ad_name: 'Fall tune-up' }] }).text, 'Someone published 1 image ad to Meta for Acme: Fall tune-up (paused until switched on in Ads Manager)')
check('a mix says both', adsPublishedSlack({ client: { id: 'c1', name: 'Acme' }, ads: [{ ad_id: '1', ad_name: 'A', video_id: 'v' }, { ad_id: '2', ad_name: 'B' }, { ad_id: '3', ad_name: 'C' }], by: 'Ethan' }).text.startsWith('Ethan published 3 ads (1 video, 2 image) to Meta for Acme: A, B, C'), true)
check('no ads, no message', adsPublishedSlack({ client: { id: 'c1', name: 'Acme' }, ads: [] }), null)

check('new client: the top tier carries its setup fee', clientAddedSlack({ id: 'n2', name: 'Top Co', tier: 3, monthly_fee: 3500, setup_fee: 500 }).blocks[0].text.text.includes('Runs Without You Marketing ($3,500/mo, $500 setup)'), true)
check('new client: no tier picked still posts, with the fee', clientAddedSlack({ id: 'n3', name: 'Odd Co', tier: null, monthly_fee: 1200 }).text, 'New client: Odd Co, $1,200/mo')

console.log(failures === 0 ? '\nAll team brief checks pass' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
