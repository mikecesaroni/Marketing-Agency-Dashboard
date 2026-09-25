// The client onboarding form: one form, in steps, that every new client fills
// in before the onboarding call. Business, what they sell, why them, leads,
// photos, and the GoHighLevel account details, all in one sitting.
//
// WHY ONE FORM. It was two (the onboarding questions, then a separate GHL
// setup form) because GHL was optional. Every client is on GHL now, so the
// second form was a second link, a second nag and a second half-finished
// thing; here it is the last two steps of the one form.
//
// WHY THESE QUESTIONS. Sixteen intakes in, the fill rate per question was
// read off the database (2026-09-25). Things almost everyone answered:
// business name, industry, the service area, the most profitable service,
// where leads go, the ad budget, the website, phone, what makes them better,
// jobs to avoid, cities to target, star rating. Things almost nobody
// answered (four or fewer of sixteen): average job value, price range,
// competitors, licence number, customer age, brand colours, the three
// "do you have photos / video / logo" boxes, leads needed per month, LSA
// budget, past-marketer stories, offer headline and fine print, words to
// avoid, booking URL. Those are gone, or folded into one question that
// earns its place. What is left is what an ad and a profile are built from.
//
// Pure data plus small helpers, so scripts/check-client-form.mjs can pin
// it, and so the page, the completion count on the client page and the
// link message never disagree about what the form asks.

export const RADIUS_CHIPS = [15, 25, 40, 60]

/**
 * Each step: key, title, blurb, and fields. Each field:
 *   key        the column, on onboarding_intake (table 'intake') or ghl_setup ('ghl')
 *   label      the question, in the client's words
 *   type       text | textarea | number | email | tel | select | radius
 *   help       one line under the label, when the question needs one
 *   placeholder
 *   required   blocks Continue on that step
 *   options    for select
 *   half       sits side by side with its neighbour on a wide screen
 */
export const FORM_STEPS = [
  {
    key: 'business',
    title: 'Your business',
    blurb: 'The basics. Most of this goes straight onto your ads and your profile.',
    fields: [
      { key: 'business_name', table: 'intake', label: 'Business name', type: 'text', required: true, placeholder: 'As customers know it', half: true },
      { key: 'owner_name', table: 'intake', label: 'Owner name', type: 'text', required: true, placeholder: 'Who we will be talking to', half: true },
      { key: 'contact_phone', table: 'intake', label: 'Best phone for you', type: 'tel', required: true, placeholder: '(555) 123-4567', half: true },
      { key: 'contact_email', table: 'intake', label: 'Best email for you', type: 'email', required: true, placeholder: 'you@company.com', half: true },
      { key: 'website', table: 'intake', label: 'Website', type: 'text', placeholder: 'www.company.com', help: 'Leave blank if you do not have one. Ads can run without it.', half: true },
      { key: 'industry_trade', table: 'intake', label: 'Trade', type: 'text', required: true, placeholder: 'HVAC, plumbing, roofing, electrical…', half: true },
      { key: 'years_in_business', table: 'intake', label: 'Years in business', type: 'text', placeholder: 'e.g. 12', half: true },
      { key: 'phone_for_ads', table: 'intake', label: 'Phone number to show on ads', type: 'tel', placeholder: 'If different from the one above', help: 'The number customers call from the ad. Often the main office line.', half: true },
    ],
  },
  {
    key: 'area',
    title: 'Where you work',
    blurb: 'This is exactly where your ads run. Too wide wastes money; too narrow misses jobs.',
    fields: [
      { key: 'service_area', table: 'intake', label: 'Home base', type: 'text', required: true, placeholder: 'City and state, e.g. Round Rock, TX', help: 'Where your trucks start the day. Ads are centred here.' },
      { key: 'service_radius_miles', table: 'intake', label: 'How far out do you travel for a job?', type: 'radius', required: true, help: 'Miles from home base. Pick the honest number, not the furthest you have ever gone.' },
      { key: 'target_cities', table: 'intake', label: 'Cities or towns to target, and any to skip', type: 'textarea', placeholder: 'e.g. Round Rock, Georgetown, Pflugerville. Skip: downtown Austin', help: 'Optional. Only if some places matter more than the radius says.' },
    ],
  },
  {
    key: 'services',
    title: 'What you sell',
    blurb: 'We lead with the job you want most of, not everything you can do.',
    fields: [
      { key: 'services_offered', table: 'intake', label: 'Services you offer', type: 'textarea', required: true, placeholder: 'AC repair, AC install, furnace tune-ups, duct cleaning…' },
      { key: 'most_profitable_service', table: 'intake', label: 'The job you want more of', type: 'textarea', required: true, placeholder: 'e.g. Full system replacements. Best margin, and we have the crew for it.', help: 'The one the ads will push hardest.' },
      { key: 'typical_price_range', table: 'intake', label: 'Rough prices', type: 'textarea', placeholder: 'e.g. Service call $89, tune-up $79, new system $8k to $15k', help: 'Ballpark is fine. It keeps the ads honest and the leads qualified.' },
      { key: 'jobs_to_avoid', table: 'intake', label: 'Jobs you do not want', type: 'textarea', placeholder: 'e.g. Window units, commercial, anything over 60 miles out', help: 'So we never send you these.' },
      { key: 'busy_season', table: 'intake', label: 'Busy and slow seasons', type: 'text', placeholder: 'e.g. Slammed June to August, slow in Feb', half: true },
      { key: 'meta_ad_budget_per_day', table: 'intake', label: 'Ad budget per day', type: 'number', placeholder: '50', help: 'US dollars, for Facebook and Instagram. Can change any time.', half: true },
    ],
  },
  {
    key: 'why',
    title: 'Why you',
    blurb: 'This is where the ads come from. Specific beats modest: the real reasons people pick you.',
    fields: [
      { key: 'why_people_choose', table: 'intake', label: 'What makes you better than your competitors?', type: 'textarea', required: true, placeholder: 'e.g. We answer the phone. Same-day service. Family-owned since 2009. We show the price before we start.', help: 'The more specific, the better the ad. Three real reasons beat ten generic ones.' },
      { key: 'ideal_customer', table: 'intake', label: 'Your ideal customer', type: 'textarea', placeholder: 'e.g. Homeowners 35 to 65 in the suburbs, older homes, want it done right not cheap', help: 'Who you are happiest working for.' },
      { key: 'current_offers_guarantees', table: 'intake', label: 'Offers or guarantees you run now, or want to', type: 'textarea', placeholder: 'e.g. $79 tune-up. Free estimates. 100% satisfaction or we come back free.', help: 'An offer is what gets a stranger to call. If you have none, say what you would be happy to run.' },
      { key: 'reviews_star_rating', table: 'intake', label: 'Google star rating', type: 'text', placeholder: '4.9', half: true },
      { key: 'reviews_count', table: 'intake', label: 'Number of reviews', type: 'text', placeholder: '220', half: true },
      { key: 'licensed_insured_certified', table: 'intake', label: 'Licences, insurance, certifications, awards', type: 'text', placeholder: 'e.g. Licensed and insured, NATE certified, BBB A+', help: 'Anything that proves you are legit. Goes on the ads.' },
      { key: 'competitors_to_beat', table: 'intake', label: 'Who are you up against?', type: 'text', placeholder: 'e.g. ABC Air, the big franchise on the highway', help: 'Optional. We look at what they run.' },
    ],
  },
  {
    key: 'leads',
    title: 'Your leads',
    blurb: 'So every lead we send lands somewhere and gets a fast reply.',
    fields: [
      { key: 'leads_go_to', table: 'intake', label: 'Where do new leads come in today?', type: 'text', required: true, placeholder: 'e.g. Office phone, website form, my cell', half: true },
      { key: 'who_answers_leads', table: 'intake', label: 'Who answers them?', type: 'text', required: true, placeholder: 'e.g. Maria at the front desk, me after 5pm', half: true },
      { key: 'lead_form_questions', table: 'intake', label: 'What do you need to know from a new lead?', type: 'textarea', placeholder: 'e.g. Name, phone, address, what is wrong, how urgent', help: 'These become the questions on the ad’s form. Fewer is better: name and phone are automatic.' },
      { key: 'main_goal', table: 'intake', label: 'What does a win look like in 90 days?', type: 'textarea', placeholder: 'e.g. 30 booked jobs a month from ads, two new techs busy', help: 'One sentence is plenty.' },
    ],
  },
  {
    key: 'photos',
    title: 'Photos and videos',
    blurb: 'Real photos of real jobs beat stock every time. One shared folder and you never email us a picture again.',
    fields: [],
    drive: true,
  },
  {
    key: 'account',
    title: 'Your account',
    blurb: 'This sets up your CRM and registers your business to send text messages. Most of it is off your business registration; the EIN and legal name have to match it exactly.',
    fields: [
      { key: 'legal_business_name', table: 'ghl', label: 'Legal business name', type: 'text', required: true, placeholder: 'Exactly as registered with the IRS', prefillFrom: 'business_name' },
      { key: 'business_entity_type', table: 'ghl', label: 'Business type', type: 'select', required: true, options: ['Sole Proprietorship', 'Partnership', 'Limited Liability Company (LLC)', 'Corporation', 'Non-Profit'], half: true },
      { key: 'ein', table: 'ghl', label: 'EIN (federal tax ID)', type: 'text', required: true, placeholder: '12-3456789', help: 'Needed by the carriers before any text can be sent. Approval takes about a week.', half: true },
      { key: 'business_address', table: 'ghl', label: 'Street address', type: 'text', required: true, placeholder: '123 Main St' },
      { key: 'business_city', table: 'ghl', label: 'City', type: 'text', required: true, half: true },
      { key: 'business_state', table: 'ghl', label: 'State', type: 'text', required: true, placeholder: 'TX', half: true },
      { key: 'business_postal_code', table: 'ghl', label: 'ZIP', type: 'text', required: true, half: true },
      { key: 'timezone', table: 'ghl', label: 'Time zone', type: 'select', required: true, options: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'], half: true },
      { key: 'main_phone', table: 'ghl', label: 'Main business phone', type: 'tel', required: true, placeholder: '(555) 123-4567', prefillFrom: 'contact_phone', half: true },
      { key: 'support_email', table: 'ghl', label: 'Email for the account', type: 'email', required: true, placeholder: 'you@company.com', prefillFrom: 'contact_email', half: true },
      { key: 'preferred_area_code', table: 'ghl', label: 'Area code for your texting number', type: 'text', placeholder: 'e.g. 512', help: 'We match it if numbers are free there.', half: true },
      { key: 'website_url', table: 'ghl', label: 'Website', type: 'text', placeholder: 'https://company.com', prefillFrom: 'website', half: true },
      { key: 'authorized_rep_name', table: 'ghl', label: 'Authorised representative', type: 'text', placeholder: 'Usually the owner', prefillFrom: 'owner_name', help: 'The person the carriers can name on the registration.', half: true },
      { key: 'authorized_rep_email', table: 'ghl', label: 'Their email', type: 'email', prefillFrom: 'contact_email', half: true },
      { key: 'authorized_rep_phone', table: 'ghl', label: 'Their phone', type: 'tel', prefillFrom: 'contact_phone', half: true },
      { key: 'sms_opt_in_method', table: 'ghl', label: 'How do customers agree to be texted?', type: 'select', options: ['They call or text us first', 'A tick box on our website form', 'They tell us in person or on the phone', 'We ask in the booking confirmation'], help: 'The carriers ask. Pick the closest.', half: true },
      { key: 'review_link', table: 'ghl', label: 'Google review link', type: 'text', placeholder: 'The link that opens the review box', help: 'Goes in the "how did we do" text after a job. Blank is fine; we can find it.', half: true },
      { key: 'booking_url', table: 'ghl', label: 'Online booking link', type: 'text', placeholder: 'Leave blank if you do not have one', half: true },
      { key: 'privacy_policy_url', table: 'ghl', label: 'Privacy policy page', type: 'text', placeholder: 'https://company.com/privacy', help: 'Optional. Helps the text registration go through first time.', half: true },
      { key: 'notes', table: 'ghl', label: 'Anything else we should know?', type: 'textarea', placeholder: 'Optional' },
    ],
  },
]

export const FORM_FIELDS = FORM_STEPS.flatMap((s) => s.fields)
export const INTAKE_FORM_KEYS = FORM_FIELDS.filter((f) => f.table === 'intake').map((f) => f.key)
export const GHL_FORM_KEYS = FORM_FIELDS.filter((f) => f.table === 'ghl').map((f) => f.key)

/** Steps for a link: the whole form, or one half for the older links. */
export function stepsFor(only = '') {
  if (only === 'ghl') return FORM_STEPS.filter((s) => s.key === 'account')
  if (only === 'intake') return FORM_STEPS.filter((s) => s.key !== 'account')
  return FORM_STEPS
}

export function emptyAnswers() {
  const out = {}
  for (const f of FORM_FIELDS) out[f.key] = ''
  return out
}

/** Saved rows in, form state out. Only keys the form owns; nulls stay ''. */
export function mergeAnswers(base, intakeRow, ghlRow) {
  const out = { ...base }
  for (const f of FORM_FIELDS) {
    const row = f.table === 'intake' ? intakeRow : ghlRow
    const v = row?.[f.key]
    if (v !== null && v !== undefined) out[f.key] = typeof v === 'number' ? String(v) : v
  }
  return out
}

const blank = (v) => v === null || v === undefined || String(v).trim() === ''

/** The required fields on one step still empty, in order. */
export function missingOnStep(step, answers) {
  return step.fields.filter((f) => f.required && blank(answers[f.key])).map((f) => f.key)
}

/** The account step's fields carried over from earlier answers, where blank. */
export function prefillAccount(answers) {
  const out = { ...answers }
  for (const f of FORM_FIELDS) {
    if (!f.prefillFrom || !blank(out[f.key])) continue
    if (!blank(answers[f.prefillFrom])) out[f.key] = answers[f.prefillFrom]
  }
  return out
}

/** Split form state into the two payloads the save functions take. Blanks become null. */
export function splitAnswers(answers) {
  const intake = {}
  const ghl = {}
  for (const f of FORM_FIELDS) {
    const raw = answers[f.key]
    let v = blank(raw) ? null : raw
    if (v !== null && (f.type === 'number' || f.type === 'radius')) {
      const n = Number(v)
      v = Number.isFinite(n) ? n : null
    }
    ;(f.table === 'intake' ? intake : ghl)[f.key] = v
  }
  return { intake, ghl }
}

/** How much of the form is answered: required fields, and everything. */
export function progress(answers, steps = FORM_STEPS) {
  const fields = steps.flatMap((s) => s.fields)
  const required = fields.filter((f) => f.required)
  return {
    required: required.filter((f) => !blank(answers[f.key])).length,
    requiredTotal: required.length,
    answered: fields.filter((f) => !blank(answers[f.key])).length,
    total: fields.length,
  }
}
