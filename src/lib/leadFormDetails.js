// What an existing Meta instant form asks, in a person's words, and how to
// load it back into the builder. Pure: the check script imports it in Node.
//
// Meta returns questions as {type, key, label, options:[{key,value}]}. The
// standard types (FULL_NAME, PHONE...) have no label of their own; CUSTOM ones
// carry the label the form shows.

import { FORM_QUESTIONS } from './formQuestions.js'

const STANDARD_LABELS = Object.fromEntries(FORM_QUESTIONS.map((q) => [q.type, q.label]))
const EXTRA_LABELS = {
  FIRST_NAME: 'First name',
  LAST_NAME: 'Last name',
  STATE: 'State',
  POST_CODE: 'Postcode',
  COUNTRY: 'Country',
  COMPANY_NAME: 'Company',
  JOB_TITLE: 'Job title',
  DOB: 'Date of birth',
  GENDER: 'Gender',
  MARITAL_STATUS: 'Marital status',
  RELATIONSHIP_STATUS: 'Relationship status',
  MILITARY_STATUS: 'Military status',
  WORK_EMAIL: 'Work email',
  WORK_PHONE_NUMBER: 'Work phone',
}

/** One question as the Studio prints it: label, whether it is prefilled, its options. */
export function describeQuestion(q) {
  const type = String(q?.type || '').toUpperCase()
  const options = (Array.isArray(q?.options) ? q.options : []).map((o) => (o && typeof o === 'object' ? o.value : o)).filter(Boolean)
  if (type === 'CUSTOM') {
    return { type, label: q?.label || q?.key || 'Custom question', prefilled: false, custom: true, options }
  }
  return { type, label: STANDARD_LABELS[type] || EXTRA_LABELS[type] || q?.label || type.toLowerCase().replace(/_/g, ' '), prefilled: true, custom: false, options }
}

/** Every question on a form, described. */
export function describeForm(form) {
  return (Array.isArray(form?.questions) ? form.questions : []).map(describeQuestion)
}

/** True when the form shows Meta's review screen before submit. */
export function isHigherIntent(form) {
  const v = form?.is_optimized_for_quality
  return v === true || v === 'true'
}

/**
 * The builder's state for "start from this form": standard ticks, custom
 * questions with their options, the thank-you text, privacy URL and intent.
 * The name gets " (copy)" so the new form is never mistaken for the old one in
 * Meta's list, where two identical names would be two identical rows.
 */
export function formToBuilder(form) {
  const described = describeForm(form)
  const picked = described.filter((d) => !d.custom).map((d) => d.type)
  const customs = described.filter((d) => d.custom).map((d) => ({ label: d.label, why: '', options: d.options }))
  const ty = form?.thank_you_page
  return {
    formName: `${form?.name || 'Form'} (copy)`,
    picked,
    customs,
    thankYou: (ty && (ty.body || ty.title)) || '',
    privacyUrl: form?.privacy_policy_url || '',
    higherIntent: isHigherIntent(form),
  }
}

/** Meta's Instant Forms library for the Page, where a form can be edited, previewed or its leads downloaded. */
export function metaFormsLibraryUrl(pageId) {
  return pageId ? `https://business.facebook.com/latest/instant_forms/forms?asset_id=${encodeURIComponent(pageId)}` : ''
}

/** "3 prefilled + 1 question" style summary for a collapsed row. */
export function summariseForm(form) {
  const d = describeForm(form)
  const pre = d.filter((x) => x.prefilled).length
  const typed = d.length - pre
  const parts = []
  if (pre) parts.push(`${pre} prefilled`)
  if (typed) parts.push(`${typed} custom`)
  return parts.length ? parts.join(' + ') : 'no questions read'
}
