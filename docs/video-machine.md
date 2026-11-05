# The video machine

The agency's week is a fresh video ad per client on Meta. This is how the
CRM is built around that, what it does on its own, and the research behind
the choices. Companion to `docs/video-copy.md` (transcripts and the three
versions) and `docs/content.md` (the Content tab).

## The week, end to end

0. **The editor drops the clip.** On the Content tab, "Drop a finished
   clip": pick the client, drop the file. It uploads, goes to Meta, and the
   client's row on the board turns purple: new clip dropped in, click to
   publish.
1. **Content tab.** The board under the three doors says who is 10+ days
   without a new ad, most behind first, with dropped clips at the very top. Click
   the client (or the purple "Click to publish", which lands with the clip
   ticked).
2. **The publish page opens** (`/publish/:client`, also reachable as Content → Publish → Video → client) with the launch strip across the top:
   Videos, Words, Where, Publish. Each says where it stands and jumps to its
   section.
3. **Drop the clips** onto the list (or Upload clips). Each one goes to the
   bucket, straight to Meta to transcode, and shows three dots that fill in
   on their own: Meta, Transcript, Copy.
4. **Tick a clip.** It is transcribed, then three versions of the copy are
   written from the transcript and the note, unasked. Pick one; the fields
   fill in and stay editable, and the ad is named
   `WC_Client · 2026-09-24 · angle`.
5. **Same place as last time?** If this client was launched from this
   browser before, one click restores the objective, button, form and the
   ad sets that took the ads. Otherwise pick ad sets, or build the funnel
   pair from inside the Campaign step.
6. **Publish** from the bar that stays at the bottom. Everything is created
   paused; switching on is a deliberate click in Ads Manager.

## What runs on its own

| Moment                         | What happens without a click                                   |
|--------------------------------|----------------------------------------------------------------|
| clip dropped (board or publish)| uploaded, registered with Meta, transcode started, board row turns purple |
| every two minutes              | any drop not yet in the client's ad account is sent; any clip Meta is still transcoding is checked and marked ready (`video-sweep`) |
| "click to publish"             | Publish opens with the clip ticked, ids and name filled in      |
| clip previewed                 | length and shape measured and saved for the clip checks         |
| clip ticked                    | transcribed (Deepgram, once, cached on the row)                 |
| transcript lands, copy blank   | three versions written (Claude, `ad-copy` mode `variations`)    |
| version picked                 | primary text, headline, description and ad name filled          |
| clip ticked with no name typed | named `WC_Client · day · file`                                  |
| publish succeeds               | destination remembered per client for "same place as last time" |
| publish succeeds               | `published_ads.video_id` recorded so the weekly board can count |

## Dropped clips reach Meta on their own (2026-11-05)

"Make clips dropped in the CRM by the editor auto send to Meta so they are
ready when we click publish, or if someone wants to do it manually."

The drop zone sends a clip to Meta from the editor's browser the moment it
lands, and that was all: a send that did not happen (the tab closed, the
call failed, no ad account that day) was never retried, and nothing asked
Meta whether it had finished, so a row stayed "processing" until somebody
opened the publish page and its picker polled. The board and Slack read
"not in Meta yet" for clips Meta was already transcoding.

Now the `video-sweep` function (`supabase/functions/video-sweep/index.ts`,
scheduled every two minutes by `supabase/video-sweep.sql`) does both:

- **Send.** Every CRM upload from the last 30 days with no registration in
  the client's current ad account is handed to Meta by URL, the same
  `/advideos` call the publish page makes. A drop for a client with no ad
  account yet goes the moment the account is connected. A send Meta refused
  is recorded on the row ("Meta would not take it: ...") and tried again six
  hours later; "Send to Meta" on the publish page retries it at once.
- **Poll.** Every clip still processing (or ready with no cover frame) is
  asked about, and the row gets Meta's answer: ready and the preferred
  thumbnail, or the error. The picker reads the same row.

Not sent: videos that only sit in the client's Drive folder (raw footage
lives there; a Drive clip goes to Meta when picked on the publish page), and
drops waved off as "published manually" (the account has the file already,
by hand).

Once a clip is in the account it is in Ads Manager's Media Library under
"<Client> — <file name>", so an ad can be built from it by hand there as well
as here. The board shows where each new clip is beside its download link
("✓ in Meta", "Meta is processing it…", "sending to Meta…", "Meta could not
process it"), and the Slack alert and the morning brief say the same
("Paradise Clips 5-1.mp4 from Kyle · in Meta, ready to publish"). The alert
gives a clip ten minutes to get there before posting, so the one line it
gets says where it is, not where it was. Pinned by
`scripts/check-video-sweep.mjs`, `scripts/check-video-launch.mjs` and
`scripts/check-team-brief.mjs`.

## Clip checks

Under each clip, from what the browser measured and whether speech was found.
Notes, never a gate:

- **Shape.** 9:16 fills Reels and Stories, which is where video delivery
  goes. 4:5 and 1:1 are fine in feed. Landscape plays small with bars on
  every phone placement. Under 720 on the short side is flagged.
- **Length.** Under 5 seconds has no room for a hook and an offer. 10 to 30
  is the sweet spot. Over 60 is past what Reels runs in full and past what a
  cold viewer sits through.
- **Words.** No speech found means no captions can be made, and most feed
  video plays on mute, so the offer has to be on screen as text.

## Research the design leans on

- Meta's unified 9:16 safe zone: keep text and logos out of the top 14%,
  bottom 35% and 6% on each side so nothing sits under the UI on Reels and
  Stories. (Meta creative guidance, summarised at
  https://www.adnabu.com/blog/facebook-video-ad-specs)
- The first three seconds decide the view: ad buyers report a hook rate
  (3-second plays over impressions) above 30% as the bar for a clip worth
  scaling. (https://www.motionapp.com/blog/hook-rate)
- Around 85% of feed video is watched with the sound off, so captions and
  on-screen text carry the message. (Digiday / Facebook data, widely cited,
  e.g. https://www.stackmatix.com/blog/facebook-video-ad-best-practices)
- Advantage+ campaigns are built for creative volume: Meta's own guidance
  is eight to twelve varied assets in rotation, refreshed as they fatigue.
  (https://www.facebook.com/business/help/advantage-plus-shopping-campaigns)
- A steady testing split, roughly 60% budget on proven creative and 40% on
  new, keeps learning going without starving what works.
  (https://bir.ch/blog/facebook-ad-creative-testing)
- Strict naming conventions are the difference between a readable Ads
  Manager and a pile: prefix, client, date, angle, in that order.
  (https://www.adlibrary.io/blog/facebook-ads-naming-convention)
- Bulk launch tools (AdManage.ai, Motion, Foreplay) all converge on the
  same shape this screen now has: drop many clips, write copy per clip,
  fan out into several ad sets in one go.

## Rules and checks

`src/lib/videoLaunch.js` holds the rules (`videoDrops`, `clipChecks`,
`videoAdName`, `launchSnapshot`, `launchSteps`); `scripts/check-video-launch.mjs`
pins them. Schema in `supabase/video-launch.sql`.
