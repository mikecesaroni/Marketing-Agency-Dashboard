// The video machine's rules: who needs a clip this week, whether a clip is
// fit to run, what to call the ad, and what "the same setup as last time"
// means. Pure, so scripts/check-video-launch.mjs can pin every one of them;
// the two localStorage helpers at the bottom are guarded so the module still
// imports in Node.
//
// WHY A WEEKLY BOARD. The agency's promise is a fresh video ad per client
// per week on Meta, because video outperforms statics for home-services
// offers and Meta's own delivery wants a steady supply of new creative
// (Advantage+ campaigns are tuned for eight to twelve assets in rotation).
// Nothing in the CRM answered "who has not had one this week", so the team
// answered it from memory. This does.

import { wcName } from './adNaming.js'

export const WEEK_MS = 7 * 86400000
// A client with no new ad for this long is flagged. Ten days, not seven:
// a weekly rhythm that slips by a weekend is not a problem, ten days is.
export const STALE_DAYS = 10
export const STALE_MS = STALE_DAYS * 86400000
// A clip older than this that was never published is not "waiting", it is
// forgotten; the board would otherwise fill with last quarter's B-roll.
export const WAITING_WINDOW_MS = 30 * 86400000

const VIDEO_EXT = /\.(mp4|mov|m4v|webm)$/i

/**
 * A published ad that carried a video rather than artboards.
 *
 * `video_id` is recorded on every video ad from now on. Ads published before
 * it existed are recognisable anyway: sizes belong to artboards, so a row
 * with no size_key was a video.
 */
export function isVideoAd(row) {
  return Boolean(row?.video_id) || row?.size_key == null
}

/**
 * Ads the nightly Meta sync knows about, shaped like published_ads rows so
 * the board counts them. A client run from Ads Manager has ads the CRM
 * never made; without this they read "no ad yet". The first day an ad
 * reported stands in for when it was made. size_key 'synced' keeps
 * isVideoAd from reading it as a legacy video row; is_video sets a marker
 * id instead, which can never match a clip's Meta video id.
 */
export function syncedAdRows(rows = []) {
  return rows
    .filter((r) => r?.client_id && r.first_seen)
    .map((r) => ({
      client_id: r.client_id,
      created_at: new Date(r.first_seen).toISOString(),
      ad_name: r.ad_name || '',
      size_key: 'synced',
      video_id: r.is_video ? `meta:${r.ad_id}` : null,
      synced: true,
    }))
}

/**
 * The drop status for one client, from when their last ad of any kind was
 * published through the CRM (lastAdAt) and whether a Meta account exists.
 *
 *   stale     ten or more days since a new ad
 *   never     a Meta account and no ad ever
 *   done      an ad in the last ten days
 *   no-meta   nothing to publish into
 *
 * "Any kind" on purpose: the ask was "clients who have gone 10+ days since a
 * new ad", and a static counts as a new ad.
 */
export function dropState({ hasMeta, lastAdAt, now }) {
  if (!hasMeta) return 'no-meta'
  if (!lastAdAt) return 'never'
  return now - new Date(lastAdAt) >= STALE_MS ? 'stale' : 'done'
}

const STATE_ORDER = { ready: 0, stale: 1, never: 2, done: 3, 'no-meta': 4 }

export const DROP_STATES = {
  ready: { label: 'New clip dropped in', tone: 'purple' },
  stale: { label: '10+ days, no new ad', tone: 'red' },
  never: { label: 'No ad yet', tone: 'blue' },
  done: { label: 'Ad in the last 10 days', tone: 'green' },
  'no-meta': { label: 'No Meta account', tone: 'slate' },
}

/**
 * The clips an editor dropped in that nobody has published yet.
 *
 * A clip is waiting when it is newer than the client's last video ad from
 * before video ids were recorded (older clips have an unknown history, and
 * the last legacy video ad is the honest cut-off), it is inside the window,
 * and no published ad carries its Meta video id. Uploads not yet registered
 * with Meta count too: an editor drops a file, and that is the moment the
 * board should say so.
 *
 * registered: ad_videos rows (storage_path, meta_video_id, created_at, file_name)
 * files: client_files video rows (storage_path, file_name, date_uploaded, uploaded_by)
 * ads: this client's video ads
 * resetAt: "start fresh" (app_settings.video_drops_reset_at): nothing added
 *   before this moment counts, whatever else is true of it
 */
export function waitingClips({ registered = [], files = [], ads = [], now = new Date(), resetAt = '' }) {
  const published = new Set(ads.map((a) => a.video_id).filter(Boolean))
  const legacyCutoff = ads
    .filter((a) => !a.video_id)
    .reduce((best, a) => (a.created_at > (best || '') ? a.created_at : best), '')
  const since = new Date(now - WAITING_WINDOW_MS).toISOString()
  const reset = resetAt ? new Date(resetAt).toISOString() : ''
  const fresh = (at) => at && at > since && at > legacyCutoff && at > reset
  const byPath = new Map(files.map((f) => [f.storage_path, f]))
  const out = []
  const seen = new Set()
  for (const r of registered) {
    if (!r?.storage_path || seen.has(r.storage_path)) continue
    seen.add(r.storage_path)
    if (r.meta_video_id && published.has(r.meta_video_id)) continue
    const f = byPath.get(r.storage_path)
    // Waved off by hand: not new, whatever else is true of it.
    if (r.drop_dismissed_at || f?.drop_dismissed_at) continue
    const at = f?.date_uploaded || r.created_at
    if (!fresh(at)) continue
    out.push({ path: r.storage_path, name: r.file_name || f?.file_name || r.storage_path, at, by: f?.uploaded_by || '', ready: r.status === 'ready' && Boolean(r.thumb_url) })
  }
  for (const f of files) {
    if (!f?.storage_path || seen.has(f.storage_path)) continue
    if (!VIDEO_EXT.test(f.file_name || '') && !VIDEO_EXT.test(f.storage_path)) continue
    seen.add(f.storage_path)
    if (f.drop_dismissed_at) continue
    if (!fresh(f.date_uploaded)) continue
    out.push({ path: f.storage_path, name: f.file_name || f.storage_path, at: f.date_uploaded, by: f.uploaded_by || '', ready: false })
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1))
}

/**
 * One row per active client, most urgent first.
 *
 * clients: id, name, archived, is_internal, meta_ad_account_id
 * publishedAds: client_id, created_at, size_key, video_id, ad_name
 * videos (ad_videos): client_id, status, meta_video_id, thumb_url, created_at, storage_path, file_name
 * files (client_files): client_id, storage_path, file_name, date_uploaded, uploaded_by
 */
export function videoDrops(clients = [], publishedAds = [], videos = [], now = new Date(), files = [], resetAt = '') {
  // Video ads, for the clip bookkeeping; every ad, for "when was the last".
  const ads = new Map()
  const anyAds = new Map()
  for (const r of publishedAds) {
    if (!r?.client_id) continue
    if (!anyAds.has(r.client_id)) anyAds.set(r.client_id, [])
    anyAds.get(r.client_id).push(r)
    if (!isVideoAd(r)) continue
    if (!ads.has(r.client_id)) ads.set(r.client_id, [])
    ads.get(r.client_id).push(r)
  }
  const clips = new Map()
  for (const v of videos) {
    if (!v?.client_id) continue
    if (!clips.has(v.client_id)) clips.set(v.client_id, [])
    clips.get(v.client_id).push(v)
  }
  const uploads = new Map()
  for (const f of files) {
    if (!f?.client_id) continue
    if (!uploads.has(f.client_id)) uploads.set(f.client_id, [])
    uploads.get(f.client_id).push(f)
  }

  return clients
    .filter((c) => c && !c.archived)
    .map((c) => {
      const mine = ads.get(c.id) || []
      const every = anyAds.get(c.id) || []
      const newest = (rows) => rows.reduce((best, r) => (r.created_at > (best || '') ? r.created_at : best), null)
      const lastVideoAt = newest(mine)
      const lastAdAt = newest(every)
      const daysSince = lastAdAt ? Math.floor((now - new Date(lastAdAt)) / 86400000) : null
      const thisWeek = mine.filter((r) => now - new Date(r.created_at) <= WEEK_MS)
      const own = clips.get(c.id) || []
      const ready = own.filter((v) => v.status === 'ready' && v.meta_video_id && v.thumb_url).length
      const hasMeta = Boolean(c.meta_ad_account_id)
      const waiting = waitingClips({ registered: own, files: uploads.get(c.id) || [], ads: mine, now, resetAt })
      const state = dropState({ hasMeta, lastAdAt, now })
      return {
        id: c.id,
        name: c.name,
        internal: Boolean(c.is_internal),
        hasMeta,
        thisWeek: thisWeek.length,
        total: mine.length,
        lastVideoAt,
        lastAdAt,
        daysSince,
        lastAdName: every.find((r) => r.created_at === lastAdAt)?.ad_name || '',
        lastAdWasVideo: every.some((r) => r.created_at === lastAdAt && isVideoAd(r)),
        // Behind on the promise, whatever else the row shows: a dropped clip
        // for a client who is also stale is still a stale client.
        behind: hasMeta && (!lastAdAt || now - new Date(lastAdAt) >= STALE_MS),
        readyClips: ready,
        clips: own.length,
        waiting,
        // A dropped clip is the loudest state: it is somebody's finished
        // work sitting there, and the point of the board is to get it out.
        state: waiting.length > 0 && hasMeta ? 'ready' : state,
      }
    })
    .sort((a, b) => {
      if (STATE_ORDER[a.state] !== STATE_ORDER[b.state]) return STATE_ORDER[a.state] - STATE_ORDER[b.state]
      // Newest drop first among the ready ones.
      if (a.state === 'ready') return a.waiting[0].at < b.waiting[0].at ? 1 : -1
      // Within a state, the one waiting longest first; never-published by name.
      if (a.lastAdAt !== b.lastAdAt) {
        if (!a.lastAdAt) return 1
        if (!b.lastAdAt) return -1
        return a.lastAdAt < b.lastAdAt ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
}

/** The numbers over the board. */
export function dropStats(rows) {
  const n = (state) => rows.filter((r) => r.state === state).length
  return {
    ready: n('ready'),
    // Fresh and behind count every client with a Meta account exactly once,
    // whatever the row shows: a dropped clip for a stale client is still a
    // stale client.
    done: rows.filter((r) => r.hasMeta && !r.behind).length,
    due: rows.filter((r) => r.behind).length,
    stale: rows.filter((r) => r.hasMeta && r.behind && r.lastAdAt).length,
    never: rows.filter((r) => r.hasMeta && !r.lastAdAt).length,
    thisWeek: rows.reduce((s, r) => s + r.thisWeek, 0),
    withMeta: rows.filter((r) => r.hasMeta).length,
  }
}

/**
 * Is this clip fit to run, and where.
 *
 * What Meta's own creative guidance and every ad-buyer's testing say, boiled
 * down to the three things a phone clip gets wrong:
 *
 *   shape     9:16 fills Reels and Stories, which is where video delivery
 *             goes; 4:5 and 1:1 are fine in feed; 16:9 is a landscape clip
 *             that plays letterboxed on every phone placement.
 *   length    under five seconds has no room for a hook and an offer; over
 *             sixty is past what Reels will run in full and past what a
 *             cold viewer sits through. The sweet spot is 10 to 30.
 *   words     no speech found means no captions can be made, and most feed
 *             video plays on mute, so the clip must carry its message on
 *             screen.
 *
 * Returns [{level: 'ok'|'warn', text}]. Nothing blocks a publish: these are
 * the notes an experienced buyer would make, not a gate.
 */
export function clipChecks({ durationSeconds, width, height, transcript, transcribedAt, transcriptError } = {}) {
  const out = []
  const w = Number(width) || 0
  const h = Number(height) || 0
  if (w > 0 && h > 0) {
    const ratio = w / h
    if (ratio <= 0.6) out.push({ level: 'ok', text: '9:16 vertical, fills Reels and Stories' })
    else if (ratio <= 0.85) out.push({ level: 'ok', text: '4:5, fine in feed; bars top and bottom in Reels' })
    else if (ratio <= 1.05) out.push({ level: 'ok', text: 'Square, fine in feed; bars in Reels' })
    else out.push({ level: 'warn', text: 'Landscape clip: plays small with bars on every phone placement. Export it 9:16 if you can.' })
    if (Math.min(w, h) < 720) out.push({ level: 'warn', text: `Low resolution (${w}×${h}); aim for 1080 on the short side` })
  }
  const d = Number(durationSeconds) || 0
  if (d > 0) {
    if (d < 5) out.push({ level: 'warn', text: `${Math.round(d)}s is too short to hook and make an offer` })
    else if (d <= 30) out.push({ level: 'ok', text: `${Math.round(d)}s, the sweet spot` })
    else if (d <= 60) out.push({ level: 'ok', text: `${Math.round(d)}s, fine; the hook still has to land in the first 3` })
    else out.push({ level: 'warn', text: `${Math.round(d)}s is long for a cold viewer and past the Reels limit; consider a cut under 60s` })
  }
  if (transcript) out.push({ level: 'ok', text: 'Speech transcribed, so captions and copy can come from it' })
  else if (transcribedAt || /no speech/i.test(String(transcriptError || ''))) {
    out.push({ level: 'warn', text: 'No speech found: make sure the offer is on screen as text, most people watch on mute' })
  }
  return out
}

/** A one-word verdict for a card: 'good', 'notes' or '' when nothing is known. */
export function clipVerdict(checks) {
  if (!checks || checks.length === 0) return ''
  return checks.some((c) => c.level === 'warn') ? 'notes' : 'good'
}

const stem = (fileName) =>
  String(fileName || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * The name the ad gets in Ads Manager when nobody types one.
 *
 * WC_Client · 2026-09-24 · angle-or-file. The date is what makes a weekly
 * machine legible in Ads Manager: sort by name and the weeks line up. The
 * angle is the copy version's name when one was picked, the file's stem
 * otherwise, so two clips on the same day still read differently.
 */
export function videoAdName({ clientName, angle, fileName, date = new Date() }) {
  const day = typeof date === 'string' ? date : date.toISOString().slice(0, 10)
  const tail = String(angle || '').trim() || stem(fileName) || 'video'
  return wcName(`${String(clientName || '').trim()} · ${day} · ${tail}`).slice(0, 100)
}

/**
 * Where a video is heading when it is the same place as last week.
 *
 * Every video launch that goes out records these; opening the publish screen
 * for the client offers them back as one click. Only the destination side:
 * the clips and the words are new every week, the ad sets rarely are.
 */
export function launchSnapshot({ objective, cta, linkUrl, leadForm, specialCategory, adsets, campaignId, reuseCampaign }) {
  return {
    at: new Date().toISOString(),
    objective: objective || 'LEADS_FORM',
    cta: cta || 'LEARN_MORE',
    linkUrl: String(linkUrl || '').trim(),
    leadForm: leadForm?.id ? { id: String(leadForm.id), name: leadForm.name || '' } : null,
    specialCategory: specialCategory || '',
    campaignId: reuseCampaign ? String(campaignId || '') : '',
    // Only ad sets that took the ads. Re-offering one that failed walks
    // straight back into the failure.
    adsets: (adsets || []).filter((a) => a?.id).map((a) => ({ id: String(a.id), name: a.name || '' })),
  }
}

/** The sentence on the "same as last time" card. */
export function describeLaunch(memory, objectives = []) {
  if (!memory) return ''
  const objective = objectives.find((o) => o.value === memory.objective)?.label || memory.objective
  const parts = [objective]
  if (memory.leadForm?.name) parts.push(`form "${memory.leadForm.name}"`)
  if (memory.adsets?.length) {
    const names = memory.adsets.map((a) => a.name || a.id)
    parts.push(
      memory.adsets.length === 1
        ? `into ${names[0]}`
        : `into ${memory.adsets.length} ad sets: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`
    )
  } else {
    parts.push('a new ad set')
  }
  return parts.join(' · ')
}

/** app_settings key: everything dropped before this moment is not "new". */
export const DROPS_RESET_KEY = 'video_drops_reset_at'

export const launchMemoryKey = (clientId) => `crm.videoLaunch.${clientId}`

export function readLaunchMemory(clientId) {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(launchMemoryKey(clientId))
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function writeLaunchMemory(clientId, snapshot) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(launchMemoryKey(clientId), JSON.stringify(snapshot))
  } catch {
    /* private mode, full storage: the next launch just starts blank */
  }
}

/**
 * The four steps of a video launch and where each one stands. Drives the
 * strip at the top of the publish screen; every value is derived, nothing
 * here is state.
 */
export function launchSteps({ picked = 0, ready = 0, withCopy = 0, destination = '', blockers = [] }) {
  return [
    {
      key: 'videos',
      label: 'Videos',
      done: picked > 0,
      detail: picked > 0 ? `${picked} picked` : ready > 0 ? `${ready} ready` : 'drop a clip',
    },
    {
      key: 'words',
      label: 'Words',
      done: picked > 0 && withCopy >= picked,
      detail: picked === 0 ? 'after the clip' : withCopy >= picked ? 'written' : `${withCopy} of ${picked}`,
    },
    {
      key: 'where',
      label: 'Where',
      done: Boolean(destination),
      detail: destination || 'pick an ad set',
    },
    {
      key: 'go',
      label: 'Publish',
      done: false,
      detail: blockers.length === 0 ? 'ready' : blockers[0],
    },
  ]
}
