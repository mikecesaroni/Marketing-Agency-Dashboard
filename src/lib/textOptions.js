// Meta's multiple text options, the pure half.
//
// Don Air's hand-built ads (read off the account 2026-11-10) carry three
// primary texts, three headlines and three descriptions, and Meta shows each
// viewer one of each in whatever combination it expects to work: "look at
// Don Air copy with the emojis and how it has 3 variants for each part of ad
// copy. I wanna have those variants." The CRM wrote one of each.
//
// Now a copy record (a video's ad_videos.copy, a static's copies[stamp] on
// the publish page) keeps the first of each where it always did, in
// primary_text, headline and description, and up to four more of each in
// more_primary_texts, more_headlines and more_descriptions. Everything that
// reads one field keeps working; the publish call sends the full lists and
// meta-publish builds the creative Meta mixes from. Blank extras are kept
// while somebody is typing and dropped on save and publish.
//
// Shared by the publish page, the video picker, the copy memory and
// scripts/check-text-options.mjs, so no imports.

/** Meta's cap per part. */
export const MAX_TEXT_OPTIONS = 5

/** The main field and the list of extras beside it. */
export const MORE_FIELDS = {
  primary_text: 'more_primary_texts',
  headline: 'more_headlines',
  description: 'more_descriptions',
}

export const LIST_FIELDS = Object.values(MORE_FIELDS)

const clean = (v) => String(v ?? '').trim()

/** Distinct, non-blank strings, trimmed, at most `max`. */
export function cleanList(list, max = MAX_TEXT_OPTIONS) {
  const out = []
  for (const v of Array.isArray(list) ? list : []) {
    const s = clean(v)
    if (s && !out.includes(s)) out.push(s)
    if (out.length >= max) break
  }
  return out
}

/** The extras on a copy record, cleaned, never repeating the main field: { more_primary_texts, more_headlines, more_descriptions }. */
export function moreOf(copy = {}) {
  const out = {}
  for (const [main, more] of Object.entries(MORE_FIELDS)) {
    const first = clean(copy?.[main])
    out[more] = cleanList(copy?.[more], MAX_TEXT_OPTIONS - 1).filter((s) => s !== first)
  }
  return out
}

/** The full lists Meta gets, the main field first: { primary_texts, headlines, descriptions }. */
export function optionLists(copy = {}) {
  const more = moreOf(copy)
  return {
    primary_texts: cleanList([copy?.primary_text, ...more.more_primary_texts]),
    headlines: cleanList([copy?.headline, ...more.more_headlines]),
    descriptions: cleanList([copy?.description, ...more.more_descriptions]),
  }
}

/** True when some part has more than one option, so the ad publishes as text options. */
export function hasTextOptions(copy = {}) {
  const l = optionLists(copy)
  return l.primary_texts.length > 1 || l.headlines.length > 1 || l.descriptions.length > 1
}

/** What the publish call carries for the ad beside its single fields, or null with one of each. */
export function textOptionsForPublish(copy = {}) {
  return hasTextOptions(copy) ? optionLists(copy) : null
}

/** "3 primary texts · 3 headlines · 2 descriptions", or '' with one of each. */
export function textOptionsLabel(copy = {}) {
  if (!hasTextOptions(copy)) return ''
  const l = optionLists(copy)
  const part = (n, one, many) => `${n} ${n === 1 ? one : many}`
  return [
    part(l.primary_texts.length, 'primary text', 'primary texts'),
    part(l.headlines.length, 'headline', 'headlines'),
    part(l.descriptions.length, 'description', 'descriptions'),
  ].join(' · ')
}

/**
 * The copy patch from what the assistant wrote ({ primaryTexts, headlines,
 * descriptions }): the first of each into the main field, the rest into the
 * extras. It replaces what was there, the way picking a version does: it is
 * an explicit click. Parts the assistant left empty are left alone.
 */
export function patchFromWritten(written = {}) {
  const patch = {}
  const put = (list, main, more) => {
    const l = cleanList(list)
    if (!l.length) return
    patch[main] = l[0]
    patch[more] = l.slice(1)
  }
  put(written?.primaryTexts, 'primary_text', 'more_primary_texts')
  put(written?.headlines, 'headline', 'more_headlines')
  put(written?.descriptions, 'description', 'more_descriptions')
  return patch
}

/**
 * The copy patch that ADDS the assistant's lists to words already there,
 * for the write nobody clicked for (2026-11-12: "make so it auto makes the
 * 3 ad copy variations instead of me having to click, for statics and
 * videos"). A part with a value keeps it as option one and takes the
 * written lines that differ as its extras; a blank part takes the written
 * first and the rest. Three of each in all, so an ad that had one of each
 * ends with two more and nothing anyone wrote is replaced.
 */
export function patchAddingOptions(current = {}, written = {}, total = 3) {
  const patch = {}
  const lists = { primary_text: written?.primaryTexts, headline: written?.headlines, description: written?.descriptions }
  for (const [main, more] of Object.entries(MORE_FIELDS)) {
    const l = cleanList(lists[main])
    if (!l.length) continue
    const have = clean(current?.[main])
    if (have) {
      patch[more] = cleanList([...(Array.isArray(current?.[more]) ? current[more] : []), ...l.filter((s) => s !== have)], Math.max(0, total - 1))
    } else {
      patch[main] = l[0]
      patch[more] = l.slice(1, total)
    }
  }
  return patch
}

/** The extras as they are saved on a static (saved_ads.more_copy), or null with none. */
export function moreCopyToSave(copy = {}) {
  const more = moreOf(copy)
  if (!more.more_primary_texts.length && !more.more_headlines.length && !more.more_descriptions.length) return null
  return { primary_texts: more.more_primary_texts, headlines: more.more_headlines, descriptions: more.more_descriptions }
}

/** The extras off a saved static (saved_ads.more_copy) as the copy record's lists, every list present. */
export function moreFromSaved(moreCopy) {
  const m = moreCopy && typeof moreCopy === 'object' ? moreCopy : {}
  return {
    more_primary_texts: cleanList(m.primary_texts, MAX_TEXT_OPTIONS - 1),
    more_headlines: cleanList(m.headlines, MAX_TEXT_OPTIONS - 1),
    more_descriptions: cleanList(m.descriptions, MAX_TEXT_OPTIONS - 1),
  }
}
