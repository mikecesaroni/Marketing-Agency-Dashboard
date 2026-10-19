// Self-check for the client's videos tab: the shaping of a row, the ways
// to get a clip, the download name, the words, and the wiring between the
// page, the dashboard, the function and the SQL.
// Run: node scripts/check-client-videos.mjs
import { readFileSync } from 'node:fs'
import { detailLine, downloadName, driveFileUrl, durationLabel, idsNeedingMeta, mergeClientVideos, shapeLabel, shapeVideo, summaryLine, wayToGet, whenLabel } from '../src/lib/clientVideos.js'
import { KINDS } from '../netlify/lib/preview.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const today = new Date('2026-10-19T12:00:00')

// ------------------------------------------------------------- one row
const crm = { ad_id: '120249926026630617', name: 'WC_Pillar | Oct 9 | $99 heat check', published_at: '2026-10-12T15:18:05Z', source: 'crm', video_id: '1047763368294524', storage_path: 'abc/1791573708090-Pillar-HVAC-10-09-2026.mp4', file_name: 'Pillar HVAC 10-09-2026.mp4', thumb: 'https://t/x.jpg', duration_seconds: 35.7, width: 1080, height: 1920 }
const v = shapeVideo(crm, null)
check('a CRM row: our file, the poster, the size', [v.adId, v.source, v.path, v.driveId, v.metaUrl, v.poster, v.seconds, v.width, v.height, v.videoId], ['120249926026630617', 'crm', 'abc/1791573708090-Pillar-HVAC-10-09-2026.mp4', '', '', 'https://t/x.jpg', 35.7, 1080, 1920, '1047763368294524'])
check('a clip from the Drive folder: no file of ours, the Drive id', [shapeVideo({ ...crm, storage_path: 'drive:1AbC' }).path, shapeVideo({ ...crm, storage_path: 'drive:1AbC' }).driveId], ['', '1AbC'])
const synced = { ad_id: '9001', name: 'Fall tune-up', published_at: '2026-10-01T00:00:00+00:00', source: 'synced' }
const creative = { ad_id: '9001', kind: 'video', video: 'https://meta/v.mp4?sig', image: 'https://meta/poster.jpg', thumb: null, video_id: '77' }
const s = shapeVideo(synced, creative)
check('a synced row with Meta\'s copy: no file, Meta\'s link and poster', [s.source, s.path, s.metaUrl, s.poster, s.videoId, s.seconds], ['synced', '', 'https://meta/v.mp4?sig', 'https://meta/poster.jpg', '77', 0])
check('an empty row still shapes', [shapeVideo(null).name, shapeVideo({}).adId], ['Video ad', ''])
check('the rows merged with a Map or an object, in order', [mergeClientVideos([crm, synced], new Map([['9001', creative]])).map((x) => x.metaUrl), mergeClientVideos([synced], { 9001: creative })[0].metaUrl, mergeClientVideos(null, null)], [['', 'https://meta/v.mp4?sig'], 'https://meta/v.mp4?sig', []])

// ------------------------------------------------------ the way to get it
check('our file downloads; Meta\'s copy opens; Drive opens; else nothing', [wayToGet(v), wayToGet(s), wayToGet(shapeVideo({ ...crm, storage_path: 'drive:1AbC' })), wayToGet(shapeVideo(synced))], ['download', 'meta', 'drive', 'none'])
check('Meta is asked only for the clips we do not hold, so many at once', [idsNeedingMeta([v, shapeVideo(synced), s, shapeVideo({ ...synced, ad_id: '9002' })]), idsNeedingMeta([shapeVideo(synced), shapeVideo({ ...synced, ad_id: '9002' })], 1)], [['9001', '9002'], ['9001']])
check('the Drive file page', driveFileUrl('1AbC'), 'https://drive.google.com/file/d/1AbC/view')

// ------------------------------------------------------------- the words
check('the download name is the ad name made safe, with the clip\'s own extension', [downloadName(v), downloadName({ ...v, path: 'x/clip.MOV' }), downloadName({ name: '', path: '' }), downloadName({ name: '  ---  ' })], ['WC_Pillar-Oct-9-99-heat-check.mp4', 'WC_Pillar-Oct-9-99-heat-check.mov', 'video.mp4', 'video.mp4'])
check('the download name is never longer than 84 characters', downloadName({ name: 'x'.repeat(200) }).length, 84)
check('how long', [durationLabel(35.7), durationLabel(65), durationLabel(0), durationLabel(null)], ['0:36', '1:05', '', ''])
check('what shape', [shapeLabel(1080, 1920), shapeLabel(1080, 1080), shapeLabel(1920, 1080), shapeLabel(0, 0)], ['Vertical', 'Square', 'Landscape', ''])
check('when, with the year only once it is not this one', [whenLabel('2026-10-12T15:18:05Z', today), whenLabel('2025-10-12T15:18:05Z', today), whenLabel('2026-10-01', today), whenLabel('', today)], ['Oct 12', 'Oct 12, 2025', 'Oct 1', ''])
check('the line under a name', [detailLine(v, today), detailLine(s, today), detailLine(shapeVideo({ ad_id: '1' }), today)], ['Published Oct 12 · 0:36 · Vertical', 'Live since Oct 1', ''])
check('the sentence at the top', [summaryLine([]), summaryLine([v]), summaryLine([v, shapeVideo({ ...crm, ad_id: '2' })]), summaryLine([s, shapeVideo(synced)]), summaryLine([v, s, shapeVideo(synced)])], [
  'No video ads have gone live on your account yet.',
  '1 video ad has gone live. Every one of them is here to watch and download.',
  '2 video ads have gone live. Every one of them is here to watch and download.',
  '2 video ads have gone live. Watch them here; the files open from Meta\'s copy.',
  '3 video ads have gone live. 1 is here to download; the rest open from Meta\'s copy.',
])
check('no em dashes in the words', /[—–]/.test([read('src/lib/clientVideos.js'), read('src/pages/ClientVideosPage.jsx'), KINDS.videos.description].join(' ')), false)

// ------------------------------------------------------------- the wiring
const sql = read('supabase/client-videos.sql')
check('the token-gated list is in the SQL file, for anon', [sql.includes('function client_videos_load(p_token text)'), sql.includes('grant execute on function client_videos_load(text) to anon, authenticated'), sql.includes('security definer')], [true, true, true])
check('the list takes the CRM\'s video ads and the synced ones that reported plays', [sql.includes('p.video_id is not null or p.size_key is null'), sql.includes('video_plays > 0'), sql.includes('a.meta_video_id = p.video_id')], [true, true, true])
check('the link preview knows the videos tab in both SQL copies', [sql.includes("p_kind in ('dashboard', 'scripts', 'videos')"), read('supabase/script-studio.sql').includes("p_kind in ('dashboard', 'scripts', 'videos')")], [true, true])
const fn = read('supabase/functions/client-dashboard/index.ts')
check('the function hands over Meta\'s copy only for the ads the list names', [fn.includes("body.action === 'videos'"), fn.includes('rpc/client_videos_load'), fn.includes('asked.filter((id) => own.has(id))'), fn.includes('.slice(0, 60)')], [true, true, true, true])
const store = read('src/lib/clientVideoStore.js')
check('the page reads the list through the function and asks Meta in sixties', [store.includes("rpc('client_videos_load'"), store.includes("action: 'videos'"), store.includes('i += 60')], [true, true, true])
check('the bucket link downloads under the clip\'s own name', store.includes('{ download: name || true }'), true)
const page = read('src/pages/ClientVideosPage.jsx')
check('the videos page plays, downloads, opens Meta\'s copy or the Drive file, and says when it cannot', ['data-video-download', 'data-video-open', 'data-video-drive', 'data-video-none', 'data-videos-empty', '<video src={src}'].map((m) => page.includes(m)), [true, true, true, true, true, true])
const dash = read('src/pages/ClientDashboardPage.jsx')
check('the dashboard\'s ad cards and lightbox carry the download, and point at the tab', [dash.split('data-ad-download').length - 1 >= 1, dash.includes("link={videoLink(videos.get(String(a.key)), creatives.get(String(a.key)))}"), dash.includes('<VideoLink link={videoLink(videos.get(String(lightbox.ad.key)), lightbox.creative)} />'), dash.includes("portalPath('videos', token)")], [true, true, true, true])
check('the help chat stays off the videos page', /videos/.test(read('src/components/HelpChat.jsx')), true)

console.log(failures === 0 ? '\nAll client videos checks pass' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
