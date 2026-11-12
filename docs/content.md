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

## Dropped videos (titled "This week's video drops" until 2026-11-12)

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
days, or until somebody clicks "Clear" on the row (it read "published
manually ×" until 2026-11-12), which also
counts as an ad published by hand that day for the ten-day promise, until
the Meta sync sees the real one (so click it only when the clip really went
out; it is for a clip published
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

## Dropped statics (2026-11-12)

"Make a separate box to drop in static images that our editor is making for
clients. Make it so we can publish with a click like the video ones in
content page." Its own box beside the video board, the two side by side and
as deep as each other on a wide screen (stacked on a narrow one), on the hub
and again at the top of the Publish door: **Dropped statics**,
`src/components/StaticDropBoard.jsx`.
Pick the client, type a note if there is one, drop the finished .png or .jpg
files; the client's row appears underneath: "New static dropped in · tuneup ·
dropped 2h ago by Kyle", with a thumbnail per size (each a download), a note
button, Clear, and "Click to publish →", which opens the publish page with
the static already ticked (`/publish/:id?static=<stamp>`), its words written
on the way. The board lists only clients with a static waiting: statics carry
no weekly promise, so nobody is "behind" here.

**How it works without new publishing code.** A dropped static is stored the
way a Studio-saved ad is: the files under `ads/<client>/<stamp>-<size>.<ext>`
and one `saved_ads` row per stamp carrying the ad's name (the file's stem)
and who dropped it (`dropped_by`). The publish page already lists every
saved set, ticks the stamps in the URL and writes feed copy for a ticked set
with none; meta-publish already uploads each size and maps it to its
placements; the gallery and the approval link already show it (the gallery
reads "dropped in by Kyle" where the Edit button would be, since there is
no Studio recipe to reopen). Which file is which size is decided by the two
boxes (see "Two boxes, two sizes" below; the first version read it from the
file name and the pixels, and grouped by name), and the files of one ad
land as one set, which publishes as one ad with each size on its
placements. The editor's format is kept (.jpg stays .jpg), so
`fetchSavedAds` reads any of png, jpg, webp as a size. `client_files.drop_kind
= 'static'` is what tells a drop from the Studio's own saves. A static is
waiting until a published ad carries its stamp, for 30 days, after the same
"start fresh" moment the clips use, or until Clear.

The rules are in `src/lib/staticDrops.js` (`planStaticDrop`, `sizeKeyFor`,
`staticSets`, `waitingStatics`, `staticDrops`), pinned by
`scripts/check-static-drops.mjs`; the uploads in `src/lib/staticDropStore.js`;
the columns in `supabase/static-drops.sql`. A dropped static reaches the
channel the way a clip does ("send CRM message when new statics are
dropped"): the alerts run posts "New static dropped in: tuneup (2 sizes)
from Kyle · ready to publish · “run it Friday”" within the quarter hour, once
per drop (keyed by stamp in `team_alerts`), and the morning brief lists it
under To publish beside the clips until it is published or cleared
(`statusRows.js` reads the dropped files and `waitingStatics` per client;
`teamBrief.js` `staticLabel`, `alertKeys`).

### Two boxes, two sizes (2026-11-12, later the same day)

"Our editor is making these two sizes for each static ad, 1080x1350 and
1080x1920. Can we make a thing somehow where he can drop both sizes in the
static box. Maybe have 2 boxes labeled with the size. And then configure it
so when I click publish it allocates the correct sizes to the correct
places on fb and ig like how ads studio was doing."

The drop box is now two boxes side by side, each labelled with its size and
where that size serves: **1080 × 1350 (4:5) → Facebook and Instagram
feeds, and anywhere else** and **1080 × 1920 (9:16) → Stories and Reels on
Facebook and Instagram**. Pick the client, drop (or choose) the file in each
box, name the ad if the file name is not it, Drop in. The two files land
under ONE stamp as one saved-ad set (feed and story), so they are one ad on
the publish page and one ad in Meta, whatever the files were called; the
file name no longer decides anything. Drop both at once anywhere in the box
and they sort themselves by their pixels. The pixels are read for every
file: the right size in the right box reads "✓ 1080 × 1350"; a near miss
reads "close enough to 4:5"; a 9:16 dropped in the 4:5 box is moved to the
9:16 box and the line says so; a 1:1 or a landscape stays where it was
dropped with "⚠ not 4:5; Meta will crop it for the feeds". A second 4:5 in
the same drop is refused (one ad at a time). One box filled and the other
empty still drops in, with "No 1080 × 1920 (9:16): Meta will crop the 4:5
for Stories and Reels. Add it to be sure." Rules: `SLOTS`, `slotFit`,
`assignSlots`, `staticAdName`, `staticAdPlan`, `slotsMissing` in
`src/lib/staticDrops.js`; upload: `uploadStaticAd` in `staticDropStore.js`.

**The publish side, and what it fixed.** meta-publish's placement rules
already sent the 9:16 to Stories and Reels and the 4:5 everywhere else as
one ad. But the three-of-each text options (written for every static on
their own since the morning) put the creative through Meta's other shape,
`optimization_type: DEGREES_OF_FREEDOM`, which carries one image, so a
static with text options was going out as its 4:5 everywhere and the 9:16
was thrown away. Meta's own developer pages are unreachable from the build
sandbox, so the answer came from the account: `ad_copy raw:true` on Horizon
HVAC found five ads built in Ads Manager with BOTH, and their shape is
`optimization_type: PLACEMENT`, a rule per placement group with image, body
and title labels, and every one of the six bodies and three titles carrying
the labels of every rule. meta-publish now builds that: an image with two or
three sizes keeps its rules and carries the lists, each body labelled
`body`, each title `title`, each description `desc`, so one label per rule
picks the whole list. A video, or an image with one size, still goes the
DEGREES_OF_FREEDOM way. Verified with Meta's `validate_only` dry run on
Horizon's account (a link ad and an instant-form ad) before the first real
publish. The publish page's row reads "one ad, 2 sizes: 4:5 to the feeds ·
9:16 to Stories and Reels", the sizes note under the list says the same, and
the result reads "mixed, on every size of the ad, each size on its own
placements". See docs/video-copy.md.
