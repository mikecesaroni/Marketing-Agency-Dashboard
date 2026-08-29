// Field order and labels for the plain-text copy of an intake form. Kept
// alongside the form's own sections so a pasted summary reads the same way the
// call went.
export const INTAKE_SECTIONS = [
  {
    title: 'BUSINESS',
    fields: [
      ['date_filled', 'Date'],
      ['business_name', 'Business Name'],
      ['owner_name', 'Owner(s) Name'],
      ['contact_phone', 'Phone'],
      ['contact_email', 'Email'],
      ['website', 'Website'],
      ['industry_trade', 'Industry / Trade'],
      ['service_area', 'Service Area'],
      ['years_in_business', 'Years in Business'],
      ['target_cities', 'Cities to Target in Ads'],
      ['service_radius_miles', 'How far out do you travel? (miles)'],
    ],
  },
  {
    title: 'SERVICE',
    fields: [
      ['services_offered', 'Services Offered'],
      ['most_profitable_service', 'Most Profitable Service'],
      ['service_want_more', 'Service They Want More Of'],
      ['jobs_to_avoid', 'Jobs To Avoid'],
    ],
  },
  {
    title: 'MONEY & BUDGETS',
    fields: [
      ['average_job_value', 'Average Job Value'],
      ['typical_price_range', 'Typical Price Range For That Job'],
      ['busy_season', 'Busy / Slow Season'],
      ['meta_ad_budget_per_day', 'Meta Ad Budget ($/day)'],
      ['lsa_ad_budget_per_day', 'LSA Ad Budget ($/day)'],
      ['leads_needed_per_month', 'Leads/Jobs Needed Per Month'],
      ['current_ads_what_works', "Current Ads - What's Working?"],
    ],
  },
  {
    title: 'CUSTOMER',
    fields: [
      ['ideal_customer', 'Ideal Customer'],
      ['customer_age_min', 'Typical Customer Age - From'],
      ['customer_age_max', 'Typical Customer Age - To'],
      ['why_people_choose', 'What Makes Them Better Than Competitors?'],
      ['most_common_objection', 'Most Common Objection'],
    ],
  },
  {
    title: 'OFFER & CTA',
    fields: [
      ['cta_offering', 'What Are We Offering to Get Leads?'],
      ['offer_headline', 'The Offer In A Few Words (goes big on the ad)'],
      ['offer_fine_print', 'Any Conditions On It (small print)'],
      ['guarantee', 'Guarantee In One Line'],
      ['financing_available', 'Financing available'],
      ['current_offers_guarantees', 'Other Offers / Guarantees'],
      ['booking_url', 'Booking or Quote Page URL'],
      ['phone_for_ads', 'Phone Number To Show On Ads'],
    ],
  },
  {
    title: 'PROOF & ASSETS',
    fields: [
      ['reviews_star_rating', 'Reviews - Star Rating'],
      ['reviews_count', 'Reviews - Count'],
      ['has_before_after_photos', 'Before/after photos'],
      ['has_video_footage', 'Video footage'],
      ['has_logo', 'Logo file'],
      ['brand_color_primary', 'Brand Colour (hex or describe it)'],
      ['brand_color_secondary', 'Second Brand Colour'],
      ['licensed_insured_certified', 'Licensed / Insured / Certified?'],
      ['license_number', 'Licence Number (if it must appear on ads)'],
    ],
  },
  {
    title: 'LEADS & FOLLOW-UP',
    fields: [
      ['leads_go_to', 'Where Do Leads Go Now?'],
      ['who_answers_leads', 'Who Answers Leads?'],
      ['response_time_to_lead', 'Response Time to New Lead'],
      ['crm_system', 'CRM or Booking System'],
      ['lead_form_questions', 'What Do You Need To Know From A Lead?'],
    ],
  },
  {
    title: 'ACCESS & PLATFORM STATUS',
    fields: [
      ['has_meta_access', 'Meta Business Suite Manager access'],
      ['meta_status', 'Meta Status'],
      ['lsa_status', 'LSA Status'],
      ['has_google_business', 'Google Business Profile access'],
      ['google_status', 'Google Status'],
      ['has_website_access', 'Website/landing page access'],
    ],
  },
  {
    title: 'GOALS',
    fields: [
      ['main_goal', 'Main Goal'],
      ['success_90_days', 'Success in 90 Days Looks Like...'],
      ['competitors_to_beat', 'Competitors to Beat'],
      ['words_to_avoid', 'Anything We Must Not Say'],
      ['bad_experience_past_marketers', 'Bad Experience with Past Marketers?'],
    ],
  },
  {
    title: 'CALL NOTES',
    fields: [['call_notes', 'Notes']],
  },
]

// Input type per field, for anything rendering INTAKE_SECTIONS as a form.
// Anything not listed is a plain text input.
export const INTAKE_FIELD_TYPES = {
  date_filled: 'date',
  contact_email: 'email',
  average_job_value: 'number',
  meta_ad_budget_per_day: 'number',
  lsa_ad_budget_per_day: 'number',
  service_radius_miles: 'number',
  customer_age_min: 'number',
  customer_age_max: 'number',
  financing_available: 'checkbox',
  has_before_after_photos: 'checkbox',
  has_video_footage: 'checkbox',
  has_logo: 'checkbox',
  has_meta_access: 'checkbox',
  has_website_access: 'checkbox',
  has_google_business: 'checkbox',
  meta_status: 'status',
  lsa_status: 'status',
  google_status: 'status',
  target_cities: 'textarea',
  services_offered: 'textarea',
  most_profitable_service: 'textarea',
  service_want_more: 'textarea',
  jobs_to_avoid: 'textarea',
  current_ads_what_works: 'textarea',
  ideal_customer: 'textarea',
  why_people_choose: 'textarea',
  most_common_objection: 'textarea',
  cta_offering: 'textarea',
  current_offers_guarantees: 'textarea',
  main_goal: 'textarea',
  success_90_days: 'textarea',
  competitors_to_beat: 'textarea',
  bad_experience_past_marketers: 'textarea',
  call_notes: 'textarea',
  lead_form_questions: 'textarea',
  words_to_avoid: 'textarea',
  typical_price_range: 'textarea',
}

export const STATUS_OPTIONS = ['Not started', 'In progress', 'Active', 'Paused', 'Needs work']

// Ours to track rather than theirs to answer.
//
// date_filled is bookkeeping. The past-marketers question is relationship
// intelligence from a sales call: nothing about the answer makes a better ad,
// and putting it in writing in front of a client invites a grievance into a
// document whose whole job is to brief creative.
const AGENCY_ONLY = new Set(['date_filled', 'bad_experience_past_marketers'])

// The subset of the intake a client should ever see. Platform access status and
// call notes are ours too. Everything else is a question Ethan already asks out
// loud on onboarding calls, so it is a question a client can answer in writing.
export const CLIENT_INTAKE_SECTIONS = INTAKE_SECTIONS
  .filter((s) => s.title !== 'ACCESS & PLATFORM STATUS' && s.title !== 'CALL NOTES')
  .map((s) => ({ ...s, fields: s.fields.filter(([key]) => !AGENCY_ONLY.has(key)) }))

export const CLIENT_INTAKE_KEYS = CLIENT_INTAKE_SECTIONS.flatMap((s) => s.fields.map(([k]) => k))

function displayValue(value) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

// Builds the pasteable summary. Empty fields are dropped rather than listed as
// blanks, the point is something you can drop into a brief or an email, and a
// wall of "Phone:" with nothing after it is just noise.
export function formatIntake(formData, clientName) {
  const blocks = []

  for (const section of INTAKE_SECTIONS) {
    const lines = []

    for (const [key, label] of section.fields) {
      const value = displayValue(formData[key])
      if (!value) continue
      // Checkboxes answered "No" are still worth stating, "no logo file" is a
      // real finding, unlike an unanswered text box.
      if (typeof formData[key] !== 'boolean' && value === '') continue
      lines.push(value.includes('\n') ? `${label}:\n${value}` : `${label}: ${value}`)
    }

    if (lines.length > 0) {
      blocks.push(`${section.title}\n${'-'.repeat(section.title.length)}\n${lines.join('\n')}`)
    }
  }

  const header = clientName ? `CLIENT INTAKE: ${clientName}` : 'CLIENT INTAKE'
  return `${header}\n${'='.repeat(header.length)}\n\n${blocks.join('\n\n')}\n`
}

// navigator.clipboard needs a secure context and isn't there in every mobile
// browser, so fall back to the old execCommand path rather than failing.
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through
  }

  try {
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}
