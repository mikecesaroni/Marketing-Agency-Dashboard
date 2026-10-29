// The three packages, and which one a client is on.
//
// The tier is a column on the client (supabase/client-tiers.sql), picked on
// the add form or the Client status page. Until it is, it is read from what
// the client pays a month, because the price IS the package: $1,500 is
// Maintenance, $2,500 is the Whole Chain, $3,500 is Runs Without You. That
// reading is the package, not a guess to confirm ("get rid of the question
// marks"): nothing marks it, and it can be changed on the card.
//
// The short names are what the boards, badges and the brief say: the
// price for the first and last, "Meta and Google" for the middle one, the
// way the team talks about them ("the 2500 tier needs Google and Meta").
//
// Pure, with no imports: nextSteps.js reads it and scripts/check-client-status.mjs
// runs it in Node.

export const TIERS = [
  {
    tier: 1,
    key: 'maintenance',
    name: 'CRM / Marketing Maintenance',
    short: '$1,500 plan',
    price: 1500,
    setup: 0,
    line: 'Get your ads running and your leads followed up.',
    includes: ['Meta ads managed', 'Creative built from their job photos', 'Leads followed up in GoHighLevel', 'Monthly cost-per-lead reporting'],
  },
  {
    tier: 2,
    key: 'whole-chain',
    name: 'The Whole Chain Marketing',
    // The short name says what the package is on the boards and in the brief
    // ("instead of saying Whole Chain say Meta and Google").
    short: 'Meta and Google',
    price: 2500,
    setup: 0,
    line: 'Show up in more places their customers look.',
    includes: ['Everything in Maintenance', 'Google Search ads', 'Local Services Ads', 'Google Business Profile', 'Re-engage their past customer list'],
  },
  {
    tier: 3,
    key: 'runs-without-you',
    name: 'Runs Without You Marketing',
    short: '$3,500 plan',
    price: 3500,
    setup: 500,
    line: 'The whole chain, with AI built around their business.',
    includes: ['Everything in the Whole Chain', 'A second-brain AI built on their business', 'Custom automations for the day to day'],
  },
]

export const TIER_BY_NUMBER = Object.fromEntries(TIERS.map((t) => [t.tier, t]))

/** The tier a monthly fee says, or 0 when the fee matches none of the packages. */
export function tierFromFee(fee) {
  const n = Number(fee)
  if (!Number.isFinite(n) || n <= 0) return 0
  // Within $100 of a package price: a $1,495 deal is still Maintenance.
  const hit = TIERS.find((t) => Math.abs(t.price - n) <= 100)
  return hit ? hit.tier : 0
}

/**
 * Which package a client is on: { tier, guessed }. The column when it is set;
 * else the one the fee says (guessed: true, which nothing on screen marks
 * any more); else tier 0, unknown.
 */
export function tierOf(client) {
  const set = Number(client?.tier)
  if (TIER_BY_NUMBER[set]) return { tier: set, guessed: false }
  const guess = tierFromFee(client?.monthly_fee)
  return { tier: guess, guessed: guess > 0 }
}

export function tierLabel(tier) {
  return TIER_BY_NUMBER[tier]?.short || 'No tier yet'
}

/** The dollars, for a badge: "$1,500/mo". */
export function tierPrice(tier) {
  const t = TIER_BY_NUMBER[tier]
  return t ? `$${t.price.toLocaleString()}/mo` : ''
}
