// Assembles the full per-client working brief.
//
// This replaces spinning up a Claude Project and pasting three documents into
// it. Everything the template used to ask you to fill in by hand comes from
// data the CRM already holds, and the parts of the playbook that are actually
// rules (stage gate, creative count, geo) are resolved here and stated as
// decisions rather than left for the model to re-derive.
//
// The one thing a pasted Project could never do is see live numbers. When ad
// data exists it is folded in, so "what should I cut" has something to read.

import { formatIntake } from './intakeSummary'
import { PLAYBOOK } from './playbook'

// Below this daily budget the playbook says stay on one broad ad set. Splitting
// a small budget across campaigns starves each of data and none exit learning.
const STAGE_2_DAILY_BUDGET = 100

// Fields the brief genuinely needs. Anything missing is surfaced in the UI
// rather than silently rendering an empty bracket, because a blank "average job
// value" quietly breaks every cost-per-booked-job calculation downstream.
export const REQUIRED_FOR_BRIEF = [
  ['business_name', 'Business Name', 'names the client everywhere in the brief'],
  ['industry_trade', 'Industry / Trade', 'drives hook angles and LTV tiering'],
  ['service_area', 'Service Area', 'sets the geo radius'],
  ['target_cities', 'Cities to Target in Ads', 'the city name goes literally into every hook'],
  ['meta_ad_budget_per_day', 'Meta Ad Budget ($/day)', 'decides Stage 1 vs Stage 2 structure'],
  ['average_job_value', 'Average Job Value', 'without it, cost per booked job and LTV:CAC cannot be calculated'],
  ['services_offered', 'Services Offered', 'the ads need something specific to sell'],
  ['cta_offering', 'What Are We Offering to Get Leads?', 'the offer is one of the five ad parts'],
  ['why_people_choose', 'What Makes Them Better', 'this is the differentiation angle'],
  ['most_common_objection', 'Most Common Objection', 'the agitate section answers it'],
  ['main_goal', 'Main Goal', 'sets the campaign objective'],
  ['success_90_days', 'Success in 90 Days', 'the benchmark everything is judged against'],
  ['leads_go_to', 'Where Do Leads Go Now?', 'decides lead form vs website vs call'],
  ['response_time_to_lead', 'Response Time to New Lead', 'speed to lead decides whether leads book'],
]

export function missingForBrief(intake) {
  if (!intake) return REQUIRED_FOR_BRIEF.map(([key, label, why]) => ({ key, label, why }))
  return REQUIRED_FOR_BRIEF.filter(([key]) => {
    const v = intake[key]
    return v === null || v === undefined || String(v).trim() === ''
  }).map(([key, label, why]) => ({ key, label, why }))
}

const money = (n) => (n || n === 0 ? `$${Number(n).toLocaleString()}` : '[not captured]')
const val = (v) => {
  if (v === true) return 'Yes'
  if (v === false) return 'No'
  const s = v === null || v === undefined ? '' : String(v).trim()
  return s || '[not captured]'
}

// Which of the seven hook formulas an ad name looks like. Rough on purpose —
// it exists to stop the model re-proposing an angle that already lost, not to
// be a classifier.
const HOOK_PATTERNS = [
  [/attention|homeowners?:/i, 'Local call-out'],
  [/\?$|won'?t|not working|problem/i, 'Problem question'],
  [/checklist|symptom|signs?/i, 'Symptom checklist'],
  [/waiting|cost of|before it|now or/i, 'Cost of waiting'],
  [/season|summer|winter|heatwave|before the/i, 'Seasonal / urgency'],
  [/\$\d|\boffers?\b|\boff\b|\bfree\b|special|discount/i, 'Bold local offer'],
  [/star|trust|families|years|rated|review/i, 'Trust / proof-led'],
]

function guessHook(name = '') {
  for (const [re, label] of HOOK_PATTERNS) if (re.test(name)) return label
  return 'Unclassified'
}

// Live account state, folded into the brief so recommendations are grounded in
// what actually ran rather than what was pasted in weeks ago.
function performanceBlock(ads) {
  if (!ads || ads.length === 0) {
    return `No ad performance data yet. This is a cold start: nothing has run,
so there is no winner to protect and no loser to avoid.`
  }

  const live = ads.filter((a) => a.live)
  const spend = ads.reduce((t, a) => t + a.spend, 0)
  const leads = ads.reduce((t, a) => t + a.leads, 0)
  const cpl = leads > 0 ? spend / leads : 0

  const line = (a) =>
    `- ${a.ad_name || a.ad_id} [${guessHook(a.ad_name)}] ${a.live ? 'LIVE' : 'paused'} — ` +
    `$${a.spend.toFixed(2)}, ${a.leads} leads, ` +
    `${a.cpl > 0 ? `$${a.cpl.toFixed(2)}/lead` : 'no leads'}`

  const ranked = [...ads].sort((a, b) => b.spend - a.spend)
  const withLeads = ranked.filter((a) => a.leads > 0).sort((a, b) => a.cpl - b.cpl)
  const noLeads = ranked.filter((a) => a.leads === 0 && a.spend > 20)

  return `Totals to date: $${spend.toFixed(2)} spent, ${leads} leads, ${
    cpl > 0 ? `$${cpl.toFixed(2)}` : 'n/a'
  } per lead. ${live.length} of ${ads.length} ads currently live.

ALL ADS:
${ranked.map(line).join('\n')}

BEST COST PER LEAD SO FAR:
${withLeads.length ? withLeads.slice(0, 3).map(line).join('\n') : '- none have produced a lead yet'}

SPENDING WITH NOTHING TO SHOW (over $20, zero leads):
${noLeads.length ? noLeads.map(line).join('\n') : '- none'}

Hook angles I can identify from the ad names: ${
    [...new Set(ads.map((a) => guessHook(a.ad_name)))].filter((h) => h !== 'Unclassified').join(', ') ||
    'none clearly identifiable'
  }. Ad names are internal labels, not the hooks themselves, so treat this as a
hint and read the copy in the account if you need certainty.
Do not re-propose an angle that already lost here without saying why it deserves another run.`
}

function ctaFor(intake) {
  const goal = `${intake?.main_goal || ''} ${intake?.cta_offering || ''}`.toLowerCase()
  if (/emergency|burst|no heat|no ac|urgent/.test(goal)) return 'Call Now'
  if (/install|replace|quote|estimate/.test(goal)) return 'Get Quote'
  if (/tune|maintenance|plan|inspection/.test(goal)) return 'Book Now'
  return 'Get Quote'
}

export function buildBrief({ client, intake, ads }) {
  const i = intake || {}
  const name = i.business_name || client?.name || 'this client'
  const daily = Number(i.meta_ad_budget_per_day) || 0
  const monthly = daily ? daily * 30 : 0
  const stage = daily >= STAGE_2_DAILY_BUDGET ? 2 : 1
  const account = client?.meta_ad_account_id ? `act_${client.meta_ad_account_id}` : '[NOT SET IN CRM]'

  const stageLine =
    stage === 1
      ? `STAGE 1 — LAUNCH LEAN. At ${money(daily)}/day this client is below the ~$${STAGE_2_DAILY_BUDGET}/day gate.
One broad ad set, 5-6 stacked creatives, different hooks, let Meta optimize.
Do NOT propose the High/Mid/Low tier structure. It would starve every campaign.`
      : `STAGE 2 — ELIGIBLE FOR TIERS. At ${money(daily)}/day this client can support splitting,
but only if each campaign can clear ~50 conversions on its own. Split the High-LTV
campaign off first and keep the rest broad until volume justifies more.`

  return `You are my execution partner for one client: ${name}.
Everything in this brief is current as of ${new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })}, generated from my CRM. Do not ask me for information that is already below.

=== ABOUT ME ===
I run a marketing agency for blue-collar businesses (home services, trades,
contractors). I run Meta ads and Google Local Services Ads. I build ad creative
in my own Claude Design Ads Studio, which produces the finished image and video
artboards. I'm a business owner, not a technical marketer, so explain things
plainly and skip the jargon. Default: do the work and hand me drafts to approve,
not advice on how I could do it myself.

=== THE CLIENT ===
Business: ${name}
Industry: ${val(i.industry_trade)}
Market: ${val(i.service_area)}
Cities to target: ${val(i.target_cities)}
Meta Ad Account: ${account}
Daily budget: ${money(daily)}/day${monthly ? `  (about ${money(monthly)}/month)` : ''}
Average job value: ${money(i.average_job_value)}
Main goal: ${val(i.main_goal)}
Success in 90 days: ${val(i.success_90_days)}
What makes them different: ${val(i.why_people_choose)}
Top objection: ${val(i.most_common_objection)}
Offer to get leads: ${val(i.cta_offering)}
Current offers: ${val(i.current_offers_guarantees)}
Proof: ${val(i.reviews_star_rating)} stars, ${val(i.reviews_count)} reviews.
  Before/after photos: ${val(i.has_before_after_photos)}. Video footage: ${val(i.has_video_footage)}. Logo: ${val(i.has_logo)}.
Where leads go: ${val(i.leads_go_to)} (answered by ${val(i.who_answers_leads)}, response time ${val(i.response_time_to_lead)})
CRM / booking: ${val(i.crm_system)}

=== STRUCTURE DECISION (already made, do not re-derive) ===
${stageLine}

Recommended CTA button for this client: ${ctaFor(i)}
Targeting: ${val(i.target_cities)}, homeowners, age 30+, exclude renters.

=== WHAT IS ALREADY RUNNING ===
${performanceBlock(ads)}

=== DELIVERY ROLES ===
Work from whichever fits what I ask for:
- Strategist: campaign plan, budget split, offer and audience decisions
- Media Buyer: build campaigns, set budgets, manage ${account} and ONLY that account
- Creative Director: design briefs for Claude Design Ads Studio, owner-video scripts, ad copy
- LSA Manager: Google Local Services setup, reviews, lead disputes
- Analyst: read the numbers above, tell me what to cut, scale or fix

=== CREATIVE SYSTEM ===
Launch rule: launch with images, stack 5-6 mixed creatives in one ad set, let
Meta optimize. Pursue owner video within 5 days. Never hold a launch waiting for video.

--- FORMAT 1: OWNER VIDEO SCRIPT ---
30-45 seconds, owner talks straight to camera, filmed on a phone.

HOOK (first 3 seconds): [line that stops the scroll]
PROBLEM: [the exact frustration their customer feels right now]
PROOF: [years, review count, guarantee, local roots]
OFFER: [the specific offer]
CTA: [call, click or text, with urgency]

Filming notes: vertical 9:16, good light, quiet room or in front of the truck.
Look at the lens. Talk like you're talking to a neighbor. One take is fine.
Real beats polished.

--- FORMAT 2: CLAUDE DESIGN — STATIC AD BRIEF ---
I build these in my Claude Design Ads Studio, so give me a DESIGN BRIEF it can
lay out, not an image-generation prompt. Be specific about what text sits where.

ARTBOARDS: 1080x1080 (square), 1080x1350 (4:5 feed), 1080x1920 (9:16 story)
BACKGROUND: [the scene or photo treatment behind the text]
LOCATION BADGE: [the service area, 2-4 words, sits top-left]
HEADLINE ON IMAGE: [5-8 words, the hook, largest element, directly under the badge]
OFFER BADGE: [the offer as one line, price first if there is one, e.g.
  "$29.95 15-Point Visual Inspection · AC & Heating" — my studio splits the
  price onto its own line inside a solid colour block]
SUBHEAD: [one supporting line under the offer, plain sentence]
PROOF STRIP: [stars and review count, e.g. "★ 5.0 on Google"]
CTA BUTTON ON IMAGE: [2-3 words, e.g. "Book Today!" — white pill, dark text]
LOGO: bottom-right, small
COLOR DIRECTION: [what to pull from their brand]

Use these exact labels. My CRM reads them straight onto the artboard, so a
label I cannot find is a slot that renders empty.
KEEP CLEAR: top 250px and bottom 320px on 9:16 — the Meta interface covers it

--- FORMAT 3: CLAUDE DESIGN — MOTION AD BRIEF ---
Scene by scene, same studio. Under 15 seconds total, hook in the first 3.

SCENE 1 (HOOK, 0-3s): visual / on-screen text / motion
SCENE 2 (PROBLEM or SOLUTION, 3-8s): visual / on-screen text / motion
SCENE 3 (PROOF, 8-12s): visual / on-screen text / motion
SCENE 4 (CTA, 12-15s): visual / on-screen text / motion

Captions always on. Must work with sound off.

=== AD COPY OUTPUT ===
When I ask for ad copy, give me one block per hook angle, in a code block:

PRIMARY TEXT: [2-3 short lines. First line is the hook, it is all that shows
before "see more". Problem, offer, urgency. Plain talk.]
HEADLINE: [5-8 words. The offer or the hook.]
DESCRIPTION: [supporting detail or trust signal.]
CTA BUTTON: [Call Now / Get Quote / Book Now / Send Photo / Learn More]

Then, at the very end of your reply, repeat the full set as one JSON block:

\`\`\`json
{
  "creative_sets": [
    {
      "hook_angle": "Cost of waiting",
      "primary_text": "...",
      "headline": "...",
      "description": "...",
      "cta": "GET_QUOTE",
      "design_brief": "..."
    }
  ]
}
\`\`\`

The JSON is what my CRM reads to build the ads, so it must be valid and must
match the copy above it exactly. Use Meta's CTA enum values in the JSON
(CALL_NOW, GET_QUOTE, BOOK_NOW, LEARN_MORE, SIGN_UP).

=== WHAT I NEED FROM YOU ===
- Build, launch and manage Meta campaigns: audiences, budgets, structure, copy.
- Write design briefs for Claude Design Ads Studio, and owner-video scripts.
- Ad copy in code blocks, plus the JSON block, so nothing gets re-typed.
- Watch performance. Lead with the recommendation, then the reasoning.
- Flag problems early. Push back if something is off. I'd rather hear it straight.

=== FORMATTING ===
- No em dashes anywhere.
- Direct, confident tone. No hedging.
- Copy-paste-ready outputs.
- Plain language, no jargon.

=== WEEKLY REPORT FORMAT ===
Spend this week / Leads / Cost per lead / Cost per booked job /
What's working / What's underperforming / Action for next week.
I will give you booked jobs; the CRM does not track them yet, so ask me for that
number rather than guessing it.

${'='.repeat(62)}
FULL INTAKE
${'='.repeat(62)}

${formatIntake(i, name)}
${'='.repeat(62)}
${PLAYBOOK}`
}
