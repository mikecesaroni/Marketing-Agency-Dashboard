// Self-check for the Google Business Profile agent brief. Run:
//   node scripts/check-gbp-agent-prompt.mjs
//
// The rule: EVERY FACT IN THE PROMPT COMES FROM THE CLIENT'S OWN ANSWERS, and
// what the intake does not know is listed as a gap, never guessed.

import { GBP_FACTS, buildGbpAgentPrompt, gbpFacts } from '../src/lib/gbpAgentPrompt.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

const client = { name: 'Comfort Experts', industry: 'HVAC', market: 'West Chester/Upper Bronx', website_url: 'https://comfortexperts.example' }
const intake = {
  business_name: 'Comfort Experts Heating & Cooling',
  industry_trade: 'HVAC',
  service_area: 'Westchester and the Bronx',
  target_cities: 'White Plains, Yonkers, New Rochelle',
  service_radius_miles: 25,
  services_offered: 'Heating and cooling, boilers, heat pumps',
  most_profitable_service: 'Full system installs',
  contact_phone: '(914) 504-4044',
  years_in_business: '12',
  licensed_insured_certified: 'Licensed and insured in NY',
  why_people_choose: 'A real person answers the phone. We show up when we say.',
  offer_headline: '$500 off any new installation',
  financing_available: 'Yes',
  words_to_avoid: 'cheap, discount',
  reviews_star_rating: 4.9,
  reviews_count: 87,
  has_logo: true,
}

const p = buildGbpAgentPrompt({ client, intake, managerEmail: 'gbp@agency.example' })

check('the intake business name wins over the CRM name', /reads exactly "Comfort Experts Heating & Cooling"/.test(p), true)
check('the trade, area and cities are all in the brief', /HVAC/.test(p) && /Westchester and the Bronx/.test(p) && /White Plains, Yonkers, New Rochelle/.test(p), true)
check('the radius is carried into the service area step', /within about 25 miles/.test(p), true)
check('the offer and the phone appear as facts', /\$500 off any new installation/.test(p) && /\(914\) 504-4044/.test(p), true)
check('financing reads yes, not the raw value', /Financing available: yes/.test(p), true)
check('the manager login is named', /signed in to business\.google\.com as gbp@agency\.example/.test(p), true)
check('the never-use words are passed on', /Words and phrases never to use: cheap, discount/.test(p), true)
check('nothing is missing, so no gap block', /NOT KNOWN YET/.test(p), false)
check('the guardrails are present', /Never change the business name/.test(p) && /stop immediately and report it/.test(p), true)

// A thin intake: facts fall back to the client row, and the rest is listed as
// unknown rather than filled in.
const thin = buildGbpAgentPrompt({ client, intake: {} })
const { facts, gaps } = gbpFacts(client, {})
check('falls back to the CRM name, trade, market and website', [facts.business_name, facts.industry, facts.service_area, facts.website], ['Comfort Experts', 'HVAC', 'West Chester/Upper Bronx', 'https://comfortexperts.example'])
check('the blanks are listed as gaps', gaps, ['Target cities', 'Services offered', 'Phone number', 'Years in business', 'Why people choose them', 'Licensed / insured / certified'])
check('and the prompt tells the agent to leave them alone', /NOT KNOWN YET \(leave these exactly as Google has them; do not guess\):\n- Target cities/.test(thin), true)
check('no radius line when none was given', /within about/.test(thin), false)
check('a missing login is a visible placeholder, not blank', /as \[OUR MANAGER EMAIL\]/.test(thin), true)

// Nothing at all still produces a usable brief.
const empty = buildGbpAgentPrompt({})
check('with no client the brief still names something', /optimising the Google Business Profile for the client, a home services company/.test(empty), true)
check('every fact has a label', GBP_FACTS.every((f) => f.label && f.from.length > 0), true)

console.log(failures ? `\n${failures} check(s) failed` : '\nAll GBP agent prompt checks pass')
process.exit(failures ? 1 : 0)
