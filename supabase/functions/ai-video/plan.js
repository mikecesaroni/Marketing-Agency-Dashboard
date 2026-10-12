// The thinking part of an AI video, with no network in it: which lines are
// spoken, when the offer lands, where the B-roll cutaways go, what each B-roll
// shot asks for, and the edit the renderer is handed.
//
// Plain JS on purpose. The ai-video function imports it (Deno runs it as is)
// and scripts/check-ai-video.mjs imports the same file in Node, so the edit
// a job sends to Shotstack is the one the checks saw.

// Lines the owner says, in order. Everything else on a card is a note for us.
export const SPOKEN_LABELS = ['HOOK', 'PROBLEM', 'PROOF', 'OFFER', 'CTA']
const NOTE_LINE = /^(angle|length|on screen text|film it)\b/i

/** "LABEL (0-3s): words" into {label, value}; the SCRIPT n: title line is dropped. */
export function scriptLines(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^\**SCRIPT\s+\d+/i.test(l))
    .map((line) => {
      const m = line.match(/^([A-Za-z][A-Za-z ]{1,24}(?:\([^)]*\))?):\s*(.*)$/)
      return m ? { label: m[1].trim(), value: m[2].trim() } : { label: '', value: line }
    })
}

/** The spoken lines as [{label: 'HOOK', value}] in script order. */
export function spokenLines(text) {
  const lines = scriptLines(text)
  const labeled = lines
    .map((l) => ({ label: String(l.label).replace(/\s*\(.*$/, '').toUpperCase(), value: l.value }))
    .filter((l) => SPOKEN_LABELS.includes(l.label) && l.value)
  if (labeled.length > 0) return labeled
  // A script that lost its layout: every line that is not a note is spoken.
  return lines.filter((l) => !l.label && !NOTE_LINE.test(l.value)).map((l) => ({ label: 'LINE', value: l.value }))
}

export function spokenText(text) {
  return spokenLines(text).map((l) => l.value).join('\n')
}

/** The "On screen text:" line, or the OFFER line, or nothing. */
export function onScreenText(text) {
  const lines = scriptLines(text)
  const on = lines.find((l) => /^on screen text/i.test(l.label))
  if (on?.value) return on.value.replace(/^["“]|["”]$/g, '').trim()
  const offer = lines.find((l) => /^offer/i.test(l.label))
  return offer?.value ? offer.value.trim() : ''
}

export function scriptTitle(text) {
  const first = String(text || '').split('\n')[0] || ''
  const m = first.match(/SCRIPT\s+\d+\s*:\s*(.+)$/i)
  return (m ? m[1] : first).replace(/\*+/g, '').trim().slice(0, 80)
}

/** A storage-safe, readable slug for the finished file. */
export function slug(text) {
  return (
    String(text || 'ad')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'ad'
  )
}

// ---------------------------------------------------------------------------
// Timing, from ElevenLabs' character alignment.
// ---------------------------------------------------------------------------

/** Seconds of speech, from the last character's end time. */
export function alignmentDuration(alignment) {
  const ends = alignment?.character_end_times_seconds || []
  const last = ends.length ? Number(ends[ends.length - 1]) : 0
  return Math.round((last > 0 ? last : 0) * 100) / 100
}

/**
 * When each spoken line starts, in seconds. The lines were sent joined with
 * newlines, so a line's first character sits at a known offset in the text;
 * the alignment gives that character's start time. When the alignment does
 * not line up with the text (a normaliser rewrote it), fall back to sharing
 * the duration out by character count, which is near enough for a card.
 */
export function lineStartTimes(lines, alignment) {
  const chars = alignment?.characters || []
  const starts = alignment?.character_start_times_seconds || []
  const joined = lines.map((l) => l.value).join('\n')
  const total = alignmentDuration(alignment)
  const out = []
  let offset = 0
  for (const line of lines) {
    const aligned = chars.length === joined.length && starts.length === chars.length
    const at = aligned ? Number(starts[offset] || 0) : (offset / Math.max(1, joined.length)) * total
    out.push({ label: line.label, start: Math.round(at * 100) / 100 })
    offset += line.value.length + 1
  }
  return out
}

/** When the OFFER line begins, else 60% of the way through. */
export function offerStart(lines, alignment, duration) {
  const times = lineStartTimes(lines, alignment)
  const offer = times.find((t) => t.label === 'OFFER')
  if (offer && offer.start > 1 && offer.start < duration - 1.5) return offer.start
  return Math.round(duration * 0.6 * 100) / 100
}

// ---------------------------------------------------------------------------
// B-roll: where the cutaways sit and what they show.
// ---------------------------------------------------------------------------

export const BROLL_LENGTH = 3.5 // seconds on screen per cutaway
const BROLL_FIRST = 3.5 // the hook is the owner's face, always
const BROLL_GAP = 3 // owner back on camera between cutaways
const BROLL_TAIL = 2.5 // the CTA is the owner's face, always
export const BROLL_MAX = 3

/** Cutaway windows that fit the speech, up to `max`, leaving the hook and the ask on the owner. */
export function brollWindows(duration, max = BROLL_MAX) {
  const out = []
  let start = BROLL_FIRST
  while (out.length < max && start + BROLL_LENGTH <= Number(duration || 0) - BROLL_TAIL) {
    out.push({ start: Math.round(start * 100) / 100, length: BROLL_LENGTH })
    start += BROLL_LENGTH + BROLL_GAP
  }
  return out
}

// What a phone would see on a job for each trade. Written as shots, not
// scenes, and always without faces or text: a generated face next to the real
// owner reads as fake, and generated lettering is never right.
const SHOTS = {
  hvac: [
    'a technician in work gloves opening the side panel of a residential air conditioning unit beside a house, close on the hands and tools',
    'a furnace in a basement with the front cover off, a flashlight beam moving across the burners',
    'a branded-looking white service van parked in a suburban driveway in late afternoon light, logo area left blank',
    'a thermostat on a hallway wall, a hand adjusting the temperature, soft window light',
    'a gloved hand sliding a fresh air filter into a return vent, dust visible in a sunbeam',
    'rooftop condenser units at dusk, a slow pan across the fans turning',
  ],
  plumbing: [
    'a plumber under a kitchen sink with a wrench on the trap, a work light clipped to the cabinet',
    'a tankless water heater being mounted on a garage wall, copper lines catching the light',
    'water running clear from a kitchen tap after a repair, close on the stream',
    'a drain camera monitor showing the inside of a pipe, a hand steadying the cable',
    'a white service van parked at a suburban curb in morning light, logo area left blank',
    'a new toilet and supply line in a bright bathroom, the final wipe-down with a cloth',
  ],
  roofing: [
    'a roofer walking a pitched shingle roof at golden hour, tool belt swinging',
    'a nail gun setting architectural shingles in a neat row, close on the hands',
    'a drone-style slow push over a finished roof with the house below, clean lines',
    'a ladder against the eave, a bundle of shingles being carried up',
    'a hand lifting a damaged shingle to show the wear underneath',
  ],
  electrical: [
    'an electrician tightening a breaker in an open panel, headlamp on, close on the hands',
    'a new outlet being wired, copper visible, a voltage tester lighting up',
    'recessed lights coming on one by one across a kitchen ceiling',
    'an EV charger mounted in a garage, the cable being coiled',
    'a white service van at a curb in morning light, logo area left blank',
  ],
  landscaping: [
    'a mower cutting clean stripes into a green lawn in morning light',
    'hands planting shrubs along a fresh mulch bed, soil on the gloves',
    'a string trimmer edging a sidewalk, grass clippings flying in the sun',
    'a sprinkler head popping up and misting over a lawn at dawn',
    'a crew raking leaves into a tidy pile under a maple tree',
  ],
  washing: [
    'a pressure washer stripping grime off a concrete driveway, a clean stripe appearing',
    'a soft-wash wand rinsing a vinyl house siding, suds sliding down',
    'a wooden deck half cleaned, the line between old grey and fresh wood',
    'roof shingles being rinsed, black streaks washing away',
  ],
  cleaning: [
    'a spotless kitchen counter being wiped in a long slow stroke, light from the window',
    'a vacuum head drawing a clean stripe across a carpet',
    'a bathroom mirror squeegeed clear, the reflection sharpening',
    'fresh folded towels set on a made bed in a bright room',
  ],
  remodel: [
    'a kitchen mid-remodel, new cabinets going in, a level held against the top',
    'tile being set on a shower wall with spacers, a trowel spreading mortar',
    'a finished bathroom with a walk-in shower and new fixtures, slow push-in',
    'a sander moving over new hardwood flooring, dust in the light',
  ],
  appliance: [
    'a technician pulling the front panel off a dryer, lint and a new belt in hand',
    'a dishwasher drawer sliding out, a hand checking the spray arm',
    'a refrigerator compressor being tested with a meter, close on the gauge',
    'a washing machine drum spinning again after a repair, clean laundry inside',
  ],
  pest: [
    'a technician spraying the exterior foundation line of a house with a backpack sprayer',
    'a bait station being placed by a garage corner, gloved hands',
    'an attic inspection with a flashlight beam across the rafters',
  ],
  general: [
    'a white service van parked in a suburban driveway in late afternoon light, logo area left blank',
    'a technician in work gloves carrying a toolbox up a front walk, seen from behind',
    'a homeowner front door opening onto a bright porch, the camera stepping inside',
    'hands tightening a fitting with a wrench, close and steady',
    'a tidy work truck bed with organised tools, slow pan',
  ],
}

const TRADE_WORDS = [
  ['hvac', /hvac|heat|air|cool|furnace|a\/c|ac\b/i],
  ['plumbing', /plumb|drain|water|sewer|pipe/i],
  ['roofing', /roof/i],
  ['electrical', /electric/i],
  ['landscaping', /landscap|lawn|tree|irrigat/i],
  ['washing', /pressure|power wash|soft wash|wash/i],
  ['cleaning', /clean|maid|janitor/i],
  ['remodel', /remodel|renovat|construct|kitchen|bath|contractor/i],
  ['appliance', /appliance/i],
  ['pest', /pest|termite|exterminat/i],
]

export function tradeKey(industry) {
  const s = String(industry || '')
  for (const [key, re] of TRADE_WORDS) if (re.test(s)) return key
  return 'general'
}

// A cheap, stable hash so two scripts for one client get different shots
// without anybody choosing them.
function hash(s) {
  let h = 7
  for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

const STYLE =
  'Vertical 9:16 handheld phone footage, realistic, natural light, steady slow camera movement, no text, no logos, no captions, no faces, no people looking at camera.'

const REF_STYLE =
  'Bring this exact photo to life with a slow, subtle handheld push-in and natural light. Keep everything in the photo exactly as it is: same place, same vehicles, same equipment. No new people, no text, no logos.'

/**
 * One prompt per cutaway. The first `refCount` are for the client's own
 * photos (image to video); the rest are shots from the trade library, picked
 * by a hash of the script so each script gets its own.
 */
export function brollPrompts({ industry, market, script, count, refCount = 0 }) {
  const n = Math.max(0, Number(count) || 0)
  const refs = Math.min(n, Math.max(0, Number(refCount) || 0))
  const shots = SHOTS[tradeKey(industry)] || SHOTS.general
  const where = String(market || '').trim()
  const start = hash(script) % shots.length
  const out = []
  for (let i = 0; i < refs; i++) out.push({ kind: 'image', prompt: REF_STYLE })
  for (let i = 0; out.length < n; i++) {
    const shot = shots[(start + i) % shots.length]
    const place = where ? ` Setting: a home in ${where}.` : ''
    out.push({ kind: 'text', prompt: `${shot}. ${STYLE}${place}` })
  }
  return out
}

// ---------------------------------------------------------------------------
// The edit.
// ---------------------------------------------------------------------------

export const FONT_URL = 'https://fonts.gstatic.com/s/montserrat/v31/JTUSjIg1_i6t8kCHKm45xW5rygbi49c.ttf'
export const FONT_FAMILY = 'Montserrat'
const ORANGE = '#f59e0b'
const PLATE = '#0b1220'

const r2 = (n) => Math.round(Number(n) * 100) / 100

/**
 * The Shotstack edit for one video: the lip-synced owner full length, B-roll
 * cutaways over it (muted, the owner's voice carries on underneath), word
 * captions off the owner's audio, an offer card from the moment the offer is
 * said, and the client's logo in a corner when there is one.
 *
 * Tracks are listed top to bottom; the first track renders on top.
 */
export function buildTimeline({ ownerUrl, duration, broll = [], onScreen = '', business = '', logoUrl = '', offerAt = null }) {
  const D = r2(duration)
  if (!(D > 0)) throw new Error('A duration is needed to cut the video.')
  const windows = brollWindows(D, broll.length)
  const cardAt = r2(offerAt != null && offerAt > 1 && offerAt < D - 1.5 ? offerAt : D * 0.6)

  const captions = {
    clips: [
      {
        asset: {
          type: 'rich-caption',
          src: 'alias://owner',
          font: { family: FONT_FAMILY, size: 54, weight: '800', color: '#ffffff' },
          stroke: { width: 3, color: '#000000', opacity: 0.9 },
          background: { color: '#000000', opacity: 0.4, borderRadius: 14, padding: 14 },
          align: { horizontal: 'center', vertical: 'bottom' },
          active: { font: { family: FONT_FAMILY, weight: '800', color: ORANGE } },
          animation: { style: 'highlight' },
        },
        start: 0,
        length: D,
        position: 'bottom',
        offset: { y: 0.14 },
      },
    ],
  }

  const cardLength = r2(D - cardAt)
  const card = {
    clips: onScreen
      ? [
          {
            asset: {
              type: 'shape',
              shape: 'rectangle',
              rectangle: { width: 960, height: business ? 330 : 260, cornerRadius: 36 },
              fill: { color: PLATE, opacity: 0.86 },
            },
            start: cardAt,
            length: cardLength,
            position: 'top',
            offset: { y: -0.06 },
            transition: { in: 'slideDown' },
          },
          {
            asset: {
              type: 'rich-text',
              text: onScreen,
              font: { family: FONT_FAMILY, size: 62, weight: '800', color: '#ffffff' },
              align: { horizontal: 'center', vertical: 'middle' },
              width: 880,
              height: 200,
            },
            start: cardAt,
            length: cardLength,
            position: 'top',
            offset: { y: business ? -0.075 : -0.09 },
            transition: { in: 'slideDown' },
          },
          ...(business
            ? [
                {
                  asset: {
                    type: 'rich-text',
                    text: business,
                    font: { family: FONT_FAMILY, size: 34, weight: '700', color: ORANGE },
                    align: { horizontal: 'center', vertical: 'middle' },
                    width: 880,
                    height: 60,
                  },
                  start: cardAt,
                  length: cardLength,
                  position: 'top',
                  offset: { y: -0.155 },
                  transition: { in: 'slideDown' },
                },
              ]
            : []),
        ]
      : [],
  }

  const logo = {
    clips: logoUrl
      ? [
          {
            asset: { type: 'image', src: logoUrl },
            start: 0,
            length: D,
            fit: 'contain',
            scale: 0.16,
            position: 'topRight',
            offset: { x: -0.04, y: -0.035 },
            opacity: 0.95,
          },
        ]
      : [],
  }

  const cutaways = {
    clips: windows.map((w, i) => ({
      asset: { type: 'video', src: broll[i].url, volume: 0, trim: 0.4 },
      start: w.start,
      length: w.length,
      fit: 'crop',
      transition: { in: 'fadeFast', out: 'fadeFast' },
    })),
  }

  const owner = {
    clips: [
      {
        asset: { type: 'video', src: ownerUrl, volume: 1 },
        start: 0,
        length: D,
        fit: 'crop',
        alias: 'owner',
      },
    ],
  }

  const tracks = [captions, card, logo, cutaways, owner].filter((t) => t.clips.length > 0)

  return {
    timeline: { background: '#000000', fonts: [{ src: FONT_URL }], tracks },
    output: {
      format: 'mp4',
      resolution: '1080',
      aspectRatio: '9:16',
      fps: 30,
      poster: { capture: 1 },
      thumbnail: { capture: 1, scale: 0.3 },
    },
  }
}

/** The audio-only render that pulls a voice sample off the base clip. */
export function sampleTimeline(videoUrl, seconds = 90) {
  return {
    timeline: {
      tracks: [{ clips: [{ asset: { type: 'video', src: videoUrl, volume: 1 }, start: 0, length: r2(seconds) }] }],
    },
    output: { format: 'mp3' },
  }
}

/** Where a job's working files live in the bucket. */
export function jobPrefix(clientId, jobId) {
  return `ai-video/${clientId}/${jobId}`
}

/** Status words for people, by status. */
export const STEP_WORDS = {
  queued: 'Waiting to start',
  generating: 'Lip-syncing the owner and filming the B-roll',
  rendering: 'Cutting the video',
  done: 'Done',
  failed: 'Failed',
}
