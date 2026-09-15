// Self-check for reading an existing instant form. Run:
//
//   node scripts/check-lead-form-details.mjs
//
// The rule: WHAT META SAYS A FORM ASKS IS WHAT THE STUDIO SHOWS, AND "START
// FROM THIS FORM" REBUILDS THE SAME QUESTIONS WITH THE SAME OPTIONS.

import { describeForm, formToBuilder, isHigherIntent, metaFormsLibraryUrl, summariseForm } from '../src/lib/leadFormDetails.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

const form = {
  id: '123',
  name: 'Plumbquick — enquiries',
  status: 'ACTIVE',
  leads_count: 4,
  is_optimized_for_quality: 'true',
  privacy_policy_url: 'https://plumbquick.com/privacy',
  thank_you_page: { title: 'Thanks — we got it', body: 'We will call you shortly.', button_type: 'NONE' },
  questions: [
    { type: 'FULL_NAME', key: 'full_name' },
    { type: 'PHONE', key: 'phone_number' },
    { type: 'ZIP', key: 'zip_code' },
    { type: 'CUSTOM', key: 'what_is_the_unit_doing', label: 'What is the unit doing?', options: [{ key: 'no_cooling', value: 'No cooling' }, { key: 'weird_noise', value: 'Weird noise' }] },
    { type: 'CUSTOM', key: 'notes', label: 'Anything else?' },
    { type: 'FIRST_NAME', key: 'first_name' },
  ],
}

const d = describeForm(form)
check('labels in a person\'s words', d.map((x) => x.label), ['Full name', 'Phone number', 'ZIP code', 'What is the unit doing?', 'Anything else?', 'First name'])
check('standard fields are prefilled, custom are not', d.map((x) => x.prefilled), [true, true, true, false, false, true])
check('options come through as their values', d[3].options, ['No cooling', 'Weird noise'])
check('a typed custom question has no options', d[4].options, [])
check('higher intent read from Meta\'s string', isHigherIntent(form), true)
check('higher intent off when absent', isHigherIntent({}), false)
check('summary for a collapsed row', summariseForm(form), '4 prefilled + 2 custom')

const b = formToBuilder(form)
check('builder: standard ticks', b.picked, ['FULL_NAME', 'PHONE', 'ZIP', 'FIRST_NAME'])
check('builder: customs with options', b.customs, [
  { label: 'What is the unit doing?', why: '', options: ['No cooling', 'Weird noise'] },
  { label: 'Anything else?', why: '', options: [] },
])
check('builder: thank-you body, privacy, intent', [b.thankYou, b.privacyUrl, b.higherIntent], ['We will call you shortly.', 'https://plumbquick.com/privacy', true])
check('builder: the copy is named as one', b.formName, 'Plumbquick — enquiries (copy)')

check('a form with no questions field', describeForm({ id: '1' }), [])
check('summary with nothing read', summariseForm({}), 'no questions read')
check('an unknown type still prints', describeForm({ questions: [{ type: 'SOME_NEW_THING' }] })[0].label, 'some new thing')
check('library link carries the page id', metaFormsLibraryUrl('756448844499117'), 'https://business.facebook.com/latest/instant_forms/forms?asset_id=756448844499117')
check('no page, no link', metaFormsLibraryUrl(''), '')

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
