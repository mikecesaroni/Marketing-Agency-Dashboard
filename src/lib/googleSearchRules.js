// What the Google Search numbers mean, as rules rather than a dashboard.
//
// Search wastes money differently from Meta. A Meta ad that is not working
// shows you a bad cost per lead and you turn it off. A search campaign that is
// not working usually has a handful of keywords doing fine and a long tail
// quietly eating the budget on clicks that were never going to call -- people
// looking for a job, a part, a tutorial, or a different trade entirely. Nobody
// finds those by looking at the campaign total, because the campaign total
// looks acceptable right up until it does not.
//
// So there are two jobs here and they are separate on purpose:
//
//   diagnoseKeywords  -- of the things we chose to bid on, which are losing?
//   negativeCandidates -- of the things people actually typed, which should we
//                         stop paying for at all?
//
// The second is where the money is. A negative keyword saves that spend across
// every campaign, permanently, and costs one click to add.
//
// Everything is pure: rows in, verdicts out. No Supabase, no dates from the
// clock unless passed in, so the check script can pin a window and assert.

export const RULES = {
  // Spend on ONE keyword with nothing to show for it. Set against a typical
  // home services job being worth several hundred dollars: at $75 with no
  // conversion the keyword has spent a meaningful fraction of a job and has
  // not produced one.
  deadSpend: 75,
  // The cheap-click version of the same failure. Twenty clicks and no calls is
  // a keyword that attracts people who are not buying, whatever it cost.
  deadClicks: 20,
  // Below this a keyword has not had a fair run, whatever it looks like.
  minSpendToJudge: 20,
  // A keyword is only a winner once it has done it more than once. One
  // conversion is noise.
  winnerConversions: 3,
  // Cost per conversion above this is bad for home services even when the
  // keyword does convert. Deliberately generous: a booked HVAC install is
  // worth far more, and killing a $200 CPL keyword that books installs is a
  // worse mistake than leaving it on.
  badCpl: 200,
  // A search term costing this much with no conversion is worth a decision.
  // Lower than deadSpend because a negative applies everywhere at once, so
  // being wrong is cheap and being right compounds.
  termDeadSpend: 25,
  // Any spend at all on an obviously-wrong term is worth flagging.
  junkTermSpend: 5,
}

// Terms that are never a customer for a home services business. These are not
// guesses: every one of them is a search that looks relevant to a keyword
// matcher and is obviously not a buyer to a human.
//
// Matched as whole words, so "parts" does not fire on "apartments" and "job"
// does not fire on "jobsite".
const JUNK_PATTERNS = [
  { re: /\b(job|jobs|hiring|careers?|salary|salaries|apprentice|apprenticeship|employment|resume)\b/i, why: 'someone looking for work' },
  { re: /\b(training|school|schools|course|courses|certification|certified|license|licensing|class|classes)\b/i, why: 'someone training for the trade' },
  { re: /\b(diy|myself|yourself|how to|tutorial|youtube|instructions|manual)\b/i, why: 'someone doing it themselves' },
  { re: /\b(wholesale|supplier|suppliers|distributor|for sale|used|refurbished|parts)\b/i, why: 'someone buying equipment, not service' },
  { re: /\b(free|cheapest)\b/i, why: 'price-only, rarely books' },
]

function junkReason(term) {
  const text = String(term || '')
  for (const { re, why } of JUNK_PATTERNS) if (re.test(text)) return why
  return null
}

const money = (n) => Math.round(Number(n || 0) * 100) / 100

/** Sum the daily rows for one thing into one row. */
function total(rows) {
  return rows.reduce(
    (a, r) => ({
      impressions: a.impressions + Number(r.impressions || 0),
      clicks: a.clicks + Number(r.clicks || 0),
      cost: a.cost + Number(r.cost || 0),
      conversions: a.conversions + Number(r.conversions || 0),
      conversionValue: a.conversionValue + Number(r.conversion_value || 0),
    }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 }
  )
}

function groupBy(rows, key) {
  const out = new Map()
  for (const r of rows) {
    const k = key(r)
    if (!out.has(k)) out.set(k, [])
    out.get(k).push(r)
  }
  return out
}

/** Rows on or after `since`, if one is given. */
function inWindow(rows, since) {
  if (!since) return rows
  return rows.filter((r) => String(r.date || '') >= since)
}

/**
 * Every keyword in the window, with a verdict.
 *
 * Verdicts, worst first: 'waste' (spending, not converting), 'expensive'
 * (converting, but each one costs too much), 'winner', 'ok', 'young' (not
 * enough spend to judge yet).
 */
export function diagnoseKeywords(rows, { since = '', rules = RULES } = {}) {
  const scoped = inWindow(rows || [], since)
  const groups = groupBy(scoped, (r) => `${r.ad_group_id}|${r.criterion_id}`)

  const out = []
  for (const [key, group] of groups) {
    const t = total(group)
    const first = group[0] || {}
    const cpl = t.conversions > 0 ? t.cost / t.conversions : null
    const cpc = t.clicks > 0 ? t.cost / t.clicks : 0

    let verdict = 'ok'
    let signal = ''

    if (t.cost < rules.minSpendToJudge) {
      verdict = 'young'
      signal = `Only ${money(t.cost)} spent so far. Not enough to call it.`
    } else if (t.conversions === 0 && (t.cost >= rules.deadSpend || t.clicks >= rules.deadClicks)) {
      verdict = 'waste'
      signal =
        `${money(t.cost)} and ${t.clicks} click${t.clicks === 1 ? '' : 's'} with no conversions. ` +
        (t.clicks >= rules.deadClicks && t.cost < rules.deadSpend
          ? 'Cheap clicks, but plenty of them, and none of them called.'
          : 'That is real money for nothing.')
    } else if (cpl !== null && cpl > rules.badCpl) {
      verdict = 'expensive'
      signal = `${money(cpl)} per conversion, over the ${money(rules.badCpl)} line.`
    } else if (t.conversions >= rules.winnerConversions) {
      verdict = 'winner'
      signal = `${t.conversions.toFixed(1)} conversions at ${money(cpl)} each. Give it room.`
    } else if (t.conversions > 0) {
      signal = `${t.conversions.toFixed(1)} conversion${t.conversions === 1 ? '' : 's'} so far at ${money(cpl)}.`
    } else {
      signal = `${money(t.cost)} spent, no conversions yet, but under the line.`
    }

    out.push({
      key,
      clientId: first.client_id,
      keyword: first.keyword_text || '(unknown)',
      matchType: first.match_type || '',
      campaign: first.campaign_name || '',
      adGroup: first.ad_group_name || '',
      adGroupId: first.ad_group_id || '',
      criterionId: first.criterion_id || '',
      status: first.status || '',
      impressions: t.impressions,
      clicks: t.clicks,
      cost: money(t.cost),
      conversions: Math.round(t.conversions * 10) / 10,
      cpl: cpl === null ? null : money(cpl),
      cpc: money(cpc),
      verdict,
      signal,
    })
  }

  // Worst first, and within that the expensive ones first: the point of the
  // list is what to act on, not an alphabet.
  const rank = { waste: 0, expensive: 1, ok: 2, young: 3, winner: 4 }
  return out.sort((a, b) => rank[a.verdict] - rank[b.verdict] || b.cost - a.cost)
}

/**
 * Search terms that should probably become negative keywords.
 *
 * A term already ADDED as a keyword or EXCLUDED as a negative is not a
 * candidate -- somebody already decided. Only 'NONE' is an open question.
 */
export function negativeCandidates(rows, { since = '', rules = RULES } = {}) {
  const scoped = inWindow(rows || [], since)
  const groups = groupBy(scoped, (r) => String(r.search_term || '').toLowerCase())

  const out = []
  for (const [term, group] of groups) {
    const t = total(group)
    const first = group[0] || {}
    // EXCLUDED means it is already a negative; ADDED means it is a keyword in
    // its own right. Either way the decision exists.
    const decided = group.some((r) => {
      const s = String(r.status || '').toUpperCase()
      return s.includes('EXCLUDED') || s.includes('ADDED')
    })
    if (decided) continue
    if (t.conversions > 0) continue

    const junk = junkReason(term)
    if (junk) {
      if (t.cost < rules.junkTermSpend) continue
    } else if (t.cost < rules.termDeadSpend) {
      continue
    }

    out.push({
      term,
      clientId: first.client_id,
      campaign: first.campaign_name || '',
      adGroupId: first.ad_group_id || '',
      matchedKeyword: first.keyword_text || '',
      clicks: t.clicks,
      impressions: t.impressions,
      cost: money(t.cost),
      // Junk first: those are certain, and the expensive-but-plausible ones
      // need a human to think about whether the term is really a bad fit.
      certain: Boolean(junk),
      why: junk
        ? `${money(t.cost)} on ${t.clicks} click${t.clicks === 1 ? '' : 's'} — ${junk}.`
        : `${money(t.cost)} on ${t.clicks} click${t.clicks === 1 ? '' : 's'} with no conversions.`,
    })
  }

  return out.sort((a, b) => Number(b.certain) - Number(a.certain) || b.cost - a.cost)
}

/** One line for the dashboard: what is bleeding, in dollars. */
export function wasteSummary(keywords, terms) {
  const deadKeywords = (keywords || []).filter((k) => k.verdict === 'waste')
  const wasted = deadKeywords.reduce((s, k) => s + k.cost, 0)
  const savable = (terms || []).reduce((s, t) => s + t.cost, 0)
  return {
    deadKeywords: deadKeywords.length,
    wasted: money(wasted),
    negativeCandidates: (terms || []).length,
    savable: money(savable),
    // The two overlap -- a wasted keyword's spend often IS the search term
    // spend -- so they are never added together here. Whoever renders this
    // shows them as two separate facts.
    headline: deadKeywords.length
      ? `${money(wasted)} on ${deadKeywords.length} keyword${deadKeywords.length === 1 ? '' : 's'} that are not converting`
      : (terms || []).length
        ? `${(terms || []).length} search term${(terms || []).length === 1 ? '' : 's'} worth blocking`
        : 'Nothing obviously wasted.',
  }
}
