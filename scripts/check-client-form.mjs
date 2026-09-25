// Self-check for the client onboarding form spec. Run: node scripts/check-client-form.mjs
//
// The form writes straight into two tables through the token functions, so a
// key that is not a real column is silently dropped by onboarding_apply().
// The column lists below are the tables as they stand (2026-09-25); a new
// question needs its column added there, and here.

import {
  FORM_FIELDS,
  FORM_STEPS,
  GHL_FORM_KEYS,
  INTAKE_FORM_KEYS,
  emptyAnswers,
  mergeAnswers,
  missingOnStep,
  prefillAccount,
  progress,
  splitAnswers,
  stepsFor,
} from '../src/lib/clientForm.js'
import { CLIENT_INTAKE_KEYS } from '../src/lib/intakeSummary.js'
import { GHL_REQUIRED_KEYS } from '../src/lib/ghlSetupFields.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

const INTAKE_COLUMNS = new Set(['business_name', 'contact_phone', 'contact_email', 'website', 'service_area', 'years_in_business', 'services_offered', 'most_profitable_service', 'service_want_more', 'average_job_value', 'busy_season', 'leads_needed_per_month', 'current_ads_what_works', 'ideal_customer', 'why_people_choose', 'most_common_objection', 'reviews_star_rating', 'reviews_count', 'has_before_after_photos', 'has_video_footage', 'has_logo', 'licensed_insured_certified', 'leads_go_to', 'who_answers_leads', 'response_time_to_lead', 'crm_system', 'has_meta_access', 'has_website_access', 'has_google_business', 'main_goal', 'success_90_days', 'competitors_to_beat', 'bad_experience_past_marketers', 'meta_status', 'lsa_status', 'google_status', 'meta_ad_budget_per_day', 'lsa_ad_budget_per_day', 'call_notes', 'industry_trade', 'owner_name', 'cta_offering', 'current_offers_guarantees', 'jobs_to_avoid', 'target_cities', 'service_radius_miles', 'customer_age_min', 'customer_age_max', 'brand_color_primary', 'brand_color_secondary', 'phone_for_ads', 'booking_url', 'offer_headline', 'offer_fine_print', 'guarantee', 'financing_available', 'license_number', 'typical_price_range', 'lead_form_questions', 'words_to_avoid'])
const GHL_COLUMNS = new Set(['legal_business_name', 'dba_name', 'business_address', 'business_city', 'business_state', 'business_postal_code', 'business_country', 'timezone', 'main_phone', 'support_email', 'ein', 'business_entity_type', 'website_url', 'privacy_policy_url', 'terms_url', 'authorized_rep_name', 'authorized_rep_email', 'authorized_rep_phone', 'sms_opt_in_method', 'sample_sms_message', 'booking_url', 'review_link', 'service_area', 'service_pricing', 'notes', 'preferred_area_code'])

check('every key is unique', new Set(FORM_FIELDS.map((f) => f.key)).size, FORM_FIELDS.length)
check('every intake key is a real column', INTAKE_FORM_KEYS.filter((k) => !INTAKE_COLUMNS.has(k)), [])
check('every ghl key is a real column', GHL_FORM_KEYS.filter((k) => !GHL_COLUMNS.has(k)), [])
check('every field names its table', FORM_FIELDS.filter((f) => !['intake', 'ghl'].includes(f.table)).map((f) => f.key), [])
check('the ghl step covers everything the build needs', GHL_REQUIRED_KEYS.filter((k) => !GHL_FORM_KEYS.includes(k)), [])
check('the ghl build fields are required on the form', GHL_REQUIRED_KEYS.filter((k) => !FORM_FIELDS.find((f) => f.key === k)?.required), [])
check('the client page counts the same intake keys', CLIENT_INTAKE_KEYS, INTAKE_FORM_KEYS)
check('the radius is asked, and required', FORM_FIELDS.find((f) => f.key === 'service_radius_miles')?.required, true)
check('what makes you better is asked, and required', FORM_FIELDS.find((f) => f.key === 'why_people_choose')?.required, true)
check('seven steps, account last', FORM_STEPS.map((s) => s.key), ['business', 'area', 'services', 'why', 'leads', 'photos', 'account'])
check('one photos step, no fields of its own', FORM_STEPS.find((s) => s.drive)?.fields.length, 0)
check('dropped: the questions almost nobody answered', ['average_job_value', 'customer_age_min', 'brand_color_primary', 'has_logo', 'leads_needed_per_month', 'lsa_ad_budget_per_day', 'bad_experience_past_marketers', 'offer_headline', 'words_to_avoid', 'response_time_to_lead', 'crm_system', 'service_pricing', 'terms_url', 'dba_name'].filter((k) => FORM_FIELDS.some((f) => f.key === k)), [])
check('select fields carry options', FORM_FIELDS.filter((f) => f.type === 'select' && !(f.options?.length > 0)).map((f) => f.key), [])
check('prefill sources exist', FORM_FIELDS.filter((f) => f.prefillFrom && !FORM_FIELDS.some((g) => g.key === f.prefillFrom)).map((f) => f.key), [])

check('old ghl-only link: just the account step', stepsFor('ghl').map((s) => s.key), ['account'])
check('old intake-only link: everything but the account', stepsFor('intake').some((s) => s.key === 'account'), false)
check('plain link: the whole form', stepsFor('').length, FORM_STEPS.length)

const empty = emptyAnswers()
check('empty answers are strings', Object.values(empty).every((v) => v === ''), true)
const merged = mergeAnswers(empty, { business_name: 'Belk', service_radius_miles: 25, ignored: 'x' }, { ein: '12-3456789' })
check('merge: rows in, numbers as strings, unknown keys out', [merged.business_name, merged.service_radius_miles, merged.ein, 'ignored' in merged], ['Belk', '25', '12-3456789', false])

const area = FORM_STEPS.find((s) => s.key === 'area')
check('missing on a step, in order', missingOnStep(area, { service_area: ' ', service_radius_miles: '' }), ['service_area', 'service_radius_miles'])
check('nothing missing once answered', missingOnStep(area, { service_area: 'Austin, TX', service_radius_miles: '25' }), [])

const pre = prefillAccount({ ...empty, business_name: 'Belk Heating', owner_name: 'Dale', contact_phone: '555', contact_email: 'd@b.com', website: 'belk.com', legal_business_name: 'Belk Heating LLC' })
check('prefill: account fields from earlier answers, never over a typed one', [pre.legal_business_name, pre.main_phone, pre.support_email, pre.authorized_rep_name, pre.authorized_rep_email, pre.website_url], ['Belk Heating LLC', '555', 'd@b.com', 'Dale', 'd@b.com', 'belk.com'])

const split = splitAnswers({ ...empty, business_name: 'Belk', service_radius_miles: '25', meta_ad_budget_per_day: 'lots', ein: ' ' })
check('split: intake and ghl apart, numbers numeric, junk null, blanks null', [split.intake.business_name, split.intake.service_radius_miles, split.intake.meta_ad_budget_per_day, split.ghl.ein, 'ein' in split.intake], ['Belk', 25, null, null, false])

const p = progress({ ...empty, business_name: 'Belk', website: 'x' })
check('progress counts required and all', [p.required, p.answered, p.requiredTotal > 10, p.total > 30], [1, 2, true, true])

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED`)
  process.exit(1)
}
console.log('\nAll client form checks passed.')
