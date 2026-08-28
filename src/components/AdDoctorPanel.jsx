import { useEffect, useState } from 'react'
import { VERDICT_META, diagnose, fetchAdDoctorData } from '../lib/adDoctor'
import { pauseAd } from '../lib/metaPublish'

/**
 * The playbook's kill/scale rules, run against the daily sync and shown as
 * verdicts with the arithmetic printed next to them.
 *
 * Deliberately NOT auto-pause. A false positive kills a good ad, resets its
 * learning, and the client notices the lead flow drop before anyone notices
 * why. The Doctor does the arithmetic; a human clicks the button - which takes
 * five seconds and catches the context no rule can see (a seasonal push, a
 * tracking gap, the client asked for that ad by name).
 */
export default function AdDoctorPanel({ client }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [pausing, setPausing] = useState('')
  const [pausedNow, setPausedNow] = useState([])

  const load = () =>
    fetchAdDoctorData(client.id)
      .then((rows) => setResult(diagnose(rows)))
      .catch((err) => {
        setError(err.message)
        setResult({ verdicts: [], medianCpl: 0, usingFallback: true })
      })

  useEffect(() => {
    load()
  }, [client.id])

  const doPause = async (ad) => {
    if (
      !confirm(
        `Pause "${ad.name}" in Meta?\n\n${ad.reasons[0] || ''}\n\nReversible any time in Ads Manager.`
      )
    )
      return
    setPausing(ad.adId)
    setError('')
    try {
      await pauseAd(client.id, ad.adId)
      setPausedNow((p) => [...p, ad.adId])
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setPausing('')
    }
  }

  if (result === null) {
    return <p className="text-sm text-slate-500">Running the numbers…</p>
  }

  const actionable = result.verdicts.filter((v) => !['ok', 'paused'].includes(v.verdict))
  const healthy = result.verdicts.filter((v) => v.verdict === 'ok')

  if (result.verdicts.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No ad-level data yet. Verdicts appear once the daily Meta sync has rows for this client.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <p className="text-xs text-slate-500">
        The playbook&rsquo;s kill/scale rules, run against the last 30 days of sync data.
        {result.usingFallback
          ? ' No leads recorded yet, so thresholds use the $60 industry benchmark until real numbers exist.'
          : ` Benchmark: this account's own $${result.medianCpl.toFixed(0)} median cost per lead.`}
      </p>

      {actionable.length === 0 ? (
        <p className="text-sm text-slate-600">
          Nothing needs a decision. {healthy.length} live ad{healthy.length === 1 ? '' : 's'}{' '}
          performing at par.
        </p>
      ) : (
        <div className="space-y-1.5">
          {actionable.map((ad) => {
            const meta = VERDICT_META[ad.verdict]
            const justPaused = pausedNow.includes(ad.adId)
            return (
              <div key={ad.adId} className="p-3 bg-white border border-slate-200 rounded-lg">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${meta.cls}`}
                      >
                        {meta.label}
                      </span>
                      <span className="text-sm font-medium text-slate-900 truncate">{ad.name}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {ad.campaign && `${ad.campaign} · `}${ad.spend.toFixed(0)} spent · {ad.leads}{' '}
                      lead{ad.leads === 1 ? '' : 's'}
                      {ad.cpl !== null && ` · $${ad.cpl.toFixed(0)}/lead`} · {ad.days} days of data
                    </p>
                    {ad.reasons.map((r, i) => (
                      <p key={i} className="text-xs text-slate-700 mt-1">
                        {r}
                      </p>
                    ))}
                  </div>

                  {ad.verdict === 'kill' && (
                    <button
                      onClick={() => doPause(ad)}
                      disabled={pausing === ad.adId || justPaused}
                      className="flex-shrink-0 px-3 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition"
                    >
                      {justPaused ? 'Paused' : pausing === ad.adId ? 'Pausing…' : 'Pause in Meta'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {healthy.length > 0 && actionable.length > 0 && (
        <p className="text-[11px] text-slate-400">
          Plus {healthy.length} live ad{healthy.length === 1 ? '' : 's'} performing at par — no
          action needed.
        </p>
      )}
    </div>
  )
}
