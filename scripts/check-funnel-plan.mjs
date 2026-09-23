// Self-check for the funnel plan. Run: node scripts/check-funnel-plan.mjs
//
// The rules: LEADS ARE EXCLUDED FROM EVERY AD SET, TOP OF FUNNEL EXCLUDES
// EVERYONE ALREADY IN THE FUNNEL, AND NO TWO AD SETS EVER BID FOR THE SAME
// PERSON.
//
// The last two are the ones that cost money when they are wrong, and neither
// shows up as an error in Meta -- the campaigns just quietly compete and the
// client pays twice to reach the same people.

import { campaignsIn, describePlan, funnelPlan, guessRoles, planGaps } from '../src/lib/funnelPlan.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

const ALL = { leads: 'L', formOpeners: 'O', engagers: 'E' }

// ------------------------------------------------------------ the full case
{
  const plan = funnelPlan(ALL)
  check('all three audiences give three ad sets', plan.length, 3)

  const tof = plan.find((a) => a.key === 'tof')
  check('top of funnel includes nobody in particular', tof.include, [])
  check('and excludes everyone already in the funnel', [...tof.exclude].sort(), ['E', 'L', 'O'])

  const openers = plan.find((a) => a.key === 'retarget-openers')
  check('the openers ad set targets the openers', openers.include, ['O'])
  check('and excludes the leads', openers.exclude, ['L'])

  const engagers = plan.find((a) => a.key === 'retarget-engagers')
  check('the engagers ad set targets the engagers', engagers.include, ['E'])
  check('and excludes leads AND openers, so nobody is in both', [...engagers.exclude].sort(), ['L', 'O'])
}

// THE INVARIANT THAT MATTERS: no person can be in two ad sets at once.
{
  const plan = funnelPlan(ALL)
  // A person is "in" an ad set if they match its include (or it includes
  // everyone) and match none of its excludes.
  const inSet = (who, a) =>
    (a.include.length === 0 || a.include.includes(who)) && !a.exclude.includes(who)

  for (const who of ['L', 'O', 'E']) {
    const sets = plan.filter((a) => inSet(who, a)).map((a) => a.key)
    check(`${who} appears in at most one ad set`, sets.length <= 1, true)
  }
  check('a lead appears in NO ad set at all', funnelPlan(ALL).filter((a) => inSet('L', a)).length, 0)
}

// -------------------------------------------------------- partial audiences
{
  const plan = funnelPlan({ leads: 'L', engagers: 'E' })
  check('with no openers audience there are two ad sets', plan.length, 2)
  check('and the engagers set excludes only the leads', plan[1].exclude, ['L'])
  check('while top of funnel still excludes both of the ones that exist', [...plan[0].exclude].sort(), ['E', 'L'])
}
{
  const plan = funnelPlan({ leads: 'L' })
  check('leads alone still builds a top of funnel', plan.length, 1)
  check('which excludes the leads', plan[0].exclude, ['L'])
}
{
  const plan = funnelPlan({})
  check('nothing picked still returns a plan rather than throwing', plan.length, 1)
  check('with nothing excluded', plan[0].exclude, [])
  check('and says so plainly', /no audiences were picked/.test(plan[0].why), true)
}

// ------------------------------------------------------------------- gaps
{
  const gaps = planGaps({ formOpeners: 'O', engagers: 'E' })
  check('a missing leads audience is called out', gaps[0].role, 'leads')
  check('as high severity, because it is the expensive one', gaps[0].severity, 'high')
}
{
  const gaps = planGaps({ leads: 'L' })
  check('nothing to retarget is high severity', gaps[0].severity, 'high')
  check('and says there is no retargeting campaign to build', /no retargeting campaign/.test(gaps[0].text), true)
}
{
  const gaps = planGaps({ leads: 'L', engagers: 'E' })
  check('engagers without openers is only a low-severity note', gaps[0].severity, 'low')
}
{
  check('a complete set has no gaps', planGaps(ALL).length, 0)
}

// --------------------------------------------------------------- campaigns
{
  const campaigns = campaignsIn(funnelPlan(ALL))
  check('two campaigns, not three', campaigns.length, 2)
  check('top of funnel first', campaigns[0].stage, 'tof')
  check('then retargeting', campaigns[1].stage, 'retarget')
}
{
  const campaigns = campaignsIn(funnelPlan({ leads: 'L' }))
  check('with no retargeting ad sets there is no retargeting campaign', campaigns.length, 1)
}

// ---------------------------------------------------------------- wording
{
  const lines = describePlan(funnelPlan(ALL), { L: 'Leads', O: 'Form openers', E: 'Engagers' })
  check('the description names audiences, not ids', /Leads/.test(lines[0]), true)
  check('and no raw id leaks into it', /\bL\b|\bO\b|\bE\b/.test(lines.join(' ')), false)
  check('top of funnel reads as excluding', /excluding/.test(lines[0]), true)
}

// ------------------------------------------------------------ list roles
{
  // Facebook and Instagram engagers are two audiences and one ad set.
  const plan = funnelPlan({ leads: ['L'], engagers: ['FB', 'IG'] })
  const eng = plan.find((a) => a.key === 'retarget-engagers')
  check('both engager audiences go into one ad set', eng.include, ['FB', 'IG'])
  check('and top of funnel excludes both of them plus the leads', [...plan[0].exclude].sort(), ['FB', 'IG', 'L'])
}
{
  // An empty array is truthy in JS; the gap checks must not be fooled by it.
  const gaps = planGaps({ leads: [], formOpeners: [], engagers: [] })
  check('empty role arrays still count as missing', gaps.length, 2)
  check('and the leads gap is still first', gaps[0].role, 'leads')
}

// ----------------------------------------------------------- role guessing
{
  const guessed = guessRoles([
    { id: '1', name: 'FB_Engagers_365D', subtype: 'ENGAGEMENT' },
    { id: '2', name: 'IG_Engagers_365D', subtype: 'IG_BUSINESS' },
    { id: '3', name: 'Lead_180D', subtype: 'WEBSITE' },
    { id: '4', name: 'Lookalike (1%) - customer', subtype: 'LOOKALIKE' },
    { id: '5', name: 'PageView_180D', subtype: 'WEBSITE' },
  ])
  check('both engager audiences are guessed', guessed.engagers, ['1', '2'])
  check('the leads audience is guessed', guessed.leads, ['3'])
  check('a lookalike is never assigned a role', [...guessed.leads, ...guessed.engagers].includes('4'), false)
  check('and an unrelated website audience is left alone', [...guessed.leads, ...guessed.engagers, ...guessed.formOpeners].includes('5'), false)
}
{
  const guessed = guessRoles([{ id: '9', name: 'Form opens - not converted 30d', subtype: 'LEAD' }])
  check('a form-openers audience is recognised by name', guessed.formOpeners, ['9'])
  check('and is not also counted as leads', guessed.leads, [])
}

console.log(failures === 0 ? '\nAll funnel plan checks passed' : `\n${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
