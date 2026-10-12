# AI video ads for clients: research and a recommended pilot

Written 2026-10-12. Question: can we generate high quality AI video ads for clients so they do not have to hand us three videos a week, using the footage we already have so the AI knows their look and sound, and can Higgsfield plug into the client chats? What are agencies doing with Higgsfield on Meta, does Meta push AI ads less, and what works?

Nothing in this document is built yet. It is research plus a recommended design.

## Short answer

1. Yes, it can be wired into the CRM. Higgsfield has a hosted MCP (April 30, 2026) and a public pay-per-generation API (September 2026). The CRM already holds the pieces around it: scripts per client in the chat, client photos and videos from Drive, the approval link, and meta-publish.
2. "Learn their look and sound from existing videos" is three narrow things, not one magic model: the owner's face (Soul ID or a HeyGen style twin from frames of existing clips), the owner's voice (a voice clone from one to three minutes of clean audio, with a consent step), and re-lip-syncing existing footage with a new audio track. Brand voice in the words comes from the context we already feed the chat (intake, past winners, offers), not from the video model.
3. Meta does not say it throttles AI creative, and it sells its own AI creative tools, so there is no reach penalty to design around. What there is: an automatic "AI info" label (visible on photoreal synthetic people) and a real audience penalty when an AI presenter is obvious or undisclosed. Agency numbers put AI voiceover over real footage at parity, avatar UGC 10 to 20 percent behind, and full text-to-video 30 to 50 percent behind on direct response.
4. Our own data says the owner on camera is the asset. Average watch time is 5.7 seconds and one in ten viewers reach 15 seconds, so the first three seconds and the owner's face and voice carry the ad. Everything after that is B-roll, which AI can supply today.
5. Recommended design: one short real recording per owner per month, then AI does the rest (new script, cloned voice, lip-sync redub of the owner's own footage, AI B-roll from their trucks and jobs, captions), through the existing approval link. No synthetic customers ever (FTC rule). Pilot on the two clients with the most video.

## The questions I set and what I learned

### 1. Can the AI "fully understand their look and sound" from the videos we already have?

Partly. Current tools do three separate jobs:

- Face and identity. Higgsfield Soul ID trains a consistent character from 20 to 80 photos in 3 to 10 minutes; frames pulled from existing videos count as photos. HeyGen Avatar V builds a digital twin from roughly a 15 second clip, Tavus from about two minutes of footage. These produce a synthetic owner who can say anything typed in.
- Voice. ElevenLabs instant clone works from about one to three minutes of clean audio (quality drops fast under 30 seconds). Professional clone needs far more audio. One review says every clone goes through a voice captcha and ElevenLabs will not let you clone someone else's voice even with consent; they clone it on their own account and share it. Treat that as single-source, but plan for the owner recording a consent phrase once.
- Re-lip-sync of existing footage. Higgsfield LipSync Studio, VEED, Sync.so, LipDub and Everypixel take a real clip plus a new audio track and move the mouth to match. This is the piece that lets one real recording become many ads. Limits: covered mouths and fast head movement break it; Kling's lip-sync is limited to 2 to 10 second clips.

What no tool does: watch 20 of a client's videos and "learn the brand". Tone, offers, proof points and hooks come from text context. We already have that in the CRM (intake answers, chat history, which scripts and ads won), which is the part the DTC Skills write-up calls the only piece of the stack that compounds.

### 2. Does Higgsfield have an API or MCP we can connect to client chats?

Yes, two routes:

- Hosted MCP at mcp.higgsfield.ai, launched April 30, 2026. OAuth login, 30 plus image and video models (Seedance 2.0, Veo 3.1, Kling 3.0, Sora 2, Soul, Nano Banana 2, Flux 2), 4K images, video capped at 15 seconds per generation. Billing rides the Higgsfield plan you already have (Plus is about $39 a month). Built for chat use (Claude Desktop, Claude Code).
- Public API, launched September 2026. Pay per generation in dollars, no subscription, $5 minimum top-up, webhook or polling, 20 concurrent jobs. Example rates: Kling about $0.042 per second, Seedance 2.5 about $0.144 per second. This is the route for the CRM, since an edge function cannot log in through OAuth on the user's behalf.

Marketing Studio (the ad product) takes a product URL or up to five images, picks an avatar and a mode (UGC, Talking Head, Tutorial, TV Spot, Hyper Motion and others), and returns a 15 second ad. Its own help center says voiceover and pacing "can vary by generation" and results are regenerated, not edited. 30 second clips exist only in the general video tool on Pro and Plus plans. Higgsfield also ships Lipsync Studio (ten lip-sync models in one place, Soul ID aware), AI Talking Avatar in 18 languages, and on October 6, 2026 launched Ads Studio for static ads.

Fit for us: Higgsfield's sweet spot is product ads from a URL (DTC e-commerce) and fast B-roll variety. For the "owner re-voiced from their own footage" workflow we need a voice clone (ElevenLabs) plus a lip-sync API (Sync.so, VEED, or Higgsfield's), with Higgsfield or Kling supplying B-roll.

### 3. What are agencies actually doing with Higgsfield on Meta?

Mostly DTC product ads, and nobody has published CPL or ROAS numbers.

- VXTX (UK agency) rebuilt its pipeline on Higgsfield, Nano Banana and Claude: brief to launch in under four hours, 20 to 50 variants per session, "conversion uplift" for STYRKR and FLOWBIO with time to market cut from 10 days to same day. No figures.
- Steve Chou (ecommerce operator) runs Higgsfield plus Claude Code plus Remotion: Claude writes 20 to 50 brand-specific concepts into a sheet, Higgsfield renders, Remotion adds captions, logos and end cards. Finished ads cost him $2 to $3 each. His one line that matters: "the system prompt is the moat"; generic prompts make generic slop, feeding the AI your winning ads and brand voice is what separates converting ads from junk.
- Admetrics published a weekly SOP wiring Higgsfield MCP and Meta's official Ads MCP (mcp.facebook.com/ads, launched April 29, 2026): pull 7, 14 and 30 day data, classify ads (winner, fatigued, funnel drop-off, underperformer), write briefs, generate, upload paused, human approves for the first three weeks, scale by 20 percent steps, kill at a spend threshold with zero conversions. Never touch campaigns the system did not create.
- DTC Skills: the MCPs are pipes. Without brand context you get the average ad in the category.
- Meta research cited by Chou: conversion rate drops about 45 percent after four views of the same ad, which is why everyone lands on two to four fresh creatives a week. Andromeda write-ups add that near-identical variants are grouped as one ad, so diversity beats raw volume.

Nothing specific to home services. HVAC marketing guides still warn that AI spokesperson videos trip the uncanny valley and recommend real footage of the owner, team and trucks with AI used for editing and captions.

### 4. Does Meta push AI ads less?

No stated penalty, and no credible evidence of one. Meta's own Advantage+ creative, image-to-video and GEM tools generate AI creative inside Ads Manager, and it reports Advantage+ end-to-end solutions above a $75 billion annual run rate, so it has no reason to suppress AI assets.

What is real:

- Automatic labelling. Meta reads C2PA and IPTC metadata and applies an "AI info" label. A photorealistic synthetic person gets a more visible label; a background touch-up does not.
- Self-disclosure. Mandatory, with removal and account penalties, only for political, electoral and social-issue ads. Several vendor blogs claim a broad "all AI ads must be labelled" rule from March 2026; they conflict with each other and with Meta's published standards, and none cite a Meta source. Treat the broad rule as unconfirmed, but turning the disclosure on when a synthetic presenter is used costs nothing and removes the risk.
- The audience penalty. People react badly to an AI presenter they were not told about, and uncanny-valley reactions show up as lower hook rate and comments, not as throttled reach. That is the penalty to design around.

### 5. What works and what does not

Published numbers:

| Format | Result | Source type |
| --- | --- | --- |
| AI statics vs human statics (Taboola field study) | AI 0.76 percent CTR vs 0.65 percent | platform study |
| AI voiceover over real footage | about parity | agency anecdote |
| AI avatar UGC vs real creator | 10 to 20 percent behind | agency anecdote |
| Fully text-to-video | 30 to 50 percent behind on direct response | agency anecdote |
| Recall and emotion | humans win | surveys |

Our own data (clients, through October 10):

| Signal | Number |
| --- | --- |
| Reliable, 41 videos, 90 days | $36.50 CPL vs $52 statics |
| Active Air, 9 videos | $41 CPL vs $133 statics |
| Average watch time, 61 video ads, 30 days | 5.7 seconds |
| Reach 15 seconds | 1 in 10 |
| Finish the video | 1 in 40 |

So: the owner's face and voice in the first three seconds is what earns the lead; most of the clip is never seen. That is exactly the split a hybrid pipeline exploits. Keep the real owner for the hook, let AI handle the rest and the volume.

What does not work, from every source and our data: a synthetic stranger reading a script, fake "customer" testimonials, one video run for months, AI voiceover with no face at all for trades where trust is the sale, and generic prompts with no brand context.

### 6. Where the legal lines are

- FTC rule on fake reviews and testimonials, effective October 21, 2024: AI-generated consumer or celebrity testimonials are banned, with civil penalties up to about $52,000 per violation. A synthetic "happy customer" is out, full stop. A synthetic owner saying words the owner approved is fine with consent.
- Likeness and voice consent: written release from the owner covering voice clone and face, revocable, with the voice stored on an account we control. Voice data can fall under Illinois BIPA, CCPA and GDPR depending on the client's state.
- Disclosure: turn on Meta's AI disclosure for any ad with a synthetic presenter; no disclosure needed for AI B-roll behind a real owner, though labelling costs nothing.
- Claims: AI must not invent licence numbers, years in business, prices or guarantees. Our script prompt already bans ID numbers.

## Recommended design

Three tiers, highest confidence first.

Tier A, Refresh (default). One real recording per owner per month: a two to three minute base clip in their truck or shop, mouth visible, head fairly still, saying neutral lines, plus a one-sentence consent phrase. The CRM then produces weekly ads:

1. Script from the client chat (already first person, no ID numbers).
2. Voice: ElevenLabs instant clone from the base clip audio, owner's consent phrase on file.
3. Lip-sync redub: the owner's own base clip with the new audio (Sync.so about $0.05 per second, VEED $0.40 per minute, or Higgsfield Lipsync Studio).
4. B-roll: Higgsfield or Kling clips prompted from the client's Drive photos (trucks, crew, jobs, before and after), 3 to 5 seconds each.
5. Assembly: hook on the owner, cut to B-roll, captions, offer card, end card with phone number (a render service such as Remotion, Creatomate or Shotstack; edge functions cannot run ffmpeg).
6. Approval link to the owner (already built), then meta-publish.

Rough API cost per 30 second ad: $2 to $6. Owner time: one recording a month instead of three a week.

Tier B, Faceless. AI B-roll with the owner's cloned voice, no synthetic face. Lowest risk, parity in agency anecdotes, good for offer and seasonal pushes between owner videos.

Tier C, Digital twin. HeyGen Avatar V (about 15 seconds of footage, $0.05 to $0.067 per second) or Higgsfield Soul ID (20 plus frames). Only for owners who will not record at all. Label it, expect 10 to 20 percent worse than real, and never use it for testimonial-style lines.

Never: synthetic customers, invented claims, unlabelled synthetic presenters.

## Pilot

- Clients: the two with the most real video on file (Reliable, Active Air), since they give the best base clips and the best CPL baseline.
- Volume: two AI videos a week per client alongside one real one, for four weeks.
- Success: hook rate (3 second views over impressions) within 10 percent of the client's real videos, CPL within 20 percent, average watch at or above 5 seconds. Beat or tie and we scale to every client that signs the release.
- Guardrails: every AI ad goes through the approval link; campaigns start paused; Meta AI disclosure on for Tier C.

## What building it in the CRM would look like

- A "Make AI video" button on each script card in the client chat. It creates a job row (client, script, tier, base clip, status) and calls a new edge function.
- The edge function runs the chain above against Higgsfield, ElevenLabs, the lip-sync vendor and the render service, polling or taking webhooks, and stores the finished MP4 in Supabase storage.
- The finished video drops into the existing ad approval flow and, once approved, into meta-publish as a video ad.
- Secrets the user adds in Supabase: Higgsfield API key, ElevenLabs API key, lip-sync vendor key, render service key. Never in the repo or chat.
- A release and consent record per client (date, scope, voice id, revoked at) in the database, and the "Make AI video" button disabled until it exists.

## Sources

Higgsfield

- [Meet the Higgsfield API](https://higgsfield.ai/blog/higgsfield-api)
- [Generate AI videos with the Higgsfield API](https://higgsfield.ai/blog/generate-ai-videos-higgsfield-api)
- [Higgsfield API guide, apiframe](https://apiframe.ai/guides/higgsfield-api-guide)
- [Higgsfield API: setup, docs, endpoints, costs, Layer3 Labs](https://www.layer3labs.io/guides/higgsfield-api)
- [Higgsfield API pricing explained, MindStudio](https://www.mindstudio.ai/blog/higgsfield-api-pricing-pay-per-use)
- [Higgsfield API is not a Plus seat, Versely](https://www.versely.studio/blog/higgsfield-api-vs-plus-seat)
- [Higgsfield expands developer access, Entarabi](https://entarabi.com/en/2026/09/higgsfield-expands-developer-access-with-apis-and-github-tools/)
- [How to make AI talking and lipsync videos, Higgsfield](https://higgsfield.ai/blog/make-ai-lipsync-videos)
- [Higgsfield Soul 2.0, The Rundown](https://www.therundown.ai/tools/higgsfield-soul-2-0)
- [Higgsfield AI review: AI Influencer Studio, Soul ID and pricing](https://make-influencer.ai/tools/higgsfield-ai)
- [Higgsfield AI review for ads: 9 modes, 15 second cap, Novoads](https://novoads.ai/en/blog/higgsfield-review)
- [Higgsfield review and pricing, Yangsweb](https://www.yangsweb.com/blog/higgsfield-ai-review-alternatives-pricing)
- [Higgsfield review, Creatify](https://creatify.ai/blog/higgsfield-soul-prompts-for-product-ads)
- [Higgsfield AI avatar generator](https://higgsfield.ai/ai-avatar-generator)
- [How to create an AI influencer, Higgsfield](https://higgsfield.ai/blog/how-to-create-ai-influencer)
- [Talking AI avatar inside Claude, Higgsfield](https://higgsfield.ai/blog/talking-ai-avatar-inside-claude)
- [How to make AI UGC videos, Higgsfield](https://higgsfield.ai/blog/how-to-make-ai-ugc-videos)
- [AI talking avatar, Higgsfield](https://higgsfield.ai/ai-talking-avatar)
- [Still image to talking video, Higgsfield](https://higgsfield.ai/blog/still-image-to-talking-video)
- [Make 100 creative ads, Higgsfield](https://higgsfield.ai/blog/make-100-creative-ads)
- [Best AI UGC video generators for marketers, Higgsfield](https://geo.higgsfield.ai/task/blog/best-ai-ugc-video-generator-marketers-authentic-ad-creatives)
- [Higgsfield launches Ads Studio, AGI Hunt](https://agihunt.info/en/e/1a10d300105d6e63813669a9fc3)
- [Higgsfield review, Luma Labs](https://lumalabs.ai/news/higgsfield-review)

Agencies and operators using Higgsfield on Meta

- [Higgsfield AI and the death of the 2 week creative cycle, VXTX](https://www.vxtx.co.uk/blog/higgsfield-ai-meta-ads-creative)
- [How to create AI Meta ads with Higgsfield, My Wife Quit Her Job](https://mywifequitherjob.com/ai-meta-ad-creative-stack/)
- [SOP: automated Meta ads creative pipeline with Higgsfield and Meta MCP, Admetrics](https://www.admetrics.io/post/how-to-create-automated-meta-ads-creative-pipeline-higgsfield-meta-mcp)
- [What Meta and Higgsfield's new MCPs don't fix, DTC Skills](https://dtcskills.com/blog/meta-higgsfield-mcp-brand-context-dtc-ads)
- [Higgsfield influencer marketing case study, SocialTag](https://www.socialtag.in/case-studies/higgsfield.html)
- [Case study: Higgsfield, Behind The Brand](https://behindthebrandnews.com/p/case-study-higgsfield)
- [This AI can create, launch and optimize your ads, Inc.](https://www.inc.com/daniel-robbins/this-ai-can-create-launch-and-optimize-your-ads-without-you-theres-a-twist/91362631)

Performance of AI creative

- [AI ad creative benchmark 2026, Digital Applied](https://www.digitalapplied.com/blog/ai-ad-creative-benchmark-2026-ctr-roas-data)
- [Is AI video ad creation worth it for performance marketing, KlickRocket](https://klickrocket.com/blog/is-ai-video-ad-creation-worth-it-for-performance-marketing-in-2026)
- [AI generated ads: what performs and what doesn't, MTM](https://www.mtm.video/blog/ai-generated-ads-what-performs-and-what-doesn-t-in-2026/)
- [AI UGC vs real creator performance, Pose](https://pose.ai/blog/ai-ugc-vs-real-creator-performance)
- [AI video ads vs human shot ads, Pose](https://pose.ai/blog/ai-video-ads-vs-human-shot-ads)
- [Do AI generated ads convert, Daily Intel](https://dailyintelservice.com/future/do-ai-generated-ads-convert-2026-performance-data)
- [AI video ad generators, Adamigo](https://www.adamigo.ai/blog/ai-video-ad-generators)
- [Creative fatigue, Analytics at Meta](https://medium.com/@AnalyticsAtMeta/creative-fatigue-how-advertisers-can-improve-performance-by-managing-repeated-exposures-e76a0ea1084d)

Meta policy, labelling and its own AI tools

- [Meta AI content labeling for ads, Coinis](https://coinis.com/blog/meta-ai-content-labeling-facebook-instagram-ads-2026)
- [AI content labeling rules for advertisers, Digital Applied](https://www.digitalapplied.com/blog/ai-content-labeling-rules-advertisers-2026-reference)
- [Meta AI generated creative ad policy, UGCVids](https://ugcvids.ai/blog/meta-ai-generated-creative-ad-policy-2026)
- [Are AI generated ads allowed on Meta, Starpop](https://starpop.ai/blog/articles/are-ai-generated-ads-allowed-on-meta)
- [AI UGC Facebook ad policy, Cinerads](https://www.cinerads.com/blog/ai-ugc-facebook-ad-policy)
- [Is Meta's AI content tag silently ruining your reach, Conversion Dedication](https://conversiondedication.com.au/is-metas-ai-content-tag-silently-ruining-your-reach/)
- [Meta AI disclosure rules, Adamigo](https://www.adamigo.ai/blog/meta-ai-disclosure-rules-advertisers-know)
- [Meta ad policy changes 2026, 1ClickReport](https://www.1clickreport.com/blog/meta-ad-policy-changes-2026-compliance-guide)
- [Meta AI ad labeling, SalesDoubler](https://salesdoubler.pro/en/meta-ai-ad-labeling/)
- [AI ad disclosure rules compared, Novoads](https://novoads.ai/en/blog/ai-ad-label-rules-2026)
- [Meta now requires advertisers to disclose AI content, TechJack](https://techjacksolutions.com/ai-brief/meta-now-requires-advertisers-to-disclose-ai-generated-conte/)
- [AI generated ads: disclosure rules, AI Marketer](https://aimarketer.com/blog/ai-generated-ads)
- [AI generated ad creative now requires disclosure on Meta, Dhruboduti](https://dhruboduti.com/blog/ai-generated-ad-creative-now-requires-disclosure-on-meta-what-counts-and-how-to-comply)
- [Meta AI content label policy, AuditSocials](https://www.auditsocials.com/blog/meta-ai-generated-content-label-policy-2026)
- [Cross platform AI labeling comparison, AuditSocials](https://www.auditsocials.com/blog/cross-platform-ai-content-labeling-requirements-2026-meta-google-tiktok-youtube-comparison)
- [Meta's fully automated ads by 2026, Pixis](https://pixis.ai/blog/metas-fully-automated-ads-by-2026-what-performance-teams-should-prepare-for/)
- [Meta 10-Q, Q2 2026](https://www.sec.gov/Archives/edgar/data/0001326801/000162828026050705/meta-20260630.htm)
- [Social media AI advertising updates, Digital Applied](https://www.digitalapplied.com/blog/social-media-ai-advertising-april-2026-meta-google)
- [Every Meta ads change in 2026, Common Thread](https://commonthreadco.com/blogs/coachs-corner/meta-ads-changes-2026)
- [Meta AI automated ads guide, Digital Applied](https://www.digitalapplied.com/blog/meta-ai-automated-ads-2026-marketing-guide)
- [What Advantage+ automates in 2026, Refonte](https://www.refontelearning.com/blog/meta-advantage-plus-explained)
- [Meta Advantage+ guide 2026, Adquisition](https://adquisition.ai/blog/guides/meta-advantage-plus-guide-2026)
- [Meta ads 2026 guide, ALM Corp](https://almcorp.com/meta-ads-2026-guide-advantage-plus-ai-creative/)
- [Meta ads updates 2026, Hawky](https://hawky.ai/blog/meta-ads-updates-2026)
- [What is Meta Andromeda, Superscale](https://www.superscale.ai/learn/what-is-meta-andromeda)
- [Meta Andromeda ROAS drop, Segwise](https://segwise.ai/blog/meta-andromeda-roas-drop)
- [Meta Andromeda creative strategy playbook, Segwise](https://segwise.ai/blog/meta-andromeda-update-creative-strategy-2026)
- [How to beat Meta's Andromeda algorithm, Segwise](https://segwise.ai/blog/beat-meta-andromeda-algorithm-creative-strategy.md)
- [Andromeda and creative teams, Cohley](https://www.cohley.com/blog/why-metas-andromeda-algorithm-just-made-your-creative-team-obsolete-and-what-cmos-are-doing-about-it)
- [Meta ads optimization checklist, Young Urban Project](https://www.youngurbanproject.com/meta-ads-optimization-checklist/)
- [Meta Andromeda update explained, Billo](https://billo.app/blog/meta-andromeda-update/)
- [Andromeda 2026, Affect Group](https://affectgroup.com/blog/andromeda-2026-how-meta-ads-algorithms-now-deliver-our-ads/)

Digital twins, voice clones and lip-sync APIs

- [Best AI avatar talking head APIs, HeyGen](https://www.heygen.com/blog/best-ai-avatar-talking-head-apis)
- [HeyGen models and pricing](https://developers.heygen.com/models)
- [HeyGen review, DIY AI](https://diyai.io/ai-tools/video-generation/reviews/heygen-review/)
- [Best virtual avatar solutions 2026, Tough Tongue](https://www.toughtongueai.com/blog/best-virtual-avatar-solutions-2026)
- [HeyGen alternatives, Layer3 Labs](https://www.layer3labs.io/comparisons/heygen-alternatives)
- [Avatar video comparison, Kompozy](https://kompozy.io/ai-video-generation/avatar-video-comparison)
- [HeyGen workflow 2026, FrankX](https://www.frankx.ai/blog/ultimate-heygen-workflow-2026)
- [ElevenLabs pricing and voice cloning, Fora Soft](https://www.forasoft.com/learn/ai-for-video-engineering/articles-ai/elevenlabs-pricing-voice-cloning-no-fakes-act)
- [ElevenLabs voice cloning review 2026, Coval](https://www.coval.ai/blog/elevenlabs-review-2026-voice-cloning-and-synthesis-capabilities-explained)
- [Best voice cloning APIs 2026, Gradium](https://gradium.ai/content/best-voice-cloning-apis-2026)
- [Best AI voice cloning tools 2026, Toolworthy](https://www.toolworthy.ai/en/blog/best-voice-cloning-ai-tools)
- [Best AI voice cloning tools, Fast.io](https://www.fast.io/resources/best-ai-voice-cloning-tools-2026.md)
- [How to use ElevenLabs, AI Weekly](https://aiweekly.co/learning-ai/generative-ai/how-to-use-elevenlabs)
- [Best AI voice generators, TechJack](https://techjacksolutions.com/ai-tools/elevenlabs/best-ai-voice-generators/)
- [Lipsync API, VEED](https://www.veed.io/learn/lipsync-api)
- [Sync.so pricing](https://sync.so/pricing)
- [LipDub pricing](https://lipdub.ai/pricing)
- [Everypixel lipsync](https://labs.everypixel.com/lipsync)
- [AI lipsync models, InVideo](https://invideo.io/blog/ai-lipsync-models/)
- [Lip sync video APIs, Tavus](https://www.tavus.io/blog/lip-sync-video-apis)
- [AI lip sync tools comparison, Crazyrouter](https://crazyrouter.com/en/blog/ai-lip-sync-tools-comparison-may-2026-apis-avatars-dubbing)

Legal and trust

- [FTC bans fake reviews and testimonials, Search Engine Land](https://searchengineland.com/ftc-fake-reviews-testimonials-445209)
- [FTC rule on fake and AI generated reviews, Sidley](https://datamatters.sidley.com/2024/08/30/u-s-ftcs-new-rule-on-fake-and-ai-generated-reviews-and-social-media-bots/)
- [FTC final rule on fake testimonials including AI, Hunton](https://hunton.com/hunton-retail-law-resource/ftc-issues-final-rule-targeting-fake-consumer-reviews-and-testimonials-including-those-generated-by-artificial-intelligence-ai-and-online-bots)
- [FTC cracks down on AI fake reviews, HotHardware](https://hothardware.com/news/ftc-cracks-down-ai-generated-fake-reviews)
- [AI for HVAC, Skill Mammoth](https://skillmammoth.com/blog/ai-for-hvac)
- [AI avatar ads guide, AdCreate](https://adcreate.com/blog/ai-avatar-ads-guide)
- [People won't trust uncanny valley endorsements, TechRadar](https://www.techradar.com/ai-platforms-assistants/ai-video-commercials-are-starting-to-spread-but-people-wont-trust-uncanny-valley-endorsements)
- [Uncanny valley effect in AI video, Hailuo](https://hailuoai.video/pages/blog/uncanny-valley-effect-ai-video-explained)
- [AI avatars vs humans, AdMove](https://www.admove.ai/blog/ai-avatars-vs-humans-guide)
- [AI avatars vs real presenters, Video Editing Company](https://videoeditingcompany.com/ai-avatars-vs-real-presenters/)
