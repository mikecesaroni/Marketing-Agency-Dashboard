// Self-check for the video machine's rules. Run: node scripts/check-video-launch.mjs
//
// The weekly board is only useful if "due" means what the team thinks it
// means, and the clip checks are only trusted if they never cry wolf on a
// good vertical clip.

import {
  clipChecks,
  clipVerdict,
  describeLaunch,
  dropState,
  dropStats,
  isVideoAd,
  launchSnapshot,
  launchSteps,
  videoAdName,
  syncedAdRows,
  videoDrops,
  waitingClips,
} from '../src/lib/videoLaunch.js'

// The labels metaPublish.js gives these; that module needs a Supabase client
// and cannot be imported here.
const OBJECTIVES = [
  { value: 'LEADS_FORM', label: 'Leads (instant form)' },
  { value: 'TRAFFIC', label: 'Traffic' },
]

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

const NOW = new Date('2026-09-24T12:00:00Z')

// A video ad is one with a video id, or an old row with no size_key.
check('video ad: video_id set', isVideoAd({ video_id: '123', size_key: null }), true)
check('video ad: legacy row with no size_key', isVideoAd({ size_key: null }), true)
check('image ad: sizes recorded', isVideoAd({ size_key: 'feed,story' }), false)

check('state: no meta account', dropState({ hasMeta: false, lastAdAt: '2026-09-23T00:00:00Z', now: NOW }), 'no-meta')
check('state: never', dropState({ hasMeta: true, lastAdAt: null, now: NOW }), 'never')
check('state: fresh (3 days ago)', dropState({ hasMeta: true, lastAdAt: '2026-09-21T00:00:00Z', now: NOW }), 'done')
check('state: fresh at 9 days', dropState({ hasMeta: true, lastAdAt: '2026-09-15T12:00:00Z', now: NOW }), 'done')
check('state: stale at exactly 10 days', dropState({ hasMeta: true, lastAdAt: '2026-09-14T12:00:00Z', now: NOW }), 'stale')
check('state: stale (3 weeks)', dropState({ hasMeta: true, lastAdAt: '2026-09-03T00:00:00Z', now: NOW }), 'stale')

const CLIENTS = [
  { id: 'A', name: 'Belk', meta_ad_account_id: 'act_1' },
  { id: 'B', name: 'Active Air', meta_ad_account_id: 'act_2' },
  { id: 'C', name: 'Classic', meta_ad_account_id: 'act_3' },
  { id: 'D', name: 'Old', meta_ad_account_id: 'act_4', archived: true },
  { id: 'E', name: 'No Meta', meta_ad_account_id: null },
  { id: 'F', name: 'Fresh', meta_ad_account_id: 'act_6', is_internal: true },
]
const ADS = [
  { client_id: 'A', created_at: '2026-09-22T00:00:00Z', video_id: 'v1', ad_name: 'WC_Belk · tune-up' },
  { client_id: 'A', created_at: '2026-09-22T00:00:00Z', size_key: 'feed' },
  { client_id: 'A', created_at: '2026-09-01T00:00:00Z', size_key: null },
  { client_id: 'B', created_at: '2026-09-12T00:00:00Z', size_key: null },
  { client_id: 'C', created_at: '2026-08-20T00:00:00Z', video_id: 'v9' },
  { client_id: 'D', created_at: '2026-09-23T00:00:00Z', video_id: 'v3' },
  { client_id: 'E', created_at: '2026-09-23T00:00:00Z', video_id: 'v4' },
]
const CLIPS = [
  { client_id: 'B', status: 'ready', meta_video_id: 'm1', thumb_url: 't' },
  { client_id: 'B', status: 'ready', meta_video_id: 'm2', thumb_url: '' },
  { client_id: 'B', status: 'processing', meta_video_id: 'm3', thumb_url: '' },
  { client_id: 'F', status: 'ready', meta_video_id: 'm4', thumb_url: 't' },
]

const rows = videoDrops(CLIENTS, ADS, CLIPS, NOW)
const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
check('archived client left out', rows.map((r) => r.id).includes('D'), false)
check('most behind first: stale (oldest first), never, fresh, no-meta', rows.map((r) => r.id), ['C', 'B', 'F', 'A', 'E'])
check('last ad counts any kind, and says which', [byId.A.lastAdAt, byId.A.daysSince, byId.A.lastAdWasVideo], ['2026-09-22T00:00:00Z', 2, true])
check('a static alone keeps a client fresh', dropState({ hasMeta: true, lastAdAt: '2026-09-23T00:00:00Z', now: NOW }), 'done')
check('behind: stale and never are behind, fresh is not', [byId.B.behind, byId.F.behind, byId.A.behind, byId.E.behind], [true, true, false, false])
check('this week counts video ads only', byId.A.thisWeek, 1)
check('total counts every video ad, legacy included', byId.A.total, 2)
check('last video ad name carried', byId.A.lastAdName, 'WC_Belk · tune-up')
check('ready clips need a thumbnail', byId.B.readyClips, 1)
check('clip count is every registered clip', byId.B.clips, 3)
check('internal flag carried', byId.F.internal, true)
check('stats', dropStats(rows), { ready: 0, done: 1, due: 3, stale: 2, never: 1, thisWeek: 2, withMeta: 4 })

// Clips an editor dropped in and nobody has published.
const NOW_ISO = NOW.toISOString()
const FILES = [
  { client_id: 'B', storage_path: 'B/v/new.mp4', file_name: 'new.mp4', date_uploaded: '2026-09-24T09:00:00Z', uploaded_by: 'Sam' },
  { client_id: 'B', storage_path: 'B/v/old.mp4', file_name: 'old.mp4', date_uploaded: '2026-08-01T09:00:00Z' },
  { client_id: 'B', storage_path: 'B/v/photo.jpg', file_name: 'photo.jpg', date_uploaded: '2026-09-24T09:00:00Z' },
  { client_id: 'A', storage_path: 'A/v/done.mp4', file_name: 'done.mp4', date_uploaded: '2026-09-21T09:00:00Z' },
  { client_id: 'A', storage_path: 'A/v/before.mp4', file_name: 'before.mp4', date_uploaded: '2026-09-20T09:00:00Z' },
  { client_id: 'E', storage_path: 'E/v/x.mp4', file_name: 'x.mp4', date_uploaded: '2026-09-24T09:00:00Z' },
]
const REGISTERED = [
  { client_id: 'A', storage_path: 'A/v/done.mp4', file_name: 'done.mp4', meta_video_id: 'v1', status: 'ready', thumb_url: 't', created_at: '2026-09-21T10:00:00Z' },
  { client_id: 'A', storage_path: 'A/v/drive.mp4', file_name: 'drive.mp4', meta_video_id: 'v7', status: 'processing', thumb_url: '', created_at: '2026-09-23T10:00:00Z' },
]
const wait = waitingClips({ registered: REGISTERED.filter((r) => r.client_id === 'A'), files: FILES.filter((f) => f.client_id === 'A'), ads: ADS.filter((a) => a.client_id === 'A'), now: NOW })
check('waiting: a published clip is not waiting', wait.some((w) => w.path === 'A/v/done.mp4'), false)
check('waiting: a clip older than the last legacy video ad is not waiting', wait.some((w) => w.path === 'A/v/before.mp4'), false)
check('waiting: a registered, unpublished, fresh clip is', wait.map((w) => [w.path, w.ready]), [['A/v/drive.mp4', false]])
const waitB = waitingClips({ files: FILES.filter((f) => f.client_id === 'B'), ads: ADS.filter((a) => a.client_id === 'B'), now: NOW })
check('waiting: an unregistered upload counts, with who dropped it', waitB.map((w) => [w.name, w.by]), [['new.mp4', 'Sam']])
check('waiting: an image is not a clip, and 30 days is the window', waitB.length, 1)
check('waiting: start fresh hides everything before the reset', waitingClips({ files: FILES.filter((f) => f.client_id === 'B'), ads: [], now: NOW, resetAt: '2026-09-24T10:00:00Z' }).length, 0)
check('waiting: a drop after the reset still shows', waitingClips({ files: FILES.filter((f) => f.client_id === 'B'), ads: [], now: NOW, resetAt: '2026-09-24T08:00:00Z' }).length, 1)
check('drops: reset threads through', videoDrops(CLIENTS, ADS, [...CLIPS, ...REGISTERED], NOW, FILES, NOW.toISOString()).filter((r) => r.state === 'ready').length, 0)
check('waiting: a legacy video ad newer than the upload hides it', waitingClips({ files: [{ storage_path: 'x.mp4', file_name: 'x.mp4', date_uploaded: '2026-09-10T00:00:00Z' }], ads: [{ created_at: '2026-09-12T00:00:00Z', size_key: null }], now: NOW }).length, 0)

const rows2 = videoDrops(CLIENTS, ADS, [...CLIPS, ...REGISTERED], NOW, FILES)
const by2 = Object.fromEntries(rows2.map((r) => [r.id, r]))
check('ready: a client with a waiting clip is ready, and first', [rows2[0].id, rows2[0].state], ['B', 'ready'])
check('ready: newest drop first among ready rows', rows2.slice(0, 2).map((r) => r.id), ['B', 'A'])
check('ready: the row carries the waiting clips', by2.B.waiting.map((w) => w.name), ['new.mp4'])
check('ready: no Meta account is never ready', by2.E.state, 'no-meta')
check('stats: ready counted, fresh and behind still add up', dropStats(rows2), { ready: 2, done: 1, due: 3, stale: 2, never: 1, thisWeek: 2, withMeta: 4 })
check('a ready row for a stale client is still behind', by2.B.behind, true)
void NOW_ISO

// Ads Meta reports that the CRM never made.
const SYNCED = syncedAdRows([
  { client_id: 'F', ad_id: '9', ad_name: '9/14/26 Video Ad 2', first_seen: '2026-09-14', is_video: true },
  { client_id: 'E', ad_id: '8', ad_name: 'x', first_seen: '2026-09-23', is_video: false },
  { client_id: 'X', ad_id: null, ad_name: 'no day', first_seen: null },
])
check('synced: shaped like published rows, video marked, blanks dropped', SYNCED.map((r) => [r.client_id, r.created_at, r.video_id, r.size_key]), [['F', '2026-09-14T00:00:00.000Z', 'meta:9', 'synced'], ['E', '2026-09-23T00:00:00.000Z', null, 'synced']])
check('synced: a synced image ad is not a legacy video ad', isVideoAd(SYNCED[1]), false)
const rows3 = videoDrops(CLIENTS, [...ADS, ...SYNCED], CLIPS, NOW)
const by3 = Object.fromEntries(rows3.map((r) => [r.id, r]))
check('synced: a client run from Ads Manager is stale, not "no ad yet"', [by3.F.state, by3.F.daysSince, by3.F.lastAdName], ['stale', 10, '9/14/26 Video Ad 2'])
check('synced: its video ad counts as the last video', by3.F.lastVideoAt, '2026-09-14T00:00:00.000Z')

// Clip checks.
const good = clipChecks({ durationSeconds: 18, width: 1080, height: 1920, transcript: 'Hi, Dale here' })
check('a good vertical clip gets no warnings', good.filter((c) => c.level === 'warn'), [])
check('verdict good', clipVerdict(good), 'good')
const bad = clipChecks({ durationSeconds: 95, width: 1920, height: 1080, transcribedAt: '2026-09-24', transcriptError: 'No speech was found in the audio.' })
check('landscape, long and silent: three warnings', bad.filter((c) => c.level === 'warn').length, 3)
check('verdict notes', clipVerdict(bad), 'notes')
check('nothing known: no checks', clipChecks({}), [])
check('verdict on nothing', clipVerdict([]), '')
check('4:5 is fine', clipChecks({ width: 1080, height: 1350 })[0].level, 'ok')
check('too short warns', clipChecks({ durationSeconds: 3 })[0].level, 'warn')
check('45s is ok with a note', clipChecks({ durationSeconds: 45 })[0].level, 'ok')
check('low resolution warns', clipChecks({ width: 540, height: 960 }).some((c) => /Low resolution/.test(c.text)), true)
check('untranscribed says nothing about speech', clipChecks({ width: 1080, height: 1920 }).length, 1)

// Names.
check('ad name: client, day, angle, WC_ prefix', videoAdName({ clientName: 'Belk Heating', angle: 'The offer', date: '2026-09-24' }), 'WC_Belk Heating · 2026-09-24 · The offer')
check('ad name: file stem when no angle', videoAdName({ clientName: 'Belk', fileName: 'IMG_1234_furnace-tune_up.MOV', date: '2026-09-24' }), 'WC_Belk · 2026-09-24 · IMG 1234 furnace tune up')
check('ad name: never over 100', videoAdName({ clientName: 'x'.repeat(120), date: '2026-09-24' }).length, 100)
check('ad name: nothing known', videoAdName({ clientName: 'Belk', date: '2026-09-24' }), 'WC_Belk · 2026-09-24 · video')

// Memory.
const snap = launchSnapshot({
  objective: 'LEADS_FORM',
  cta: 'GET_QUOTE',
  linkUrl: ' https://belk.com ',
  leadForm: { id: 77, name: 'Belk enquiries' },
  specialCategory: '',
  adsets: [{ id: 1, name: 'Cold' }, { id: 2, name: 'Warm' }, { id: null }],
  campaignId: 'c1',
  reuseCampaign: true,
})
check('snapshot keeps the destination only', Object.keys(snap).sort(), ['adsets', 'at', 'campaignId', 'cta', 'leadForm', 'linkUrl', 'objective', 'specialCategory'])
check('snapshot: ids are strings, blanks dropped', snap.adsets, [{ id: '1', name: 'Cold' }, { id: '2', name: 'Warm' }])
check('snapshot: form kept as id and name', snap.leadForm, { id: '77', name: 'Belk enquiries' })
check('snapshot: link trimmed', snap.linkUrl, 'https://belk.com')
check('snapshot: no campaign when not reusing', launchSnapshot({ campaignId: 'c1', reuseCampaign: false }).campaignId, '')
check('describe: objective, form, ad sets', describeLaunch(snap, OBJECTIVES), 'Leads (instant form) · form "Belk enquiries" · into 2 ad sets: Cold, Warm')
check('describe: one ad set', describeLaunch({ objective: 'TRAFFIC', adsets: [{ id: '1', name: 'Cold' }] }, OBJECTIVES), 'Traffic · into Cold')
check('describe: new ad set', describeLaunch({ objective: 'TRAFFIC', adsets: [] }, OBJECTIVES), 'Traffic · a new ad set')
check('describe: nothing', describeLaunch(null), '')

// Steps.
const steps = launchSteps({ picked: 2, ready: 3, withCopy: 1, destination: 'Cold', blockers: ['a video has no primary text'] })
check('steps: videos done', [steps[0].done, steps[0].detail], [true, '2 picked'])
check('steps: words half done', [steps[1].done, steps[1].detail], [false, '1 of 2'])
check('steps: where done', [steps[2].done, steps[2].detail], [true, 'Cold'])
check('steps: publish shows the first blocker', steps[3].detail, 'a video has no primary text')
check('steps: nothing picked', launchSteps({ ready: 3 })[0].detail, '3 ready')
check('steps: all clear', launchSteps({ picked: 1, withCopy: 1, destination: 'x' })[3].detail, 'ready')

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`)
  process.exit(1)
}
console.log('\nAll video launch checks passed.')
