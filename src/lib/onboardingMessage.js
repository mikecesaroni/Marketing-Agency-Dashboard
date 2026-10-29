// The message that goes with a client's onboarding link, word for word.
//
// Two asks and nothing else: the form, and photos. The photos ask changed on
// 2026-10-29: WE make the Google Drive folder, share it with the client and
// link it in the CRM, and the message hands them the link ("I made one folder
// in Google Drive. Please add in your best job photos/videos..."). Before,
// the message asked the client to make a folder and share it with our service
// account, and to reply with the link, which was three things to get wrong.
//
// Pure: scripts/check-onboarding-message.mjs pins the wording.

/** The folder link the way Google hands it out, with the share parameter. */
export const driveFolderLink = (id) => (id ? `https://drive.google.com/drive/folders/${id}?usp=sharing` : '')

/** What stands in for the folder link until one is linked on the client page. */
export const FOLDER_PLACEHOLDER = '[link the Drive folder on the client page under Files and this fills in]'

/**
 * url: the client's onboarding link (with its ?form= parameter when any)
 * mode: 'both' (the whole form), 'intake' (without the account step), 'ghl' (the account step only)
 * driveFolderId: the client's linked Drive folder, or ''
 * clientName: for the account-step message's greeting
 */
export function onboardingMessage({ url = '', mode = 'both', driveFolderId = '', clientName = '' } = {}) {
  if (!url) return ''

  // The account setup on its own is a different ask to a different person on
  // a different day: it is registration paperwork, not "tell us about your
  // business", and none of the photo instructions belong anywhere near it.
  if (mode === 'ghl') {
    return [
      `Hi ${clientName || 'there'} team,`,
      '',
      'To get your account and text messaging set up, we need a few details',
      'off your business registration: your EIN, business address and who the',
      'authorised contact is.',
      '',
      url,
      '',
      'It saves as you go, so you can stop and come back if you need to look',
      'something up.',
      '',
      'Thanks!',
    ].join('\n')
  }

  const lines = [
    'Hi guys,',
    '',
    'Two quick things and we can get your ads moving.',
    '',
    '1) Fill out your onboarding form (about ten minutes):',
    url,
    'It saves as you go, so you can stop and come back to it.',
  ]
  // Said only when it is true: the onboarding-only link ends at the end of
  // the onboarding, and promising a second part that never arrives is its
  // own small broken promise.
  if (mode === 'both') lines.push('The last step asks for your EIN and business address, so have those handy.')

  lines.push(
    '',
    '2) Photos for your ads. I made one folder in Google Drive. Please add in your best',
    'job photos/videos, your logo and any team pictures. Here is that link:',
    '',
    `    ${driveFolderLink(driveFolderId) || FOLDER_PLACEHOLDER}`,
    '',
    'Thanks!'
  )
  return lines.join('\n')
}
