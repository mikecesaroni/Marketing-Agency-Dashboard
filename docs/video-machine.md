# The video machine

The agency's week is a fresh video ad per client on Meta. This is how the
CRM is built around that, what it does on its own, and the research behind
the choices. Companion to `docs/video-copy.md` (transcripts and the three
versions) and `docs/content.md` (the Content tab).

## The week, end to end

1. **Content tab.** The board under the three doors says who needs a video
   this week, most behind first. Click the client.
2. **Publish opens** on their page with the launch strip across the top:
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
| clip dropped                   | uploaded, registered with Meta, transcode started               |
| clip previewed                 | length and shape measured and saved for the clip checks         |
| clip ticked                    | transcribed (Deepgram, once, cached on the row)                 |
| transcript lands, copy blank   | three versions written (Claude, `ad-copy` mode `variations`)    |
| version picked                 | primary text, headline, description and ad name filled          |
| clip ticked with no name typed | named `WC_Client · day · file`                                  |
| publish succeeds               | destination remembered per client for "same place as last time" |
| publish succeeds               | `published_ads.video_id` recorded so the weekly board can count |

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
