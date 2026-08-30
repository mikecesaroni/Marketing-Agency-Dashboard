/**
 * Comparing two AI visibility scans of the same business.
 *
 * The whole value of a second scan is proving that the fixes worked, and that
 * only holds if both scans asked the same questions. The prompt set is written
 * by a model, so left to itself every scan asks something different and a
 * score moving from 30 to 45 could just as easily mean the second set was
 * easier. A re-scan copies its baseline's prompts verbatim; this reports on
 * the result, and refuses to pretend when the sets do not line up.
 */

// Prompts are matched on their text rather than their id, because a re-scan
// creates new prompt rows carrying the same wording.
const key = (p) => String(p.prompt || '').trim().toLowerCase()

const rate = (n, total) => (total > 0 ? n / total : 0)

function done(prompts) {
  return (prompts || []).filter((p) => p.status === 'done')
}

/**
 * How one prompt moved.
 *
 *   won      not named before, named now — the result worth showing a client
 *   lost     named before, not now
 *   held     named both times
 *   missing  named neither time
 */
export function promptChange(before, after) {
  const was = Boolean(before?.mentioned)
  const is = Boolean(after?.mentioned)
  if (!was && is) return 'won'
  if (was && !is) return 'lost'
  return was ? 'held' : 'missing'
}

const CHANGE_ORDER = { won: 0, held: 1, lost: 2, missing: 3 }

/**
 * The technical fixes, as facts rather than claims.
 *
 * Each is a flag the site audit sets, so "fixed" here means the site really
 * changed between the two scans — not that somebody ticked it off a list.
 */
const AUDIT_CHECKS = [
  { key: 'blocks_everything', label: 'robots.txt lets crawlers in', good: false },
  { key: 'reachable', label: 'The site responds', good: true },
  { key: 'has_local_business', label: 'LocalBusiness structured data', good: true },
  { key: 'has_faq', label: 'FAQ structured data', good: true },
  { key: 'llms_txt', label: 'llms.txt', good: true },
  { key: 'meta_description', label: 'Meta description', good: true },
]

export function auditChanges(before, after) {
  if (!before || !after) return []
  const out = []

  for (const check of AUDIT_CHECKS) {
    // A truthy meta_description is a string, so this is "present" rather than
    // "=== true".
    const was = check.good ? Boolean(before[check.key]) : !before[check.key]
    const is = check.good ? Boolean(after[check.key]) : !after[check.key]
    if (was === is) continue
    out.push({ label: check.label, fixed: is && !was, broke: was && !is })
  }

  const wasBlocked = before.blocked_crawlers || []
  const isBlocked = after.blocked_crawlers || []
  const unblocked = wasBlocked.filter((c) => !isBlocked.includes(c))
  const newlyBlocked = isBlocked.filter((c) => !wasBlocked.includes(c))
  if (unblocked.length > 0) {
    out.push({ label: `Unblocked ${unblocked.join(', ')}`, fixed: true, broke: false })
  }
  if (newlyBlocked.length > 0) {
    out.push({ label: `Now blocking ${newlyBlocked.join(', ')}`, fixed: false, broke: true })
  }

  // Things that broke are the ones somebody needs to see first.
  return out.sort((a, b) => Number(b.broke) - Number(a.broke))
}

const delta = (before, after) => ({
  before: before ?? null,
  after: after ?? null,
  delta: before === null || before === undefined || after === null || after === undefined
    ? null
    : after - before,
})

/**
 * Compares a baseline scan against a later one.
 *
 * Both arguments are scans with their `prompts` attached, as fetchScan
 * returns them.
 */
export function compareScans(baseline, current) {
  const beforePrompts = done(baseline?.prompts)
  const afterPrompts = done(current?.prompts)

  const beforeBy = new Map(beforePrompts.map((p) => [key(p), p]))
  const afterBy = new Map(afterPrompts.map((p) => [key(p), p]))

  const shared = [...afterBy.keys()].filter((k) => beforeBy.has(k))

  const rows = shared.map((k) => {
    const before = beforeBy.get(k)
    const after = afterBy.get(k)
    return {
      prompt: after.prompt,
      category: after.category,
      before,
      after,
      change: promptChange(before, after),
      citedNow: Boolean(after.cited) && !before.cited,
      citedLost: Boolean(before.cited) && !after.cited,
      // Lower is better: it is how far into the answer the first mention
      // lands. Only meaningful when named in both.
      positionDelta:
        before.mentioned && after.mentioned &&
        Number.isFinite(Number(before.position_pct)) &&
        Number.isFinite(Number(after.position_pct))
          ? Number(after.position_pct) - Number(before.position_pct)
          : null,
    }
  })

  rows.sort(
    (a, b) => CHANGE_ORDER[a.change] - CHANGE_ORDER[b.change] || a.prompt.localeCompare(b.prompt)
  )

  const counts = { won: 0, lost: 0, held: 0, missing: 0 }
  for (const r of rows) counts[r.change]++

  // Rates are recomputed over the shared prompts alone rather than read off
  // the scans. The stored rate covers every prompt in that scan, and comparing
  // two numbers drawn from different question sets is the exact mistake this
  // module exists to avoid.
  const total = rows.length
  const mentionBefore = rows.filter((r) => r.before.mentioned).length
  const mentionAfter = rows.filter((r) => r.after.mentioned).length
  const citeBefore = rows.filter((r) => r.before.cited).length
  const citeAfter = rows.filter((r) => r.after.cited).length

  return {
    // Anything below a full overlap means the two scans asked partly different
    // questions, so the numbers are not straightforwardly comparable and the
    // report has to say so rather than quietly averaging over the difference.
    comparable: total > 0 && total === beforePrompts.length && total === afterPrompts.length,
    sharedCount: total,
    beforeCount: beforePrompts.length,
    afterCount: afterPrompts.length,

    score: delta(baseline?.visibility_score, current?.visibility_score),
    mentionRate: delta(rate(mentionBefore, total), rate(mentionAfter, total)),
    citationRate: delta(rate(citeBefore, total), rate(citeAfter, total)),

    counts,
    rows,
    audit: auditChanges(baseline?.crawler_audit, current?.crawler_audit),

    days:
      baseline?.created_at && current?.created_at
        ? Math.max(
            0,
            Math.round(
              (new Date(current.created_at) - new Date(baseline.created_at)) / 86400000
            )
          )
        : null,
  }
}

/**
 * A plain sentence for the top of the report.
 *
 * Written from the prompt counts rather than the score, because "three
 * questions now name you that did not before" is the thing a client
 * understands, and the score is a number they have no feel for.
 */
export function headline(comparison) {
  const { won, lost } = comparison.counts
  if (won === 0 && lost === 0) return 'No change in which questions name them.'
  const parts = []
  if (won > 0) {
    parts.push(won === 1 ? '1 question now names them' : `${won} questions now name them`)
  }
  if (lost > 0) parts.push(`${lost} stopped`)
  return `${parts.join(', ')}.`
}
