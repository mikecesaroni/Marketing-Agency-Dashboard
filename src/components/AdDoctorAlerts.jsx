import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAdDoctorDataAll } from '../lib/adDoctor'
import { fetchAllLearnings } from '../lib/adLearningsStore'
import { digestAdDoctor, digestCounts, digestHeadline, digestNumbers } from '../lib/adDoctorDigest'
import { VERDICT_META } from '../lib/adDoctorRules'
import { Card } from './ui'

/**
 * The Ad Doctor Agent's kill and scale verdicts, across every client, on the
 * dashboard.
 *
 * Until now a dead ad was only found by opening that client's page and
 * scrolling to the Doctor, which nobody does daily for eight accounts. This
 * runs the same rules on the same sync data for all of them and lists only the
 * two verdicts that mean "do something today": a kill is money leaving for
 * nothing, a scale is a winner starved of budget. Watch, learning and healthy
 * stay on the client page with their arithmetic.
 *
 * Renders nothing when there is nothing to act on, and nothing while loading,
 * so a quiet day costs no space and the card is believed when it appears.
 * Each row links to that client's Ad Doctor, where the pause button is: the
 * Doctor never pauses anything itself.
 */
export default function AdDoctorAlerts() {
  const [items, setItems] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchAdDoctorDataAll(), fetchAllLearnings().catch(() => [])])
      .then(([rows, learnings]) => {
        if (!cancelled) setItems(digestAdDoctor(rows, { learnings }))
      })
      .catch((err) => {
        console.error('Ad Doctor digest failed', err)
        if (!cancelled) setItems([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!items || items.length === 0) return null

  const counts = digestCounts(items)
  const tone = counts.kill > 0 ? 'danger' : 'success'

  return (
    <Card tone={tone} padding="lg" className="mb-6 md:mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-slate-900">
          Ad Doctor Agent: {digestHeadline(items)}
          <span className="font-normal text-slate-600">
            {' '}
            across {counts.clients} client{counts.clients === 1 ? '' : 's'}
          </span>
        </p>
        <p className="text-xs text-slate-600">Last 30 days of the Meta sync, same rules as each client's page</p>
      </div>

      <div className="mt-3 space-y-2">
        {items.map((it) => {
          const meta = VERDICT_META[it.verdict]
          const kill = it.verdict === 'kill'
          return (
            <div key={`${it.clientId}-${it.adId}`} className="flex overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className={`w-1 flex-shrink-0 ${kill ? 'bg-red-500' : 'bg-green-500'}`} />
              <div className="min-w-0 flex-1 p-3">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${meta.cls}`}>
                    {meta.label}
                  </span>
                  <Link
                    to={`/client/${it.clientId}#ad-doctor`}
                    className="text-sm font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                  >
                    {it.clientName}
                  </Link>
                  <span className="min-w-0 break-words text-sm text-slate-700">{it.name}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-600">{it.reason}</p>
                <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">{digestNumbers(it)}</p>
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-xs text-slate-600">
        {counts.kill > 0
          ? 'Open the client to pause from the Ad Doctor. Nothing is paused automatically.'
          : 'Open the client to see the Doctor’s plan. Raise budget no more than 20% at a time.'}
      </p>
    </Card>
  )
}
