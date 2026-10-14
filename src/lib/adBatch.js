/**
 * Three ads in one go: the pure half.
 *
 * From the Content tab, "Make 3 ads" picks a client and lands in their Studio
 * with three creative sets written from the client's brief, each laid out in
 * a different look, the photo and logo already picked. This module holds the
 * decisions that need no network: the prompt, which look each set gets, which
 * photo to start from, and how a set's fields round-trip through the Studio's
 * state so edits survive switching between the three.
 *
 * Network (the chat call, the files) lives in adBatchStore.js.
 */

// The three looks a batch cycles through, in order: the three newest
// compositions, so a batch reads as a campaign rather than one template
// three times. The classic look stays a click away.
export const BATCH_LOOKS = ['stack', 'plate', 'split']
export const BATCH_SIZE = 3

const LOOK_NAMES = { stack: 'Headline stack', plate: 'Bottom plate', split: 'Split panel', cover: 'Classic', card: 'Photo on a colour', ai: 'AI concept' }

export function lookName(key) {
  return LOOK_NAMES[key] || key
}

/** Each set gets a look, round robin, unless it already carries one. */
export function assignLooks(sets) {
  return (sets || []).map((s, i) => ({ ...s, layout: s.layout || BATCH_LOOKS[i % BATCH_LOOKS.length] }))
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * What the Studio asks the chat for. The brief (the system prompt the chat
 * already uses) carries the formats and the JSON schema; this only says how
 * many, which angles, and that the JSON is the part that matters.
 */
export function makeAdsPrompt({ count = BATCH_SIZE, clientName, today = new Date() } = {}) {
  const n = Math.max(1, Math.min(6, Number(count) || BATCH_SIZE))
  const month = MONTHS[today.getMonth()]
  const angles = n >= 3 ? 'the current offer, the time of year, and proof or trust' : 'the current offer and the time of year'
  return [
    `Write ${n} static ads for ${clientName || 'this client'} to run now, in ${month}: ${angles}, one ad each, each a different hook.`,
    'For every ad fill every slot of FORMAT 2 with real words: location badge, headline on image (five to eight words, the shout first: FREE, $89, SAVE), offer badge with the price first, subhead, proof strip, colour direction, background note. Also the primary text, headline and description Meta shows beside the image.',
    `End with the JSON block of exactly ${n} creative_sets, every key filled, matching the copy above it. No brackets, no placeholders, no phone numbers or web addresses in the painted text. Keep it to the briefs and the JSON; no preamble.`,
  ].join('\n\n')
}

const SAVED_OR_MADE = /^(ads|concepts|ai-video)\//
const IMAGE = /\.(png|jpe?g|webp|heic|heif)$/i
const LOGO = /logo/i

/**
 * The photo a batch starts from when nobody has picked one: the client's
 * newest uploaded photo that is not a saved ad, a concept or a logo; else the
 * first photo in their Drive folder (as a drive: path); else nothing, and the
 * Studio asks.
 */
export function pickBackground({ files = [], drive = [] } = {}) {
  const uploads = (files || [])
    .filter((f) => IMAGE.test(f.file_name || f.storage_path || '') && !SAVED_OR_MADE.test(f.storage_path || '') && !LOGO.test(f.file_name || ''))
    .sort((a, b) => String(b.date_uploaded || '').localeCompare(String(a.date_uploaded || '')))
  if (uploads.length > 0) return uploads[0].storage_path
  const photo = (drive || []).find((f) => String(f.mime_type || '').startsWith('image/') && !LOGO.test(f.name || ''))
  return photo ? `drive:${photo.id}` : ''
}

/** The chip label for one set in the batch strip. */
export function setTitle(set, i) {
  const angle = String(set?.hookAngle || '').trim()
  const hook = String(set?.hook || '').trim()
  const words = angle || (hook ? hook.split(/\s+/).slice(0, 4).join(' ') : `Ad ${i + 1}`)
  return `${i + 1} · ${words}`
}

// The Studio fields a set carries, and the order the Studio reads them.
export const SET_FIELDS = ['badge', 'hook', 'offerAmount', 'offerDetail', 'subhead', 'proof', 'primaryText', 'headline', 'description', 'accent', 'badgeColor', 'layout', 'backgroundPath']

/**
 * A set rebuilt from the Studio's current fields, so switching between the
 * three keeps what was typed on each. Only what differs from the set as it
 * came is written; an untouched colour stays unset so the Studio's own
 * default (or the logo's) keeps applying.
 */
export function snapshotSet(set, fields) {
  const out = { ...set }
  for (const key of SET_FIELDS) {
    if (fields[key] === undefined) continue
    out[key] = fields[key]
  }
  return out
}

/** True when a batch has something to save: a hook or an offer on every set. */
export function batchReady(sets) {
  return Array.isArray(sets) && sets.length > 0 && sets.every((s) => s.hook?.trim() || s.offerAmount?.trim() || s.offerDetail?.trim())
}
