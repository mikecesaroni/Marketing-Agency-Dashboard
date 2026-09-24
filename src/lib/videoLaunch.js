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
 * The weekly drop status for one client, given their published ads and
 * registered clips.
 *
 *   done      a video ad went out in the last seven days
 *   due       none this week, but they have had one before (the machine
 *             missed a beat) or they have a Meta account and clips waiting
 *   overdue   the last one is more than fourteen days old
 *   never     a Meta account and no video ad ever
 *   no-meta   nothing to publish into
 */
export function dropState({ hasMeta, lastVideoAt, now }) {
  if (!hasMeta) return 'no-meta'
  if (!lastVideoAt) return 'never'
  const age = now - new Date(lastVideoAt)
  if (age <= WEEK_MS) return 'done'
  if (age > 2 * WEEK_MS) return 'overdue'
  return 'due'
}

const STATE_ORDER = { overdue: 0, due: 1, never: 2, done: 3, 'no-meta': 4 }

export const DROP_STATES = {
  overdue: { label: 'Overdue', tone: 'red' },
  due: { label: 'Due this week', tone: 'amber' },
  never: { label: 'No video yet', tone: 'blue' },
  done: { label: 'Done this week', tone: 'green' },
  'no-meta': { label: 'No Meta account', tone: 'slate' },
}

/**
 * One row per active client, most urgent first.
 *
 * clients: id, name, archived, is_internal, meta_ad_account_id
 * publishedAds: client_id, created_at, size_key, video_id, ad_name
 * videos (ad_videos): client_id, status, meta_video_id, thumb_url, created_at
 */
export function videoDrops(clients = [], publishedAds = [], videos = [], now = new Date()) {
  const ads = new Map()
  for (const r of publishedAds) {
    if (!r?.client_id || !isVideoAd(r)) continue
    if (!ads.has(r.client_id)) ads.set(r.client_id, [])
    ads.get(r.client_id).push(r)
  }
  const clips = new Map()
  for (const v of videos) {
    if (!v?.client_id) continue
    if (!clips.has(v.client_id)) clips.set(v.client_id, [])
    clips.get(v.client_id).push(v)
  }

  return clients
    .filter((c) => c && !c.archived)
    .map((c) => {
      const mine = ads.get(c.id) || []
      const lastVideoAt = mine.reduce((best, r) => (r.created_at > (best || '') ? r.created_at : best), null)
      const thisWeek = mine.filter((r) => now - new Date(r.created_at) <= WEEK_MS)
      const own = clips.get(c.id) || []
      const ready = own.filter((v) => v.status === 'ready' && v.meta_video_id && v.thumb_url).length
      const hasMeta = Boolean(c.meta_ad_account_id)
      return {
        id: c.id,
        name: c.name,
        internal: Boolean(c.is_internal),
        hasMeta,
        thisWeek: thisWeek.length,
        total: mine.length,
        lastVideoAt,
        lastAdName: mine.find((r) => r.created_at === lastVideoAt)?.ad_name || '',
        readyClips: ready,
        clips: own.length,
        state: dropState({ hasMeta, lastVideoAt, now }),
      }
    })
    .sort((a, b) => {
      if (STATE_ORDER[a.state] !== STATE_ORDER[b.state]) return STATE_ORDER[a.state] - STATE_ORDER[b.state]
      // Within a state, the one waiting longest first; never-published by name.
      if (a.lastVideoAt !== b.lastVideoAt) {
        if (!a.lastVideoAt) return 1
        if (!b.lastVideoAt) return -1
        return a.lastVideoAt < b.lastVideoAt ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
}

/** The numbers over the board. */
export function dropStats(rows) {
  const n = (state) => rows.filter((r) => r.state === state).length
  return {
    done: n('done'),
    due: n('due') + n('overdue') + n('never'),
    overdue: n('overdue'),
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
