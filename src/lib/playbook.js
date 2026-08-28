// The HQ Meta Ads Playbook.
//
// Static reference appended to every client brief. Kept in the repo rather than
// the database on purpose: it is versioned, it changes rarely, and when it does
// change every client should pick up the new version at once.
//
// The rules in here that are genuinely deterministic (stage gate, CTA by
// urgency, creative count) are ALSO encoded in clientBrief.js, so the brief
// states the decision as a fact rather than asking the model to re-derive it.
//
// Sources behind the 2026 sections: Meta's Andromeda update compressed ad
// lifespan to 2-4 weeks and made More Volume forms junk; the speed-to-lead
// numbers are from Invoca / Convoso home-services benchmarks; the learning
// phase mechanics are Meta's own documented thresholds.

export const PLAYBOOK = `META ADS PLAYBOOK: SERVICE BUSINESSES (HQ REFERENCE)
Focus: hooks, offers, creative, lead quality, kill/scale discipline, LTV.
Applies to every client.

=== THE ONE IDEA THAT MATTERS MOST ===
The hook is the first 3 seconds of a video or the first line of text. It decides
whether anyone sees the rest of the ad. Hook format drives more performance
difference than visuals, offer, or CTA. Test the hook first. Everything else is
secondary.

Why it compounds: a better hook gets more engagement, Meta rewards engaging
creative with cheaper delivery, so a 2x better hook can cut cost per lead 30-40%.

=== THE 5-PART AD STRUCTURE (every service ad uses this) ===
1. HOOK: call out the homeowner and the problem
2. AGITATE: name the cost of doing nothing
3. OFFER: make the next step cheap and easy
4. PROOF: a number, a rating, or a name
5. CTA: tell them exactly what tapping does

Example (HVAC):
Hook: "Buffalo homeowners: is your AC already struggling before summer?"
Agitate: "Wait until July and you're on a 3-week repair list in a heatwave."
Offer: "Free 21-point AC tune-up this month."
Proof: "4.9 stars, 600+ local jobs."
CTA: "Tap Book Now to grab a slot."

=== HOOK FORMULAS THAT WORK ===
Always drop in the real city and real service.
1. LOCAL CALL-OUT: "Attention Raleigh homeowners..."
   (Raleigh is the example. Use this client's own city.)
2. PROBLEM QUESTION: "Furnace won't turn on?"
3. SYMPTOM CHECKLIST: "Weak water pressure? Rattling pipes? Higher bills? Here's why."
4. COST-OF-WAITING: "That small roof leak is a $9,000 problem in six months."
5. SEASONAL / URGENCY: "Book your AC tune-up before the first heatwave hits Raleigh."
6. BOLD LOCAL OFFER: "$79 drain cleaning for Raleigh homeowners this week only."
7. TRUST / PROOF-LED: "600+ Raleigh families trust us with their heating."
8. TECH-TO-CAMERA: a real tech pointing at the lens: "Your AC is going to fail
   this summer. Here's how to know before it does." The strongest video open
   there is for trades - a real person, a real uniform, a direct claim.
9. EDUCATE-FIRST: "3 signs your water heater dies this year." Value before the
   sell lowers ad resistance and builds the trust that wins the emergency call
   later.

FEAR vs CURIOSITY vs OFFER: fear-of-loss hooks (cost-of-waiting, symptom
checklist) usually beat pure-offer hooks for REPAIR intent; offer hooks win for
MAINTENANCE (a tune-up has no fear to tap). Match the emotion to the job type,
and never manufacture fear you can't substantiate - "that leak is a $9,000
problem" needs to be a real number from real jobs.

Avoid: vague brand fluff, anything a renter would click, claims you can't back up.

=== PRICE, DISCOUNTS AND OFFERS (what to show and when) ===
The rule: price the small stuff, finance the big stuff, quote the middle.

- LOW-TICKET / TRIPWIRE (drain clean, tune-up, inspection): SHOW THE PRICE.
  "$79 drain cleaning" outpulls "affordable drain cleaning" every time - a real
  number is the hook. Round, concrete, city-anchored.
- HIGH-TICKET (replacement, install, repipe): NEVER show the total. Show the
  MONTHLY PAYMENT: "New AC from $89/month" removes the price objection before
  it forms. If the client offers financing, financing IS the offer.
- MID-TICKET / VARIABLE (repairs, custom work): no price. "Get Quote" - price
  talk belongs in the follow-up call, not the ad.

Discounts: a concrete dollar-off ("$100 off installs this month") works as
urgency and pre-qualifies price-shoppers honestly. Percentage discounts read
weaker. NEVER stack discounts, and never lead with a discount on emergency
work - someone with a burst pipe needs speed, not $50 off.

The trade nobody says out loud: price-led ads pull MORE leads of LOWER average
quality. That is fine for Low-LTV volume campaigns and wrong for High-LTV
campaigns, where the free-estimate / financing angle draws fewer, better leads.

=== LEAD FORMS: QUALITY BEATS VOLUME (2026) ===
Since Meta's Andromeda update, "More Volume" instant forms are so frictionless
that people submit them by accident and don't remember doing it. For any client
with a human answering the phone:

- Use the HIGHER INTENT form type (adds a review screen before submit). This is
  the single biggest quality lever and costs nothing to build.
- Add ONE qualifying question a real buyer answers easily and a tire-kicker
  won't: "When do you need this done?" (ASAP / this month / just researching)
  or "Are you the homeowner?". Each extra field costs roughly 10% of
  submissions and returns more than that in close rate.
- Prefill everything else (name, phone, email) - prefilled fields are why
  instant forms convert at all.
- There is no passcode gate on Meta forms, and faking one with a custom
  question just burns good leads. The review screen + one real question does
  the same filtering honestly.

Judge the form change on COST PER BOOKED JOB, never on cost per lead - a
quality filter always raises CPL and usually lowers cost per job.

=== SPEED TO LEAD (the lever that beats every ad tweak) ===
A form lead called within 5 minutes is ~21x more likely to convert than one
called after 30. Within the first minute the lift is bigger still. 95% of home
service companies fail this - which means the follow-up SLA is a larger edge
than any creative decision in this playbook.

Set with every client at onboarding: who calls form leads, and how fast. If
nobody can call within 15 minutes during business hours, run Call ads and
maintenance offers instead of lead forms - a form lead that ages overnight is
mostly spend with no job.

=== CREATIVE DIRECTION: REAL BEATS PRODUCED ===
The visual hierarchy for trades, best first:
1. Real tech/owner to camera, branded shirt, job site behind them (video)
2. Real before/after of an actual job (image or video)
3. Branded truck in a real driveway - the "your neighbor hired us" shot
4. Team photo with the trucks - trust format for proof-led hooks
5. Clean composited offer card (what the Studio builds) - works best paired
   with a real photo background, not a stock one

Never stock photos. Homeowners pattern-match stock instantly, and Meta's
delivery increasingly rewards the native-looking content people don't skip.
The client's phone camera beats a stock library - ask every client for: 10
job-site photos, 3 truck shots, 1 owner/team photo, shot in daylight, per
quarter. That library is a deliverable, chase it like one.

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

=== KILL / SCALE DISCIPLINE (Andromeda era) ===
Ad lifespan has compressed: creative that used to run 6-8 weeks now fatigues in
2-4. The refresh cycle is part of the retainer, not an emergency.

DON'T TOUCH too early:
- An ad set in learning (under ~50 conversions/week) gives noisy numbers.
  Budget jumps over 20%, edits, or adding/removing ads RESET learning - batch
  changes, don't drip them.
- Don't judge any single ad before it has spent ~1.5-2x the account's cost per
  lead. Killing at $20 spend on a $60-CPL account is killing on noise.

KILL when (any one):
- Spend >= 3x the account's median CPL with ZERO leads
- CPL > 2x account median after >= 5x median CPL in spend
- CTR down 30%+ from its own first-week baseline (fatigue - refresh, don't mourn)

WATCH when: frequency climbs past ~3, or CTR slides 10%+ week over week.
That ad has 1-2 weeks left; have its replacement ready.

SCALE when: CPL <= 0.7x account median with 10+ leads. Raise budget <= 20% at a
time (more resets learning), or duplicate the winning creative into the next
format instead of raising budget at all.

The CRM's Ad Doctor runs these exact rules against the daily sync data and
flags the verdicts. Trust it for the arithmetic; overrule it with context it
can't see (a seasonal push, a client request, a tracking gap).

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
CAMPAIGN "HIGH-LTV: REPLACEMENT"  (most budget): replacements, installs
CAMPAIGN "MID-LTV: MAINTENANCE"   (steady)     , plans, tune-ups
CAMPAIGN "LOW-LTV: SERVICE CALLS" (lean)       , diagnostic, repair

Starting split once tiered: 50% High / 30% Mid / 20% Low, then let numbers move it.

Offer style follows the tier: High = financing/monthly payment, Mid = priced
tune-up or plan, Low = priced tripwire. See the price section above.

Tier templates for other trades:
- Pressure washing: High = full house + roof soft-wash / Mid = recurring plans / Low = single driveway
- Roofing: High = full replacement / Mid = repairs + plans / Low = inspections, patches
- Plumbing: High = repipe, water heater, sewer / Mid = fixtures, maintenance / Low = drain clears
- Lawn: High = installs, hardscaping / Mid = recurring contracts / Low = one-time cleanups

=== STAGING RULE (the most important part) ===
STAGE 1: LAUNCH LEAN (default for every new client):
- One broad ad set, 5-6 stacked creatives, let Meta optimize.
- Any client under roughly $75-100/day lives here.
- Goal: find the winning hook and offer. Do not split yet.

STAGE 2: GRADUATE TO TIERS:
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
On instant-form ads the button opens the form, so the button text sets the
expectation: "Get Quote" primes a follow-up call; "Book Now" primes a time slot.
Set it to what actually happens next or the lead feels tricked at hello.

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
- Andromeda retrieves ads by the creative itself: fresh, varied creative gets
  cheaper delivery, and stale creative decays in 2-4 weeks. Plan a standing
  refresh cadence per client, not refresh-on-emergency.
- Lead forms convert 25-35% higher than landing pages for home services - use
  Higher Intent forms, not More Volume (see the lead form section).
- Meta = demand GENERATION (before they search). Google LSA = demand CAPTURE (as
  they search). Different jobs, they complement.

=== THE METRIC THAT ACTUALLY MATTERS ===
Form fills are not the metric. Booked jobs are. A cheap lead that never books
loses money quietly. Judge every account on cost per booked job, and scaling
decisions on LTV:CAC. And before touching any ad setting, check the follow-up:
a 5-minute call-back SLA moves more revenue than any change in Ads Manager.`
