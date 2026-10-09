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

## Keeping clients out of the CRM

The dashboard page itself has no way in: no agency nav, no link to any
CRM page, and it reads only through token-gated database functions. The
risk is the address. While sign-in is off, anyone who learns the CRM's
address can open it, and a link on the same address hands a client that
address. Two walls, both in the code and ready to switch on:

1. **A client-facing site.** Deploy the same build a second time (a second
   Netlify site from the same branch, or a second domain on this one) with
   `VITE_PUBLIC_ONLY=true`, or with its host named in `VITE_PUBLIC_HOST`.
   That deployment serves only the four kinds of client page (dashboard,
   report, approval, onboarding); every other address is "Nothing here".
   The commented rules in `netlify.toml` make Netlify refuse at the edge as
   well, before any JavaScript runs.
2. **Links that never carry the CRM's address.** Set `VITE_PUBLIC_APP_URL`
   on the CRM site to the client-facing address and every link the CRM
   makes for a client (dashboard, report, approval, onboarding) points
   there. Set the weekly-report function's `APP_URL` secret to the same so
   emails do too.

Until the client-facing site exists, client links use the CRM's address.
The real fix for the CRM itself is sign-in: `LOGIN_REQUIRED` in
`src/lib/access.js`, plus dropping the `anon_open_while_login_off` policies
(the statement is in that migration's header). `scripts/check-public-site.mjs`
checks the walls: the public pages import no CRM shell and link to no CRM
page, the router has the client-facing mode, every client link goes
through the public base, and search engines are told to stay out.

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
