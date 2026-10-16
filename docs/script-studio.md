# The Video Script Studio (the client's page)

Written 2026-10-16. A separate page for clients, tied to the CRM: they open a private link on their phone and get video scripts to read into the camera, written from their intake, their website, what is working in their ads, the season, and how they talk. Built for owners who are not computer people: three ready picks at the top, one tap writes a script, big type to read it off the screen, a teleprompter, and one-tap rewrites when it does not sound like them. No login, nothing to install.

The link is `/scripts/<token>`, on the same private token as their dashboard (`clients.dashboard_token`), so a client has one link family and the dashboard and the scripts page point at each other ("Film this week's video" on the dashboard, "Your numbers" on the scripts page).

## The questions this answers, and how

**How does a client get in without a password?** The same way they get their dashboard: a private link. The CRM's client page has a card with the link and Copy; send it by text. The dashboard has a button to it. A bad or old link is a plain "This link did not open".

**What do they see first?** "Hi Ethan. Here is what to film this week." and three picks: the season's lead hook (from the season playbook for their trade and market), "more of what is working" (the ad that brought the most leads, by its hook), and proof (their review numbers), with "meet the owner" and a tip as fallbacks. Each says why it, this week. Picks move on: a topic written in the last seven days is not offered again.

**What if they want something else?** "Or make your own": ten topics as big chips (this month's offer, a problem I fix every week, meet the owner, a happy customer, before and after, a quick tip, a question I always get, when it breaks, tune-up or plan, why we cost what we cost), three lengths (15, 30, 60 seconds), and behind "More choices" who is on camera (just me, me and a tech, my voice over clips), where (truck, job, shop, customer's home) and tone (straight talk, friendly neighbour, a little funny). An optional box for "anything to add". Two taps is enough.

**What does a script look like?** The hook first, marked "first three seconds". Four to eight spoken lines, each one breath, in big type, with "Show:" under each for what the camera sees. Then the words to put on the screen, "Film it" (where to stand, what to show), and the caption to post with it. "About 30 seconds to say" is counted from the words at 2.5 a second.

**How do they read it while filming?** The teleprompter: the spoken lines huge, white on black, scrolling at reading pace; tap to start and stop, Slower and Faster, bigger and smaller text. For a phone propped next to the one filming, or a laptop behind it. Also "Read it to me" (the phone reads it aloud so they hear the rhythm), Copy, Share or "Text it to me", and Print.

**What if it does not sound like them?** One-tap changes under every script: Shorter, Punchier, More casual, More like how I talk, Different angle, Lead with the offer, or type what to change ("mention we are open Saturdays"). Each makes a new version; the old one stays in the list.

**How does it know what works?** The function reads the client's `ad_daily` for the last 90 days and turns it into plain lines ("Your 'Furnace tune-up' ad brought 10 leads in the last 90 days, about $30 each"), plus the jobs they reported booked on the weekly reports. Those lines are on the page ("What is working for you") and in the brief, and the hooks already used in their ads and saved ads are listed as ones not to open with.

**How does it sound like them?** Two ways. "How I talk" is a short sheet: what people call them, "I" or "we", straight talk / friendly / funny, words they never say, how they sign off, anything else. And the transcripts of videos they have already made (`ad_videos.transcript`, from the publish screen) go into the brief as "how they actually sound".

**What happens after they film?** "I filmed this" marks the script filmed (the CRM card shows it). "Filmed it? Send it to us" has their Drive folder when one is linked, else the words to text or email it the usual way. Save for later and Not for me keep the list honest.

**Is it safe?** The page talks only to the `script-studio` Edge Function. The token names the client; every read is by that client's id; a script id has to belong to that client. The brief is built on the server from the CRM, so the browser never holds the Anthropic key or a prompt it could bend. Fields a client should not see stay out of the brief: budgets, fees, call notes, complaints about past marketers. Forty scripts a day per link.

**Why not build it into the dashboard?** Different job, different mood. The dashboard is numbers; this is "what do I say". One link family, two pages.

## Where the code is

- `supabase/functions/_shared/scriptStudio.js`: the pure half, shared by the function, the browser and the check: the menus (`TOPICS`, `LENGTHS`, `SPEAKERS`, `SETTINGS`, `TONES`, `CHANGES`), `workingLines` and `aggregateAds`, `ideasFor` (the three picks), `buildScriptBrief` (the system prompt), `scriptAsk` and `reviseAsk`, `parseScript`, `scriptToText`, `secondsFor`. Tested by `scripts/check-script-studio.mjs`.
- `supabase/functions/script-studio/index.ts`: the function. `load` (the client, the voice, what is working, the scripts, the Drive link), `write`, `revise`, `status`, `voice`. Claude Opus 5 with adaptive thinking, streamed, the brief cached. Needs `ANTHROPIC_API_KEY`. Deployed with the `_shared` folder beside it.
- `supabase/script-studio.sql`: `video_scripts` (ask, script, status, parent_id), `clients.voice_profile`, and `client_link_name` learning the `scripts` kind for link previews. Already applied.
- `src/pages/ScriptStudioPage.jsx`, `src/components/scripts/ScriptView.jsx`, `Teleprompter.jsx`, `VoiceSheet.jsx`: the page. `src/lib/scriptStudioStore.js`: the calls, `scriptsLink`, `topicsUsedRecently`, `fetchClientScripts`. The season playbook is computed in the browser (`src/lib/seasonPlaybook.js`) and sent with each ask.
- `src/components/ScriptStudioCard.jsx` on the client page: the link, the scripts with their statuses, how they say they talk.
- `src/App.jsx` (both route lists), `src/lib/publicSite.js` (`/scripts/` is a client page), `netlify/lib/preview.js` and `netlify/edge-functions/client-preview.ts` (the link preview, `public/og-video-scripts.png`).

## Still to do

- The weekly report email could carry the scripts link next to the dashboard link.
- An "Ask for a video" nudge from the CRM (a text with the link and the pick of the week) once the SMS side exists.
