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

import { PHOTO_TEMPLATES, TEMPLATE_LAYOUTS, TEMPLATE_SHAPES, TWO_PHOTO_TEMPLATES, isLookKey, templateMenu } from './adTemplateMeta.js'
import { pickTemplate } from './seasonPlaybook.js'

// The looks a batch cycles through, in order, matched to the angles the
// prompt asks for: the offer on a poster that shouts the price, the time of
// year on the season's template, proof on the owner's photo with the stars;
// then another round of the same three ideas in other clothes. A batch reads
// as a campaign rather than one template three times.
export const BATCH_LOOKS = ['massive_deal', 'season_sale', 'stack', 'photo_sale', 'price_grid', 'plate']
export const BATCH_SIZE = 3

const LOOK_NAMES = { stack: 'Headline stack', plate: 'Bottom plate', split: 'Split panel', before: 'Before and after', cover: 'Classic', card: 'Photo on a colour', ai: 'AI concept',
  ...Object.fromEntries(TEMPLATE_LAYOUTS.map((t) => [t.key, t.label])) }

export function lookName(key) {
  return LOOK_NAMES[key] || key
}

/** Each set gets a look, round robin, unless it already carries one. The fallback when there is no playbook. */
export function assignLooks(sets) {
  return (sets || []).map((s, i) => ({ ...s, layout: s.layout || BATCH_LOOKS[i % BATCH_LOOKS.length] }))
}

/**
 * A look for every set from the season playbook: each set gets the template
 * that scores best for its words at this time of year (financing words to
 * the financing template, a tune-up to the tune-up poster, two prices to
 * the grid), no template twice, and the proof ad goes on the owner's photo
 * (the Headline stack) when there is a photo to put it on. A set that
 * already carries a look keeps it.
 */
export function chooseLooks(sets, { phase, hasPhoto = false, pick = pickTemplate } = {}) {
  const used = []
  return (sets || []).map((s, i) => {
    if (s.layout) {
      used.push(s.layout)
      return s
    }
    const angle = String(s.hookAngle || '').toLowerCase()
    const proof = /proof|trust|review|star/.test(angle) || (i === 2 && !angle)
    let layout
    // The chat's own pick wins when it is a real key, fits the photos there
    // are, and nothing in the batch has it yet; the scorer is the safety net.
    const wanted = String(s.suggestedLayout || '').trim()
    const fits = wanted && isLookKey(wanted) && !used.includes(wanted) && !TWO_PHOTO_TEMPLATES.includes(wanted) && !(['before'].includes(wanted)) && (hasPhoto || !(PHOTO_TEMPLATES.includes(wanted) || ['cover', 'stack', 'plate', 'split'].includes(wanted)))
    if (fits) layout = wanted
    else if (proof && hasPhoto && !used.includes('stack')) layout = 'stack'
    else layout = pick({ phase, content: s, hasPhoto, hasAfter: false, exclude: used }).key
    used.push(layout)
    return { ...s, layout }
  })
}

/** What a template needs in words, for an ask that names one. */
export function templateAsk(key) {
  const t = TEMPLATE_LAYOUTS.find((x) => x.key === key)
  if (!t) return ''
  const s = TEMPLATE_SHAPES[key] || {}
  return `Every ad is for the "${t.label}" template (${t.hint}). Write the words to its shape: it needs ${s.needs || 'the usual slots'}.`
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * What the Studio asks the chat for. The brief (the system prompt the chat
 * already uses) carries the formats and the JSON schema; this only says how
 * many, which angles, and that the JSON is the part that matters.
 */
export function makeAdsPrompt({ count = BATCH_SIZE, clientName, today = new Date(), photos = [], playbook = '', template = '', about = '' } = {}) {
  const n = Math.max(1, Math.min(6, Number(count) || BATCH_SIZE))
  const month = MONTHS[today.getMonth()]
  const angles = n >= 3 ? 'the current offer, the time of year, and proof or trust' : n === 2 ? 'the current offer and the time of year' : 'the strongest angle for right now'
  const subject = String(about || '').trim()
  const parts = [
    subject
      ? `Write ${n} static ad${n === 1 ? '' : 's'} for ${clientName || 'this client'} to run now, in ${month}, about this: ${subject}.${n > 1 ? ' Each a different hook.' : ''}`
      : `Write ${n} static ad${n === 1 ? '' : 's'} for ${clientName || 'this client'} to run now, in ${month}: ${angles}, ${n === 1 ? 'one ad' : 'one ad each, each a different hook'}.`,
    ...(playbook ? [`SEASON PLAYBOOK, write to it: ${playbook}`] : []),
    ...(template && templateAsk(template) ? [templateAsk(template)] : [`TEMPLATES: for every ad add a "template" key with the one template from this list that says it best (by the ad's words first, then the playbook; never the same one twice in a batch) and a "template_reason" line, and write the ad's words to that template's shape:\n${templateMenu()}`]),
    'For every ad fill every slot of FORMAT 2 with real words: location badge, headline on image (five to eight words, the shout first: FREE, $89, SAVE), offer badge with the price first, subhead, proof strip, background note. Also the primary text, headline and description Meta shows beside the image. Leave offer_colour and badge_colour empty: the Studio takes the colours from the logo.',
    'Two more keys on every set, for the poster templates: "sticker", two or three words for a starburst or a seal (EASY FINANCING, SAME DAY, 0% FOR 18 MONTHS; "" when nothing fits), and "offers", a list of up to two {"amount","detail"} price tiles when the brief carries more than one price (the main offer first; [] otherwise). Real prices from the brief only; never invent one.',
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

// The Studio fields a set carries, and the order the Studio reads them. The
// last six are the template extras and the second photo (src/lib/adTemplates.js).
export const SET_FIELDS = ['badge', 'hook', 'offerAmount', 'offerDetail', 'subhead', 'proof', 'primaryText', 'headline', 'description', 'accent', 'badgeColor', 'layout', 'backgroundPath', 'backgroundPath2', 'kicker', 'sticker', 'offers', 'cutout', 'theme']

/** The chat's offer tiles, as the Studio keeps them: up to four {amount, detail}, blanks dropped. */
export function tilesFrom(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((o) => ({ amount: String(o?.amount ?? o?.offer_amount ?? '').trim(), detail: String(o?.detail ?? o?.offer_detail ?? '').trim() }))
    .filter((o) => o.amount || o.detail)
    .slice(0, 4)
}

/**
 * The piece of equipment a batch stands in the corner of a template, from
 * the trade and the month: a furnace through the heating months and a
 * condenser through the cooling ones for an HVAC company, a water heater
 * for a plumber, nothing for a trade with no unit to show.
 */
export function cutoutFor(industry, today = new Date()) {
  const trade = String(industry || '').toLowerCase()
  const month = today.getMonth() + 1
  const heating = month >= 10 || month <= 3
  if (/plumb|water heater|drain/.test(trade)) return 'water_heater'
  if (/hvac|heat|cool|air|furnace|a\/c|ac\b|mechanical|comfort/.test(trade)) return heating ? 'furnace' : 'ac'
  return ''
}

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
