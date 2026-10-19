# The client's videos

Every video ad that has gone live on a client's ad account, on their own
link, to watch and to download and post on their own pages. It is the
"Your videos" tab of the client's one link (`/videos/<token>`, the same
token as their Live KPIs and Video scripts tabs), and the Live KPIs tab
carries the same download on every video ad's card.

## What a client sees

- **The tab.** `src/pages/ClientVideosPage.jsx`, on the same dark surface
  as the dashboard. One card per video ad, newest first: the clip playing
  in place, its whole name as it is in the ad account, "Published Oct 9"
  (the day the CRM created the ad) or "Live since Oct 9" (the first day an
  ad made in Ads Manager reported), and its length and shape when known.
- **Under each card, one of:** Download (our file, under the ad's name);
  Open the file (Meta's copy, in a new tab, saved from the player); Open in
  your Google Drive (a clip published from their folder); or a line saying
  the clip is older than Meta keeps and to reply to the Monday email.
- **At the top,** how many video ads have gone live and how many are files
  to download, then a note on getting a video onto a phone. With nothing
  live yet, a line pointing at the Video scripts tab.
- **On the Live KPIs tab,** a video ad's card and its full-size view carry
  "Download video" or "Open video file", and "All your videos" above the
  cards opens this tab.

The download is a real download, not a page that plays the clip: the
bucket is on another origin, so an anchor's `download` attribute alone is
ignored, and Supabase's `?download=<name>` sets the disposition server
side instead (`downloadUrl` in `src/lib/clientVideoStore.js`). A phone
puts the file in Files (iPhone) or Downloads (Android).

## Where the videos come from

`client_videos_load(p_token)` in `supabase/client-videos.sql`, token-gated
like `client_dashboard_load`: the token names the client, the function
runs as definer, and it returns the client's name and the list, nothing
else. Two kinds of row, told apart by `source`:

- **crm**: published through the CRM (`published_ads` rows with a
  `video_id`, or with no `size_key` from before `video_id` existed, since
  sizes belong to artboards). The clip itself is in the `client-files`
  bucket when the CRM uploaded it (`ad_videos`, joined on the Meta video
  id), so the row carries its `storage_path`, `file_name`, Meta's poster
  frame, and the length and size the CRM measured. A clip published from
  the client's Drive folder has a `drive:` path and no bucket object.
- **synced**: made straight in Ads Manager and known only from the nightly
  sync (`ad_daily` rows that reported video plays, not already in
  `published_ads`). No file of ours.

For every row with no file of ours, the page asks the `client-dashboard`
function for Meta's own copy (`action: 'videos'` with the ad ids, sixty at
a time). The function keeps the ids to the ones `client_videos_load` lists
for that token, so a request can name nothing that is not the client's
own, then fetches the creatives and the playable `source` the way the
dashboard does. The link is signed and expires; it is used at once and
never stored. Meta stops handing it over for old enough videos, which is
the "older than Meta keeps" line.

`client_link_name` learned the `videos` kind at the same time, so a link
pasted into a message shows "Your videos for <business>" with its own
card (`public/og-your-videos.png`, `netlify/lib/preview.js`).

## Files

- `supabase/client-videos.sql`: `client_videos_load`, and `client_link_name`
  with the `videos` kind (also updated in `script-studio.sql`). Applied
  live; re-run the file to apply again.
- `supabase/functions/client-dashboard/index.ts`: the `videos` action.
- `src/lib/clientVideos.js` (pure: the shaping, the way to get a clip, the
  download name, the words), `src/lib/clientVideoStore.js` (the calls and
  the bucket links), `src/pages/ClientVideosPage.jsx`.
- `src/pages/ClientDashboardPage.jsx`: `videoLink`, the card and lightbox
  links, "All your videos".
- `src/lib/clientPortal.js`, `src/components/PortalTabs.jsx` (the third
  tab and its icon; on a phone the icon sits over the label so three fit),
  `src/App.jsx` (both route lists), `src/lib/publicSite.js`,
  `src/components/HelpChat.jsx`, `netlify/lib/preview.js`,
  `netlify/edge-functions/client-preview.ts`, `netlify.toml`.
- `scripts/check-client-videos.mjs`, plus the portal, public-site and
  link-preview checks.
