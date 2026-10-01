// Self-check for reading an ad's instant-form leads back from Meta: Meta's
// field_data into a lead someone can read, and the display helpers.
// Run: node scripts/check-ad-leads.mjs

import { prettyQuestion, toLead } from '../supabase/functions/meta-ad-leads/index.ts'
import { leadWhen, prettyPhone } from '../src/lib/adLeadsFormat.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

{
  const l = toLead({
    id: '1', created_time: '2026-09-29T19:14:00+0000', platform: 'fb', form_id: '9',
    field_data: [
      { name: 'full_name', values: ['Dana Reyes'] },
      { name: 'phone_number', values: ['+15125550142'] },
      { name: 'email', values: ['dana@example.com'] },
      { name: 'what_is_your_zip_code?', values: ['78681'] },
      { name: 'how_old_is_your_system?', values: ['10+ years'] },
      { name: 'street_address', values: [''] },
    ],
  })
  check('name, phone and email are pulled out; the rest become questions; blanks are dropped',
    [l.name, l.phone, l.email, l.answers], ['Dana Reyes', '+15125550142', 'dana@example.com', [{ question: 'What is your zip code?', answer: '78681' }, { question: 'How old is your system?', answer: '10+ years' }]])
  const split = toLead({ id: '2', field_data: [{ name: 'first_name', values: ['Sam'] }, { name: 'last_name', values: ['Lee'] }] })
  check('first and last name join when the form asks them apart', split.name, 'Sam Lee')
  check('a lead with no fields does not crash', toLead({ id: '3' }).name, '')
}
check('question keys read as sentences', prettyQuestion('do_you_own_your_home?'), 'Do you own your home?')
check('phones read as US numbers, odd ones pass through', [prettyPhone('+15125550142'), prettyPhone('5125550142'), prettyPhone('+44 20 7946 0958')], ['(512) 555-0142', '(512) 555-0142', '+44 20 7946 0958'])
check('a bad time is blank, a good one is short', [leadWhen('nope'), /Sep 29/.test(leadWhen('2026-09-29T19:14:00Z'))], ['', true])

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
