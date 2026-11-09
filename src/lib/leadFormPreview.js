// What a Meta instant form looks like before it exists: the pure half of the
// Studio's live preview.
//
// Meta has no preview a page can embed, and its own preview only exists once
// the form does. So the Studio draws the form the way a person taps through
// it on their phone: the intro card with the cover photo, the questions with
// the prefilled answers already in, the review screen when Higher Intent is
// on, and the thank-you page. This module turns the builder's state into
// those pages; InstantFormPreview.jsx draws them. The same fields become the
// create call's intro card (context_card), question page headline
// (question_page_custom_headline) and cover photo.
//
// Plain JavaScript, no imports but the question list, so
// scripts/check-lead-form-preview.mjs runs it in Node.

import { FORM_QUESTIONS } from './formQuestions.js'

/** The answers Meta would prefill, as a sample person, so the preview reads like the real thing. */
export const SAMPLE_ANSWERS = {
  FULL_NAME: 'Jordan Lee',
  FIRST_NAME: 'Jordan',
  LAST_NAME: 'Lee',
  PHONE: '(555) 014-2200',
  EMAIL: 'jordan.lee@email.com',
  STREET_ADDRESS: '48 Maple Street',
  CITY: 'Manchester',
  STATE: 'NH',
  ZIP: '03101',
  POST_CODE: '03101',
  COUNTRY: 'United States',
  COMPANY_NAME: 'Lee Property Group',
  JOB_TITLE: 'Owner',
}

const LABELS = {
  ...Object.fromEntries(FORM_QUESTIONS.map((q) => [q.type, q.label])),
  FIRST_NAME: 'First name',
  LAST_NAME: 'Last name',
  STATE: 'State',
  POST_CODE: 'Postcode',
  COUNTRY: 'Country',
  COMPANY_NAME: 'Company name',
  JOB_TITLE: 'Job title',
}

/** The intro card's lines: one per line typed, blanks dropped, five at most (Meta shows a short list). */
export function introLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5)
}

/** Meta's style for the intro card: a list when there is more than one line, a paragraph otherwise. */
export function introStyle(lines) {
  return (lines || []).length > 1 ? 'LIST_STYLE' : 'PARAGRAPH_STYLE'
}

/** The sample city and state from the client's market ("Manchester, NH"); the sample person's otherwise. */
export function sampleCity(market) {
  const m = String(market || '').trim()
  const parts = m.split(',').map((s) => s.trim()).filter(Boolean)
  if (!parts.length) return { city: SAMPLE_ANSWERS.CITY, state: SAMPLE_ANSWERS.STATE }
  return { city: parts[0], state: parts[1] && parts[1].length <= 3 ? parts[1].toUpperCase() : SAMPLE_ANSWERS.STATE }
}

/**
 * The extra parts of the create call, from the builder's intro fields:
 * the question page headline, and the intro card (title, lines, button,
 * style). Nothing when nothing was typed, so a form with no intro is the
 * form it always was.
 */
export function formExtras({ headline = '', introTitle = '', introText = '', introButton = '' } = {}) {
  const lines = introLines(introText)
  const title = String(introTitle || '').trim()
  const head = String(headline || '').trim()
  const intro = title || lines.length
    ? { title: title || head, content: lines, style: introStyle(lines), button_text: String(introButton || '').trim() || 'Continue' }
    : null
  return { headline: head || undefined, intro: intro || undefined }
}

/**
 * The pages of the form as a person taps through them, with the words on
 * each. The intro card shows when there is a cover photo or any intro text;
 * the review screen only on a Higher Intent form.
 */
export function previewPages({
  pageName = 'Your business',
  headline = '',
  introTitle = '',
  introText = '',
  introButton = '',
  picked = [],
  customs = [],
  higherIntent = true,
  thankYou = '',
  privacyUrl = '',
  market = '',
  hasCover = false,
  websiteUrl = '',
} = {}) {
  const lines = introLines(introText)
  const title = String(introTitle || '').trim()
  const head = String(headline || '').trim()
  const hasIntro = Boolean(title || lines.length)
  const { city, state } = sampleCity(market)
  const fields = [
    ...(picked || []).map((type) => ({
      type,
      label: LABELS[type] || String(type).toLowerCase().replace(/_/g, ' '),
      prefilled: true,
      value: type === 'CITY' ? city : type === 'STATE' ? state : SAMPLE_ANSWERS[type] || '',
    })),
    ...(customs || [])
      .filter((c) => String(c?.label || '').trim())
      .map((c) => ({ type: 'CUSTOM', label: String(c.label).trim(), prefilled: false, options: (c.options || []).map((o) => String(o || '').trim()).filter(Boolean) })),
  ]
  const pages = []
  if (hasIntro || hasCover) {
    pages.push({ key: 'intro', label: 'Intro', title: title || head || pageName, lines, button: String(introButton || '').trim() || 'Continue' })
  }
  pages.push({ key: 'questions', label: 'Questions', headline: head, fields, button: higherIntent ? 'Review' : 'Submit', privacyUrl: String(privacyUrl || '').trim() })
  if (higherIntent) pages.push({ key: 'review', label: 'Review', fields, button: 'Submit' })
  pages.push({
    key: 'thanks',
    label: 'Thank you',
    title: 'Thanks, we got it',
    body: String(thankYou || '').trim() || 'We will be in touch shortly.',
    button: String(websiteUrl || '').trim() ? 'Visit website' : '',
  })
  return pages
}

/**
 * What to say about a cover photo's shape. Meta shows the cover wide (about
 * 1.91 to 1), so a portrait photo is cropped to its middle band.
 */
export function coverShapeNote(width, height) {
  const w = Number(width) || 0
  const h = Number(height) || 0
  if (!w || !h) return ''
  const ratio = w / h
  if (ratio < 1.2) return 'A tall photo: Meta shows the cover wide, so only the middle band shows. A landscape photo fits better.'
  if (w < 800) return 'A small photo: it may look soft on a phone. 1200 pixels wide or more is best.'
  return ''
}
