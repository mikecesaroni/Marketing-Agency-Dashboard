# Client status

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

- Tier 2 and up: Google Ads access, the Google campaign published, **Local Services Ads live** (`lsa-live`, reads and writes `clients.lsa_active`), Google Business Profile access, **Past customer list loaded and re-engaged** (`past-customers`, marked by hand).
- Tier 3: **Second-brain AI built on the business** (`ai-brain`, after the onboarding call) and **Custom automations built** (`automations`, after the GHL build), both marked by hand.

A tick comes from the data where the data knows (an ad account connected, a campaign running, a flag flipped) and from a person otherwise (`step_overrides`, with who and when; `src/lib/completeStep.js`), and can be taken back. Client-side steps count how long they have been waiting: the link steps from their own stamp, the rest (access, photos) from the day the onboarding link went out, or the day the client was added.

## The flags

`src/lib/clientStatus.js` (`clientFlags`, pinned by `scripts/check-client-status.mjs`) turns what the CRM already keeps into one list per client, worst first. A client **needs a call** when anything red or amber is on them.

| Severity | Flag | When |
|---|---|---|
| red | Meta ads stopped / ad account disabled | the delivery alert (`src/lib/adHealth.js`): no spend for two days on a live account, or Meta reports the account disabled |
| red | No leads for N days | live, spent in the last fourteen days, and no lead for seven days (or none in fourteen); Meta `ad_daily` leads and Google `google_campaign_daily` conversions together |
| red | No new video or ad in N days | the video board's row (`videoDrops`): ten or more days since the last ad of any kind, or none ever, on a client with a Meta account |
| red | Payment overdue / Card failing | an unpaid `payments` row past its date, marked overdue, or with a failure count |
| amber | Waiting on them N days | a client-side step open seven days or more, naming the steps |
| amber | Google Ads sync failing | tier 2 and up with a customer id and `google_ads_sync_error` |
| blue | New clip waiting to go out | the video board's "ready" state |
| blue | KPIs not logged this week | live and no `weekly_kpis` row this week |
| blue | No package set / Package guessed from the fee | the tier column empty |
| blue | On pause | `paused_at` set; no ads expected, and nothing else is flagged for them |

Each flag links to the place to fix it (the client page section, the Content board, Payments).

## The page

`src/pages/ClientStatusPage.jsx`, data from `src/lib/clientStatusData.js` (one round of queries: the pipeline for everyone, the delivery view, two weeks of ad days, the video board's inputs, the payments). Three buckets side by side on a wide screen (four while anyone has no package), each with its name, price, what it owes, and how many need a call. A card per client: the name, "Call them" or "Chase" or "Running", a Call button (the intake phone), the owner, the package picker; the flags; the pipeline strip and the next step with its button and a Done; the checklist, folded, with a tick box per step and quick links (client page, Files, Ads, Ad Studio, the video board, Live KPIs). Views: Everyone, Needs a call, Waiting on client, Running clean. The board holds still while you work: the order is frozen until a filter changes, so marking a step done does not move the card out from under the eye.

Checked in the browser by the scratch Playwright run: four mock clients across the packages, each flag, the buckets, the filter, a tick writing an override with a name, a package pick writing the column.
