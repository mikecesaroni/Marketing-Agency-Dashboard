// The messages sent to a client so their Google Ads account can be read and
// managed from the CRM.
//
// The route we ask for: allow our email domain on their account's Security
// tab, add our email as a user, then send us their customer ID. The domain
// comes first because an account with "Allowed domains" switched on refuses
// the invite outright, and the client gives up at step 4 thinking it broke. It is one screen they can find, it needs nothing from
// our side before they start, and once it is done the CRM reads the account
// directly (the sync asks it as itself). Linking under our manager account
// works too and is kept as the fallback for anyone who prefers it.
//
// The manager id is a constant here for the same reason the agency email is:
// a row in app_settings drifted from the code once already. It has to be the
// same account as the GOOGLE_ADS_LOGIN_CUSTOMER_ID secret on the sync.

import { AGENCY_EMAIL, AGENCY_EMAIL_DOMAIN } from './agencyEmail.js'

export const GOOGLE_ADS_MANAGER_ID = '2701038317'

/** As Google shows it, 270-103-8317. */
export const GOOGLE_ADS_MANAGER_ID_DISPLAY = GOOGLE_ADS_MANAGER_ID.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')

/** The short ask. Fits in a text message. */
export function buildGoogleAdsAccessMessage() {
  return `Quick one so we can run and report on your Google Ads:

Two short steps in your Google Ads account, then send us your customer ID. About 3 minutes, and you keep full ownership.

1. Sign in at https://ads.google.com

FIRST, ALLOW OUR DOMAIN (Google blocks the invite without this)
2. Open this page: https://ads.google.com/aw/accountaccess/users
   (or click Admin, then Access and security)
3. Click the Security tab at the top of that page, then the pencil next to Allowed domains
4. Add: ${AGENCY_EMAIL_DOMAIN}
   Keep any domains already in the list, and if the list is empty add your own too (like gmail.com or yourbusiness.com) so your own logins keep working
5. Click Save

THEN, ADD US AS A USER
6. Click the Users tab, right next to Security
7. Click the blue + button
8. Enter our email: ${AGENCY_EMAIL}
9. Pick Admin access and click Send invitation

LAST
10. Reply here with your customer ID. It is the ten digit number at the top right of Google Ads, like 123-456-7890

No Google Ads account yet? Do not create one, Google will push you into building a campaign and adding a card. Just reply with the Google email you want it under and your business name as you want it shown, and we will set it up and make you the owner.

Reply here or text me if Google gives you any trouble.`
}

/**
 * The long version, for a client doing it on their own. Every click named,
 * the direct links, what they will see, and what to do when it does not look
 * like that. Written to be read on a phone by someone who has never opened
 * the Admin menu.
 */
export function buildGoogleAdsLinkWalkthrough() {
  return `Giving us access to your Google Ads, step by step

What this is: you are letting our agency email into your Google Ads account, so we can build and manage your ads and show you the results. It takes about 3 minutes. You stay the owner. We cannot take the account away, change who owns it, or lock you out, and you can remove us any time.

Two things you will need, copy them now:
Our domain: ${AGENCY_EMAIL_DOMAIN}   (step 2)
Our email: ${AGENCY_EMAIL}   (step 4)

NO GOOGLE ADS ACCOUNT YET?
Skip everything below. Do not create one yourself: Google walks new accounts straight into building a campaign and adding a card, and it is easy to end up with something spending money before anyone meant it to. Instead, reply here with:
1. The Google email you want the account under (a Gmail, or your business email if it is on Google Workspace)
2. Your business name exactly as you want it to show
We create the account for you and invite that email as the owner, so it is yours and stays yours. The only thing you will ever do in it is add a card for the ad spend, and we will tell you when it is time for that.

If you do have an account, carry on:

Best done on a computer. It works on a phone in a browser too, but the menus are easier to find on a bigger screen.

STEP 1: Sign in to Google Ads
Go to https://ads.google.com and sign in with the Google account you use for your ads. If you have more than one account, pick the one for your business.

STEP 2: Allow our domain (do this first)
Google will not let you invite us until our domain is on your account's allowed list, so this comes before adding us.
1. Click this link, it opens Access and security:
   https://ads.google.com/aw/accountaccess/users
   If it does not land you there: click Admin in the left menu (the gear icon, near the bottom), then Access and security.
2. Click the Security tab at the top of the page.
3. Find Allowed domains and click the pencil next to it.
4. Type ${AGENCY_EMAIL_DOMAIN} and add it.
5. Leave any domains already in the list alone. If the list was empty, also add the domain of your own email (gmail.com if you sign in with Gmail, or yourbusiness.com if you use a work email), so you and your team can still get in.
6. Click Save.

STEP 3: Open the Users page
Click the Users tab, right next to Security, on the same page.

STEP 4: Add us as a user
1. Click the blue + button (top left of the list).
2. In the email box, type: ${AGENCY_EMAIL}
3. Under access level, pick Admin. That lets us build campaigns, fix problems and pull reports without having to ask you each time. You stay the owner either way.
4. Click Send invitation.

STEP 5: Find your customer ID
Look at the top right of Google Ads, next to your account name. There is a ten digit number that looks like 123-456-7890. That is your customer ID.

STEP 6: Send it to us
Reply here with "sent" and that number. We accept the invitation on our side, usually within the hour, and that is it. You will see ${AGENCY_EMAIL} on your Users tab.

From then on your Google Ads numbers show up in our reporting on their own. Nothing else for you to do.

IF SOMETHING LOOKS DIFFERENT

- You cannot find Allowed domains, or there is no pencil: your login is not an admin on the account. Sign in with the owner's Google account, or ask whoever set the account up to do these steps.
- It still says our email is not allowed in step 4: go back to the Security tab and check ${AGENCY_EMAIL_DOMAIN} saved exactly like that, with no www and no @ in front. Then send the invitation again.
- There is no + button on the Users tab, or it is grey: same as above, sign in as the owner or an admin.
- It asks you to verify it is you: that is Google's normal security check. Follow it through, then carry on.
- You cannot find your way in at all: send us a screenshot of what you see and we will point you to the right button. Or hop on a quick call and we will do it together.
- Not sure whether you even have an account: go to https://ads.google.com and sign in. If it offers to create a new account or start a campaign, you do not have one. Stop there and reply with the two things under "No Google Ads account yet" above.

Reply here or text me if you get stuck anywhere.`
}
