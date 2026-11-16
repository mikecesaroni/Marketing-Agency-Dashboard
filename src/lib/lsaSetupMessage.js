// The message sent to a client to kick off their LSA (Google pay per lead).
//
// The plan, as Ethan set it on 2026-11-16: "I want the client to do the
// verification themselves and then add us as users when that's complete. I do
// not want us to set it up for them and ask for their verification docs."
// So the message asks for exactly two things, in order: the owner signs up at
// Google's Local Services page and finishes verification on their own, then
// adds us as an Admin. We never collect their license, insurance or ID, and we
// never start the account for them. Once we are in, we take over.
//
// It used to carry a third step asking them to link their Google Ads account
// to our manager account. That step is out of the message; ask for it
// separately when needed (docs/google-ads.md). Since 2026-11-17 a client's
// pay per lead lives inside Google Ads, so the nightly sync reads it from the
// account we are added to with no link needed.
//
// Google moved Local Services into Google Ads, as a Performance Max campaign
// with pay-per-lead goals, and is retiring the standalone dashboard. Sign-up
// and verification still start at https://g.co/localservices (a pay-per-lead
// campaign cannot be made from scratch inside Google Ads yet), but access is
// given on the Google Ads account once it has moved there. Step 2 covers both
// sides of the move.
//
// Client-facing: plain words, no em or en dashes (scripts/check-google-split.mjs).

import { AGENCY_EMAIL, AGENCY_EMAIL_DOMAIN } from './agencyEmail.js'

export function buildLsaSetupMessage() {
  return `Quick setup on your end to get your Google pay per lead ads going (the "Google Verified" ads at the very top of Google).

Google makes the business owner sign up and get verified directly, so this part has to come from you. Once you're verified, you add us and we take over everything else.

STEP 1: Sign up and get verified
Using your own Google account, start at https://g.co/localservices and finish Google's verification. Google will ask for:
- A business check (your registration and ID)
- A background check for each owner (no credit check). In some trades Google also wants one for each tech who goes on jobs.
- Your license(s)
- Your insurance

Make sure the business name on your license and insurance matches your business name exactly. That's what holds most people up. Verification usually takes Google 3 to 4 weeks, so the sooner you start the better.

STEP 2: Once you're verified, add us as an Admin
Google has moved Local Services into Google Ads, so you'll most likely find it there:
1. Sign in to Google Ads: https://ads.google.com
2. Click Admin, then Access and security
3. Click the blue + button
4. Enter our email: ${AGENCY_EMAIL}
5. Pick Admin access and send the invite

If yours is still in the old Local Services dashboard (https://ads.google.com/localservices/), go to Account Access, click the blue + button and invite the same email as Admin.

If Google gives you an error when you add us, it's blocking outside email addresses. Add ${AGENCY_EMAIL_DOMAIN} as an allowed domain, then send the invite again:
- In Google Ads: Admin, then Access and security, then the Security tab
- In the Local Services dashboard: the gear icon, then Security, then Allowed Domains

THAT'S IT
Once we're in, we handle the rest: budget, service areas, job types, photos, lead disputes and the day to day.

Text me if Google gives you any trouble. Happy to jump on a quick call if that's easier.`
}
