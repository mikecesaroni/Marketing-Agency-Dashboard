// Self-check for the onboarding message's wording. Run: node scripts/check-onboarding-message.mjs
//
// The rule: THE MESSAGE IS THE OWNER'S WORDS, WITH THE CLIENT'S FORM LINK AND
// THE DRIVE FOLDER WE MADE FOR THEM FILLED IN, AND NOTHING ELSE.

import { FOLDER_PLACEHOLDER, driveFolderLink, onboardingMessage } from '../src/lib/onboardingMessage.js'

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

const URL = 'https://marketing-agency-dashboard.netlify.app/onboarding/abc123'
const FOLDER = '1TtEYIGJwKufdgZK555jEWiT5Dnr8yhAp'

check(
  'the whole message, word for word, with the form link and our folder link',
  onboardingMessage({ url: URL, mode: 'both', driveFolderId: FOLDER }),
  [
    'Hi guys,',
    '',
    'Two quick things and we can get your ads moving.',
    '',
    '1) Fill out your onboarding form (about ten minutes):',
    URL,
    'It saves as you go, so you can stop and come back to it.',
    'The last step asks for your EIN and business address, so have those handy.',
    '',
    '2) Photos for your ads. I made one folder in Google Drive. Please add in your best',
    'job photos/videos, your logo and any team pictures. Here is that link:',
    '',
    '    https://drive.google.com/drive/folders/1TtEYIGJwKufdgZK555jEWiT5Dnr8yhAp?usp=sharing',
    '',
    'Thanks!',
  ].join('\n')
)
check('the folder link carries the share parameter', driveFolderLink(FOLDER), `https://drive.google.com/drive/folders/${FOLDER}?usp=sharing`)
check('no folder linked yet: a placeholder stands where the link goes, so it cannot be sent unnoticed', onboardingMessage({ url: URL, driveFolderId: '' }).includes(`    ${FOLDER_PLACEHOLDER}`), true)
check('the onboarding-only link drops the EIN line', onboardingMessage({ url: `${URL}?form=intake`, mode: 'intake', driveFolderId: FOLDER }).includes('EIN'), false)
check('no mention of sharing a folder with us, or of replying with a link', /share|reply/i.test(onboardingMessage({ url: URL, driveFolderId: FOLDER })), false)
check('the account-step message is its own, and names the business', onboardingMessage({ url: `${URL}?form=ghl`, mode: 'ghl', clientName: 'Acme' }).startsWith('Hi Acme team,\n\nTo get your account and text messaging set up'), true)
check('no link, no message', onboardingMessage({ url: '' }), '')

if (failures) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll onboarding message checks passed')
