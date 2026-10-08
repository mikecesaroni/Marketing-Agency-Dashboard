# Weekly client reports

Every Monday morning, each client with ad spend the week before gets one
short email: last week's spend, leads, impressions, click rate and cost per
lead, two or three plain sentences on what the numbers mean, a four-line
glossary, and the same argument every week: the return on the leads is the
number that matters, and only the client knows it. The email links to a web
copy of the report where they can tell us how many of the leads became jobs
and roughly what they were worth. That answer shows up in the next week's
report as dollars back per dollar spent.

Nothing in the report is written by a model. Every sentence is a fixed
template with the week's numbers in it, so it reads the same way every week
and never over-promises. The copy lives in
`supabase/functions/weekly-report/weekly.ts`; the CRM preview and the email
use the same code.

## Where it lives in the CRM

Reports, then Housekeeping, "Weekly client reports". One row per client
with a Meta or Google account:

- **Goes to**: the address the report is sent to. The onboarding form's
  contact email by default; click it to set a different one (saved on the
  client as `report_email`).
- **Weekly**: On or Off per client. Off means never sent, with the reason
  "switched off" in the log.
- **This week**: Sent, Built but not emailed, Skipped (with the reason) or
  Failed (with the provider's error).
- **They told us**: the client's answer from the web copy, when there is one.
- **Preview** opens the exact email. **Send now** builds and sends that
  client's report (or "Send again"). **Copy link** copies the web copy's
  address, for a text or Slack when email is not set up.
- **Run this week now** does what Monday morning does, for every client.
  Clients already sent this week are left alone.

The arrows beside the week move to an earlier week, for a re-run.

## Who gets one

Not archived, not an internal business, weekly report switched on, ad
spend above zero that week on Meta or Google, and a valid email on file.
Every skip is logged with its reason.

## What is needed once, on the Supabase side

Edge Functions, Secrets:

| Secret | What |
| --- | --- |
| `RESEND_API_KEY` | From resend.com. Without it, reports are still built every Monday and marked "Built, not emailed", with the link to copy by hand. |
| `REPORT_FROM` | The sender, e.g. `The Working Class Marketing <reports@workingclassgroup.com>`. The domain has to be verified in Resend. |
| `REPORT_REPLY_TO` | Optional. Where client replies land. |
| `REPORT_BCC` | Optional but recommended. A copy of every report that goes out. |
| `REPORT_AGENCY_NAME` | Optional. The sign-off. Default The Working Class Marketing. |
| `APP_URL` | Optional. Where the CRM lives, for the report link. Default the Netlify address. |

The Monday schedule is a pg_cron job (`weekly-client-reports`, Mondays
13:00 UTC, 9am Eastern) that calls the `weekly-report` function; the SQL is
at the bottom of `supabase/weekly-reports.sql`.

## The web copy

`/report/<token>` is public: the token in the link is the credential, there
is no login and no agency chrome. It reads the saved report through
`weekly_report_load(token)` and takes the client's answer through
`weekly_report_answer(token, jobs, revenue, note)`. The table itself is not
readable with the anon key.

## Why the report says what it says

Agencies with low churn report the same way: a short fixed structure every
week so changes stand out, a few numbers tied to the business rather than
vanity metrics, plain words on what changed and why, candour on a bad week,
and the question that connects ad spend to money in the bank. Cost per lead
is on the report because owners ask for it; the return note is on the
report because cost per lead cannot tell anyone whether the ads paid.
