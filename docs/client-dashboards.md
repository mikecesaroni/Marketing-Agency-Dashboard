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
  opens the picture full size or plays the video. A video ad's card and
  its full-size view carry "Download video" (the clip from the bucket,
  under the ad's name, when the CRM published it) or "Open video file"
  (Meta's copy); "All your videos" above the cards opens the videos tab
  (`docs/client-videos.md`). Pictures and videos come
  from Meta at the moment the page opens, through the `client-dashboard`
  function, and are never stored, because Meta's links expire. Google
  Search ads are words, so they show no picture. Since 2026-11-06 ("add in
  the landing page the ads are using in the KPI dash if the ads are landing
  page ads") a landing page ad's card and its full-size view carry "Goes to
  belknapheating.com/fall-tune-up ↗", the page the ad sends people to, as
  a link in a new tab: read off the creative with the picture (a link ad's
  link, the button on a video ad, a dynamic creative's link_urls), shown as
  host and path with no tracking query (`landingLabel` in
  `src/lib/clientDashboard.js`). An instant-form ad has no page and says
  "Form opens inside Facebook, no landing page"; a Google Search ad says
  nothing. Facebook-internal links (a Message button) are not a landing
  page and are left out.
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

## The address on the links (2026-11-07)

"Can we change the URL of this CRM when we send out links." Yes, from the
Reports page: under **Client dashboards**, the line **Links go out on**
shows the address every client link starts with (this site's own until one
is saved) and **Use our own domain** takes a domain (clients.yourdomain.com,
however it is typed: https:// is added, the host lowercased, nothing after
it kept) and saves it to `app_settings.public_app_url`. From then on every
link the CRM makes for a client, the dashboard, the weekly report, an ad
approval, the onboarding form, the video scripts and the videos tab, and the
links in the weekly report emails (the `weekly-report` function reads the
same row, then its `APP_URL` secret, then the site) carry that address.
Links already sent keep working on the old one. Clearing the box puts the
links back on the site's own address.

The one thing the box cannot do is make the domain answer: it has to be
added to the site in Netlify (Domain management) with its DNS pointed where
Netlify says. Once the padlock shows, the CRM loads on the new address too
(it is the same site), and the link address can be saved. To make the new
domain serve only the client pages, put its host into the edge rules in
`netlify.toml` and `VITE_PUBLIC_HOST` (the wall below).

`cleanPublicUrl`, `publicBase` and the cache behind `publicLink` are in
`src/lib/publicSite.js` (pinned by `scripts/check-public-site.mjs`); the
reads and writes in `src/lib/publicSiteStore.js`; the CRM reads the setting
once when it opens (`src/App.jsx`).

## Keeping clients out of the CRM

The dashboard page itself has no way in: no agency nav, no link to any
CRM page, and it reads only through token-gated database functions. The
risk is the address. While sign-in is off, anyone who learns the CRM's
address can open it, and a link on the same address hands a client that
address. Two walls, both in the code and ready to switch on:

1. **A client-facing site.** Deploy the same build a second time (a second
   Netlify site from the same branch, or a second domain on this one) with
   `VITE_PUBLIC_ONLY=true`, or with its host named in `VITE_PUBLIC_HOST`.
   That deployment serves only the seven kinds of client page (dashboard,
   report, approval, onboarding, video scripts, videos, billing); every
   other address is "Nothing here".
   The commented rules in `netlify.toml` make Netlify refuse at the edge as
   well, before any JavaScript runs.
2. **Links that never carry the CRM's address.** Set `VITE_PUBLIC_APP_URL`
   on the CRM site to the client-facing address and every link the CRM
   makes for a client (dashboard, report, approval, onboarding) points
   there. Set the weekly-report function's `APP_URL` secret to the same so
   emails do too.

Until the client-facing site exists, client links use the CRM's address.
The CRM itself asks for a sign-in (`LOGIN_REQUIRED` in `src/lib/access.js`,
with `supabase/logins-on.sql` as its database half; see `docs/logins.md`),
and the client pages themselves never ask for one.

3. **A client's tab never sees the sign-in form** (since 2026-11-04: "make
   sure there's no way they can get inside our main CRM from these links,
   or even get prompted to log in"). The moment a client page opens, that
   browser tab is marked a client's (`sessionStorage`, so per tab). From
   then on every CRM address typed into it, the root, `/clients`, `/login`
   itself, shows "Nothing here" instead of the login page, so a client who
   edits their link learns nothing about what else exists. A signed-in
   teammate is never affected: the session wins. A teammate who is not
   signed in and opened a client link in a tab signs in from a fresh tab.
   A client who closes the tab and later types the CRM's address by hand
   meets the login page like any stranger, which says nothing about the
   link. `src/lib/publicSite.js` (`markClientVisitor`, `isClientVisitor`),
   `src/components/RequireAuth.jsx`, the `/login` route in `src/App.jsx`.

`scripts/check-public-site.mjs` checks the walls: the public pages import
no CRM shell and link to no CRM page, the router has the client-facing
mode, the auth gate and the login address are dead ends in a client's tab,
every client link goes through the public base, and search engines are
told to stay out.

## On a phone

Most clients open their link on a phone, so both client pages (the numbers
and the video scripts) are checked at four phone sizes, 360 to 412 pixels
wide: nothing scrolls sideways, nothing is clipped, every button is at
least 40 pixels tall, no type is under 11 pixels, and the teleprompter's
buttons fit on the screen. The pieces that needed changing for that: the
weeks table under "The number that matters most" is a list of cards on a
phone (six columns do not fit) and a table from a tablet up; the time-range
and chart toggles, the "Tell us" link, the lightbox Close and the small
text buttons on the scripts page are all at least 40 pixels tall; the tab
labels never wrap.

What a phone downloads matters as much. The client pages are in the first
file, so a link opens in one trip; every CRM page and the help chat are
separate files that load on first visit (`React.lazy` in `src/App.jsx`),
so a client's phone never downloads the agency's screens. Built files
carry a hash in their name and `public/_headers` tells Netlify to cache
them for a year; a tab left open across a deploy reloads itself once if a
file has gone (`vite:preloadError` in `src/main.jsx`). Before the split
the one file was about 1.9 MB; the client pages now fetch about 0.7 MB
before compression.

## Saving it to the home screen (2026-11-04)

A client who saved their dashboard to their phone got the CRM login
("are you able to send the password? it only shows up on a web link but
I wanna save it to my phone"). No client has a password; the icon was
pointing at the wrong door. The site declares a web app manifest for the
CRM (`public/manifest.webmanifest`) whose start page is `/`, and a home
screen icon opens the manifest's start page, not the page it was saved
from. Now a client page is served from its own shell, `client.html`,
which has no manifest at all: `netlify.toml` routes the six client paths
to it at the edge, before any script runs, so no phone ever sees the
CRM's manifest on a client page (the first fix took the manifest off with
script after the page loaded; a phone that had already read it still
opened the login: "I just tried again and it's the same issue"). The
page's script also names the icon for the page ("KPI Dashboard", "Weekly
Report", "Video Scripts"...) and takes the manifest off should the shell
ever carry one (`src/lib/homeScreen.js`, `scripts/check-home-screen.mjs`).
So "Add to Home Screen" saves the page's own address on iPhone and
Android alike, and still opens full screen on iPhone. A client who saved
the icon before this deletes it and adds it again from their link.

## What a message app shows for the link

A dashboard link pasted into iMessage, WhatsApp, Slack or an email
previews as "KPI Dashboard for <business name>", a one-line description
and a dark card image; a report link as "Weekly ads report for <business
name>". A message app fetches the page without running JavaScript, so the
app's one HTML file would otherwise show the CRM's title. A Netlify edge
function (`netlify/edge-functions/client-preview.ts`, words and rewrite in
`netlify/lib/preview.js`) runs in front of `/dashboard/*` and `/report/*`, looks the
token up through `client_link_name` (returns the business name and
nothing else) and rewrites the head. Anything else, and any error, passes
through untouched. The card images are `public/og-kpi-dashboard.png` and
`public/og-weekly-report.png`. Checked by `scripts/check-link-preview.mjs`.

Message apps cache previews, so a link that was shared before this went
live keeps its old preview in that thread; a fresh paste gets the new one.

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
