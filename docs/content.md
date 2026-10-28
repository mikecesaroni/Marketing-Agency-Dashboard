# Content

The creative side of the CRM, in the sidebar as **Content**. Three doors:

| Door         | What it opens                                                                  |
|--------------|--------------------------------------------------------------------------------|
| Ad Studio    | a client list; pick one and the Studio opens on their page (`?open=studio`)     |
| Google Drive | every client's linked folders: open in Drive, browse, download, link a folder   |
| Publish      | Video, Image or Build a funnel first. Video: pick a client and land on `/publish/:id`, a page of its own with only the video flow. Image: the client's Studio opens on its Publish tab (`?open=publish`). Funnel: its own builder page, `/funnel/:id` (the same builder also sits on the client page) |

The Studio and Publish already live on each client's page. This tab is the
way in that starts from the job rather than the client: "I am publishing this
afternoon, who has creative ready?" Each door shows the same clients, most
recent creative work first (newest saved ad, published ad or uploaded video),
with the numbers that matter on the card: saved ads, videos, live ads, when
they were last published. Archived clients are left out; internal businesses
stay and are marked.

## Google Drive

One row per client. A button per linked folder opens it in Drive in a new tab,
which is where downloading, uploading and sharing happen. "Browse files" shows
the read-only browser the client page has (live from Drive, click a file to
open it there). "Link a folder" takes a folder link or ID; the folder has to
be shared with the CRM's service account first, and a shared drive needs a
Manager to add it.

## Rules and checks

`src/lib/contentHub.js` decides who shows, the order and the numbers;
`scripts/check-content-hub.mjs` pins it.

## This week's video drops

Under the three doors, and again at the top of the Publish door: one row per
client with a Meta ad account, most behind first. A client with no new ad of
any kind (video or static) for **10 days or more** is flagged red, oldest
first; one who has never had an ad is **no ad yet**; one with an ad in the
last 10 days is **fresh**. Each row says how many days since the last ad and
its name, and opens the publish page. Only a clip that was dropped in and not
yet published counts as new; clips that already ran are not mentioned. The Publish door counts how many clients are at 10+ days.
"Last ad" means the newest of what the CRM published and what the nightly
Meta sync reports (`client_newest_ad`), so an account run from Ads Manager
counts too.

**The editor's drop zone** sits at the top of the board: pick the client,
type a note if there is one ("post these a day apart", "the 1:1 is for Meta
only"; Kyle asked for it after two Active Air clips went out together that
were meant to run a day apart), drop the finished .mp4 or .mov. It goes to
the bucket and on to Meta to transcode, and the client's row turns purple:
"New clip dropped in · tuneup.mp4 · dropped 2h ago by Sam · Click to
publish". The note (`client_files.drop_note`) goes everywhere the clip is
mentioned: under the row on the board (with a "note" button to add or change
it after the fact), beside the clip on the publish screen, in the Slack
alert, in the morning brief and in the Client tiers flag. That click opens
Publish on the client page with the clip already ticked (`?open=publish&video=`),
so the transcript and the three versions of copy start on their own. A clip
counts as waiting until a published ad carries its Meta video id, for 30
days, or until somebody clicks "published manually ×" on the row (for a clip published
by hand in Ads Manager, a duplicate, a test). Only clips uploaded into the
CRM count; a video a client adds to their Google Drive folder is raw footage,
not a drop, and never flags. "Click to publish" ticks every new clip on the
row and nothing else. Beside it, a **Download** link per new clip (two clips,
two links, each under its own file name) hands over the finished file
itself, for a client's own posting, a second cut or an archive; the link
goes through the bucket's download disposition, so the browser saves the
file instead of playing it. The same links appear under the drop zone the
moment a clip lands. The name comes from the "You:"
the CRM keeps for tasks (asked once, kept in that browser) and is shown on
the box as "Signed as Kyle · Not you?", because in October 2026 Kyle (the
editor) typed the clip's name into the one-time prompt and a month of drops
then read "from Active Air 2 - 19/18" on the board and in Slack. Since then
a signature is printed only when it reads as a person's name (letters,
spaces, apostrophes, dots, hyphens; a digit or a slash is a clip label), the
box asks again when the saved name does not, and that one slip is known to
be Kyle (`personName` in `src/lib/videoLaunch.js`), so his browser repairs
itself the next time the Content page opens. "clear
new-clip flags" under the board starts fresh: everything already in the CRM
stops counting as new (`app_settings.video_drops_reset_at`).

The rules are in `src/lib/videoLaunch.js` (`videoDrops`, `dropState`, `waitingClips`) and
pinned by `scripts/check-video-launch.mjs`. See `docs/video-machine.md` for
the publish screen itself.
