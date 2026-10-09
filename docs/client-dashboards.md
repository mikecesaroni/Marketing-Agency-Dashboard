# Client dashboards

Every client has one private link, `/dashboard/<token>`, that shows every
number we have for them with the reason it matters one click away. It is
the same dark surface as the agency's Reports page, cut down to what an
owner needs, with no login and no agency chrome.

## What a client sees

- **The headline**: leads, ad spend and cost per lead for the last 7, 30
  or 90 days against the same length of time before, and leads and spend
  split by channel.
- **The numbers**: six tiles (spend, leads, cost per lead, impressions,
  clicks, click rate). Clicking one opens four short paragraphs: what it
  is, why it matters, what good looks like, what we do with it.
- **By day**: leads or spend per day, Meta and Google stacked.
- **By channel**: a card each for Meta, Google and LSA (when logged).
- **Your ads**: every ad that ran in the range as a card: the picture, or
  the video's opening frame with a play button; a verdict against the
  client's own average cost per lead (Working, Fair, Costly, No leads yet,
  Too early); leads, spend, cost per lead and click rate. Tapping a card
  opens the picture full size or plays the video. Pictures and videos come
  from Meta at the moment the page opens, through the `client-dashboard`
  function, and are never stored, because Meta's links expire. Google
  Search ads are words, so they show no picture.
- **The number that matters most**: dollars back per dollar spent, from
  the weeks the client answered the weekly report, with a table of those
  weeks. Before any answer: the argument for return over cost per lead,
  with a worked example from their average job value, and the link to the
  newest weekly report's form.
- **A glossary** of every term, each one click to open.

The copy lives in `src/lib/clientDashboard.js` (`METRIC_GUIDE`) and is
fixed text: short sentences, everyday words, no hype, no em dashes.

## Where the link lives

- Reports page, "Client dashboards": one card per client with Open, Copy
  link and New link. New link replaces the token, so the old link stops
  working.
- The client page header: "Client dashboard".
- The bottom of every weekly report email, and the top of the report's web
  copy.

## How it is wired

`supabase/client-dashboard.sql` adds `clients.dashboard_token` (every
client gets one by default) and `client_dashboard_load(token)`, a security
definer function that returns everything the page needs in one JSON:
180 days of daily Meta and Google totals (90 days plus the 90 before, for
the comparison), one row per ad per window (7, 30, 90 days), the weekly
reports with the client's answers, and the LSA weeks. The anon key can
call that function and nothing else; the page never reads a table.

The page is `src/pages/ClientDashboardPage.jsx`; the Reports panel is
`src/components/ClientDashboardsPanel.jsx`; the maths and the words are in
`src/lib/clientDashboard.js`, checked by `scripts/check-client-dashboard.mjs`.
