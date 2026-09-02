import { Link } from 'react-router-dom'
import { money } from '../lib/queries'
import { failureSummary } from '../lib/paymentFailures'
import { Badge, Card } from './ui'

// Cards that failed, and whether anybody has to do anything.
//
// Renders nothing at all when nothing is outstanding. An alert that is always
// on screen saying "0 failures" trains people to look past the place a real
// failure will appear.
//
// The lead fact is Stripe's own retry date, not the failure. Stripe retries a
// failed subscription invoice up to four times over about two weeks and most
// go through -- MBD Pressure Washing's failed on a Sunday and was paid the next
// morning without anyone touching it. So a failure Stripe is still working on
// is information, and one it has given up on is a job.

export default function PaymentFailureAlerts({ payments }) {
  const summary = failureSummary(payments || [])
  if (!summary) return null

  const urgent = summary.critical > 0

  return (
    <Card tone={urgent ? 'danger' : 'warning'} padding="lg" className="mb-4">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className={`font-semibold ${urgent ? 'text-red-800' : 'text-amber-900'}`}>
          {summary.count === 1 ? 'A payment failed' : `${summary.count} payments failed`}
        </h3>
        <span className={`text-sm font-semibold tabular-nums ${urgent ? 'text-red-700' : 'text-amber-800'}`}>
          {money(summary.amount)} not collected
        </span>
        {summary.critical > 0 && (
          <Badge tone="danger">
            {summary.critical} need{summary.critical === 1 ? 's' : ''} you
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        {summary.rows.map((f) => (
          <div
            key={f.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white/70 bg-white/80 px-3 py-2"
          >
            {f.clientId ? (
              <Link
                to={`/client/${f.clientId}`}
                className="min-w-0 flex-1 truncate font-semibold text-slate-900 hover:text-blue-600"
              >
                {f.client}
              </Link>
            ) : (
              <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">{f.client}</span>
            )}

            <Badge tone="neutral" className="uppercase">
              {f.type}
            </Badge>

            <span className="w-24 flex-shrink-0 text-right text-sm font-bold tabular-nums text-slate-900">
              {money(f.amount)}
            </span>

            <span
              className={`w-full flex-shrink-0 text-xs sm:w-auto sm:flex-1 ${
                f.severity === 'critical' ? 'font-medium text-red-700' : 'text-amber-800'
              }`}
            >
              {f.label}
            </span>

            {f.url && (
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="flex-shrink-0 text-xs font-medium text-slate-600 underline hover:text-slate-900"
              >
                Open in Stripe
              </a>
            )}
          </div>
        ))}
      </div>

      <p className={`mt-2 text-[11px] ${urgent ? 'text-red-700' : 'text-amber-800'}`}>
        {summary.critical > 0
          ? 'Stripe has stopped retrying the ones marked urgent, or its retry date has passed with no money. Those need a new card from the client.'
          : 'Stripe is still retrying these. They clear themselves the moment one goes through — nothing to dismiss.'}
      </p>
    </Card>
  )
}
