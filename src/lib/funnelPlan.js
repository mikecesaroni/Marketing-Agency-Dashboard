// A two-campaign funnel, as data rather than as a thing you remember to do.
//
// The structure:
//
//   TOP OF FUNNEL   one ad set, strangers only.
//                   Excludes leads, form openers and engagers, so it never
//                   pays to reach anybody who already knows the business.
//
//   RETARGETING     two ad sets, because the two audiences deserve separate
//                   budgets and separate verdicts:
//                     - opened the form and did not submit
//                     - engaged with Facebook or Instagram
//                   Both exclude leads.
//
// THE EXCLUSION ON THE TOP-OF-FUNNEL SIDE IS THE POINT. Without it the two
// campaigns bid against each other in the same auction for the same people:
// the client pays twice to reach them, the top-of-funnel numbers are flattered
// by warm traffic it did not earn, and the retargeting numbers are diluted by
// people who would have converted anyway. Everybody remembers to include the
// engagers in retargeting and nearly everybody forgets to exclude them from
// prospecting, which is why this is a template and not a checklist.
//
// Leads are excluded EVERYWHERE. Somebody who already gave their number should
// not see either campaign; they should be getting a phone call.
//
// Pure: audiences in, a plan out. Nothing here talks to Meta. What executes it
// is createFunnel in metaFunnel.js, and what it builds is exactly what
// describePlan() says it will.

export const STAGES = {
  tof: 'Top of funnel',
  retarget: 'Retargeting',
}

// What each role means, in the words somebody picking an audience needs.
export const ROLES = {
  leads: {
    label: 'Leads',
    hint: 'People who submitted the form. Excluded from everything — they should be getting a call, not another ad.',
    required: true,
  },
  formOpeners: {
    label: 'Opened the form',
    hint: 'Opened the instant form and did not submit it. The warmest people who are not yet leads.',
    required: false,
  },
  engagers: {
    label: 'Facebook / Instagram engagers',
    hint: 'Anyone who engaged with the Page or the Instagram account.',
    required: false,
  },
}

/**
 * The ad sets to build, given which audience fills which role.
 *
 * `audiences` is {leads, formOpeners, engagers}, each an id or null. A role
 * left empty simply drops out: a client with no form-openers audience yet gets
 * a working funnel with one retargeting ad set instead of two, rather than an
 * error telling them to go and make one first.
 */
export function funnelPlan(audiences = {}, { budgetCents = {} } = {}) {
  // Each role holds ANY number of audiences, because the real accounts do:
  // Facebook engagers and Instagram engagers are two separate saved audiences
  // and both belong in the one engagers ad set. Meta ORs several included
  // audiences together, which is exactly the behaviour wanted.
  const list = (v) => (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean)
  const leads = list(audiences.leads)
  const openers = list(audiences.formOpeners)
  const engagers = list(audiences.engagers)

  // Everyone already in the funnel. This is what top of funnel excludes, and
  // it is built from whatever exists rather than assuming all three do.
  const warm = [...openers, ...engagers, ...leads]

  const adsets = []

  adsets.push({
    key: 'tof',
    stage: 'tof',
    name: 'Top of funnel — cold',
    include: [],
    exclude: warm,
    budget_cents: budgetCents.tof ?? null,
    why: warm.length
      ? 'Strangers only. Everyone already in the funnel is excluded, so this never bids against the retargeting campaign.'
      : 'Strangers only — but nothing is excluded yet, because no audiences were picked. Until one is, this is an ordinary cold campaign.',
  })

  if (openers.length) {
    adsets.push({
      key: 'retarget-openers',
      stage: 'retarget',
      name: 'Retargeting — opened the form',
      include: openers,
      exclude: leads,
      budget_cents: budgetCents.openers ?? null,
      why: 'Opened the form and did not finish it. The warmest people who are not yet leads, so this usually earns the higher budget of the two.',
    })
  }

  if (engagers.length) {
    adsets.push({
      key: 'retarget-engagers',
      stage: 'retarget',
      name: 'Retargeting — FB / IG engagers',
      include: engagers,
      // Openers are excluded here as well as leads, so somebody who did both
      // sits in exactly one ad set. Two ad sets bidding for the same person
      // is the same waste as two campaigns doing it.
      exclude: [...leads, ...openers],
      budget_cents: budgetCents.engagers ?? null,
      why: 'Engaged with the Page or Instagram but never opened the form. Kept apart from the openers so each gets its own budget and its own verdict.',
    })
  }

  return adsets
}

/** One role's audiences, however it was given: an id, a list, or nothing. */
export function roleList(v) {
  return (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean)
}

/**
 * What is missing, in the order it is worth fixing.
 *
 * Note the roleList() calls rather than plain truthiness: an empty array is
 * truthy in JavaScript, so `!audiences.leads` stopped being a test for "no
 * leads audience" the moment roles became lists, and every gap would have
 * silently stopped firing.
 */
export function planGaps(rawAudiences = {}) {
  const audiences = {
    leads: roleList(rawAudiences.leads).length ? rawAudiences.leads : null,
    formOpeners: roleList(rawAudiences.formOpeners).length ? rawAudiences.formOpeners : null,
    engagers: roleList(rawAudiences.engagers).length ? rawAudiences.engagers : null,
  }
  const gaps = []
  if (!audiences.leads) {
    gaps.push({
      role: 'leads',
      severity: 'high',
      text: 'No leads audience. Without it every ad set keeps paying to reach people who already gave you their number.',
    })
  }
  if (!audiences.formOpeners && !audiences.engagers) {
    gaps.push({
      role: 'formOpeners',
      severity: 'high',
      text: 'Nothing to retarget. Pick at least one of the form-openers or engagers audiences, or there is no retargeting campaign to build.',
    })
  }
  if (!audiences.formOpeners && audiences.engagers) {
    gaps.push({
      role: 'formOpeners',
      severity: 'low',
      text: 'No form-openers audience. Retargeting will run on engagers alone, which is a colder and usually more expensive group.',
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

/** The campaigns to create, derived from whichever ad sets survived. */
export function campaignsIn(adsets) {
  const out = []
  for (const a of adsets) {
    if (!out.some((c) => c.stage === a.stage)) {
      out.push({ stage: a.stage, name: STAGES[a.stage] })
    }
  }
  return out
}

/**
 * First guess at which saved audience fills which role, by name and subtype.
 *
 * The house convention across the accounts that already have these is
 * FB_Engagers_365D, IG_Engagers_365D, Lead_180D -- so matching on name gets it
 * right most of the time, and subtype catches the ones named differently.
 *
 * A GUESS, never a decision: it fills the pickers in and the person confirms.
 * Auto-applying it would be how a lookalike audience ends up excluded from
 * prospecting because somebody called it "Lead lookalike".
 */
export function guessRoles(audiences = []) {
  const out = { leads: [], formOpeners: [], engagers: [] }

  for (const a of audiences) {
    const name = String(a?.name || '').toLowerCase()
    const subtype = String(a?.subtype || '').toUpperCase()

    // Lookalikes are modelled strangers, not the people they were built from.
    // Excluding one from prospecting would exclude most of the prospects.
    if (subtype === 'LOOKALIKE' || name.includes('lookalike')) continue

    if (name.includes('form') && (name.includes('open') || name.includes('not converted') || name.includes('no submit'))) {
      out.formOpeners.push(a.id)
    } else if (name.includes('lead') || name.includes('converted') || name.includes('customer')) {
      out.leads.push(a.id)
    } else if (subtype === 'ENGAGEMENT' || subtype === 'IG_BUSINESS' || name.includes('engager')) {
      out.engagers.push(a.id)
    }
  }

  return out
}
