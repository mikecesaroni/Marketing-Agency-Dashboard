// A two-campaign funnel, modelled on the two accounts already running one.
//
// THIS IS NOT A DESIGN. It is Horizon HVAC and Horizon Water Co read back off
// the live API and turned into a template, because those two are what the
// other clients are meant to look like. Where a first guess disagreed with
// what is actually running, the live account won. What is running:
//
//   TOP OF FUNNEL   one campaign, campaign budget, ONE broad ad set.
//                   Includes nobody in particular. EXCLUDES the page viewers,
//                   the engagers and the leads, so it only ever pays for
//                   strangers. Advantage audience ON -- exclusions are still
//                   honoured, and on a broad prospecting ad set the expansion
//                   is the point.
//
//   RETARGETING     one campaign, campaign budget, one ad set per warm group:
//                     FB_IG_Engagers   include FB + IG engagers, exclude leads
//                     PageView_180D    include site visitors, exclude leads
//                   Advantage audience OFF on both, because here an included
//                   audience has to mean what it says.
//
// THE EXCLUSIONS ON THE PROSPECTING SIDE ARE THE POINT. Without them the two
// campaigns bid against each other in the same auction for the same people:
// the client pays twice to reach them, prospecting numbers are flattered by
// warm traffic they did not earn, and retargeting numbers are diluted by
// people who would have converted anyway. Everybody remembers to include the
// engagers in retargeting; nearly everybody forgets to exclude them from
// prospecting. Horizon Water Co's broad ad set excludes all four audiences;
// Horizon HVAC's excludes only the leads, which is the weaker of the two and
// is why this template follows Water Co.
//
// Leads are excluded EVERYWHERE. Somebody who already gave their number should
// be getting a phone call, not another impression.
//
// Pure: audiences in, a plan out. Nothing here talks to Meta.

export const STAGES = {
  tof: 'Top of funnel',
  retarget: 'Retargeting',
}

// The three jobs an audience can do here. `warmVisitors` covers whichever of
// the two warm signals a client actually has -- PageView_180D on the accounts
// running website conversions, or an instant-form-opener audience on the ones
// running lead forms. They sit in the same slot because they play the same
// part: people who showed interest and did not convert.
export const ROLES = {
  leads: {
    label: 'Already a lead',
    hint: 'People who already sent their details. Left out of every ad, so the client is not paying to reach someone who should be getting a call.',
    required: true,
  },
  warmVisitors: {
    label: 'Looked, did not send a lead',
    hint: 'Visited the website or opened the form and stopped. The retargeting campaign goes after these.',
    required: false,
  },
  engagers: {
    label: 'Liked, watched or followed',
    hint: 'Interacted with the Facebook Page or Instagram. Warm, so the retargeting campaign reaches them too.',
    required: false,
  },
}

/** One role's audiences, however it was given: an id, a list, or nothing. */
export function roleList(v) {
  return (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean)
}

/**
 * The campaigns and ad sets to build.
 *
 * `separateWarm` mirrors the one judgement call the live accounts did NOT
 * make: there, somebody who both visited the site and engaged sits in both
 * retargeting ad sets, and the two compete for them inside the same campaign
 * budget. Excluding the visitors from the engagers set would close that.
 *
 * ASKED AND ANSWERED, 2026-09-23: keep the overlap. So the default here is
 * not a placeholder waiting on a decision, it IS the decision, and the option
 * stays only because the reasoning is worth keeping next to the code. Anyone
 * tempted to turn it on is changing how the accounts run, not fixing an
 * oversight, and should ask again rather than assume.
 */
export function funnelPlan(audiences = {}, { budgetCents = {}, separateWarm = false } = {}) {
  // Each role holds ANY number of audiences, because the real accounts do:
  // Facebook engagers and Instagram engagers are two saved audiences and one
  // ad set. Meta ORs several included audiences together, which is exactly
  // the behaviour wanted.
  const leads = roleList(audiences.leads)
  const visitors = roleList(audiences.warmVisitors)
  const engagers = roleList(audiences.engagers)

  // Everyone already in the funnel. Built from whatever exists rather than
  // assuming all three do.
  const warm = [...visitors, ...engagers, ...leads]

  const campaigns = []
  const adsets = []

  campaigns.push({
    stage: 'tof',
    name: 'Top of funnel',
    // Budget lives on the CAMPAIGN, as it does on every live campaign in both
    // accounts. An earlier draft of this put it on the ad sets, arguing that a
    // campaign budget lets Meta starve prospecting -- which is true only when
    // cold and warm ad sets share one campaign. They do not: prospecting and
    // retargeting are separate campaigns with separate budgets, so the risk
    // never arises and the accounts are right.
    budget_cents: budgetCents.tof ?? null,
  })

  adsets.push({
    key: 'tof-broad',
    stage: 'tof',
    name: 'Broad — lead excluded',
    include: [],
    exclude: warm,
    // ON, matching both live broad ad sets. Exclusions are still honoured
    // with it on; it is the INCLUDES that Meta treats as a suggestion, and
    // this ad set has none.
    advantage_audience: 1,
    why: warm.length
      ? 'Strangers only. Everyone already in the funnel is excluded, so this never bids against the retargeting campaign.'
      : 'Strangers only — but nothing is excluded yet, because no audiences were picked. Until one is, this is an ordinary cold campaign.',
  })

  const warmSets = []
  if (engagers.length) {
    warmSets.push({
      key: 'retarget-engagers',
      stage: 'retarget',
      name: 'FB / IG engagers',
      include: engagers,
      exclude: [...leads, ...(separateWarm ? visitors : [])],
      // OFF. Here an included audience has to mean what it says, and with
      // advantage audience on Meta delivers outside it whenever it likes --
      // which turns a retargeting ad set back into a cold one without saying
      // so, and undoes the separation this whole structure exists to create.
      advantage_audience: 0,
      why: 'Engaged with the Page or Instagram. Both engager audiences go in together, as they do on the live accounts.',
    })
  }
  if (visitors.length) {
    warmSets.push({
      key: 'retarget-visitors',
      stage: 'retarget',
      name: 'Site visitors',
      include: visitors,
      exclude: leads,
      advantage_audience: 0,
      why: 'Looked and did not convert. The warmest people who are not yet leads.',
    })
  }

  if (warmSets.length) {
    campaigns.push({
      stage: 'retarget',
      name: 'Retargeting',
      budget_cents: budgetCents.retarget ?? null,
    })
    adsets.push(...warmSets)
  }

  return { campaigns, adsets }
}

/** What is missing, in the order it is worth fixing. */
export function planGaps(raw = {}) {
  const leads = roleList(raw.leads)
  const visitors = roleList(raw.warmVisitors)
  const engagers = roleList(raw.engagers)

  const gaps = []
  if (!leads.length) {
    gaps.push({
      role: 'leads',
      severity: 'high',
      text: 'No "already a lead" audience picked. Without it the ads keep paying to reach people who already sent their details.',
    })
  }
  if (!visitors.length && !engagers.length) {
    gaps.push({
      role: 'engagers',
      severity: 'high',
      text: 'Nobody to retarget. Pick at least one warm audience, or there is no retargeting campaign to build.',
    })
  }
  if (!visitors.length && engagers.length) {
    gaps.push({
      role: 'warmVisitors',
      severity: 'low',
      text: 'No "looked, did not send a lead" audience. Retargeting will reach people who liked or watched only; the best accounts run both.',
    })
  }
  return gaps
}

/** One sentence per ad set, for the confirm step. */
export function describePlan(adsets, names = {}) {
  const label = (id) => names[id] || id
  return adsets.map((a) => {
    const inc = a.include.length ? `to ${a.include.map(label).join(' and ')}` : 'to everyone in the location'
    const exc = a.exclude.length ? `, excluding ${a.exclude.map(label).join(', ')}` : ', excluding nobody'
    return `${a.name}: ${inc}${exc}.`
  })
}

/**
 * First guess at which saved audience fills which role, by name and subtype.
 *
 * Matched against the convention both live accounts already use:
 * FB_Engagers_365D, IG_Engagers_365D, PageView_180D, Lead_180D, and the two
 * instant-form equivalents the CRM builds, FormOpen_90D and FormSubmit_90D.
 *
 * A GUESS, never a decision: it fills the pickers in and a person confirms.
 * Auto-applying it is how a lookalike ends up excluded from prospecting
 * because somebody called it "Lead lookalike".
 */
export function guessRoles(audiences = []) {
  const out = { leads: [], warmVisitors: [], engagers: [] }

  for (const a of audiences) {
    const name = String(a?.name || '').toLowerCase()
    const subtype = String(a?.subtype || '').toUpperCase()

    // A lookalike is modelled strangers, not the people it was built from.
    // Excluding one from prospecting would exclude most of the prospects.
    if (subtype === 'LOOKALIKE' || name.includes('lookalike')) continue
    // An uploaded customer list is not a Meta-measured lead audience, and the
    // live accounts do not use one in the funnel.
    if (name.endsWith('.csv')) continue

    // WARM IS TESTED FIRST, and the order is the whole correctness of this.
    //
    // "Mini-Split LP Visitors - Not Converted - 30d" is a real audience on
    // Horizon HVAC, and a leads test that looked for "converted" claimed it --
    // which would have put the warmest non-leads on the account into the
    // exclude-everywhere slot, quietly removing them from the retargeting
    // they exist for. Matching "not converted" before "converted" is the fix;
    // dropping the bare "converted" signal is the belt to go with it.
    if (
      name.includes('pageview') ||
      name.includes('visitor') ||
      name.includes('not converted') ||
      (name.includes('form') && (name.includes('open') || name.includes('dropped')))
    ) {
      out.warmVisitors.push(a.id)
    } else if (name.includes('form') && name.includes('submit')) {
      // FormSubmit_90D, the instant-form lead. Tested BEFORE the engagers
      // branch because Meta files every lead-form audience under subtype
      // ENGAGEMENT, the same as Page engagers, and on subtype alone the
      // people who already sent their number would land in the retargeting
      // include list instead of the exclude-everywhere one.
      out.leads.push(a.id)
    } else if (subtype === 'ENGAGEMENT' || subtype === 'IG_BUSINESS' || name.includes('engager')) {
      out.engagers.push(a.id)
    } else if (name.startsWith('lead') || name.includes('_lead') || name.includes('leads')) {
      out.leads.push(a.id)
    }
  }

  return out
}
