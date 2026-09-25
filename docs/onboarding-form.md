# The client onboarding form

One link, one form, seven short steps, filled in by the client before the
onboarding call. `/onboarding/<token>`. The question set lives in
`src/lib/clientForm.js` and is pinned by `scripts/check-client-form.mjs`.

| Step | Asks for | Why |
|---|---|---|
| Your business | name, owner, phone, email, website, trade, years, phone for ads | the ad and the profile |
| Where you work | home base, **mile radius** (required, chips for 15/25/40/60), cities to target or skip | this is exactly where the ads run |
| What you sell | services, the job they want more of, rough prices, jobs to avoid, seasons, ad budget per day | what the ads lead with |
| Why you | **what makes you better than competitors** (required), ideal customer, offers and guarantees, star rating and count, licences and certifications, competitors | where the ads come from |
| Your leads | where leads come in, who answers, what to ask a lead, what a 90-day win looks like | so every lead lands and the form asks the right things |
| Photos and videos | the shared Google Drive folder | real photos for the ads |
| Your account | legal name, entity type, EIN, address, time zone, phone, email, area code, website, authorised rep, opt-in method, review link, booking link, privacy page, anything else | the GoHighLevel build and A2P text registration |

Every client is on GoHighLevel now, so the account step is part of the one
form rather than a second link; `clients.ghl_plan` defaults to true for new
clients. The account step is pre-filled from the business step (legal name,
phone, email, website, owner as the authorised rep) so the EIN is about the
only thing left to type.

## What was dropped, and why

Read off the sixteen intakes in the database on 2026-09-25. Questions that
four or fewer clients had ever answered were removed: average job value,
customer age range, brand colours, the three "do you have photos / video /
logo" boxes, leads needed per month, LSA budget, bad experiences with past
marketers, offer headline and fine print, guarantee as a separate line, words
to avoid, booking URL on the intake (it is on the account step), response
time, CRM system (it is GoHighLevel now), main goal and 90-day success merged
into one. On the account side: DBA, terms page, a second service area and a
second pricing box that duplicated the business steps, the sample text
message nobody wrote.

## How it saves

Each Continue writes that step through the token functions
(`onboarding_link_save_intake` / `onboarding_link_save_ghl`), so a client who
stops halfway loses nothing. Required questions block Continue and are marked
in red. "Send it in" on the last step saves both halves with the submitted
flag, which is what the client page and the dashboard read. A returning
client who already sent the business half lands on the account step.

Older links still work: `?form=intake` shows everything but the account step,
`?form=ghl` only the account step. The "Account step only" link is what the
client page sends when a client is on the plan but the details are missing.
