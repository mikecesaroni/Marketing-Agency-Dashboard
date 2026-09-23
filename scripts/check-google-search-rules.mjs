// Self-check for the Google Search rules. Run: node scripts/check-google-search-rules.mjs
//
// The rules: A KEYWORD SPENDING WITH NOTHING TO SHOW IS CALLED WASTE, A
// KEYWORD THAT HAS NOT SPENT ENOUGH IS NOT JUDGED AT ALL, AND A SEARCH TERM
// SOMEBODY HAS ALREADY DECIDED ABOUT IS NEVER PROPOSED AGAIN.

import { RULES, diagnoseKeywords, negativeCandidates, wasteSummary } from '../src/lib/googleSearchRules.js'

let failures = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`)
}

const kw = (over) => ({
  client_id: 'c1',
  date: '2026-09-20',
  ad_group_id: 'ag1',
  criterion_id: 'k1',
  keyword_text: 'ac repair',
  match_type: 'PHRASE',
  campaign_name: 'Search - AC',
  ad_group_name: 'AC repair',
  impressions: 100,
  clicks: 5,
  cost: 30,
  conversions: 0,
  conversion_value: 0,
  ...over,
})

const term = (over) => ({
  client_id: 'c1',
  date: '2026-09-20',
  ad_group_id: 'ag1',
  search_term: 'ac repair near me',
  keyword_text: 'ac repair',
  status: 'NONE',
  impressions: 50,
  clicks: 3,
  cost: 30,
  conversions: 0,
  ...over,
})

// ---------------------------------------------------------------- keywords
{
  const [k] = diagnoseKeywords([kw({ cost: 10, clicks: 2 })])
  check('under the minimum spend it is not judged', k.verdict, 'young')
}
{
  const [k] = diagnoseKeywords([kw({ cost: 90, clicks: 6, conversions: 0 })])
  check('expensive and converting nothing is waste', k.verdict, 'waste')
}
{
  // The cheap-click failure: well under the dollar bar, well over the clicks.
  const [k] = diagnoseKeywords([kw({ cost: 40, clicks: 25, conversions: 0 })])
  check('cheap clicks that never convert are still waste', k.verdict, 'waste')
  check('and the reason says which bar it crossed', /Cheap clicks/.test(k.signal), true)
}
{
  const [k] = diagnoseKeywords([kw({ cost: 500, conversions: 1 })])
  check('converting once at a terrible price is expensive, not waste', k.verdict, 'expensive')
}
{
  const [k] = diagnoseKeywords([kw({ cost: 300, conversions: 4 })])
  check('four conversions at a fair price is a winner', k.verdict, 'winner')
  check('and its cost per conversion is reported', k.cpl, 75)
}
{
  // One conversion is noise, and must not promote a keyword to winner.
  const [k] = diagnoseKeywords([kw({ cost: 100, conversions: 1 })])
  check('a single conversion is not yet a winner', k.verdict, 'ok')
}
{
  // Daily rows for the same keyword are one keyword, not several.
  const rows = [
    kw({ date: '2026-09-18', cost: 40, clicks: 10, conversions: 0 }),
    kw({ date: '2026-09-19', cost: 40, clicks: 10, conversions: 0 }),
  ]
  const out = diagnoseKeywords(rows)
  check('daily rows are summed into one keyword', out.length, 1)
  check('and the summed spend is what gets judged', out[0].cost, 80)
  check('which tips it over the line', out[0].verdict, 'waste')
}
{
  // Two keywords in different ad groups sharing a criterion id are different
  // keywords. Grouping on criterion alone would merge them.
  const rows = [kw({}), kw({ ad_group_id: 'ag2', cost: 90, conversions: 0 })]
  check('the same criterion id in two ad groups stays two keywords', diagnoseKeywords(rows).length, 2)
}
{
  const rows = [
    kw({ criterion_id: 'a', cost: 200, conversions: 0 }),
    kw({ criterion_id: 'b', cost: 300, conversions: 5 }),
    kw({ criterion_id: 'c', cost: 90, conversions: 0 }),
  ]
  const out = diagnoseKeywords(rows)
  check('the worst is listed first', out[0].verdict, 'waste')
  check('and the winner is listed last', out[out.length - 1].verdict, 'winner')
  check('with the bigger waste above the smaller', out[0].cost, 200)
}
{
  const rows = [kw({ date: '2026-09-01', cost: 500 }), kw({ date: '2026-09-20', cost: 30 })]
  const out = diagnoseKeywords(rows, { since: '2026-09-15' })
  check('rows before the window are excluded', out[0].cost, 30)
}

// ----------------------------------------------------------- search terms
{
  const out = negativeCandidates([term({ cost: 40 })])
  check('an expensive term with no conversions is a candidate', out.length, 1)
  check('and it is not called certain', out[0].certain, false)
}
{
  const out = negativeCandidates([term({ cost: 5 })])
  check('a cheap term with no conversions is left alone', out.length, 0)
}
{
  const out = negativeCandidates([term({ cost: 40, conversions: 1 })])
  check('a term that converted is never a candidate', out.length, 0)
}
{
  const out = negativeCandidates([term({ cost: 40, status: 'EXCLUDED' })])
  check('a term already excluded is not proposed again', out.length, 0)
}
{
  const out = negativeCandidates([term({ cost: 40, status: 'ADDED' })])
  check('nor is one already added as a keyword', out.length, 0)
}
{
  // Junk fires far below the dollar bar, because a negative is cheap to add.
  const out = negativeCandidates([term({ search_term: 'hvac jobs near me', cost: 8 })])
  check('an obvious job search is caught cheaply', out.length, 1)
  check('and is called certain', out[0].certain, true)
  check('with the human reason, not a threshold', /looking for work/.test(out[0].why), true)
}
{
  const out = negativeCandidates([term({ search_term: 'how to fix my ac myself', cost: 8 })])
  check('a DIY search is caught', out[0].certain, true)
}
{
  // Whole-word matching: these two must NOT fire.
  const out = negativeCandidates([
    term({ search_term: 'ac repair apartments downtown', cost: 8 }),
    term({ search_term: 'emergency ac repair jobsite', cost: 8 }),
  ])
  check('"apartments" does not trip the parts rule', out.length, 0)
}
{
  const out = negativeCandidates([
    term({ search_term: 'ac repair near me', cost: 200 }),
    term({ search_term: 'hvac apprenticeship', cost: 10 }),
  ])
  check('certain junk outranks a more expensive maybe', out[0].term, 'hvac apprenticeship')
}
{
  // Case and spacing: Google returns terms lowercased, but the grouping must
  // not depend on that.
  const out = negativeCandidates([
    term({ date: '2026-09-18', search_term: 'HVAC Jobs', cost: 5 }),
    term({ date: '2026-09-19', search_term: 'hvac jobs', cost: 5 }),
  ])
  check('the same term in two cases is one candidate', out.length, 1)
  check('with its spend summed', out[0].cost, 10)
}

// --------------------------------------------------------------- summary
{
  const keywords = diagnoseKeywords([kw({ cost: 200, conversions: 0 })])
  const terms = negativeCandidates([term({ cost: 40 })])
  const s = wasteSummary(keywords, terms)
  check('the summary counts the dead keywords', s.deadKeywords, 1)
  check('and what they cost', s.wasted, 200)
  check('and keeps the savable total separate', s.savable, 40)
  check('the headline leads with the waste', /200/.test(s.headline), true)
}
{
  const s = wasteSummary([], [])
  check('nothing wrong says so plainly', s.headline, 'Nothing obviously wasted.')
}
{
  // The thresholds are the contract. If one moves, this fails and whoever
  // moved it has to say why in the same commit.
  check('the thresholds are the ones documented', [RULES.deadSpend, RULES.deadClicks, RULES.badCpl, RULES.termDeadSpend], [75, 20, 200, 25])
}

console.log(failures === 0 ? '\nAll Google Search rule checks passed' : `\n${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
