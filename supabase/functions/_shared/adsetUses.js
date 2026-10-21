// What the ads already in an ad set carry: the instant form their button
// opens, or the link they send people to.
//
// Publishing into an ad set that is running means the new ad has to match
// its neighbours. The ad set's optimisation goal says WHETHER a form is
// needed (meta-publish reads that off the ad set); this says WHICH form, or
// which link, by reading the creatives of the ads already in there. Without
// it the publish screen asked for a form on every ad set, including the
// ones whose ads all go to a website, and somebody had to click back and
// choose by hand what Meta already knew.
//
// Plain JS, no Deno imports, so scripts/check-publish-destination.mjs can run
// it in Node against the creative shapes meta-publish writes.

/** The call-to-action value on a creative, whichever shape the creative took. */
function ctaValue(creative) {
  const spec = creative?.object_story_spec || {}
  const feed = creative?.asset_feed_spec || {}
  return (
    spec.link_data?.call_to_action?.value ||
    spec.video_data?.call_to_action?.value ||
    feed.call_to_actions?.[0]?.value ||
    null
  )
}

/** The link on a creative: the link_data link, the CTA link, or the feed spec's first website_url. */
function linkOf(creative) {
  const spec = creative?.object_story_spec || {}
  const feed = creative?.asset_feed_spec || {}
  return String(
    spec.link_data?.link ||
      ctaValue(creative)?.link ||
      feed.link_urls?.[0]?.website_url ||
      ''
  ).trim()
}

/**
 * ads: rows from GET /{adset}/ads?fields=id,name,effective_status,creative{object_story_spec,asset_feed_spec}
 *
 * Returns { lead_form_id, link_url, ad_id, ad_name, ads, active } or null
 * when there are no ads to read. A delivering ad is preferred over a paused
 * one: it is what the ad set is actually doing. Among equals, the first
 * Meta listed, which is the newest.
 */
export function usesFromAds(ads = []) {
  const rows = (Array.isArray(ads) ? ads : []).filter((a) => a && a.creative)
  if (rows.length === 0) return null
  const live = rows.filter((a) => String(a.effective_status || '').toUpperCase() === 'ACTIVE')
  const pick = live[0] || rows[0]
  const value = ctaValue(pick.creative) || {}
  const formId = value.lead_gen_form_id ? String(value.lead_gen_form_id) : ''
  return {
    lead_form_id: formId,
    link_url: linkOf(pick.creative),
    ad_id: String(pick.id || ''),
    ad_name: String(pick.name || ''),
    ads: rows.length,
    active: live.length,
  }
}
