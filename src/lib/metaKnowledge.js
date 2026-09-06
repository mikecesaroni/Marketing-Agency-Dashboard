// What the AI in this CRM knows about Meta advertising, and how it is kept
// honest.
//
// This is the knowledge base behind the client chat, the Ad Doctor and the
// copy assistant. It is split from playbook.js on purpose: the playbook is how
// THIS AGENCY works (structure, stages, kill rules, the LTV strategy); this is
// how META works and what wins for blue-collar trades on it, written so a
// model can apply it to one client's numbers.
//
// Two rules for editing it:
//
//   1. Every number carries where it came from: [meta] for Meta's own
//      published guidance, [industry] for the 2026 practitioner consensus
//      (multiple agencies reporting the same range), [ours] for this
//      account's data. When [ours] disagrees with [industry], [ours] wins for
//      our clients and the disagreement is stated.
//
//   2. It is the STATIC half of the knowledge. The moving half is the
//      ad_learnings table, refreshed nightly from ad_daily after the Meta
//      sync, and appended to every prompt under "WHAT OUR OWN DATA SAYS". A
//      finding that keeps recurring in the nightly learnings should be
//      promoted into this file with an [ours] tag and the date; a rule here
//      that the learnings keep contradicting should be removed. That is the
//      feedback loop, and a person closes it, on purpose.
//
// Pure: scripts/check-meta-knowledge.mjs imports it and asserts the sections
// and the load-bearing numbers are present, so a careless edit cannot quietly
// drop the learning-phase rule or the fatigue thresholds.

export const KNOWLEDGE_UPDATED = '2026-09-06'

export const META_KNOWLEDGE = `
############################################################
META ADS KNOWLEDGE BASE, BLUE-COLLAR EDITION (updated ${KNOWLEDGE_UPDATED})
############################################################
Tags: [meta] Meta's own guidance. [industry] 2026 practitioner consensus.
[ours] this agency's account data. When [ours] and [industry] disagree, [ours]
wins for our clients, and you say so.

=== 1. HOW DELIVERY WORKS NOW (2026) ===
Three systems sit between an ad and a person, in this order:

RETRIEVAL (Andromeda, fully rolled out Oct 2025). Before any auction, Meta
scans the whole ad pool and shortlists roughly a thousand candidates for one
person. It shortlists BY THE CREATIVE: image, video, audio and text are read
by models and each genuinely different creative gets its own identity. Two
ads that look alike are treated as one entry with two tickets. Consequences:
- Distinct creatives get more chances to be retrieved than near-copies. Ten
  clones of a winner do not get ten times the reach; they compete with each
  other. [meta] [industry]
- Fresh creative is retrieved more readily than stale creative; the practical
  lifespan of one concept is 2 to 4 weeks on a local account, and shorter at
  higher spend. [industry]
- Meta's own test: one ad set carrying 25 diverse creatives produced 17% more
  conversions at 16% lower cost than five ad sets of five. Consolidate, do not
  fragment. [meta]

RANKING (Lattice) then predicts, for each shortlisted ad, how likely this
person is to take the action the ad set optimises for. It is one large model
predicting click, lead and purchase together, and it is trained by what the
account feeds back: pixel and Conversions API events, offline uploads, form
submissions. It learns your buyer only from what you report. [meta]

THE AUCTION then ranks by Total Value = bid x estimated action rate x ad
quality, and the winner pays just enough to beat the runner-up. Money is one
of three terms. A better creative raises the estimated action rate and the
quality term at once, which is why creative changes move CPL more than bid
changes do. [meta]

Ad Relevance Diagnostics (per ad, in Ads Manager) report three rankings
against ads competing for the same audience: Quality, Engagement Rate,
Conversion Rate. Read them as a triage: low Quality = the creative itself
(clickbait, withheld information, low production); low Engagement = the hook;
low Conversion = the offer, the form or the landing page. Below Average on
Conversion Rate with fine Engagement means the ad is doing its job and the
step after it is not. [meta]

=== 2. THE LEARNING PHASE, AND WHAT RESETS IT ===
An ad set needs about 50 optimisation events (leads, for our campaigns)
inside 7 days to leave learning. [meta] Until then, delivery is unstable and
CPL typically runs 20 to 50% above where it settles. [industry] An ad set
that cannot reach 50 in a week is marked Learning Limited and can stay there
forever; its numbers are real but noisy, and most of our local accounts live
here, which is fine as long as everyone knows it.

Budget floor for exiting learning: 50 x target CPL / 7 per day. A $60 CPL
needs about $430/day per ad set to exit in a week. Below that, run ONE ad set
and judge on trend, not on Meta's learning status. [industry]

These reset learning, so batch them and do them rarely: budget changes over
about 20% (raise 20 to 25% at most every 3 to 4 days), targeting changes,
bid strategy changes, changing the optimisation event, adding or removing
ads from the ad set, pausing 7 days or more. These do not: renaming, small
schedule tweaks, small exclusions. [meta] [industry]

Practical rule for a local account: change one thing, wait 3 to 4 days,
read it, change the next thing. Never edit a winner in place; duplicate it
and change the copy.

=== 3. ACCOUNT STRUCTURE FOR A LOCAL TRADE ===
- One campaign, one ad set, radius geo, broad otherwise. Location plus an age
  floor (30 or 35) is the whole targeting. Interest stacking shrinks the
  audience Meta can explore and raises CPM. [industry]
- Radius: start at the true service area, 15 to 30 miles for HVAC and
  plumbing. Under about 100,000 people in the radius CPMs run 50 to 100%
  higher for lack of inventory; 200,000 to 500,000 is the comfortable range.
  Advantage+ audience treats the radius as a preference, not a wall, so
  expect some spill. [industry]
- Exclude renters where the trade needs a homeowner (installs, repipes,
  water treatment). Not for pressure washing or appliance repair.
- Creative count in the one ad set: 3 to 5 distinct angles at launch and
  under about $100/day; 8 to 12 concepts at scale. Distinct means a different
  problem, person, emotion or format, not a different colour. [industry]
- Budget lives at the ad set (ABO) while there is one ad set. Campaign budget
  (CBO) only once there are two or more ad sets worth funding, and then it
  will starve the smaller one; that is what it is for.
- Advantage+ Leads campaigns (global 2026) pair instant forms with the same
  optimisation engine as Advantage+ Sales. Use them for lead gen; they are
  not a reason to split audiences. [meta]

=== 4. CREATIVE: WHAT THE MACHINE REWARDS ===
- Diversity over volume. Keep every live creative meaningfully different
  from every other; agencies measuring it aim for under 40% similarity.
  Refresh on a standing 2 to 3 week cadence per client, not on emergency.
  [industry]
- Video over image for trades. [ours] Video $37 per lead at 2.99% CTR over
  $10,083; image $53 at 2.32% over $8,573; one video in fourteen produced
  nothing against one image in four; video paid a higher CPM and still won
  (40 ads with $50+ behind them, Sept 2026). [industry] agrees: video wins
  nine of ten creative tests on home-service accounts, and owner-to-camera
  beats produced content by 25 to 40%.
- Sound off is the default: 80 to 85% of video plays are muted. The hook and
  the offer must be ON SCREEN as text inside two seconds. [meta] [industry]
- Retention benchmarks, cold traffic: 3-second hook rate about 25%; ThruPlay
  (15 s or complete) 18 to 28%. [industry] [ours] Our winners held 11 to 18%
  to ThruPlay and averaged 6 to 10 s watched; our losers 6 to 7% and 3 to 4 s.
  Retention tracked cost per lead almost perfectly. A clip under 8% ThruPlay
  is a re-cut, not a budget problem.
- Hook emotion depends on format. [ours] Fear, problem and question hooks on
  a STILL IMAGE were our worst ads ("Problem-Question Hook B" $258 a lead,
  "Cost of Waiting" 0 leads). The same emotion in video ran $40 a lead. On a
  still, lead with the offer or with trust in the owner's voice ("You Deal
  With The Owner, Not A Call Center" 5.88% CTR).
- Offer size. [ours] No dollar-off under $250 pulled: every image ad under
  $100 off produced nothing or ran over $75 a lead. Winners: "$2,500 OFF a
  new system" ($34/lead, 87 leads), "FREE AIR HANDLER" ($46), "NO PAYMENTS
  FOR 6 MONTHS" ($37 on $1,292), "$1,200 upgrade, yours free" (6.9% CTR).
  A concrete term beat a vague one on the same client: "Financing" $72 vs
  "No payments for 6 months" $37. Tripwire prices work when a person says
  them ($84.99 owner video $38) and not on a card ($29.95 inspection image
  $70). [industry] agrees: 5 to 10% off is not an incentive; finance the big
  ticket, price the small one.
- Proof on every creative: rating and review count, a named guarantee, or a
  credential. [ours] Every top-quartile ad carried one.
- Real over produced: job-site photos and phone video of the owner and
  trucks. Before-and-after and time-lapse beat polished reels 3 to 5x in
  this niche. [industry] [ours] MBD Pressure Washing before-and-after $25 a
  lead on $1,180.
- Vertical 9:16 for Reels and Stories, 4:5 for feed; Reels safe zone 14%
  top, 6% sides, 35% bottom (Stories 20%). [meta, March 2026 unification]
- Winning hook, new format: turn a winning video hook into a static
  headline and a winning static into a video open. Never clone the winner
  into the same format.

=== 5. FATIGUE: HOW TO SEE IT COMING ===
Order of appearance on a local account: [industry]
1. CTR falls 15 to 20% from its own peak over 7 to 14 days (earliest tell,
   3 to 5 days before frequency shows it).
2. Hook rate falls 20%+ (video).
3. CPM rises 10%+ with no change in the market (Meta is paying more to find
   fresh eyes).
4. Frequency: prospecting decays past about 2.5 a week and falls off past
   4.0. Prepare the replacement at 2.0 to 2.5, swap before 3.0. Retargeting
   tolerates 4 to 6.
5. Negative feedback (hides, "see less") ticks up.
A typical concept peaks days 1 to 3, warns days 4 to 7 and loses 30 to 50%
of CTR by days 8 to 10 at meaningful spend; at our local budgets the curve
stretches to 2 to 4 weeks. After fatigue sets in expect CPM +20 to 40% and
CTR -15 to 30%; by frequency 9, CPC runs 160% over baseline. The earlier the
refresh, the cheaper it is.

Telling fatigue from the market: CTR down with CPM flat is the creative.
CPM up with CTR flat is the auction (season, competitor, holiday). CPM up
AND CTR down is both, and the fix is still the creative first.

=== 6. LEAD FORMS AND LEAD QUALITY ===
- Instant forms run 30 to 50% cheaper per lead than a landing page and close
  lower. [industry] For trades with a human calling back, the form wins on
  cost per booked job IF the callback is fast. Without a fast callback, run
  Call ads instead.
- Higher Intent form type (review screen before submit) cuts junk 30 to 40%
  and raises CPL 15 to 20%. Always Higher Intent. [meta] [industry]
- One qualifying question a buyer answers and a browser will not: "When do
  you need this done?" (ASAP / this month / just looking) or "Are you the
  homeowner?". Each extra field costs about 10% of submissions and returns
  more in close rate. Prefill everything else. [industry]
- A privacy policy URL is REQUIRED on every form; Meta refuses to create one
  without it. [meta]
- Teach the machine what a good lead is: report booked or qualified leads
  back to Meta (Conversions API or offline event upload) and optimise toward
  that event once volume allows. Meta optimises to what it is fed; fed only
  form fills, it finds people who fill forms. [meta] [industry]
- Judge on cost per qualified lead or cost per booked job. $80 leads that
  book 40% of the time beat $15 leads that book 2% of the time by a mile.
- Speed to lead: a call inside 5 minutes converts about 21x better than one
  after 30 minutes. This is the largest lever in the whole system and it is
  not in Ads Manager. [industry]

=== 7. BLUE-COLLAR MARKET FACTS ===
CPL benchmarks on Meta, 2026, US, so a number can be judged: [industry]
- HVAC overall $45 to $116; tune-up form fill $35 to $65; maintenance $40 to
  $80; system replacement $80 to $150; tap-to-call estimate in shoulder
  season up to $200. Shoulder seasons (spring, fall) run 20 to 30% cheaper.
- Plumbing about $73 average; emergency work converts highest of all trades
  (12 to 16%) because the buyer is already in pain.
- Home services CPC $1.20 to $2.80; account-wide median CTR across
  industries 1.05%, so 2% on a trade ad is good and 3%+ is excellent.
[ours] Account median across eight clients this summer: about $40 to $45 per
lead on the winners, $53 on statics, $37 on video.

Seasonality, so a CPL move is not misread as a creative problem:
- HVAC: AC pre-season push April to May, peak June to August (repair and
  replacement), furnace push September to November, "60 days before first
  freeze" ads work; dead spots late September and February.
- Plumbing: freeze and burst pipes December to February in cold markets,
  water heaters year-round with a winter bump, drains after holidays.
- Water treatment and filtration: year-round, strongest when a water-quality
  story is in local news; sensory hooks (film on skin, white residue) beat
  chemistry.
- Pressure washing and exterior: spring through early fall; before-and-after
  is the whole ad.
- Roofing and gutters: after storms, and fall before leaves.
- Appliance repair and used appliances: year-round, landlords and property
  managers as a second audience.

Buyer psychology in the trades: the owner-operator is the brand. "You deal
with the owner" outperformed everything else we put on a still. Reviews and
years in business are proof, not decoration. Owners hire people who look
like they show up, so trucks, uniforms and daylight job sites beat studio
anything.

=== 8. DIAGNOSIS ORDER (what the Ad Doctor checks, in this order) ===
1. Is it delivering at all? No impressions: account disabled or unsettled,
   ad rejected, ad set paused, audience too small, budget below the minimum.
   Not a creative problem.
2. Delivering but nobody clicks (CTR under 1%, hook rate under 15%): the
   creative. Hook first, then format, then offer.
3. Clicks but no leads (CTR fine, zero or expensive leads): the step after
   the click. Form type, form questions, the offer's believability, the
   landing page, or leads landing somewhere nobody watches.
4. Leads but no bookings: not an ad problem. Speed to lead, who answers,
   what they say. Check this before touching Ads Manager.
5. A former winner getting expensive: separate CTR from CPM (section 5). Then
   check the calendar (section 7) before calling it fatigue.
6. Everything above fine and still under 50 leads a week: it is learning
   limited and that is normal at this budget. Judge on trend over 7 to 14
   days, never day to day.

=== 9. GUARDRAILS ===
- Do not judge an ad before it has spent 1.5 to 2x the account's cost per
  lead. Do not kill on noise.
- Do not edit a live ad set more than once every 3 to 4 days. Batch changes.
- Never raise a budget more than 20 to 25% at a time.
- Never clone a winner into the same format; put the hook in a new one.
- Never optimise to form fills when booked-job data exists to optimise to.
- Say when a number is [industry] rather than [ours], and prefer [ours].
- When the nightly learnings below contradict anything above, the learnings
  are newer and win for that client; say that too.
############################################################
`.trim()
