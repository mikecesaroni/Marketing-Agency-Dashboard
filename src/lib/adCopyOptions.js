/**
 * Choosing between the options ad-copy returns.
 *
 * Separate from adCopy.js only because that module holds the Supabase client
 * and scripts/check-ad-copy.mjs has no business constructing one. Everything
 * here is pure.
 */

/**
 * The Nth suggestion for each field, wrapping per field.
 *
 * The model returns three options for every field it is asked about, and
 * taking only the first threw six of the nine away — then charged for a whole
 * new request to see a second one, which on Opus with adaptive thinking is not
 * a fast round trip. So "another angle" walks this list first and only calls
 * again once it runs out.
 *
 * Wrapping is per field rather than across the set, because the model does not
 * promise the same count for each: asking for index 2 when a field only got
 * one option should give that one option back, not nothing.
 */
export function nthPerField(options, index = 0) {
  const byField = new Map()
  for (const option of options || []) {
    const list = byField.get(option.field) || []
    list.push(option.value)
    byField.set(option.field, list)
  }

  const out = {}
  for (const [field, values] of byField) {
    if (values.length > 0) out[field] = values[index % values.length]
  }
  return out
}

/** How many rounds of "another angle" this reply can serve on its own. */
export function anglesAvailable(options) {
  const counts = new Map()
  for (const option of options || []) {
    counts.set(option.field, (counts.get(option.field) || 0) + 1)
  }
  return counts.size === 0 ? 0 : Math.max(...counts.values())
}
