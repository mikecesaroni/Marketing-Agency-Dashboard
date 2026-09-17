import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAdDoctorDataAll } from '../lib/adDoctor'
import { fetchAllLearnings } from '../lib/adLearningsStore'
import { digestAdDoctor, digestCounts, digestDetails, digestHeadline, digestNumbers } from '../lib/adDoctorDigest'
import { VERDICT_META } from '../lib/adDoctorRules'
import { pauseAd } from '../lib/metaPublish'
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
 * Each row opens to the whole case: every reason, the retention signals, the
 * numbers the rules used and the next move. A kill can be paused from here,
 * the same call the client page makes, behind the same confirm. Nothing is
 * ever paused without a click, and Meta can switch it back on any time.
 *
 * Renders nothing when there is nothing to act on, and nothing while loading,
 * so a quiet day costs no space and the card is believed when it appears.
 */
export default function AdDoctorAlerts() {
  const [items, setItems] = useState(null)
  const [open, setOpen] = useState(null)
  const [pausing, setPausing] = useState('')
  const [paused, setPaused] = useState([])
  const [error, setError] = useState('')

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

  const doPause = async (it) => {
    if (!confirm(`Pause "${it.name}" (${it.clientName}) in Meta?\n\n${it.reason}\n\nReversible any time in Ads Manager.`)) return
    setPausing(it.adId)
    setError('')
    try {
      await pauseAd(it.clientId, it.adId)
      setPaused((p) => [...p, it.adId])
    } catch (err) {
      setError(`Could not pause "${it.name}": ${err.message}`)
    } finally {
      setPausing('')
    }
  }

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
        <p className="text-xs text-slate-600">Last 30 days of the Meta sync, same rules as each client\u2019s page</p>
      </div>

      {error && <p className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</p>}

      <div className="mt-3 space-y-2">
        {items.map((it) => {
          const meta = VERDICT_META[it.verdict]
          const kill = it.verdict === 'kill'
          const key = `${it.clientId}-${it.adId}`
          const isOpen = open === key
          const justPaused = paused.includes(it.adId)
          return (
            <div key={key} className={`flex overflow-hidden rounded-lg border bg-white ${isOpen ? 'border-slate-300' : 'border-slate-200'}`}>
              <div className={`w-1 flex-shrink-0 ${justPaused ? 'bg-slate-300' : kill ? 'bg-red-500' : 'bg-green-500'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-3 p-3">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : key)}
                    aria-expanded={isOpen}
                    className="min-w-0 flex-1 text-left"
                    title={isOpen ? 'Hide the reasoning' : 'Show why'}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${justPaused ? 'bg-slate-100 text-slate-500' : meta.cls}`}>
                        {justPaused ? 'Paused' : meta.label}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">{it.clientName}</span>
                      <span className="min-w-0 break-words text-sm text-slate-700">{it.name}</span>
                      <span className="text-[11px] text-slate-400">{isOpen ? '\u25be hide' : '\u25b8 why?'}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-600">{it.reason}</p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">{digestNumbers(it)}</p>
                  </button>

                  {kill && (
                    <button
                      type="button"
                      onClick={() => doPause(it)}
                      disabled={pausing === it.adId || justPaused}
                      className="flex-shrink-0 rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                    >
                      {justPaused ? 'Paused' : pausing === it.adId ? 'Pausing\u2026' : 'Pause in Meta'}
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className="space-y-2.5 border-t border-slate-100 bg-slate-50/60 px-3 py-2.5 text-xs">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Why</p>
                      <ul className="mt-1 space-y-1">
                        {it.reasons.map((r, i) => (
                          <li key={i} className="text-slate-800">{r}</li>
                        ))}
                        {it.signals.map((r, i) => (
                          <li key={`s${i}`} className="text-slate-600">{r}</li>
                        ))}
                      </ul>
                    </div>
                    <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
                      {digestDetails(it).map(([k, v]) => (
                        <FragmentRow key={k} k={k} v={v} />
                      ))}
                      <dt className="text-slate-500">Format</dt>
                      <dd className="text-slate-800">{it.isVideo ? 'video' : 'image'}{it.campaign ? ` \u00b7 ${it.campaign}` : ''}</dd>
                    </dl>
                    {it.prescription && (
                      <p className="text-slate-900">
                        <span className="font-semibold">Next move:</span> {it.prescription}
                      </p>
                    )}
                    <p>
                      <Link to={`/client/${it.clientId}#ad-doctor`} className="text-blue-600 hover:underline">
                        Open {it.clientName}\u2019s Ad Doctor for the full diagnosis \u2192
                      </Link>
                    </p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-xs text-slate-600">
        {counts.kill > 0
          ? 'Pause asks first and is reversible in Ads Manager. Nothing is paused automatically.'
          : 'Open the client to see the Doctor\u2019s plan. Raise budget no more than 20% at a time.'}
      </p>
    </Card>
  )
}

function FragmentRow({ k, v }) {
  return (
    <>
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-slate-800">{v}</dd>
    </>
  )
}
