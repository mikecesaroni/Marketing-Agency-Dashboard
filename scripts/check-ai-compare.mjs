// Self-check for the AI visibility before/after comparison.
// Run: node scripts/check-ai-compare.mjs
//
// The thing this has to get right: a re-scan only proves a fix worked if both
// scans asked the SAME questions. The prompt set is model-written, so left
// alone every scan asks something different and a score moving 30 -> 45 could
// just mean the second set was easier. A re-scan copies its baseline's prompts,
// and `comparable` is false whenever that did not happen — because a report
// shown to a client must not quietly average over a changed question set.

import { compareScans, promptChange, auditChanges, headline } from '../src/lib/aiCompare.js'

const P = (prompt, over = {}) => ({
  prompt, category: 'unbranded', status: 'done',
  mentioned: false, cited: false, position_pct: null, ...over,
})
const scan = (prompts, over = {}) => ({
  visibility_score: 0, created_at: '2026-08-01T00:00:00Z', prompts, ...over,
})

let failures = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`)
}

// --- the four ways one prompt can move ------------------------------------
check('not named -> named is a win', promptChange(P('a'), P('a', { mentioned: true })), 'won')
check('named -> not named is a loss', promptChange(P('a', { mentioned: true }), P('a')), 'lost')
check('named both times is held',
  promptChange(P('a', { mentioned: true }), P('a', { mentioned: true })), 'held')
check('named neither time is missing', promptChange(P('a'), P('a')), 'missing')

// --- a real before/after --------------------------------------------------
{
  const before = scan([
    P('best hvac company in dallas'),
    P('who fixes ac fast in dallas', { mentioned: true, position_pct: 80 }),
    P('emergency ac repair near me'),
    P('hvac vs plumber for a leak', { mentioned: true, cited: true, position_pct: 40 }),
  ], { visibility_score: 25, created_at: '2026-06-01T00:00:00Z' })

  const after = scan([
    P('best hvac company in dallas', { mentioned: true, cited: true, position_pct: 20 }),
    P('who fixes ac fast in dallas', { mentioned: true, position_pct: 30 }),
    P('emergency ac repair near me'),
    P('hvac vs plumber for a leak'),
  ], { visibility_score: 48, created_at: '2026-07-01T00:00:00Z' })

  const c = compareScans(before, after)
  check('the sets line up, so it is comparable', c.comparable, true)
  check('counts', c.counts, { won: 1, lost: 1, held: 1, missing: 1 })
  check('score delta', [c.score.before, c.score.after, c.score.delta], [25, 48, 23])
  check('mention rate is unchanged at 2 of 4',
    [c.mentionRate.before, c.mentionRate.after], [0.5, 0.5])
  check('citation rate held at 1 of 4',
    [c.citationRate.before, c.citationRate.after], [0.25, 0.25])
  check('days between scans', c.days, 30)

  const won = c.rows.find((r) => r.change === 'won')
  check('the won row is first', c.rows[0].change, 'won')
  check('a new citation is noted', won.citedNow, true)
  check('a lost citation is noted', c.rows.find((r) => r.change === 'lost').citedLost, true)

  const held = c.rows.find((r) => r.change === 'held')
  check('moving from 80% to 30% into the answer is a negative delta',
    held.positionDelta, -50)

  check('headline', headline(c), '1 question now names them, 1 stopped.')
}

// --- THE GUARD: different questions are not comparable --------------------
{
  const before = scan([P('best hvac in dallas'), P('who fixes ac fast')])
  const after = scan([
    P('best hvac in dallas', { mentioned: true }),
    P('a completely different question', { mentioned: true }),
  ])
  const c = compareScans(before, after)
  check('a changed question set is not comparable', c.comparable, false)
  check('...and only the shared question is scored', c.sharedCount, 1)
  check('...with both set sizes reported so the report can say why',
    [c.beforeCount, c.afterCount], [2, 2])
}

// --- rates come from the shared prompts, never the stored figures ---------
// The stored rate covers every prompt in its own scan. Reading those two
// numbers side by side is exactly the mistake this module exists to prevent.
{
  const before = scan([P('shared'), P('only-in-before', { mentioned: true })],
    { mention_rate: 0.5 })
  const after = scan([P('shared', { mentioned: true })], { mention_rate: 1 })
  const c = compareScans(before, after)
  check('rates ignore prompts the other scan never asked',
    [c.mentionRate.before, c.mentionRate.after], [0, 1])
  check('and it is flagged as not comparable', c.comparable, false)
}

// --- unfinished prompts are not evidence ----------------------------------
{
  const before = scan([P('a'), P('b', { status: 'failed' })])
  const after = scan([P('a', { mentioned: true }), P('b', { status: 'pending' })])
  const c = compareScans(before, after)
  check('a failed or pending prompt is left out', c.sharedCount, 1)
  check('...and the finished ones still compare cleanly', c.comparable, true)
}

// --- wording differences in whitespace/case still match -------------------
{
  const before = scan([P('  Best HVAC In Dallas  ')])
  const after = scan([P('best hvac in dallas', { mentioned: true })])
  check('matching ignores case and surrounding space', compareScans(before, after).counts.won, 1)
}

// --- the technical audit --------------------------------------------------
{
  const changes = auditChanges(
    { blocks_everything: true, has_local_business: false, has_faq: false,
      meta_description: '', blocked_crawlers: ['GPTBot', 'ClaudeBot'], reachable: true },
    { blocks_everything: false, has_local_business: true, has_faq: false,
      meta_description: 'We fix air conditioners in Dallas.',
      blocked_crawlers: ['ClaudeBot'], reachable: true }
  )
  const labels = changes.filter((c) => c.fixed).map((c) => c.label)
  check('the fixes that actually landed', labels, [
    'robots.txt lets crawlers in',
    'LocalBusiness structured data',
    'Meta description',
    'Unblocked GPTBot',
  ])
  check('nothing unchanged is listed', changes.some((c) => c.label.includes('FAQ')), false)
}

// --- something breaking is surfaced first ---------------------------------
{
  const changes = auditChanges(
    { has_local_business: true, has_faq: false, reachable: true, meta_description: 'x' },
    { has_local_business: false, has_faq: true, reachable: true, meta_description: 'x' }
  )
  check('a regression sorts above a fix', changes[0].label, 'LocalBusiness structured data')
  check('...and is marked as broken', changes[0].broke, true)
}

// --- nothing to compare ---------------------------------------------------
{
  const c = compareScans(scan([]), scan([]))
  check('two empty scans are not comparable', c.comparable, false)
  check('and the headline says nothing moved', headline(c),
    'No change in which questions name them.')
}

// --- a scan with no baseline at all ---------------------------------------
{
  const c = compareScans(null, scan([P('a', { mentioned: true })]))
  check('no baseline is handled without throwing', c.comparable, false)
  check('...and reports no shared prompts', c.sharedCount, 0)
}

console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
