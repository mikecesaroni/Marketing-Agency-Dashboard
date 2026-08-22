// The HQ Meta Ads Playbook.
//
// Static reference appended to every client brief. Kept in the repo rather than
// the database on purpose: it is versioned, it changes rarely, and when it does
// change every client should pick up the new version at once.
//
// The rules in here that are genuinely deterministic (stage gate, CTA by
// urgency, creative count) are ALSO encoded in clientBrief.js, so the brief
// states the decision as a fact rather than asking the model to re-derive it.

export const PLAYBOOK = `META ADS PLAYBOOK — SERVICE BUSINESSES (HQ REFERENCE)
Focus: hooks, creative testing, keeping it simple, spending toward LTV.
Applies to every client.

=== THE ONE IDEA THAT MATTERS MOST ===
The hook is the first 3 seconds of a video or the first line of text. It decides
whether anyone sees the rest of the ad. Hook format drives more performance
difference than visuals, offer, or CTA. Test the hook first. Everything else is
secondary.

Why it compounds: a better hook gets more engagement, Meta rewards engaging
creative with cheaper delivery, so a 2x better hook can cut cost per lead 30-40%.

=== THE 5-PART AD STRUCTURE (every service ad uses this) ===
1. HOOK — call out the homeowner and the problem
2. AGITATE — name the cost of doing nothing
3. OFFER — make the next step cheap and easy
4. PROOF — a number, a rating, or a name
5. CTA — tell them exactly what tapping does

Example (HVAC):
Hook: "Buffalo homeowners: is your AC already struggling before summer?"
Agitate: "Wait until July and you're on a 3-week repair list in a heatwave."
Offer: "Free 21-point AC tune-up this month."
Proof: "4.9 stars, 600+ local jobs."
CTA: "Tap Book Now to grab a slot."

=== HOOK FORMULAS THAT WORK ===
Always drop in the real city and real service.
1. LOCAL CALL-OUT: "Attention [City] homeowners..."
2. PROBLEM QUESTION: "Furnace won't turn on?"
3. SYMPTOM CHECKLIST: "Weak water pressure? Rattling pipes? Higher bills? Here's why."
4. COST-OF-WAITING: "That small roof leak is a $9,000 problem in six months."
5. SEASONAL / URGENCY: "Book your AC tune-up before the first heatwave hits [City]."
6. BOLD LOCAL OFFER: "$79 drain cleaning for [City] homeowners this week only."
7. TRUST / PROOF-LED: "600+ [City] families trust us with their heating."

Avoid: vague brand fluff, anything a renter would click, claims you can't back up.

=== KEEP-IT-SIMPLE TESTING SYSTEM ===
TEST ONE THING AT A TIME, IN THIS ORDER:
1. Hook  2. Offer  3. Format (video vs image)  4. CTA
Never change two things at once, or the data is useless.

FASTEST TEST: same ad body, swap only the first 3 seconds (video) or first line
(text). Run 3-5 hook variations against each other.

LAUNCH SETUP:
- One ad set, broad audience, let Meta optimize.
- Stack 5-6 creatives with different hooks in that one ad set.
- Geo radius = service area plus small buffer. Homeowners, age 30+, exclude renters.

CALLING A WINNER:
- Wait for at least 50 leads/conversions per variation. Meta's own bar.
- 3 clicks is noise, not data.

WITH A WINNER:
- Don't clone it 20 times. Put the winning hook in a NEW format: winning video
  hook becomes a static headline, winning static becomes a video open.
- Keep the account at 10-20 active ads across formats, not 50 clones.

=== THE LTV STRATEGY ===
- CAC = ad spend / jobs booked.
- LTV = first job PLUS repeat work PLUS referrals, not just the first ticket.
- Target ratio: 3:1 or better.
- Judge scaling on LTV:CAC. Judge the week on cost per booked job. Neither is
  cost per lead.

Not every job is worth the same. A $9,000 replacement customer is worth far more
than a $120 diagnostic, so once an account has data, weight budget toward the
highest-LTV work.

=== HIGH / MID / LOW LTV STRUCTURE (Stage 2 only) ===
CAMPAIGN "HIGH-LTV — REPLACEMENT"  (most budget) — replacements, installs
CAMPAIGN "MID-LTV — MAINTENANCE"   (steady)      — plans, tune-ups
CAMPAIGN "LOW-LTV — SERVICE CALLS" (lean)        — diagnostic, repair

Starting split once tiered: 50% High / 30% Mid / 20% Low, then let numbers move it.

Tier templates for other trades:
- Pressure washing: High = full house + roof soft-wash / Mid = recurring plans / Low = single driveway
- Roofing: High = full replacement / Mid = repairs + plans / Low = inspections, patches
- Plumbing: High = repipe, water heater, sewer / Mid = fixtures, maintenance / Low = drain clears
- Lawn: High = installs, hardscaping / Mid = recurring contracts / Low = one-time cleanups

=== STAGING RULE (the most important part) ===
STAGE 1 — LAUNCH LEAN (default for every new client):
- One broad ad set, 5-6 stacked creatives, let Meta optimize.
- Any client under roughly $75-100/day lives here.
- Goal: find the winning hook and offer. Do not split yet.

STAGE 2 — GRADUATE TO TIERS:
- Only once EACH campaign can clear ~50 conversions on its own.
- Split off the High-LTV campaign first, keep the rest broad, add Mid and Low as
  volume grows.

BUILD THE STRUCTURE TO THE BUDGET, NEVER THE BUDGET TO THE STRUCTURE.
A three-campaign setup on $50/day loses to one broad ad set every time.

=== CTA RULES ===
- Emergency (burst pipe, no heat): "Call Now"
- Tune-up / maintenance: "Book Now"
- Install / big quote: "Get Quote"
- Panel/photo jobs: "Send Photo"
Softer CTAs often beat hard-sell for services. Worth testing.
Match CTA to tier: High-LTV leans "Get Quote", Mid leans "Book Now", Low leans "Call Now".

=== FORMAT SPECS ===
- Vertical 9:16 for Reels/Stories, 4:5 for feed.
- Video under 15 seconds. Hook in first 3 seconds.
- Captions always on. Must work with sound off.
- Keep frame edges clear of text so the interface doesn't cover it.
- Real photos of the team and the work beat stock every time.

=== WHAT META REWARDS IN 2026 ===
- Broad audiences + clean conversion data beat manual interest targeting.
- Creative DIVERSITY beats creative VOLUME. Angles and formats, not clones.
- Advantage+ handles targeting better than hand-built audiences at scale.
- Lead forms convert 25-35% higher than landing pages for home services.
- Meta = demand GENERATION (before they search). Google LSA = demand CAPTURE (as
  they search). Different jobs, they complement.

=== THE METRIC THAT ACTUALLY MATTERS ===
Form fills are not the metric. Booked jobs are. A cheap lead that never books
loses money quietly. Judge every account on cost per booked job, and scaling
decisions on LTV:CAC.`
