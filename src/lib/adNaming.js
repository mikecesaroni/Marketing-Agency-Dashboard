// The one naming rule for everything the CRM creates in Meta.
//
// Every campaign, ad set and ad this CRM makes starts with WC_. Asked for on
// 2026-09-24 so that, inside a client's ad account, what the agency built is
// told apart at a glance from what the client or a previous agency left
// there. Ads Manager sorts and filters by name; a fixed prefix is the only
// thing that makes "ours" a filter.
//
// It is applied at the LAST moment before a name is sent to Meta, in one
// place per path (publish, funnel, chat), so a name typed without it or a
// default built without it still goes out right. It is never applied to a
// name that already carries it, so a round trip through an edit does not
// stack prefixes.
//
// The edge functions carry the same three lines (they cannot import from the
// app), so a change here is a change there too: meta-funnel and meta-manage.

export const WC_PREFIX = 'WC_'

/**
 * A name with the agency prefix on the front, exactly once.
 *
 * Case-insensitive on the check, so "wc_Spring" is treated as already
 * prefixed rather than becoming "WC_wc_Spring"; the stored prefix is not
 * corrected, because renaming what a person typed is a different decision.
 * Whitespace on either side of the name is dropped first, since Meta keeps
 * it and it makes two names that look identical sort apart.
 */
export function wcName(name) {
  const clean = String(name ?? '').trim()
  if (!clean) return clean
  if (clean.toUpperCase().startsWith(WC_PREFIX)) return clean
  return `${WC_PREFIX}${clean}`
}

/**
 * How an ad is named in Meta: the kind (Static or Video) right after the
 * prefix, then the date, the season and the hook, with " | " between. No
 * company name: the ad lives inside the client's own account, so the name
 * only ever has to tell the client's ads apart from each other. Same shape
 * as the Meta library filenames, so a set and its ad match up by eye.
 *
 *   WC_Static | 2026-10-08 | Summer | AC died? Same-day cooling repair
 *   WC_Video | 2026-10-08 | Winter | The offer
 *
 * The kind came first on 2026-11-13 ("when we publish statics name it
 * WC_Static..., videos WC_Video..."); until then it was the season first
 * and "Video" fourth, with nothing at all saying an image was a static.
 * Sorted by name in Ads Manager, the statics now sit together and the
 * videos together, each in date order.
 *
 * Meta caps ad names at 100 characters, so the hook is what gets cut.
 */
const SEASON_WORDS = { all: 'Year-round', spring: 'Spring', summer: 'Summer', fall: 'Fall', winter: 'Winter', holiday: 'Holiday' }
export const AD_KINDS = { static: 'Static', video: 'Video' }
export function metaAdName({ season, date = new Date(), hook, kind = AD_KINDS.static } = {}) {
  const day = typeof date === 'string' ? date : new Date(date).toISOString().slice(0, 10)
  const seasonWord = SEASON_WORDS[String(season || '').toLowerCase()] || SEASON_WORDS.all
  const words = String(hook || '').replace(/\s+/g, ' ').trim() || 'ad'
  const head = [String(kind || AD_KINDS.static).trim(), day, seasonWord].join(' | ')
  const full = wcName(`${head} | ${words}`)
  if (full.length <= 100) return full
  // Cut the hook, never the parts that sort and filter.
  const room = 100 - (full.length - words.length)
  return wcName(`${head} | ${words.slice(0, Math.max(1, room)).trimEnd()}`)
}

/**
 * A name that starts WC_Static or WC_Video, whatever was typed or kept.
 *
 * Applied where an ad is sent to Meta, after the person's own name: a name
 * typed without the kind gets it in front ("Fall tune-up" becomes
 * "WC_Static | Fall tune-up"), a default kept from before 2026-11-13
 * ("WC_Fall | 2026-11-10 | Video | The offer") is reshaped rather than
 * doubled, and one already right is left exactly as it is. Empty stays
 * empty, so a required-name check still fires.
 */
export function adKindName(name, kind = AD_KINDS.static) {
  const want = String(kind || AD_KINDS.static).trim()
  const clean = String(name ?? '').trim()
  if (!clean) return clean
  // The prefix off the first part, then every part that is only a kind word
  // comes out, and the kind asked for goes in front of what is left.
  const stripped = clean.split('|').map((p) => p.trim())
  stripped[0] = stripped[0].replace(/^wc_/i, '').trim()
  const parts = stripped.filter(Boolean)
  const rest = parts.filter((p) => !Object.values(AD_KINDS).some((k) => k.toLowerCase() === p.toLowerCase()))
  const same = parts[0]?.toLowerCase() === want.toLowerCase() && rest.length === parts.length - 1
  if (same && clean.toUpperCase().startsWith(WC_PREFIX)) return clean
  return wcName([want, ...rest].join(' | '))
}

/** True when a Meta object's name follows the rule. Used to tell ours apart. */
export function isWcName(name) {
  return String(name ?? '').trim().toUpperCase().startsWith(WC_PREFIX)
}
