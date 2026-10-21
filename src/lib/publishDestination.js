// Publishing into ad sets that already exist: the ad sets decide.
//
// An ad set's optimisation goal fixes what its creatives carry. An
// instant-form ad set needs a creative whose button opens a form; a traffic
// or website-leads ad set needs one that carries a link. meta-publish reads
// that off each ad set when it builds the creative, so the server was never
// wrong. The screen was: it kept its own objective (instant form by default),
// showed "The instant form" and refused to publish without one, for ad sets
// whose ads all go to a website. The way out was clicking back, choosing
// Website, then choosing "All live" again.
//
// These helpers make the screen read the ad sets the same way the server
// does, and read the form or link the ad sets' own ads already use off the
// check verdicts (meta-adset-check `uses`), so the new ad matches its
// neighbours without a click. Pure; scripts/check-publish-destination.mjs
// runs them in Node.

const FORM = 'LEADS_FORM'

/**
 * What the creative has to carry.
 *
 *   reuseAdset  publishing into existing ad sets
 *   adsets      the picked ad sets, each with `objective` as list_adsets
 *               reads it back (LEADS_FORM, TRAFFIC, LEADS_WEBSITE)
 *   objective   the OBJECTIVES entry chosen on the screen, for a new ad set
 *
 * Returns { from, needsForm, needsLink, needsPixel, formAdsets, webAdsets }.
 * With ad sets picked, `from` is 'adsets': a form is needed when any picked
 * ad set opens one (each ad is built against its own ad set, so a mixed pick
 * needs both the form and the link), a link is always needed (a lead ad's
 * creative still carries one), and the pixel is the ad set's business, not
 * the creative's. Otherwise `from` is 'objective' and the chosen objective
 * says.
 */
export function creativeNeeds({ reuseAdset = false, adsets = [], objective = null } = {}) {
  const picked = Array.isArray(adsets) ? adsets.filter(Boolean) : []
  if (reuseAdset && picked.length > 0) {
    const formAdsets = picked.filter((a) => a.objective === FORM)
    const webAdsets = picked.filter((a) => a.objective !== FORM)
    return {
      from: 'adsets',
      needsForm: formAdsets.length > 0,
      needsLink: true,
      needsPixel: false,
      formAdsets,
      webAdsets,
    }
  }
  return {
    from: 'objective',
    needsForm: Boolean(objective?.needsForm),
    needsLink: Boolean(objective?.needsLink),
    needsPixel: Boolean(objective?.needsPixel),
    formAdsets: [],
    webAdsets: [],
  }
}

const nameOf = (checks, adsets, id) =>
  adsets.find((a) => a.id === id)?.name || checks[id]?.adset_name || ''

/**
 * The instant form the picked ad sets' own ads already open, from the check
 * verdicts (keyed by ad set id, each with `uses` from meta-adset-check).
 * The first picked ad set that has one, in the order they were picked.
 * Returns { id, name, adsetName, adName } or null.
 */
export function formFromChecks(checks = {}, adsetIds = [], adsets = []) {
  for (const id of adsetIds) {
    const u = checks?.[id]?.uses
    if (u?.lead_form_id) {
      return {
        id: String(u.lead_form_id),
        name: String(u.lead_form_name || ''),
        adsetName: nameOf(checks, adsets, id),
        adName: String(u.ad_name || ''),
      }
    }
  }
  return null
}

/**
 * The link the picked ad sets' own ads already carry, the same way.
 * Returns { url, adsetName, adName } or null.
 */
export function linkFromChecks(checks = {}, adsetIds = [], adsets = []) {
  for (const id of adsetIds) {
    const u = checks?.[id]?.uses
    if (u?.link_url) {
      return { url: String(u.link_url), adsetName: nameOf(checks, adsets, id), adName: String(u.ad_name || '') }
    }
  }
  return null
}

const list = (rows) => {
  const names = rows.map((a) => a.name || 'an ad set')
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
}

/**
 * The sentence under "Objective" when the picked ad sets decide it. Says
 * where the ads will go and, when there is nothing to pick, says so.
 */
export function describeAdsetDestination(adsets = []) {
  const { formAdsets, webAdsets } = creativeNeeds({ reuseAdset: true, adsets })
  const n = formAdsets.length + webAdsets.length
  if (n === 0) return ''
  if (formAdsets.length === 0) {
    return n === 1
      ? `${webAdsets[0].name || 'It'} sends people to the website, so there is no instant form to pick.`
      : `All ${n} send people to the website, so there is no instant form to pick.`
  }
  if (webAdsets.length === 0) {
    return n === 1
      ? `${formAdsets[0].name || 'It'} opens an instant form, so the ad gets the form its other ads use.`
      : `All ${n} open an instant form, so the ads get the form their neighbours use.`
  }
  return (
    `${list(formAdsets)} ${formAdsets.length === 1 ? 'opens' : 'open'} an instant form; ` +
    `${list(webAdsets)} ${webAdsets.length === 1 ? 'sends' : 'send'} people to the website. ` +
    'Each ad is built for its own ad set, so both the form and the link are used.'
  )
}
