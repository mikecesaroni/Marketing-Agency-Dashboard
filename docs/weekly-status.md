# Weekly status, the team brief and the Slack channel

Added 2026-10-21, after "I want a weekly report for us to see how all clients are doing ... for our weekly executive status, not too in depth but big key points", "set up emails so we can get morning reports ... with things that need our attention and what is looking green", "a Slack channel where the CRM will send us alerts/flags for accounts, morning summaries, new edit from Kyle dropped in, no ads for 10+ days", and "we don't want to be bombarded".

## The questions, and the answers built in

- **What should ping the moment it happens?** Only what costs money or a day if it waits for morning: an ad account disabled, ads gone quiet (two full days without spend on a live account; Meta restates the last day or two, so one quiet day is not trusted, and a second sync at 1pm Eastern corrects the morning's numbers), a new edit dropped in (so it is published the same day), a client crossing ten days without a new ad, a card failing. Once per client per episode, never repeated. One line when the ads are delivering again, and only then: an alert that vanishes because the client was paused or archived closes in the log without a word (pausing Tito's once read as "ads delivering again").
- **What waits for the morning?** No leads while spending, a Google sync failing, who is onboarding. One line each. Money is not in the brief at all ("just tell us when a card fails, and don't keep showing it"): a card failing is one alert when it happens, an overdue invoice is the Payments page's business. A chase (waiting on the client) is not a flag in the brief either: it is a day count on the onboarding line, because the first real brief had twelve "waiting on them N days" lines for clients whose ads were running fine. Housekeeping (KPIs not logged, a package not set) stays on the Client tiers board.
- **How many messages a day?** One brief on weekday mornings at 7am Eastern. Alerts only when something is new, and never between 9pm and 7am. A quiet day is one message.
- **How long is the brief?** One line per thing, no explanations: the flag names the problem, the link goes to the place to fix it. The clients running clean are one line with their leads for the week ("Acme 8↑, Belk 5, ..."). Onboarding clients are one line each with their next step.
- **What is green?** A live client whose ads have no flag (account, ads stopped, no leads, no new ad, Google sync), with their leads this week and whether that is up or down on the week before. Money does not take a client off that line; it has its own.
- **Email or Slack?** Slack is the channel. Email is opt in (addresses on the Weekly status page) and needs the same two secrets the client reports use, `RESEND_API_KEY` and `REPORT_FROM`. Nothing is sent twice: the brief is once a day unless "Send now" is pressed.
- **Paused clients?** One line at the foot of the brief, "On pause (1): MBD Pressure Washing (since Oct 3, 25 days)", so nobody forgets them ("can we show paused clients in the morning brief"). Nothing else: a paused client carries only the "On pause" flag on the board, so no alert, their invoices fail by design while paused, and no ads are expected.
- **What about the weekly?** Monday's brief carries the week's totals and the clients that need a decision, in full, plus who is trending up. The whole table is the Weekly status page.

## The Weekly status page (`/weekly`)

`src/pages/WeeklyStatusPage.jsx`, logic in `src/lib/weeklyStatus.js` (pinned by `scripts/check-weekly-status.mjs`), data from `src/lib/weeklyStatusData.js`.

The last 7 days up to and including today against the 7 before ("make this last 7 days, not week by week dates", then "up to present"): rolling windows, not calendar weeks. Today is still filling in and that is accepted. Four windows back to back make the trend. From the same ad days the client reports use (`ad_daily` for Meta, `google_campaign_daily` for Google, `weekly_kpis` rows with channel LSA for the leads logged by hand; an LSA week lands in the window holding its Monday). The arrows move 7 days back.

| Column | What |
|---|---|
| Ads | Running · Ads stopped · Account disabled · No spend last week · Onboarding · Not running · Paused |
| Spent, Leads, Per lead | the week, with the change on the week before |
| Trend, 4 weeks | four bars of leads per week and Up, Down or Steady: leads up or down a fifth on the week, three weeks in one direction, or cost per lead moving a fifth; two weeks of spend with no lead is Down; nothing spent for two weeks is no trend |
| New ad? | New ad needed: N days (ten or more since any ad), No ad yet, N clips waiting to publish (red when also behind), New ad Nd ago |
| Key points | up to three, in plain words: the ads-off alert, no leads with the money spent, the trend's reason, the stale ad or the waiting clip, a payment, a chase, the next onboarding step. A clean week says "Running clean". |

Worst first: ads off, then a down trend, then a new ad needed, then no spend, then onboarding and not running, then steady, then the wins. Inside a rank, bigger spend first.

**Copy report** copies the whole thing as plain text: the totals line, the counts, then the clients under Needs a decision, Not running yet, Steady, Trending up, one line each (`weeklyText`).

## The team brief (`supabase/functions/team-digest`)

The function runs the CRM's own code: `src/lib/statusRows.js` (the same queries and the same `clientStatus()` the Client tiers board uses), `src/lib/weeklyStatus.js` and `src/lib/teamBrief.js`, bundled into `model.js` by `npm run brief` (rolldown). **Edit the modules, rebuild, redeploy.** `scripts/check-team-brief.mjs` pins the brief, the three renderings and the alert rules.

Actions: `brief` (the morning run; once a day unless `force`; skipped on weekends unless forced), `alerts` (the quarter-hour run; skipped in quiet hours unless forced), `preview` (today's brief: subject, text, html, the Slack message), `status`, `test_slack`. The Weekly status page has a button for each.

The log is `team_digests` (every brief, alert post and test, with where it went). The channel's memory is `team_alerts`: one row per client per thing (`<client>:ads-off`, `<client>:clip:<path>`, ...), open until it clears. An alert run posts only keys not open in the table and closes the ones that are gone; the brief marks everything it carried as posted, so the first alert run of the day does not repeat it.

Schedule (pg_cron, `supabase/team-brief.sql`): `team-morning-brief` weekdays 11:00 UTC (7am Eastern); `team-alerts` every 15 minutes. Both call the function the way the client reports' job does, with the project's anon key.

## Slack

An incoming webhook, one channel. In Slack: api.slack.com/apps, create an app (or open ours), Incoming Webhooks, switch it on, Add New Webhook to Workspace, pick the channel, copy the URL. Paste it on the Weekly status page (admins only). The URL is a secret, so it lives in the database vault: `set_slack_webhook(url)` writes it (admin check inside), `slack_webhook()` reads it and is callable only with the service key, `slack_connected()` tells the CRM whether one is set and never the URL. "Send a test" posts a hello.

Messages are Block Kit: a header, one section per group (chunked under Slack's 3000-character cap), client names linking to their page and flags to the place to fix them, a footer with Client tiers, the video board and Tasks.

## What is needed once

- Slack: the webhook, pasted on the page.
- Email (optional): `RESEND_API_KEY` and `REPORT_FROM` in Edge Function secrets, plus the addresses on the page.
- `APP_URL` if the CRM ever moves off the Netlify address.
