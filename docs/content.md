# Content

The creative side of the CRM, in the sidebar as **Content**. Three doors:

| Door         | What it opens                                                                  |
|--------------|--------------------------------------------------------------------------------|
| Ad Studio    | a client list; pick one and the Studio opens on their page (`?open=studio`)     |
| Google Drive | every client's linked folders: open in Drive, browse, download, link a folder   |
| Publish      | Video or Image first. Video: pick a client and land on `/publish/:id`, a page of its own with only the video flow. Image: the client's Studio opens on its Publish tab (`?open=publish`) |

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
client with a Meta ad account, most behind first. A video ad published in the
last seven days is **done**; none for more than a week is **due**; more than
two weeks is **overdue**; a client who has never had one is **no video yet**.
Each row says when the last video ad went out, its name, and how many clips
are already sent to Meta and ready, and opens Publish on that client's page.
The Publish door counts how many clients need one this week.

**The editor's drop zone** sits at the top of the board: pick the client,
drop the finished .mp4 or .mov. It goes to the bucket and on to Meta to
transcode, and the client's row turns purple: "New clip dropped in ·
tuneup.mp4 · dropped 2h ago by Sam · Click to publish". That click opens
Publish on the client page with the clip already ticked (`?open=publish&video=`),
so the transcript and the three versions of copy start on their own. A clip
counts as waiting until a published ad carries its Meta video id, for 30
days. The name comes from the "You:" the CRM keeps for tasks.

The rules are in `src/lib/videoLaunch.js` (`videoDrops`, `dropState`, `waitingClips`) and
pinned by `scripts/check-video-launch.mjs`. See `docs/video-machine.md` for
the publish screen itself.
