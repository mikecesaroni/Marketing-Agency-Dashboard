// The message sent to a client to kick off their LSA setup.
//
// It asks for two things: that they stand up and verify their own Local
// Services account, and that they add us to it as an Admin. Admin access is
// what lets us manage the profile, budget and lead disputes by hand.
//
// It used to carry a third step asking them to link their Google Ads account
// to our manager account, which is the only route to the API -- a developer
// token can only be issued to a manager account, so email access can never
// reach it. That step is out of the message now and lead data comes in by
// hand. If automatic LSA reporting is wanted later, the link has to be asked
// for again; nothing else in the CRM will surface the need.

import { AGENCY_EMAIL, AGENCY_EMAIL_DOMAIN } from './agencyEmail.js'

export function buildLsaSetupMessage() {
  return `Quick setup on your end to get your Google ads started:

Before we can get your Google Local Services Ads up and running, there are two things we need you to handle on your end. Google requires the business owner to do these directly, so we can't do them for you. Once these are done, we take over everything else.

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
4. Enter our email: ${AGENCY_EMAIL}
5. Select Admin access
6. Send the invitation

If you get an error when adding us, Google is blocking outside email domains. Fix it like this, then try the invite again:

1. In your Local Services Ads dashboard, click the Settings icon (gear) and choose Security from the dropdown
2. Click the Security tab
3. Find the Allowed Domains section
4. Click Add Domain and enter: ${AGENCY_EMAIL_DOMAIN}
5. Save

THAT'S IT
Once those are done, we handle the rest, full account setup, service areas, job
types, photos, budgeting, lead routing, and ongoing management. We'll take it
from there and keep you posted.

Reply here or text me if you hit any snags on Google's end. Happy to jump on a
quick call if it's easier.`
}
