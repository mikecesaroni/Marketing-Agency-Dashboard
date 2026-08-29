/**
 * Joins class names, dropping anything falsy.
 *
 * Deliberately NOT a Tailwind-aware merger. Two competing utilities in one
 * string are resolved by the order they appear in the generated stylesheet,
 * not by the order they appear here, so "px-3" plus a caller's "px-4" is a
 * coin toss rather than an override. Rather than add a dependency to make that
 * work, the components below take the shape of a control as PROPS -- variant,
 * size -- and leave className for where the control sits: flex-1, w-full,
 * mt-2, md:w-auto. That is what nearly every call site in this app was
 * actually using className for anyway.
 *
 * So: `<Button variant="danger" size="sm" className="w-full" />`, never
 * `<Button className="bg-red-600 px-2 py-1" />`. If a button needs a look the
 * variants do not cover, the variant list is the thing to change.
 */
export function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}
