import { Link } from 'react-router-dom'
import { money } from '../lib/queries'
import { onboardingGaps } from '../lib/billing'
import { Badge, Card } from './ui'

/**
 * The two things that quietly hold up a new client's money.
 *
 * Neither shows up in the payments ledger as anything wrong. An unpaid setup
 * fee is one unremarkable pending row among a client's twelve scheduled
 * months, and a client who never subscribed is an absence — no overdue row, no
 * missing payment, nothing for any filter to catch. Both need asking about
 * directly, which is what this does.
 */
export default function OnboardingMoneyPanel({ clients, payments, todayDate }) {
  const { setupUnpaid, notSubscribed } = onboardingGaps(clients, payments, todayDate)

  if (setupUnpaid.length === 0 && notSubscribed.length === 0) {
    return (
      <Card tone="success" className="mb-4">
        <p className="text-sm font-semibold text-slate-900">✓ Every client is paid up and billing</p>
        <p className="mt-0.5 text-xs text-slate-600">
          No setup fee outstanding, and every active client has started their subscription.
        </p>
      </Card>
    )
  }

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2">
      <Column
        title="Setup fee not paid"
        count={setupUnpaid.length}
        total={setupUnpaid.reduce((sum, r) => sum + r.amount, 0)}
        empty="Every setup fee is collected."
      >
        {setupUnpaid.map((row) => (
          <Row key={row.client.id} client={row.client}>
            <span className="font-semibold tabular-nums text-slate-900">{money(row.amount)}</span>
            {row.reason === 'unscheduled' ? (
              <Badge tone="warning">never scheduled</Badge>
            ) : row.overdue ? (
              <Badge tone="danger">overdue {row.dueDate}</Badge>
            ) : (
              <span className="text-[11px] text-slate-500">due {row.dueDate}</span>
            )}
          </Row>
        ))}
      </Column>

      <Column
        title="Not subscribed yet"
        count={notSubscribed.length}
        empty="Every active client is billing monthly."
      >
        {notSubscribed.map((row) => (
          <Row key={row.client.id} client={row.client}>
            {row.scheduled ? (
              <Badge tone="info">schedule ready</Badge>
            ) : (
              <Badge tone="warning">no billing set up</Badge>
            )}
            {row.scheduled && !row.stripeLinked && (
              <span className="text-[11px] text-slate-500">send them the link</span>
            )}
          </Row>
        ))}
      </Column>
    </div>
  )
}

function Column({ title, count, total, empty, children }) {
  return (
    <Card tone={count > 0 ? 'warning' : 'default'} className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <p className="text-sm font-semibold text-slate-900">
          {title}
          <span className="ml-1.5 font-normal text-slate-600">{count}</span>
        </p>
        {total > 0 && (
          <p className="text-xs font-semibold tabular-nums text-slate-700">{money(total)}</p>
        )}
      </div>
      {count === 0 ? (
        <p className="mt-1 text-xs text-slate-500">{empty}</p>
      ) : (
        <div className="mt-2 space-y-1.5">{children}</div>
      )}
    </Card>
  )
}

// The client's name is the link, because every one of these ends in opening
// that client to chase it.
function Row({ client, children }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-200/70 pt-1.5 first:border-0 first:pt-0">
      <Link
        to={`/client/${client.id}`}
        className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 hover:text-blue-700 hover:underline"
      >
        {client.name}
      </Link>
      {children}
    </div>
  )
}
