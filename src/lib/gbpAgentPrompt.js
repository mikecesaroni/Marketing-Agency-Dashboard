/**
 * The browser-agent brief for optimising one client's Google Business Profile.
 *
 * Pure: no Supabase import, so scripts/check-gbp-agent-prompt.mjs can reach
 * it. The button that copies it lives in GbpAgentPromptButton.jsx.
 *
 * The rule: EVERY FACT IN THE PROMPT COMES FROM THE CLIENT'S OWN ANSWERS. A
 * generic "optimise the GBP" brief makes an agent invent hours, a licence
 * number, a review count, or a keyword-stuffed business name, and each of those
 * is a suspension risk on a real profile. So the prompt names what the intake
 * knows, tells the agent to leave what it does not know alone, and lists the
 * gaps so a person can fill them before the agent is let loose.
 */

const clean = (v) => String(v ?? '').trim()
const has = (v) => clean(v) !== ''

// What the prompt needs and where the intake keeps it. Label is what the gap
// list shows a person; the field is what buildGbpAgentPrompt reads.
export const GBP_FACTS = [
  { key: 'business_name', label: 'Business name', from: ['intake.business_name', 'client.name'] },
  { key: 'industry', label: 'Trade', from: ['intake.industry_trade', 'client.industry'] },
  { key: 'service_area', label: 'Service area', from: ['intake.service_area', 'client.market'] },
  { key: 'target_cities', label: 'Target cities', from: ['intake.target_cities'] },
  { key: 'services', label: 'Services offered', from: ['intake.services_offered'] },
  { key: 'phone', label: 'Phone number', from: ['intake.contact_phone'] },
  { key: 'website', label: 'Website', from: ['intake.website', 'client.website_url'] },
  { key: 'years', label: 'Years in business', from: ['intake.years_in_business'] },
  { key: 'why_choose', label: 'Why people choose them', from: ['intake.why_people_choose'] },
  { key: 'licensed', label: 'Licensed / insured / certified', from: ['intake.licensed_insured_certified'] },
]

function pick(client, intake, paths) {
  for (const p of paths) {
    const [obj, key] = p.split('.')
    const v = obj === 'intake' ? intake?.[key] : client?.[key]
    if (has(v)) return clean(v)
  }
  return ''
}

/** The facts the prompt will use, and which ones are still blank. */
export function gbpFacts(client, intake) {
  const facts = {}
  const gaps = []
  for (const f of GBP_FACTS) {
    facts[f.key] = pick(client, intake, f.from)
    if (!facts[f.key]) gaps.push(f.label)
  }
  return { facts, gaps }
}

const yesNo = (v) => {
  const s = clean(v).toLowerCase()
  if (!s) return ''
  if (/^(y|yes|true|1)/.test(s)) return 'yes'
  if (/^(n|no|false|0)/.test(s)) return 'no'
  return s
}

/**
 * The prompt itself. Long on purpose: a browser agent does exactly what it is
 * told and nothing it is not, so the brief carries the facts, the order of
 * work, the guardrails and the report format.
 */
export function buildGbpAgentPrompt({ client, intake, managerEmail } = {}) {
  const i = intake || {}
  const { facts, gaps } = gbpFacts(client, i)
  const name = facts.business_name || 'the client'
  const trade = facts.industry || 'home services'
  const area = facts.service_area || 'their service area'
  const cities = facts.target_cities
  const radius = has(i.service_radius_miles) ? `${clean(i.service_radius_miles)} miles` : ''
  const owner = clean(i.owner_name)
  const login = clean(managerEmail) || '[OUR MANAGER EMAIL]'

  const line = (label, value) => (has(value) ? `- ${label}: ${clean(value)}` : null)
  const factLines = [
    line('Business name (use exactly this, nothing added)', name),
    line('Trade', trade),
    line('Owner', owner),
    line('Service area', area),
    line('Target cities, in priority order', cities),
    line('Service radius', radius),
    line('Services offered', i.services_offered),
    line('Most profitable service (feature it first)', i.most_profitable_service),
    line('Service they want more of', i.service_want_more),
    line('Years in business', i.years_in_business),
    line('Licensed / insured / certified', i.licensed_insured_certified),
    line('License number', i.license_number),
    line('Phone', i.contact_phone),
    line('Website', facts.website),
    line('Booking link', i.booking_url),
    line('Current offer', i.offer_headline || i.current_offers_guarantees),
    line('Offer fine print', i.offer_fine_print),
    line('Guarantee', i.guarantee),
    line('Financing available', yesNo(i.financing_available)),
    line('Why customers choose them, in their own words', i.why_people_choose),
    line('Ideal customer', i.ideal_customer),
    line('Jobs they do NOT want', i.jobs_to_avoid),
    line('Google rating and review count they reported', [has(i.reviews_star_rating) ? `${clean(i.reviews_star_rating)} stars` : '', has(i.reviews_count) ? `${clean(i.reviews_count)} reviews` : ''].filter(Boolean).join(', ')),
    line('Photos available', [yesNo(i.has_before_after_photos) === 'yes' ? 'before/after job photos' : '', yesNo(i.has_logo) === 'yes' ? 'logo' : '', yesNo(i.has_video_footage) === 'yes' ? 'video' : ''].filter(Boolean).join(', ')),
    line('Words and phrases never to use', i.words_to_avoid),
    line('Busy season', i.busy_season),
    line('Competitors they want to beat', i.competitors_to_beat),
  ].filter(Boolean)

  const gapBlock = gaps.length
    ? `\nNOT KNOWN YET (leave these exactly as Google has them; do not guess):\n${gaps.map((g) => `- ${g}`).join('\n')}\n`
    : ''

  return `You are optimising the Google Business Profile for ${name}, a ${trade} company serving ${area}. You are signed in to business.google.com as ${login}, which has the Manager role on this profile. Work only on this one profile. If more than one location is listed, stop and report which ones you see before touching anything.

EVERYTHING YOU WRITE MUST COME FROM THE FACTS BELOW. Do not invent hours, prices, a licence number, awards, years in business, a review count, or a claim about the business. If a fact is not listed, leave that field exactly as it is and note it in your report.

FACTS FROM THE CLIENT'S ONBOARDING FORM
${factLines.join('\n')}
${gapBlock}
WORK IN THIS ORDER

1. Business name. Confirm it reads exactly "${name}". Remove any added words such as a city, a trade or a slogan; Google suspends profiles for that. Do not otherwise change it.

2. Categories. This is the single biggest ranking factor. Set the primary category to the one Google offers that most exactly matches the trade (${trade}). Add secondary categories only for services the client actually offers from the list above, up to the limit Google shows. Remove any category that does not match a listed service. Write down what you changed.

3. Service area. This is a home services business that visits customers, so the profile should be a service-area business. If a street address is shown and it is a home or a shop customers do not visit, set the profile to hide the address. Set the service areas to the target cities listed above${radius ? `, staying within about ${radius}` : ''}, most important first, up to the maximum Google allows. Do not add cities that are not listed.

4. Services. Under Services, add every service from the list above as its own item, using Google's suggested service where one matches and a custom service where none does. Put the most profitable service first. Give each a one to two sentence description that names the service, the area, and one reason to choose this company drawn from "why customers choose them". No prices unless a typical price was given above. Remove services the client says they do not want.

5. Business description. Write up to 750 characters in plain language a homeowner would use. Lead with what they do and where${cities ? ` (name the main cities: ${cities})` : ''}, then the reason customers choose them in their own words, then the offer or guarantee if one is listed, then how to get in touch. No phone numbers, no URLs, no all caps, no promotional stuffing, no words from the never-use list. Paste it and save.

6. Contact and links. Confirm the phone number and website match the facts above exactly, including formatting. If a booking link is listed, add it as the appointment link. Turn on messaging if it is off. Do not change a phone number or website that is not listed above.

7. Attributes. Turn on only the attributes that are true from the facts: for example licensed, insured, free estimates only if an estimate offer is listed, financing only if listed as yes, and any ownership or accessibility attribute the owner has stated. Leave unknown attributes unset.

8. Hours. Do not change hours unless they are listed above. If the profile shows no hours at all, note it in the report rather than guessing.

9. Photos. Upload only photos the client provided (their shared Drive folder, or the ones already in the CRM). Set a logo and a cover photo if those exist. Add job photos and truck or team photos in the right categories. Name nothing with keywords; Google ignores file names. Do not upload stock photos.

10. Posts. Create one Update post and, if an offer is listed above, one Offer post: the offer headline, the fine print as written, the service area, and a "Call now" or "Book" button pointing at the phone or booking link listed. Nothing that is not in the facts.

11. Q&A. If the Questions section is empty, add three questions a homeowner in ${area} would actually ask about ${trade}, and answer each from the facts (service area, whether they are licensed and insured, financing or offer). Do not answer questions other people have asked with anything not in the facts.

12. Reviews. Do not post or solicit reviews. If there are unanswered reviews, reply to each in the owner's voice${owner ? ` (${owner})` : ''}: thank the person by first name, mention the specific job if they named it, and for a negative review apologise, do not argue, and invite them to call. Two to three sentences each. Never mention a discount in a reply.

GUARDRAILS
- Never change the business name beyond removing added words. Never request re-verification. Never merge, remove or mark a location closed.
- Never add keywords to the name, never add a city that is not listed, never claim a licence, award, rating or year that is not in the facts.
- If Google shows a suspension, a pending verification, a "suggested edit", or asks for identity documents, stop immediately and report it.
- If any step needs an owner decision (a second location, a phone number that differs from the facts, a category with no exact match), stop at that step, do everything that does not depend on it, and report the question.

REPORT BACK, IN THIS SHAPE
1. Primary category before and after, and secondary categories added or removed.
2. Service areas set.
3. Services added, with their descriptions.
4. The business description you saved, in full.
5. Attributes turned on, photos uploaded (count and type), posts created, questions added, reviews replied to.
6. Everything you left alone because it was not in the facts, and every question for the owner.`
}
