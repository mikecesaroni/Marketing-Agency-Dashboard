/**
 * AI videos, the pure half: what a job and a setup row mean, in words the
 * panel and the chat can show. Network access lives in aiVideoStore.js.
 *
 * The .js on the import is required: scripts/check-ai-video.mjs loads this
 * module in plain Node.
 */
import { isDrivePath } from './driveLabels.js'

export const ACTIVE_STATUSES = ['queued', 'generating', 'rendering']

export function isActive(job) {
  return ACTIVE_STATUSES.includes(job?.status)
}

/** Owner's voice is cloned, base clip chosen, consent on file: the button can work. */
export function setupReady(setup) {
  return Boolean(setup && setup.status === 'ready' && setup.voice_id && setup.base_video_path && setup.consent_name)
}

/** What still stands between this client and a first AI video, in order. */
export function setupProblems(setup) {
  const out = []
  if (!setup?.base_video_path) out.push('Pick the owner’s base clip (them talking to camera for at least 45 seconds).')
  if (!setup?.consent_name) out.push('Record who agreed to the voice clone, in writing.')
  if (setup?.status === 'error') out.push(setup.error || 'Preparing the voice failed. Try again.')
  else if (setup?.status === 'preparing') out.push('The voice is being prepared. A minute or two.')
  else if (setup?.base_video_path && setup?.consent_name && !setup?.voice_id) out.push('Press Prepare the voice.')
  return out
}

/** One line for the setup state. */
export function setupLabel(setup) {
  if (!setup || setup.status === 'needs_clip') return 'Not set up'
  if (setup.status === 'preparing') return 'Preparing the voice…'
  if (setup.status === 'error') return 'Needs attention'
  if (setupReady(setup)) return 'Ready'
  return 'Not set up'
}

const STEP_WORDS = {
  queued: 'Waiting to start',
  generating: 'Lip-syncing the owner and filming the B-roll',
  rendering: 'Cutting the video',
  done: 'Done',
  failed: 'Failed',
}

/** What is happening to a job, for the pill. */
export function jobLabel(job) {
  if (!job) return ''
  if (job.status === 'failed') return job.error ? `Failed: ${job.error}` : 'Failed'
  if (job.status === 'done') return 'Ready to watch'
  return job.step || STEP_WORDS[job.status] || job.status
}

/**
 * The four stages as dots, so a glance says what is still cooking.
 * voice: TTS done once the job leaves 'queued'. sync and broll: terminal once
 * the job leaves 'generating'. cut: done at 'done'.
 */
export function jobStages(job) {
  const s = job?.status
  const after = (stage) => ACTIVE_STATUSES.indexOf(s) > ACTIVE_STATUSES.indexOf(stage) || s === 'done'
  const failedAt = s === 'failed' ? job.failed_from || 'queued' : ''
  const state = (stage, doneWhen, busyWhen) => {
    if (failedAt === stage) return 'bad'
    if (s === 'failed') return ACTIVE_STATUSES.indexOf(failedAt) > ACTIVE_STATUSES.indexOf(stage) ? 'done' : 'todo'
    if (doneWhen) return 'done'
    if (busyWhen) return 'busy'
    return 'todo'
  }
  const brollCount = Array.isArray(job?.broll) ? job.broll.length : 0
  return [
    { label: 'Voice', state: state('queued', after('queued'), s === 'queued') },
    { label: 'Lip-sync', state: state('generating', after('generating'), s === 'generating') },
    {
      label: 'B-roll',
      state: brollCount === 0 && after('queued') ? 'skip' : state('generating', after('generating'), s === 'generating'),
    },
    { label: 'Cut', state: state('rendering', s === 'done', s === 'rendering') },
  ]
}

/** The finished file's name in the client's Files. */
export function aiFileName(title, stamp = Date.now()) {
  const base =
    String(title || 'ai video')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'ai-video'
  return `ai-${base}-${stamp}.mp4`
}

/** How a base clip is described in the setup panel. */
export function baseClipLabel(setup) {
  if (!setup?.base_video_path) return ''
  const name = setup.base_video_name || setup.base_video_path.split('/').pop()
  return isDrivePath(setup.base_video_path) ? `${name} (Google Drive)` : name
}

/** Seconds as m:ss. */
export function clock(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** The secrets the function needs, for the message when one is missing. */
export const SECRETS = [
  { name: 'ELEVENLABS_API_KEY', vendor: 'ElevenLabs', job: 'the owner’s voice' },
  { name: 'SYNC_API_KEY', vendor: 'Sync.so', job: 'the lip-sync' },
  { name: 'SHOTSTACK_API_KEY', vendor: 'Shotstack', job: 'the cut, captions and offer card' },
  { name: 'HIGGSFIELD_API_KEY_ID + HIGGSFIELD_API_KEY_SECRET', vendor: 'Higgsfield', job: 'the B-roll (optional; without it the video is the owner only)' },
]
