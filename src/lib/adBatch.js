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

import { TEMPLATE_LAYOUTS } from './adTemplateMeta.js'

// The three looks a batch cycles through, in order: the three newest
// compositions, so a batch reads as a campaign rather than one template
// three times. The classic look stays a click away.
export const BATCH_LOOKS = ['stack', 'plate', 'split']
export const BATCH_SIZE = 3

const LOOK_NAMES = { stack: 'Headline stack', plate: 'Bottom plate', split: 'Split panel', before: 'Before and after', cover: 'Classic', card: 'Photo on a colour', ai: 'AI concept',
  ...Object.fromEntries(TEMPLATE_LAYOUTS.map((t) => [t.key, t.label])) }

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
export function makeAdsPrompt({ count = BATCH_SIZE, clientName, today = new Date(), photos = [] } = {}) {
  const n = Math.max(1, Math.min(6, Number(count) || BATCH_SIZE))
  const month = MONTHS[today.getMonth()]
  const angles = n >= 3 ? 'the current offer, the time of year, and proof or trust' : 'the current offer and the time of year'
  const parts = [
    `Write ${n} static ads for ${clientName || 'this client'} to run now, in ${month}: ${angles}, one ad each, each a different hook.`,
    'For every ad fill every slot of FORMAT 2 with real words: location badge, headline on image (five to eight words, the shout first: FREE, $89, SAVE), offer badge with the price first, subhead, proof strip, background note. Also the primary text, headline and description Meta shows beside the image. Leave offer_colour and badge_colour empty: the Studio takes the colours from the logo.',
  ]
  if (photos.length > 0) {
    const list = photos.map((p, i) => `${i + 1} ${p.name || `photo ${i + 1}`}`).join(', ')
    parts.push(
      `Attached are ${photos.length} photos of this business, numbered in this order: ${list}. For each ad add a "photo" key with the number of the one that fits it best: the owner's face for trust, the van or the work for the offer, the one that shows the season for the time of year. Use a different photo for each ad while there are enough; never a photo that shows nothing of the business.`
    )
  }
  parts.push(
    `End with the JSON block of exactly ${n} creative_sets, every key filled, matching the copy above it${photos.length ? ', each with its "photo" number' : ''}. No brackets, no placeholders, no phone numbers or web addresses in the painted text. Keep it to the briefs and the JSON; no preamble.`
  )
  return parts.join('\n\n')
}

/** How many photos the chat is shown. Past this the pick stops getting better and the turn gets slow. */
export const BATCH_PHOTO_MAX = 8

/**
 * Every photo a batch may use, newest first: the client's uploads that are
 * not saved ads, concepts or the logo, and the images in their Drive folder.
 * Each is {path, name, when}; a Drive photo's path is drive:<id>, which the
 * Studio already knows how to load.
 */
export function photoPool({ files = [], drive = [] } = {}) {
  const uploads = (files || [])
    .filter((f) => IMAGE.test(f.file_name || f.storage_path || '') && !SAVED_OR_MADE.test(f.storage_path || '') && !LOGO.test(f.file_name || ''))
    .map((f) => ({ path: f.storage_path, name: f.file_name || f.storage_path, when: String(f.date_uploaded || '') }))
  const fromDrive = (drive || [])
    .filter((f) => String(f.mime_type || '').startsWith('image/') && !LOGO.test(f.name || ''))
    .map((f) => ({ path: `drive:${f.id}`, name: f.name || f.id, when: String(f.created_time || f.modified_time || '') }))
  return [...uploads, ...fromDrive].sort((a, b) => b.when.localeCompare(a.when))
}

/**
 * A photo for every set. The chat's pick (a 1-based number into `shown`,
 * the photos it was sent) wins when it is valid; otherwise the next photo
 * nobody has used yet, newest first, from the whole pool. A set that
 * already carries a photo keeps it.
 */
export function assignPhotos(sets, { pool = [], shown = pool, picks = [] } = {}) {
  const used = new Set()
  const out = []
  for (let i = 0; i < (sets || []).length; i++) {
    const s = sets[i]
    if (s.backgroundPath) {
      used.add(s.backgroundPath)
      out.push(s)
      continue
    }
    const n = Number(picks[i])
    let path = n >= 1 && n <= shown.length ? shown[n - 1].path : ''
    if (!path || (used.has(path) && pool.length > used.size)) {
      path = (pool.find((p) => !used.has(p.path)) || pool[0] || {}).path || ''
    }
    if (path) used.add(path)
    out.push({ ...s, backgroundPath: path })
  }
  return out
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
