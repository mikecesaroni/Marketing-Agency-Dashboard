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

/**
 * The long version of Option B, for a client doing it themselves. Every
 * click named, the links to the exact pages, what they will see, and what to
 * do when it does not look like that. Written to be read on a phone by
 * someone who has never opened the Admin menu.
 */
export function buildGoogleAdsLinkWalkthrough() {
  return `Linking your Google Ads account to us, step by step

What this is: you are giving our agency manager account permission to see your Google Ads account. It takes about 2 minutes. You keep full ownership. We cannot change your payment method, take the account away, or lock you out. You can remove us any time in the same place you add us.

Our manager account: Working Class Marketing
Our manager ID: ${GOOGLE_ADS_MANAGER_ID_DISPLAY}
(You will need that number in step 4. Copy it now.)

Best done on a computer. It works on a phone in a browser too, but the menus are easier to find on a bigger screen.

STEP 1: Sign in to Google Ads
Go to https://ads.google.com and sign in with the Google account you use for your ads. If you have more than one account, pick the one for your business.

STEP 2: Open the Managers page
Click this link, it takes you straight there:
https://ads.google.com/aw/accountaccess/managers

If the link does not land you there, find it by hand:
1. Click Admin in the left menu (the gear icon, near the bottom)
2. Click Access and security
3. Click the Managers tab at the top

STEP 3: Add a manager
Click the blue + button (top left of the list).

STEP 4: Enter our ID
A box appears asking for a manager account ID. Type in:
${GOOGLE_ADS_MANAGER_ID_DISPLAY}
Then click Send request (some screens say Submit).

STEP 5: Tell us it is sent
Reply here with "sent". We accept the request on our side, usually within the hour, and the link goes live. You will see Working Class Marketing on your Managers tab with the status Active.

That is it. From then on your Google Ads numbers show up in our reporting on their own. Nothing else for you to do.

IF SOMETHING LOOKS DIFFERENT

- No Managers tab, or the + button is grey: your login is not an admin on the account. Sign in with the owner's Google account, or ask whoever set the account up to add you as an admin under Access and security > Users.
- It asks for a number in the format 123-456-7890 and says the ID is not valid: check the dashes and digits, it is ${GOOGLE_ADS_MANAGER_ID_DISPLAY}.
- It says you already have a manager: that is fine, an account can have more than one. Add us anyway.
- You cannot find your way in at all: send us a screenshot of what you see, or just send us your customer ID (top right of Google Ads, ten digits) and we will send the request from our side instead. You then only have to click Accept in the email Google sends you.

Reply here or text me if you get stuck anywhere. Happy to jump on a quick call and do it together.`
}
