// "Send to Meta library": the arithmetic, with no network in it.
//
// A saved set goes into the client's ad account image library (Ads Manager,
// Media library) as its three sizes, without making an ad. That lets the
// team build by hand in Ads Manager from the CRM's artwork, which is the
// low-risk way to use a young account: three paced image uploads and no
// campaign structure appearing from nowhere.

/** What the function needs: the storage path of every saved size, by size key. */
export function libraryImages(set) {
  return Object.fromEntries((set?.ordered || []).filter((x) => x?.file?.storage_path).map(({ size, file }) => [size.key, file.storage_path]))
}

/** Whether a set has been sent, and when, from its saved_ads row. */
export function libraryStatus(recipe) {
  const at = recipe?.meta_library_at || null
  const hashes = recipe?.meta_image_hashes || null
  const sizes = hashes && typeof hashes === 'object' ? Object.keys(hashes) : []
  return { sent: Boolean(at && sizes.length), at, sizes }
}

/** "In Meta library since Oct 7" or ''. */
export function libraryLine(recipe, now = new Date()) {
  const s = libraryStatus(recipe)
  if (!s.sent) return ''
  const d = new Date(s.at)
  const sameYear = d.getFullYear() === now.getFullYear()
  return `In Meta library since ${d.toLocaleDateString([], sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })}`
}
