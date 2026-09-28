// The message sent to a client so their Google Ads account can be read by
// the CRM.
//
// One link does it: their account linked under our manager account. Once it
// is, the nightly sync finds their account by name and saves the id itself,
// so the message asks for nothing else. The manager id is a constant here for
// the same reason the agency email is: a row in app_settings drifted from the
// code once already. It has to be the same account as the
// GOOGLE_ADS_LOGIN_CUSTOMER_ID secret on the sync function.

export const GOOGLE_ADS_MANAGER_ID = '2701038317'

/** As Google shows it, 270-103-8317. */
export const GOOGLE_ADS_MANAGER_ID_DISPLAY = GOOGLE_ADS_MANAGER_ID.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')

export function buildGoogleAdsAccessMessage() {
  return `Quick one so we can see your Google Ads numbers:

We report on your Google Ads spend and leads inside our system, and for that your Google Ads account needs to be linked to our agency manager account. It takes about two minutes and you keep full ownership of your account.

Option A (easiest): send us your Google Ads customer ID
1. Sign in at https://ads.google.com
2. Your customer ID is at the top right, ten digits like 123-456-7890
3. Reply here with that number

We then send a link request from our manager account and you will get an email from Google Ads. Open it and click Accept, or accept it in your account under Admin > Access and security > Managers.

Option B: link it yourself
1. Sign in at https://ads.google.com
2. Go to Admin > Access and security > Managers
3. Click the + button and enter our manager ID: ${GOOGLE_ADS_MANAGER_ID_DISPLAY}
4. Send the request. We accept it on our side and you are done.

Either way, once the link is in place everything else happens automatically on our end. Reply here or text me if Google gives you any trouble.`
}
