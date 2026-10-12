// Self-check for AI videos: the script parsing, the timing, the B-roll
// windows and prompts, and the edit handed to the renderer.
// Run: node scripts/check-ai-video.mjs

import {
  BROLL_LENGTH,
  alignmentDuration,
  brollPrompts,
  brollWindows,
  buildTimeline,
  lineStartTimes,
  offerStart,
  onScreenText,
  sampleTimeline,
  scriptTitle,
  slug,
  spokenLines,
  spokenText,
  tradeKey,
} from '../supabase/functions/ai-video/plan.js'
import { aiFileName, baseClipLabel, jobLabel, jobStages, setupProblems, setupReady } from '../src/lib/aiVideo.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

const script = `SCRIPT 2: Heat check
Angle: the first cold night is days away
Length: about 30 seconds
HOOK (0-3s): Has your heat run since March?
PROBLEM: The first cold night is when it fails. Always at 9pm.
PROOF: Licensed and insured, 14 years in Burnet.
OFFER: $89 heat check this week.
CTA: Call the number on screen.
On screen text: Heat check, $89
Film it: in the truck, window light`

// The words, and only the words.
check('spoken lines keep their labels and order', spokenLines(script).map((l) => l.label), ['HOOK', 'PROBLEM', 'PROOF', 'OFFER', 'CTA'])
check('spoken text is the lines joined, no labels, no notes', spokenText(script), 'Has your heat run since March?\nThe first cold night is when it fails. Always at 9pm.\nLicensed and insured, 14 years in Burnet.\n$89 heat check this week.\nCall the number on screen.')
check('a script that lost its layout still drops the notes', spokenText('SCRIPT 1: Loose\nAngle: whatever\nJust say this.\nFilm it: outside'), 'Just say this.')
check('the on-screen line feeds the card', onScreenText(script), 'Heat check, $89')
check('no on-screen line falls back to the offer', onScreenText('SCRIPT 1: X\nHOOK (0-3s): Hi.\nOFFER: $79 tune-up.'), '$79 tune-up.')
check('the title comes off the first line, stars dropped', scriptTitle('**SCRIPT 3: Burning smell**\nHOOK (0-3s): x'), 'Burning smell')
check('slugs are storage safe', slug('Heat check, $89!'), 'heat-check-89')

// Timing off the alignment.
const text = spokenText(script)
const chars = [...text]
const starts = chars.map((_, i) => Math.round(i * 0.08 * 100) / 100)
const ends = starts.map((s) => Math.round((s + 0.08) * 100) / 100)
const alignment = { characters: chars, character_start_times_seconds: starts, character_end_times_seconds: ends }
const duration = alignmentDuration(alignment)
check('duration is the last character’s end', duration, ends[ends.length - 1])
const times = lineStartTimes(spokenLines(script), alignment)
check('each line starts where its first character does', times.map((t) => t.label), ['HOOK', 'PROBLEM', 'PROOF', 'OFFER', 'CTA'])
check('the hook starts at zero and the offer after the proof', [times[0].start, times[3].start > times[2].start], [0, true])
check('offer time is the OFFER line’s start', offerStart(spokenLines(script), alignment, duration), times[3].start)
check('with no alignment the offer lands 60% through', offerStart(spokenLines(script), null, 30), 18)

// Cutaways: never over the hook, never over the ask.
check('a 30s script gets three cutaways, starting after the hook', brollWindows(30), [
  { start: 3.5, length: BROLL_LENGTH },
  { start: 10, length: BROLL_LENGTH },
  { start: 16.5, length: BROLL_LENGTH },
])
check('a 12s script gets one', brollWindows(12).length, 1)
check('an 8s script gets none', brollWindows(8), [])
check('the cap holds', brollWindows(90).length, 3)

// Prompts: the client’s photos first, then the trade, no faces, no text.
const prompts = brollPrompts({ industry: 'HVAC', market: 'Austin, Texas', script, count: 3, refCount: 1 })
check('one image prompt then two text prompts', prompts.map((p) => p.kind), ['image', 'text', 'text'])
check('trade shots mention the market and forbid text and faces', prompts.slice(1).every((p) => /Austin, Texas/.test(p.prompt) && /no text/.test(p.prompt) && /no faces/.test(p.prompt)), true)
check('two scripts get different shots', prompts[1].prompt !== brollPrompts({ industry: 'HVAC', script: 'SCRIPT 1: Other\nHOOK (0-3s): Different words entirely.', count: 2 })[0].prompt, true)
check('trades from the intake answers', ['HVAC/Plumbing', 'Pressure Washing', 'Roofing', 'Appliances', 'Water treatment', ''].map(tradeKey), ['hvac', 'washing', 'roofing', 'appliance', 'plumbing', 'general'])

// The edit.
const edit = buildTimeline({
  ownerUrl: 'https://x/owner.mp4',
  duration: 30,
  broll: [{ url: 'https://x/b1.mp4' }, { url: 'https://x/b2.mp4' }],
  onScreen: 'Heat check, $89',
  business: 'Belk Heating',
  logoUrl: 'https://x/logo.png',
  offerAt: 19.2,
})
const tracks = edit.timeline.tracks
check('tracks top to bottom: captions, card, logo, cutaways, owner', tracks.map((t) => t.clips[0].asset.type), ['rich-caption', 'shape', 'image', 'video', 'video'])
check('captions are cut from the owner’s own audio', tracks[0].clips[0].asset.src, 'alias://owner')
check('the owner runs full length under everything, aliased', [tracks[4].clips[0].alias, tracks[4].clips[0].length, tracks[4].clips[0].asset.volume], ['owner', 30, 1])
check('two cutaways, muted, in the first two windows', tracks[3].clips.map((c) => [c.start, c.length, c.asset.volume]), [[3.5, 3.5, 0], [10, 3.5, 0]])
check('the card shows from the moment the offer is said to the end', tracks[1].clips.map((c) => [c.start, c.length]), [[19.2, 10.8], [19.2, 10.8], [19.2, 10.8]])
check('the card carries the offer and the business', tracks[1].clips.slice(1).map((c) => c.asset.text), ['Heat check, $89', 'Belk Heating'])
check('vertical 1080 with a poster frame', [edit.output.aspectRatio, edit.output.resolution, edit.output.poster.capture], ['9:16', '1080', 1])
const bare = buildTimeline({ ownerUrl: 'https://x/o.mp4', duration: 9, broll: [], onScreen: '', business: 'X' })
check('no B-roll, no card, no logo: captions and owner only', bare.timeline.tracks.map((t) => t.clips[0].asset.type), ['rich-caption', 'video'])
check('an offer time past the end falls back', buildTimeline({ ownerUrl: 'u', duration: 20, onScreen: 'x', offerAt: 19.9 }).timeline.tracks[1].clips[0].start, 12)
check('the voice sample is an audio-only render of the first 90 seconds', [sampleTimeline('https://x/base.mp4').output.format, sampleTimeline('https://x/base.mp4').timeline.tracks[0].clips[0].length], ['mp3', 90])

// What the panel says.
const ready = { status: 'ready', voice_id: 'v', base_video_path: 'c/1-clip.mp4', consent_name: 'Dale' }
check('ready means voice, clip and consent', [setupReady(ready), setupReady({ ...ready, voice_id: null }), setupReady(null)], [true, false, false])
check('problems in order: clip, consent, then the button', setupProblems({ status: 'needs_clip' }).length, 2)
check('a prepared clip and consent with no voice says to press the button', setupProblems({ status: 'needs_clip', base_video_path: 'x', consent_name: 'Dale' }), ['Press Prepare the voice.'])
check('a Drive base clip says so', baseClipLabel({ base_video_path: 'drive:abc', base_video_name: 'IMG_1.mov' }), 'IMG_1.mov (Google Drive)')
check('stages for a job being lip-synced', jobStages({ status: 'generating', broll: [{}, {}] }).map((s) => s.state), ['done', 'busy', 'busy', 'todo'])
check('stages for a job with no B-roll that is cutting', jobStages({ status: 'rendering', broll: [] }).map((s) => s.state), ['done', 'done', 'skip', 'busy'])
check('a failure in the cut keeps the earlier stages green', jobStages({ status: 'failed', failed_from: 'rendering', broll: [{}] }).map((s) => s.state), ['done', 'done', 'done', 'bad'])
check('labels', [jobLabel({ status: 'done' }), jobLabel({ status: 'failed', error: 'x' }), jobLabel({ status: 'rendering', step: 'Cutting the video' })], ['Ready to watch', 'Failed: x', 'Cutting the video'])
check('file names', aiFileName('Heat check, $89', 5), 'ai-heat-check-89-5.mp4')

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
