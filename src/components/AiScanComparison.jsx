import { compareScans, headline } from '../lib/aiCompare'
import { CATEGORY_LABELS } from '../lib/aiVisibility'
import { Badge, Card } from './ui'

const pct = (n) => `${Math.round((n || 0) * 100)}%`
const shortDate = (iso) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

const CHANGE = {
  won: { label: 'now named', tone: 'success', rail: 'bg-green-500' },
  lost: { label: 'lost', tone: 'danger', rail: 'bg-red-500' },
  held: { label: 'still named', tone: 'info', rail: 'bg-blue-400' },
  missing: { label: 'still missing', tone: 'dim', rail: 'bg-slate-300' },
}

/**
 * What changed between two scans of the same business.
 *
 * The number a client actually understands is not the score, it is "these
 * three questions name you now and did not before". So the prompt-by-prompt
 * list is the report and the score sits alongside it, rather than the other
 * way round.
 */
export default function AiScanComparison({ baseline, current }) {
  const c = compareScans(baseline, current)

  if (c.sharedCount === 0) {
    return (
      <Card tone="default">
        <p className="text-sm font-semibold text-slate-900">Nothing to compare yet</p>
        <p className="mt-0.5 text-xs text-slate-600">
          These two scans have no questions in common, so there is no before and after to show.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card tone={c.counts.won > c.counts.lost ? 'success' : 'default'} padding="lg">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">{headline(c)}</p>
          <p className="text-xs text-slate-500">
            {shortDate(baseline.created_at)} → {shortDate(current.created_at)}
            {c.days ? ` · ${c.days} days` : ''}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-4">
          <Movement label="Visibility score" before={c.score.before} after={c.score.after} />
          <Movement
            label="Answers naming them"
            before={c.mentionRate.before}
            after={c.mentionRate.after}
            format={pct}
          />
          <Movement
            label="Answers citing the site"
            before={c.citationRate.before}
            after={c.citationRate.after}
            format={pct}
          />
        </div>

        {/* Said plainly rather than hidden, because every number above is
            only meaningful while both scans asked the same questions. */}
        {!c.comparable && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
            These scans did not ask exactly the same questions — {c.sharedCount} of{' '}
            {c.beforeCount} and {c.afterCount} overlap. Only the shared questions are counted
            above, so treat the movement as indicative rather than measured.
          </p>
        )}
      </Card>

      {c.audit.length > 0 && (
        <Card>
          <p className="text-sm font-semibold text-slate-900">What changed on the site</p>
          <p className="mt-0.5 text-xs text-slate-600">
            Facts from re-auditing the site, not a checklist anyone ticked.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {c.audit.map((a) => (
              <Badge key={a.label} tone={a.fixed ? 'success' : 'danger'}>
                {a.fixed ? '✓ ' : '✗ '}
                {a.label}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <div>
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-sm font-semibold text-slate-800">Question by question</h3>
          <div className="flex flex-wrap gap-1.5">
            {['won', 'lost', 'held', 'missing'].map((k) =>
              c.counts[k] > 0 ? (
                <Badge key={k} tone={CHANGE[k].tone}>
                  {c.counts[k]} {CHANGE[k].label}
                </Badge>
              ) : null
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          {c.rows.map((row) => (
            <Row key={row.prompt} row={row} />
          ))}
        </div>
      </div>
    </div>
  )
}

// A number and where it came from. The arrow is the point: a bare "48" says
// nothing without the 25 it moved from.
function Movement({ label, before, after, format = (n) => (n ?? '—') }) {
  const delta = typeof before === 'number' && typeof after === 'number' ? after - before : null
  const tone =
    delta === null || delta === 0
      ? 'text-slate-500'
      : delta > 0
        ? 'text-green-700'
        : 'text-red-700'
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-1.5 tabular-nums">
        <span className="text-sm text-slate-400 line-through">{format(before)}</span>
        <span className="text-xl font-semibold tracking-tight text-slate-900">{format(after)}</span>
      </p>
      {delta !== null && delta !== 0 && (
        <p className={`text-xs font-medium ${tone}`}>
          {delta > 0 ? '▲' : '▼'} {format(Math.abs(delta))}
        </p>
      )}
    </div>
  )
}

function Row({ row }) {
  const change = CHANGE[row.change]
  return (
    <div className="flex gap-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className={`w-1 flex-shrink-0 ${change.rail}`} />
      <div className="min-w-0 flex-1 p-2.5">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <p className="min-w-0 flex-1 text-sm text-slate-900">{row.prompt}</p>
          <Badge tone={change.tone}>{change.label}</Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
          <span>{CATEGORY_LABELS[row.category] || row.category}</span>
          {row.citedNow && <span className="text-green-700">site now cited</span>}
          {row.citedLost && <span className="text-red-700">citation lost</span>}
          {/* Lower is better: it is how far into the answer the first mention
              lands, so a negative delta means they moved up. */}
          {row.positionDelta !== null && row.positionDelta !== 0 && (
            <span className={row.positionDelta < 0 ? 'text-green-700' : 'text-slate-500'}>
              {row.positionDelta < 0 ? 'named earlier' : 'named later'} in the answer
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
