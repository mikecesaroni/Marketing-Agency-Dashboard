# How the CRM runs a client, and how the team works it

Written for the team, September 2026, after a pass over the whole CRM asking one
question: when someone opens a client, do they know the next move, whose it is,
and what to click? This is the operating model that came out of it and where each
piece lives.

## One pipeline, three screens

Every client is on the same launch pipeline. It is computed, not typed, from
what the CRM already knows, in `src/lib/nextSteps.js`:

| Phase | Steps | Owner |
| --- | --- | --- |
| Sign up | Setup fee paid, onboarding form filled in, onboarding call done | client, client, us |
| Access | Meta ad account and Page, photos and logo, GHL details (if on plan), GBP access, LSA access (if LSA) | client |
| Build | GHL backend built and marked live (if on plan), ads built | us |
| Launch | Published to Meta, Meta ads live | us |
| Run | This week's KPIs logged, monthly report sent | us |

A step is done when the data says so (a submitted form, a connected account, a
saved ad, a paid invoice). A step is blocked while the step it depends on is
open. The next move is the first unblocked step that is ours; when everything
open belongs to the client, the next move is the chase.

The same list is rendered in three places, so they can never disagree:

- **Client page**: the sticky Next-up bar under the header. Phase, progress,
  the next step with its owner and days waiting, the button that does it, the
  client's owner on the team, and the whole plan on a click.
- **Deliverables**: the team board. Every client, one row each, sorted by who
  needs a hand first. Filters pinned at the top: Needs us, Waiting on client,
  Everyone, Launched, by owner, by name. Open a row for the plan and the
  hand-typed tasks with assignees.
- **Dashboard**: What is next, per client. Two columns, ours and theirs.

## Messages and links, one click from the client

Every ask of a client has a copy button where the step is:

- Onboarding form and GHL details: the link message, from the Next-up bar or
  the board row. It saves as they go.
- Meta access, LSA access, GBP access: the stored messages with our IDs filled
  in, in a modal on the client page and the board. The GBP modal also carries
  the per-client agent brief.
- Photos: the onboarding message's Drive folder ask; the Studio's photo picker
  reads the folder live.

The agency-wide sweep (who still needs each channel, and the Meta access
report) is folded under the board for the weekly pass.

## Who is on it

Free-text names, no logins needed: a client owner on each client, an assignee
on each hand-typed task. Names already used appear as suggestions. Filter the
board by owner to see one person's plate.

## Money

Payments and Team open only for the owner, signed in once per browser
(sidebar, "Owner sign in"). The ledger, the partner split and the Stripe tables
are unreadable to anyone else at the database, not only hidden. The dashboard
reads paid or not through a status view.

## The system learns

Two loops, both automatic, both feeding the chat and the Ad Studio's copy
assistant on every call:

1. **Nightly learnings** (08:40): best and worst ads per client and across the
   agency, hook and offer classes, format split, retention, fatigue, with the
   hook text where the ad was built here. Then **trade winners** (08:50): for
   each trade, the cheapest-per-lead ads across every client in it, so a new
   plumber's brief starts from what worked for plumbers.
2. **Memory**: rows that survive the nightly rewrite. The CRM writes them
   itself when an ad is paused from a Kill verdict (hook, numbers, why), when a
   Scale verdict is kept ("Remember this winner"), and when ads are published
   (which hooks, when to judge them). The team adds anything else in the
   Memory panel on the client page, for one client or the whole agency.

When you ask the chat for ads for a heating client, it has the heating
winners, this client's own best and worst, what was paused and why, and what
is running now, before it writes a word.

## Habits that keep it clean

- Work from the board in the morning: Needs us first, then the longest
  client waits.
- Flip the toggles when things go live (Meta ads, GHL, GBP, LSA). They drive
  the pipeline, the sync, the reports and the dashboard.
- Keep the Page ID honest. The Meta card picks by evidence and leaves a blank
  rather than guessing; fill the blank from the client's own Page.
- When a client says an ad worked or flopped, put it in Memory in one line
  with the number. That line reaches the next brief.
- Anything outside the standard launch is a task on the board with a name
  on it.
