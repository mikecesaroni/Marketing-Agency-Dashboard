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
      ['why_people_choose', 'What Makes Them Better Than Competitors?'],
      ['most_common_objection', 'Most Common Objection'],
    ],
  },
  {
    title: 'OFFER & CTA',
    fields: [
      ['cta_offering', 'What Are We Offering to Get Leads?'],
      ['current_offers_guarantees', 'Current Offers / Guarantees'],
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
      ['licensed_insured_certified', 'Licensed / Insured / Certified?'],
    ],
  },
  {
    title: 'LEADS & FOLLOW-UP',
    fields: [
      ['leads_go_to', 'Where Do Leads Go Now?'],
      ['who_answers_leads', 'Who Answers Leads?'],
      ['response_time_to_lead', 'Response Time to New Lead'],
      ['crm_system', 'CRM or Booking System'],
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
      ['bad_experience_past_marketers', 'Bad Experience with Past Marketers?'],
    ],
  },
  {
    title: 'CALL NOTES',
    fields: [['call_notes', 'Notes']],
  },
]

function displayValue(value) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

// Builds the pasteable summary. Empty fields are dropped rather than listed as
// blanks — the point is something you can drop into a brief or an email, and a
// wall of "Phone:" with nothing after it is just noise.
export function formatIntake(formData, clientName) {
  const blocks = []

  for (const section of INTAKE_SECTIONS) {
    const lines = []

    for (const [key, label] of section.fields) {
      const value = displayValue(formData[key])
      if (!value) continue
      // Checkboxes answered "No" are still worth stating — "no logo file" is a
      // real finding, unlike an unanswered text box.
      if (typeof formData[key] !== 'boolean' && value === '') continue
      lines.push(value.includes('\n') ? `${label}:\n${value}` : `${label}: ${value}`)
    }

    if (lines.length > 0) {
      blocks.push(`${section.title}\n${'-'.repeat(section.title.length)}\n${lines.join('\n')}`)
    }
  }

  const header = clientName ? `CLIENT INTAKE — ${clientName}` : 'CLIENT INTAKE'
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
