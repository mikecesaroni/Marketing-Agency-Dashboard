// The brief handed to Higgsfield Ads Studio for one batch of concepts, built
// from what the Studio already knows. Plain JS: the ad-concepts function
// imports it and scripts/check-ad-concepts.mjs tests the same file in Node.
//
// What the brief has to do, in order of importance:
//   1. keep the words right: the headline, the offer and the business name
//      are quoted and the model is told to use them exactly and add nothing
//      (no phone numbers, websites or addresses, which it would otherwise
//      invent)
//   2. look like a photo of this business, not a stock model: the owner and
//      the van come from the reference images when there are any
//   3. read as a direct-response ad for Facebook, not a brand poster: one
//      giant word, an offer card, brand colours, the logo small
//   4. differ from each other: each concept is a different scene and layout

const TRADE_SCENES = {
  hvac: 'a technician at a customer’s front door, a furnace or air conditioner being serviced, the service van in a driveway',
  plumbing: 'a plumber at a kitchen sink or water heater, the service van in a driveway, clean copper and tools',
  roofing: 'a roofer on a pitched shingle roof, a ladder at the eave, the finished roof in low sun',
  electrical: 'an electrician at a breaker panel, new lighting coming on in a kitchen, the service van',
  landscaping: 'a crew on a striped lawn, fresh mulch beds, a mower in morning light',
  washing: 'a pressure washer stripping a driveway, a half-cleaned deck, siding being rinsed',
  cleaning: 'a spotless kitchen counter, fresh towels on a made bed, a bright bathroom',
  remodel: 'a kitchen mid-remodel with new cabinets, a finished bathroom with a walk-in shower',
  appliance: 'a technician at an open dryer or dishwasher, a repaired washing machine running',
  pest: 'a technician treating a foundation line, a tidy porch, a bait station being placed',
  general: 'a technician at a customer’s front door, the service van in a suburban driveway',
}

const TRADE_WORDS = [
  ['hvac', /hvac|heat|air|cool|furnace|a\/c|ac\b/i],
  ['plumbing', /plumb|drain|water|sewer|pipe/i],
  ['roofing', /roof/i],
  ['electrical', /electric/i],
  ['landscaping', /landscap|lawn|tree|irrigat/i],
  ['washing', /pressure|power wash|soft wash|wash/i],
  ['cleaning', /clean|maid|janitor/i],
  ['remodel', /remodel|renovat|construct|kitchen|bath|contractor/i],
  ['appliance', /appliance/i],
  ['pest', /pest|termite|exterminat/i],
]

export function tradeKey(industry) {
  const s = String(industry || '')
  for (const [key, re] of TRADE_WORDS) if (re.test(s)) return key
  return 'general'
}

const SEASON_LIGHT = {
  spring: 'spring, fresh green, soft morning light',
  summer: 'high summer, bright sun, deep shade',
  fall: 'autumn, orange leaves, warm low afternoon light',
  winter: 'winter, cold clear light, a hint of frost',
  holiday: 'the holidays, warm evening light, a lit porch',
}

function season(today = new Date()) {
  const m = today.getMonth() + 1
  if (m >= 3 && m <= 5) return 'spring'
  if (m >= 6 && m <= 8) return 'summer'
  if (m >= 9 && m <= 11) return 'fall'
  return m === 12 ? 'holiday' : 'winter'
}

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim()
const quoted = (s) => `"${clean(s).replace(/"/g, '”')}"`

/**
 * The brief and the fields Ads Studio takes beside it.
 *
 * brief: { business, industry, market, hook, offerAmount, offerDetail,
 *          subhead, proof, badge, accent, badgeColor, notes, hasOwnerPhoto,
 *          hasLogo, hasVan }
 */
export function buildBrief(brief, { count = 4, today = new Date() } = {}) {
  const b = brief || {}
  const business = clean(b.business) || 'the business'
  const trade = tradeKey(b.industry)
  const where = clean(b.market)
  const hook = clean(b.hook)
  const offer = [clean(b.offerAmount), clean(b.offerDetail)].filter(Boolean).join(' ')
  const subhead = clean(b.subhead)
  const proof = clean(b.proof)
  const badge = clean(b.badge)
  const accent = clean(b.accent) || '#C81E1E'
  const navy = clean(b.badgeColor) || '#1E3A8A'
  const asked = Number(count)
  const n = Math.max(1, Math.min(8, Number.isFinite(asked) ? asked : 4))

  const words = []
  if (hook) words.push(`Headline, exactly these words: ${quoted(hook)}.`)
  if (offer) words.push(`Offer, exactly: ${quoted(offer)}, on a white rounded offer card.`)
  if (subhead) words.push(`Supporting line, exactly: ${quoted(subhead)}.`)
  if (proof) words.push(`Proof line, small, exactly: ${quoted(proof)}.`)
  if (badge) words.push(`A small location tag reading ${quoted(badge)}.`)
  words.push(`The business name ${quoted(business)}, spelled exactly like that, small.`)

  const refs = []
  if (b.hasLogo) refs.push('the first reference image is the logo: reproduce it faithfully, small, in a corner or on the shirt')
  if (Number(b.photoCount) > 0) {
    refs.push(
      `the ${b.hasLogo ? 'other' : ''} reference ${Number(b.photoCount) === 1 ? 'image is a real photo' : 'images are real photos'} of this business: the owner or technician (keep their likeness, face, build and clothing; they are the person in the ad, smiling, looking at the customer or the camera), their service van or truck (keep its shape and colours), their work`.replace(/\s{2,}/g, ' ')
    )
  }

  const lines = [
    `Create ${n} distinct, premium direct-response static ads for ${business}, a ${trade === 'general' ? 'home services' : trade} company${where ? ` serving ${where}` : ''}. Audience: homeowners${where ? ` in ${where}` : ''}.`,
    words.join(' '),
    `Use no other text at all: no phone number, no website, no address, no prices other than the ones above, no slogans, no fine print. Spell every word exactly as given.`,
    `Photography: a real-photo look, ${TRADE_SCENES[trade]}, ${SEASON_LIGHT[season(today)]}, natural skin and fabric, no stock-model gloss, no AI sheen, no extra people.`,
    `Typography and layout: bold clean sans-serif, strong hierarchy with one giant accent word in ${accent} (the first word of the headline when it is short), the rest in ${navy} or white depending on the background, a white rounded offer card, brand colours ${accent} and ${navy}, generous margins, nothing important in the outer 6% of the frame, text sharp and fully legible at phone size.`,
    refs.length ? `References: ${refs.join('; ')}.` : 'No reference images: invent a believable technician in a plain navy polo and a white van, no visible brand names.',
    `Make each of the ${n} ads a different scene and a different arrangement of the same words (headline top-right over the photo; words on a colour plate below the photo; colour panel beside the photo; giant price first), so they look like one campaign, not one template.`,
    clean(b.notes) ? `Direction from the team: ${clean(b.notes)}` : '',
  ].filter(Boolean)

  return {
    prompt: lines.join('\n\n'),
    niche: `${trade === 'general' ? 'Home services' : trade.charAt(0).toUpperCase() + trade.slice(1)} (local service business)`,
    target_audience: `Homeowners${where ? ` in ${where}` : ''} who need ${trade === 'general' ? 'home services' : trade} work done and respond to a clear offer from a local, licensed company`,
    language: 'en',
  }
}

/** Where a batch's images are kept in the bucket (never under ads/, which is the saved-ad prefix). */
export function conceptPath(clientId, conceptId, index) {
  return `concepts/${clientId}/${conceptId}-${index + 1}.png`
}
