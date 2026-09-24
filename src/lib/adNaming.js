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

/** True when a Meta object's name follows the rule. Used to tell ours apart. */
export function isWcName(name) {
  return String(name ?? '').trim().toUpperCase().startsWith(WC_PREFIX)
}
