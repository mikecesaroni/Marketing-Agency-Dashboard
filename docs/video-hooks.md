# Video hooks: the first three seconds

Added 2026-10-30, after "the hook is the most important part of all this, to grab attention in the first 5 seconds; do research for service business hooks and scripts and dial in the knowledge base for our system when I ask for scripts in chat", and "the season was wrong when I asked: it gave me summer when it is mid fall; make sure the system knows the time of year always and the location and seasonality for that business, like Texas only has a short time for heating compared to New York".

## Where the knowledge lives

- `VIDEO_HOOK_PLAYBOOK` in `supabase/functions/_shared/scriptStudio.js`: the rules, the twelve hook patterns with a home-services line each, and what kills a hook. One text, fed whole to every script writer: the chat's Refill and angle buttons (`src/lib/season.js`, `buildRefillPrompt`) and the client-facing Script Studio (`buildScriptBrief`). The Meta Ads Playbook (`src/lib/playbook.js`, in every client brief) still carries the static-ad hook formulas and the fear-versus-offer findings from the account data; this one is the owner-on-camera version.
- The season: `src/lib/season.js`. Each market kind has its own year (`SEASON_MONTHS`): hot markets (Florida, Texas, Arizona, the Gulf) have a five-month summer (May to September) and a two-month fall (October, November), so October 30 in West Palm Beach is "early fall", not "mid summer" as it read before. Cold and mixed markets follow the meteorological seasons. `climateYear()` says how long heating and cooling actually run ("the heating season is a handful of cold nights between December and February" for a hot market; "October into April" for a cold one), and the prompt tells the model to write to the date and the market: never a late-October "summer", never heating sold in Texas as if winter were long.
- Every script now has an INTRO line after the HOOK: the owner's name and the company in one breath, inside the first five seconds. The recording tips say the same.

## The rules, and why

| Rule | Source |
|---|---|
| The first line is the hook; no greeting, no company name first, no music before words | Meta's research: 47% of a video ad's value lands in the first 3 seconds, 74% by second 10; CapCut and Fluxnote hook guides: long intros, logo stings and slow greetings kill the hook |
| Name and company in the next breath, inside five seconds | Meta: brand and message inside the first 5 seconds makes the creative 1.7x likelier to land in the top fifth for purchase intent |
| A face to the lens from the first frame | TikTok's Symphony study: a person on screen in the first 2 seconds lifts hooking power about 1.5x |
| The hook has to read as text | 92% of mobile video is watched muted (Surefire Local); captions are burned in |
| Open on the viewer's town, season or symptom | Saas Hero's 2026 field-service video guide: speak to camera inside 3 seconds, open on a symptom the homeowner recognises |
| Hook rate is the score | 3-second views over impressions; under 30% the hook is the problem; the best accounts run 45 to 55% (2026 practitioner consensus) |
| Fear and symptom hooks belong on video, not stills | This agency's own account data, in `playbook.js` |

Sources read on 2026-10-30: [Social Media Today on Meta's Reels hook guidance](https://www.socialmediatoday.com/news/meta-shares-reels-tips-for-marketers/806808/), [Social Media Today on Meta's creative diversification tips](https://socialmediatoday.com/news/meta-shares-tips-on-reels-hooks-creative-diversification-in-ads-and-threa/808182), [True Future Media on short-form hooks](https://www.truefuturemedia.com/articles/science-of-short-form-video-hooks), [Saas Hero's field-service video guide](https://saashero.net/content/video-marketing-for-field-service/), [Surefire Local on silent viewing](https://www.surefirelocal.com/?p=57661), [CapCut on hook formulas](https://www.capcut.com/create/short-form-video-hooks), [Fluxnote's video ad hooks guide](https://fluxnote.io/guides/video-ad-hooks-guide), [Segwise on 2026 hook benchmarks](https://segwise.ai/blog/dtc-ad-creative-hooks.md), [Admapix's UGC script template](https://www.admapix.com/blog/best-practices/ugc-video-ad-script-template).

## Checks

`scripts/check-season.mjs` pins the season per market (late September in SWFL is late summer, October 30 is early fall, Rhode Island in late September is early fall), the climate line, and that every Refill prompt carries the hook playbook, the INTRO line and the owner's name. `scripts/check-script-studio.mjs` pins the Script Studio brief and the recording tips.
