import { Link } from 'react-router-dom'
import { adDeliveryAlerts } from '../lib/adHealth'
import { Card } from './ui'

/**
 * Clients paying for ads that are not running.
 *
 * Top of the dashboard, above everything, because this is the only thing here
 * that is actively costing a client money while nobody looks. Summit Water
 * Pros' ads were off for days over an unpaid $3.04 and the CRM's own dashboard
 * still counted them among the live accounts.
 *
 * Renders nothing when all is well, so it costs no space on a normal day —
 * which is also what keeps it credible when it does appear.
 */
export default function AdDeliveryAlerts({ clients, delivery, todayDate }) {
  const alerts = adDeliveryAlerts(clients, delivery, todayDate)
  if (alerts.length === 0) return null

  const worst = alerts.some((a) => a.severity === 'critical') ? 'critical' : 'warning'

  return (
    <Card tone={worst === 'critical' ? 'danger' : 'warning'} padding="lg" className="mb-6 md:mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-slate-900">
          {alerts.length === 1
            ? 'A client is paying for ads that are not running'
            : `${alerts.length} clients are paying for ads that are not running`}
        </p>
        <p className="text-xs text-slate-600">Checked against Meta on the last sync</p>
      </div>

      <div className="mt-3 space-y-2">
        {alerts.map((a) => (
          <div
            key={a.client.id}
            className="flex overflow-hidden rounded-lg border border-slate-200 bg-white"
          >
            <div
              className={`w-1 flex-shrink-0 ${
                a.severity === 'critical' ? 'bg-red-500' : 'bg-amber-500'
              }`}
            />
            <div className="min-w-0 flex-1 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <Link
                  to={`/client/${a.client.id}`}
                  className="text-sm font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                >
                  {a.client.name}
                </Link>
                <span
                  className={`text-xs font-medium ${
                    a.severity === 'critical' ? 'text-red-700' : 'text-amber-700'
                  }`}
                >
                  {a.headline}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-600">{a.detail}</p>
              {a.lastSpend && (
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Last spent {a.lastSpend}
                  {a.quietDays ? ` · ${a.quietDays} days ago` : ''}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
