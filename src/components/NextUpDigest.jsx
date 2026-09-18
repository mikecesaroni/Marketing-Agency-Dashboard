import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchNextStepsForAll } from '../lib/nextStepsData'
import { OWNER, urgency } from '../lib/nextSteps'
import { stepHref } from '../lib/stepLinks'
import { Card } from './ui'

/**
 * The dashboard's answer to "what is next, for whom": every client's next
 * move in two columns. Ours to do, with the button that does it, and the
 * client's, with how long we have been waiting.
 *
 * This replaces six small lists that each described one state ("GHL waiting
 * on the client", "Meta not live yet", "Ready to build ads", ...). A client
 * appeared in two or three of them and in none of them was it clear which
 * came first. One pipeline, one line per client, same rules as the client
 * page and the Deliverables board.
 */
export default function NextUpDigest() {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchNextStepsForAll()
      .then((r) => !cancelled && setRows(r))
      .catch(() => !cancelled && setRows([]))
    return () => {
      cancelled = true
    }
  }, [])

  if (!rows) return null
  const sorted = [...rows].sort((a, b) => urgency(b.result) - urgency(a.result) || a.client.name.localeCompare(b.client.name))
  const ours = sorted.filter((r) => r.result.ours.length > 0)
  const theirs = sorted.filter((r) => r.result.ours.length === 0 && r.result.theirs.length > 0)
  const running = rows.filter((r) => r.result.launched && !r.result.next).length
  if (ours.length === 0 && theirs.length === 0) return null

  const Column = ({ title, tone, list, render }) => (
    <div className="min-w-0">
      <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>
        {title} <span className="font-normal tabular-nums text-slate-400">{list.length}</span>
      </p>
      {list.length === 0 ? (
        <p className="text-xs text-slate-400">Nothing.</p>
      ) : (
        <ul className="space-y-1">{list.map(render)}</ul>
      )}
    </div>
  )

  return (
    <Card padding="lg" className="mb-6 md:mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-slate-900">What is next, per client</p>
        <p className="text-xs text-slate-600">
          {running > 0 && `${running} running and quiet · `}
          <Link to="/deliverables" className="text-blue-600 hover:underline">
            Open the board →
          </Link>
        </p>
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <Column
          title="Needs us"
          tone="text-blue-700"
          list={ours}
          render={(r) => {
            const s = r.result.ours[0]
            return (
              <li key={r.client.id} className="flex flex-wrap items-baseline gap-x-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
                <Link to={`/client/${r.client.id}`} className="font-semibold text-slate-900 hover:text-blue-700 hover:underline">
                  {r.client.name}
                </Link>
                {r.client.assigned_to && <span className="text-slate-400">{r.client.assigned_to}</span>}
                <span className="text-slate-700">{s.title}</span>
                <Link to={stepHref(r.client.id, s)} className="ml-auto whitespace-nowrap text-blue-600 hover:underline">
                  {s.action.label} →
                </Link>
              </li>
            )
          }}
        />
        <Column
          title="Waiting on the client"
          tone="text-amber-700"
          list={theirs}
          render={(r) => {
            const s = r.result.theirs[0]
            const days = Math.max(0, ...r.result.theirs.map((x) => x.waitingDays || 0))
            return (
              <li key={r.client.id} className="flex flex-wrap items-baseline gap-x-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
                <Link to={`/client/${r.client.id}`} className="font-semibold text-slate-900 hover:text-blue-700 hover:underline">
                  {r.client.name}
                </Link>
                <span className="text-slate-700">{s.title}</span>
                {r.result.theirs.length > 1 && <span className="text-slate-400">+{r.result.theirs.length - 1} more</span>}
                <span className={`ml-auto whitespace-nowrap ${days >= 7 ? 'font-semibold text-amber-700' : 'text-slate-400'}`}>
                  {days > 0 ? `${days}d waiting` : s.owner === OWNER.client ? 'chase' : ''}
                </span>
              </li>
            )
          }}
        />
      </div>
    </Card>
  )
}
