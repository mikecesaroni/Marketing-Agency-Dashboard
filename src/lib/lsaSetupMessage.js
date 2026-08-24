// The message sent to a client to kick off their LSA setup.
//
// It asks for two separate things that are easy to confuse:
//
//   Local Services dashboard access (by email) lets us manage the profile,
//   budget and lead disputes by hand. The client has usually already done this.
//
//   Linking their Google Ads account to our manager account is what lets the
//   CRM read leads through the API. A developer token can only be issued to a
//   manager account, so individual email access can never reach the API no
//   matter how much permission it carries.
//
// Both are needed. Neither substitutes for the other.

export const MANAGER_ID_PLACEHOLDER = '[OUR MANAGER ACCOUNT ID]'

export function buildLsaSetupMessage(managerId) {
  const id = String(managerId || '').trim() || MANAGER_ID_PLACEHOLDER

  return `Quick setup on your end to get your Google ads started:

Before we can get your Google Local Services Ads up and running, there are three things we need you to handle on your end. Google requires the business owner to do these directly, so we can't do them for you. Once these are done, we take over everything else.

STEP 1: Set up and verify your Google Local Services account
Using your own Google account, start your Local Services Ads profile and complete Google's verification. This is the part that takes the most time, so starting now is the best thing you can do to speed up your launch.

Google will ask you to verify:
- Your identity (owner background/identity check)
- Your business details
- Your license(s)
- Your insurance

Have your license and insurance info handy before you start, that's what slows most people down.

STEP 2: Add us as an admin
Once your account is created (verified is even better), invite us as an Admin so we can build everything out for you.

1. Sign in to your Google Local Services dashboard: https://ads.google.com/localservices/
2. Go to Account Access in the menu
3. Click the blue + button
4. Enter our email: roundtablemgmtt@gmail.com
5. Select Admin access
6. Send the invitation

If you get an error when adding us, Google is blocking outside email domains. Fix it like this, then try the invite again:

1. In your Local Services Ads dashboard, click the Settings icon (gear) and choose Security from the dropdown
2. Click the Security tab
3. Find the Allowed Domains section
4. Click Add Domain and enter: gmail.com
5. Save

STEP 3: Link your Google Ads account to our manager account
This is what lets our system pull your lead and cost data automatically, so
your reporting is live instead of us screenshotting your dashboard.

1. Sign in at ads.google.com with the same Google account
2. Click the tools icon, then Setup, then Account access
3. Choose Managers, then click the + button
4. Enter our manager account ID: ${id}
5. Send the request, then approve it when the confirmation arrives

If you do not see a Managers tab, send us a screenshot of that page and we will
walk you through it. It moves around depending on the account.

THAT'S IT
Once those are done, we handle the rest, full account setup, service areas, job
types, photos, budgeting, lead routing, and ongoing management. We'll take it
from there and keep you posted.

Reply here or text me if you hit any snags on Google's end. Happy to jump on a
quick call if it's easier.`
}
