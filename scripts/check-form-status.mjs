// Self-check for the onboarding form badge on the Clients list: in, sent,
// or not sent yet. Run: node scripts/check-form-status.mjs

import { FORM_TONE, formStatus } from '../src/lib/formStatus.js'
import { intakeFilled } from '../src/lib/nextSteps.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

const TODAY = '2026-11-03'

check('submitted through the link: in, with the day', formStatus({ submittedAt: '2026-10-30T14:02:00Z', sentAt: '2026-10-28', today: TODAY }), { state: 'in', label: '● Form in', detail: 'Onboarding form submitted 2026-10-30', days: 4 })
check('filled in on the call, no stamp: still in', formStatus({ filled: true, today: TODAY }), { state: 'in', label: '● Form in', detail: 'Onboarding form filled in on the call', days: null })
check('sent, nothing back: sent, with how long ago', formStatus({ sentAt: '2026-10-28T20:42:04Z', today: TODAY }), { state: 'sent', label: '◐ Form sent', detail: 'Onboarding form sent 2026-10-28, 6 days ago, not submitted yet', days: 6 })
check('sent today reads 0 days', formStatus({ sentAt: TODAY, today: TODAY }).detail, 'Onboarding form sent 2026-11-03, 0 days ago, not submitted yet')
check('one day is singular', formStatus({ sentAt: '2026-11-02', today: TODAY }).detail.includes('1 day ago'), true)
check('no link at all: not sent yet', formStatus({ today: TODAY }), { state: 'none', label: '○ No form yet', detail: 'Onboarding form not sent yet: copy the link from their page (Send to client)', days: null })
check('nothing passed at all still answers', formStatus().state, 'none')
check('a submitted stamp wins over a sent date', formStatus({ submittedAt: '2026-11-01', sentAt: '2026-10-20', today: TODAY }).state, 'in')
check('tones: green in, blue sent, dim none', [FORM_TONE.in, FORM_TONE.sent, FORM_TONE.none], ['success', 'info', 'dim'])

// The same "filled in" rule as the launch pipeline's form step.
const answers = { business_name: 'Acme', contact_phone: '555', service_area: 'Raleigh', services_offered: 'HVAC', most_profitable_service: 'Installs', ideal_customer: 'Homeowners', why_people_choose: 'Fast', offer_headline: 'Free quote' }
check('eight answers count as filled in', intakeFilled(answers), true)
check('seven do not', intakeFilled({ ...answers, offer_headline: '' }), false)
check('no intake row is not filled', intakeFilled(null), false)

if (failures) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
