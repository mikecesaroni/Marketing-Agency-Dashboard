# Client tiers (the Client tiers board)

Added 2026-10-20, after "organize all clients in 3 buckets based on which tier they are in and what they need us to do ... flag any clients who haven't had videos in 10 days or they have not been getting leads". It took over from the Onboarding Progress board (`/deliverables`, which still lands here).

## The packages

`clients.tier` (supabase/client-tiers.sql), 1 to 3, null until somebody picks it. The pure half is `src/lib/clientTiers.js` (`TIERS`, `tierOf`, `tierFromFee`).

| Tier | Name | A month | Includes |
|---|---|---|---|
| 1 | CRM / Marketing Maintenance | $1,500 | Meta ads managed, creative from their job photos, leads followed up in GoHighLevel, monthly cost-per-lead reporting |
| 2 | The Whole Chain Marketing | $2,500 | Everything in 1, plus Google Search ads, Local Services Ads, the Business Profile, re-engaging their past customer list |
| 3 | Runs Without You Marketing | $3,500 plus $500 setup | Everything in 2, plus a second-brain AI built on the business and custom automations |

Every package includes the GoHighLevel build, so `nextSteps()` treats a client with a tier as on the GHL plan, and the migration switched `ghl_plan` on for every active client. Until the tier is set it is **guessed from `monthly_fee`** (within $100 of a package price) and shown as a guess: an amber picker on the card, a blue "Package guessed from the fee" flag, a `Maintenance?` badge on the Clients list. Pick it on the card to confirm; it writes the column and the card moves bucket.

## What the package owes: the checklist

The same launch pipeline the client page's Next-up bar shows (`src/lib/nextSteps.js`, pinned by `scripts/check-next-steps.mjs`), so the two never disagree. The tier adds steps:

- Tier 2 and up: Google Ads access, the Google campaign published, **Local Services Ads live** (`lsa-live`, reads and writes `clients.lsa_active`), **Past customer list loaded and re-engaged** (`past-customers`, marked by hand). The Business Profile is sold with the package but is not a step (taken off the list 2026-10-20 on request; the GBP access message is still on the client page's copy panel).
- Tier 3: **Second-brain AI built on the business** (`ai-brain`, after the onboarding call) and **Custom automations built** (`automations`, after the GHL build), both marked by hand.

A tick comes from the data where the data knows (an ad account connected, a campaign running, a flag flipped) and from a person otherwise (`step_overrides`, with who and when; `src/lib/completeStep.js`), and can be taken back. Client-side steps count how long they have been waiting: the link steps from their own stamp, the rest (access, photos) from the day the onboarding link went out, or the day the client was added.

## The flags

`src/lib/clientStatus.js` (`clientFlags`, pinned by `scripts/check-client-status.mjs`) turns what the CRM already keeps into one list per client, worst first. A client **needs a call** when anything red or amber is on them.

| Severity | Flag | When |
|---|---|---|
| red | Meta ads stopped / ad account disabled | the delivery alert (`src/lib/adHealth.js`): two full days without spend on a live account (three counting today; Meta restates the last day or two, so one quiet day is not trusted), or Meta reports the account disabled |
| red | No leads for N days | live, spent in the last fourteen days, and no lead for seven days (or none in fourteen); Meta `ad_daily` leads and Google `google_campaign_daily` conversions together |
| red | No new video or ad in N days | the video board's row (`videoDrops`): ten or more days since the last ad of any kind, or none ever, on a client with a Meta account |
| red | Payment overdue / Card failing | an unpaid `payments` row past its date, marked overdue, or with a failure count |
| | Live on any channel | "Running" means live on Meta (the switch), Google Search (the nightly sync sees a running campaign) or Local Services (its switch). A client who had Meta live, switched it off and runs Google or LSA has left Meta ("MCL is not doing Meta anymore, just Google"): running, the Meta steps come off their plan, no Meta delivery alert and no video promise; spending with no leads is still a call. A Whole Chain client who has not been through Meta yet keeps the Meta steps whatever else is live, because that package is Meta and Google both. Maintenance is ONE channel ("the 1500 plan is only Meta or Google, only one of those"): Meta unless the client has no Meta ad account and is on Google already (a Google Ads id, or Local Services live), in which case the Google steps are theirs and no Meta step is owed. |
| amber | Only N leads this week / No leads this week | two leads or fewer on a full week of spend (five or more days with spend in the last seven); the detail has the spend and the cost per lead. Not when "no leads" is already up, not on a week the ads barely ran. The card reads "Needs a look" (amber that is not a chase) |
| amber | Waiting on them N days | a client-side step open seven days or more, naming the steps; counted from the day the onboarding message went out (the link's date), so a client nobody has written to yet has no wait: their first step is ours, "Send the onboarding form" |
| amber | Google Ads sync failing | tier 2 and up with a customer id and `google_ads_sync_error` |
| blue | New clip waiting to go out | the video board's "ready" state |
| blue | KPIs not logged this week | live and no `weekly_kpis` row this week |
| blue | No package set / Package guessed from the fee | the tier column empty |
| blue | On pause | `paused_at` set; the only flag a paused client carries. No ads expected, no chase, and no money flag: a paused subscription's invoices fail by design, so a card failing on a paused client is not a call (added 2026-10-21 after MBD's failing card reached the Slack channel) |

Each flag links to the place to fix it (the client page section, the Content board, Payments).

## The page

`src/pages/ClientStatusPage.jsx`, data from `src/lib/clientStatusData.js` (one round of queries: the pipeline for everyone, the delivery view, two weeks of ad days, the video board's inputs, the payments). Three buckets side by side on a wide screen (four while anyone has no package), each with its name, price, what it owes, and how many need a call. A card per client, kept plain after "it seems too overwhelming": the name, a phone button (the intake phone) and one status word (Call them, Chase, Running, Onboarding, Paused); the flags as short lines (the detail on hover, or when the card is open); the next step with its one button; "More", which opens the checklist as one plain list in order with a tick box per step, the owner, and the links (client page, Files, Ads, Ad Studio, the video board); and the package picker at the foot. No phase dots or phase names anywhere, on the client page's Next-up bar either (taken off 2026-10-20). Each bucket's header is the package name and price, what it includes on hover. Views: Everyone, Needs a call, Waiting on client, Running clean. The board holds still while you work: the order is frozen until a filter changes, so marking a step done does not move the card out from under the eye.

Checked in the browser by the scratch Playwright run: four mock clients across the packages, each flag, the buckets, the filter, a tick writing an override with a name, a package pick writing the column.
