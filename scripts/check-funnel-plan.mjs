// Self-check for the funnel plan. Run: node scripts/check-funnel-plan.mjs
//
// The rules: LEADS ARE EXCLUDED FROM EVERY AD SET, TOP OF FUNNEL EXCLUDES
// EVERYONE ALREADY IN THE FUNNEL, AND THE PLAN MATCHES WHAT THE TWO LIVE
// ACCOUNTS ACTUALLY RUN.
//
// The exclusion rules are the ones that cost money when they are wrong, and
// neither shows up as an error in Meta -- the campaigns just quietly compete
// and the client pays twice to reach the same people.
//
// The last block is the important one: it pins the template against the real
// structure read off Horizon Water Co's live account, so a future change that
// drifts away from what is running fails here.

import { describePlan, funnelPlan, guessRoles, planGaps, roleList } from '../src/lib/funnelPlan.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

const ALL = { leads: ['L'], warmVisitors: ['V'], engagers: ['FB', 'IG'] }

// ------------------------------------------------------ the shape it builds
{
  const { campaigns, adsets } = funnelPlan(ALL)
  check('two campaigns', campaigns.length, 2)
  check('top of funnel first', campaigns[0].stage, 'tof')
  check('then retargeting', campaigns[1].stage, 'retarget')
  check('three ad sets', adsets.length, 3)

  const tof = adsets.find((a) => a.key === 'tof-broad')
  check('the broad ad set includes nobody in particular', tof.include, [])
  check('and excludes everyone already in the funnel', [...tof.exclude].sort(), ['FB', 'IG', 'L', 'V'])
  check('with advantage audience ON, as both live broad ad sets have it', tof.advantage_audience, 1)

  const eng = adsets.find((a) => a.key === 'retarget-engagers')
  check('both engager audiences go into one ad set', eng.include, ['FB', 'IG'])
  check('excluding the leads', eng.exclude, ['L'])
  check('with advantage audience OFF, so the include is honoured', eng.advantage_audience, 0)

  const vis = adsets.find((a) => a.key === 'retarget-visitors')
  check('the visitors ad set targets the visitors', vis.include, ['V'])
  check('excluding the leads', vis.exclude, ['L'])
  check('advantage audience off there too', vis.advantage_audience, 0)
}

// A LEAD MUST NEVER BE REACHABLE. This is the one that costs the client money
// and their goodwill at the same time.
{
  const { adsets } = funnelPlan(ALL)
  const reaches = (who, a) =>
    (a.include.length === 0 || a.include.includes(who)) && !a.exclude.includes(who)
  check('a lead is reachable by NO ad set', adsets.filter((a) => reaches('L', a)).length, 0)
  check('a visitor is reachable by exactly one', adsets.filter((a) => reaches('V', a)).length, 1)
  check('and it is the retargeting one, not the broad one', adsets.find((a) => reaches('V', a)).key, 'retarget-visitors')
  check('an engager is not reachable by the broad ad set', reaches('FB', adsets[0]), false)
}

// The overlap the live accounts leave in place, and the option to close it.
{
  const { adsets } = funnelPlan(ALL)
  const eng = adsets.find((a) => a.key === 'retarget-engagers')
  check('by default a visitor who also engaged is in both warm ad sets', eng.exclude.includes('V'), false)
}
{
  const { adsets } = funnelPlan(ALL, { separateWarm: true })
  const eng = adsets.find((a) => a.key === 'retarget-engagers')
  check('separateWarm closes that overlap', [...eng.exclude].sort(), ['L', 'V'])
  const reaches = (who, a) =>
    (a.include.length === 0 || a.include.includes(who)) && !a.exclude.includes(who)
  check('and then nobody is in two ad sets', ['L', 'V', 'FB'].every((w) => adsets.filter((a) => reaches(w, a)).length <= 1), true)
}

// -------------------------------------------------------- partial audiences
{
  const { campaigns, adsets } = funnelPlan({ leads: ['L'], engagers: ['FB'] })
  check('with no visitors audience there are two ad sets', adsets.length, 2)
  check('and still two campaigns', campaigns.length, 2)
  check('top of funnel excludes the two that exist', [...adsets[0].exclude].sort(), ['FB', 'L'])
}
{
  const { campaigns, adsets } = funnelPlan({ leads: ['L'] })
  check('leads alone builds only a top of funnel', adsets.length, 1)
  check('and only one campaign, since there is nothing to retarget', campaigns.length, 1)
  check('which excludes the leads', adsets[0].exclude, ['L'])
}
{
  const { adsets } = funnelPlan({})
  check('nothing picked still returns a plan rather than throwing', adsets.length, 1)
  check('with nothing excluded', adsets[0].exclude, [])
  check('and says so plainly', /no audiences were picked/.test(adsets[0].why), true)
}

// ------------------------------------------------------------------- gaps
{
  const gaps = planGaps({ warmVisitors: ['V'], engagers: ['FB'] })
  check('a missing leads audience is called out', gaps[0].role, 'leads')
  check('as high severity, because it is the expensive one', gaps[0].severity, 'high')
}
{
  const gaps = planGaps({ leads: ['L'] })
  check('nothing to retarget is high severity', gaps[0].severity, 'high')
}
{
  const gaps = planGaps({ leads: ['L'], engagers: ['FB'] })
  check('engagers without visitors is only a low-severity note', gaps[0].severity, 'low')
}
{
  check('a complete set has no gaps', planGaps(ALL).length, 0)
}
{
  // An empty array is truthy in JS; the gap checks must not be fooled by it.
  const gaps = planGaps({ leads: [], warmVisitors: [], engagers: [] })
  check('empty role arrays still count as missing', gaps.length, 2)
}
{
  check('roleList takes a bare id', roleList('X'), ['X'])
  check('and a list', roleList(['X', 'Y']), ['X', 'Y'])
  check('and nothing', roleList(null), [])
}

// ----------------------------------------------------------- role guessing
{
  // Exactly the audiences on Horizon HVAC's live account.
  const guessed = guessRoles([
    { id: '1', name: 'IG_Engagers_365D', subtype: 'IG_BUSINESS' },
    { id: '2', name: 'FB_Engagers_365D', subtype: 'ENGAGEMENT' },
    { id: '3', name: 'Lead_180D', subtype: 'WEBSITE' },
    { id: '4', name: 'PageView_180D', subtype: 'WEBSITE' },
    { id: '5', name: 'Mini-Split LP Visitors - Not Converted - 30d', subtype: 'WEBSITE' },
    { id: '6', name: 'HorizonHVAC_messaging_contacts.csv', subtype: 'CUSTOM' },
    { id: '7', name: 'Lookalike (1%) - HorizonHVAC_customer 12.4.25', subtype: 'LOOKALIKE' },
    { id: '8', name: 'Visitors 180', subtype: 'WEBSITE' },
  ])
  check('both engager audiences are found', [...guessed.engagers].sort(), ['1', '2'])
  check('the leads audience is found', guessed.leads, ['3'])
  check('page views and visitors are warm', [...guessed.warmVisitors].sort(), ['4', '5', '8'])
  const assigned = [...guessed.leads, ...guessed.engagers, ...guessed.warmVisitors]
  check('a lookalike is never given a role', assigned.includes('7'), false)
  check('and neither is an uploaded csv', assigned.includes('6'), false)
}
{
  const guessed = guessRoles([{ id: '9', name: 'Form opens - not converted 30d', subtype: 'LEAD' }])
  check('a form-openers audience counts as warm', guessed.warmVisitors, ['9'])
  check('and is not mistaken for leads', guessed.leads, [])
}

// ---------------------------------------------------------------- wording
{
  const { adsets } = funnelPlan(ALL)
  const lines = describePlan(adsets, { L: 'Leads', V: 'PageView_180D', FB: 'FB engagers', IG: 'IG engagers' })
  check('the description names audiences, not ids', /Leads/.test(lines[0]), true)
  check('top of funnel reads as excluding', /excluding/.test(lines[0]), true)
}

// ------------------------------------------- pinned against the live account
//
// Horizon Water Co, read off the API on 2026-09-23. If this fails, either the
// template drifted or the account changed -- and either way somebody should
// look before it gets copied onto fifteen more clients.
{
  const live = {
    leads: ['Lead_180D'],
    warmVisitors: ['PageView_180D'],
    engagers: ['FB_Engagers_365D', 'IG_Engagers_365D'],
  }
  const { campaigns, adsets } = funnelPlan(live)

  check('the live account has two campaigns and so does the plan', campaigns.length, 2)
  check('the live account has three ad sets and so does the plan', adsets.length, 3)

  const broad = adsets.find((a) => a.key === 'tof-broad')
  check(
    'the broad ad set excludes the same four audiences as RI-AllState-Broad_LeadExclu',
    [...broad.exclude].sort(),
    ['FB_Engagers_365D', 'IG_Engagers_365D', 'Lead_180D', 'PageView_180D']
  )
  check('and matches its advantage_audience of 1', broad.advantage_audience, 1)

  const eng = adsets.find((a) => a.key === 'retarget-engagers')
  check('FB_IG_Engagers_365 includes both engager audiences', eng.include, ['FB_Engagers_365D', 'IG_Engagers_365D'])
  check('and excludes only the leads, as it does live', eng.exclude, ['Lead_180D'])
  check('with advantage_audience 0, as it is live', eng.advantage_audience, 0)

  const vis = adsets.find((a) => a.key === 'retarget-visitors')
  check('PageView_180D includes the page viewers', vis.include, ['PageView_180D'])
  check('and excludes only the leads, as it does live', vis.exclude, ['Lead_180D'])
  check('with advantage_audience 0, as it is live', vis.advantage_audience, 0)

  check('budget is on the campaigns, not the ad sets, as it is live',
    adsets.every((a) => !('budget_cents' in a)), true)
  check('and both campaigns carry a budget slot', campaigns.every((c) => 'budget_cents' in c), true)
}

console.log(failures === 0 ? '\nAll funnel plan checks passed' : `\n${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
