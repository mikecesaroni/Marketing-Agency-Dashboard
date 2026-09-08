import { useEffect, useState } from 'react'
import { VERDICT_META, diagnose, fetchAdDoctorData } from '../lib/adDoctor'
import { verdictsForPrompt } from '../lib/adDoctorRules'
import { pauseAd } from '../lib/metaPublish'
import { fetchLearnings } from '../lib/adLearningsStore'
import { learningsBlock } from '../lib/adLearnings'
import { META_KNOWLEDGE } from '../lib/metaKnowledge'
import { renderBlocks, sendChatMessage } from '../lib/clientChat'

/**
 * The kill/scale rules plus the 2026 fatigue and retention signals, run
 * against the daily sync and shown as verdicts with the arithmetic printed
 * next to them, each with the next move.
 *
 * Deliberately NOT auto-pause. A false positive kills a good ad, resets its
 * learning, and the client notices the lead flow drop before anyone notices
 * why. The Doctor does the arithmetic; a human clicks the button.
 *
 * Two layers. The rules (src/lib/adDoctorRules.js) are reproducible: the same
 * numbers always give the same verdict. "Full diagnosis" then hands that
 * verdict table, the Meta knowledge base and last night's agency-wide
 * learnings to the chat model, which writes the plan in words. The reply is
 * saved into this client's chat, so it is there when someone opens the chat
 * later.
 */

const DOCTOR_ROLE = `You are the Ad Doctor Agent for one home-services client's Meta account. You are
handed the verdict table the CRM's rules produced (every number they used),
the Meta knowledge base, and last night's findings from this agency's own ad
data. Write the plan.

Order: what to do TODAY (pause, hold, build), then what to build next and why
(format, hook angle, offer), then what to watch this week and the number that
would change your mind. Attribute every cost move to the creative or the
auction using the CTR and CPM figures, and check the season before calling
anything fatigue. Quote the numbers. Prefer the agency's own data over
industry figures and say which is which. Never propose editing a live ad in
place, never propose a budget change over 20%, never kill anything under the
spend floor. Plain language, no headers longer than a few words, no em dashes,
under 350 words.`

export default function AdDoctorPanel({ client }) {
  const [result, setResult] = useState(null)
  const [learnings, setLearnings] = useState([])
  const [error, setError] = useState('')
  const [pausing, setPausing] = useState('')
  const [pausedNow, setPausedNow] = useState([])
  const [showHealthy, setShowHealthy] = useState(false)
  const [diagnosis, setDiagnosis] = useState('')
  const [diagnosing, setDiagnosing] = useState(false)

  const load = async () => {
    try {
      const [rows, learned] = await Promise.all([
        fetchAdDoctorData(client.id),
        fetchLearnings(client.id).catch(() => []),
      ])
      setLearnings(learned)
      setResult(diagnose(rows, { learnings: learned }))
    } catch (err) {
      setError(err.message)
      setResult({ verdicts: [], adsets: [], account: {}, medianCpl: 0, usingFallback: true })
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id])

  const doPause = async (ad) => {
    if (!confirm(`Pause "${ad.name}" in Meta?\n\n${ad.reasons[0] || ''}\n\nReversible any time in Ads Manager.`)) return
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

  const fullDiagnosis = async () => {
    if (!result) return
    setDiagnosing(true)
    setError('')
    try {
      const system = [
        DOCTOR_ROLE,
        '',
        `CLIENT: ${client.name}${client.industry ? `, ${client.industry}` : ''}${client.market ? `, ${client.market}` : ''}. Today is ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.`,
        '',
        '=== THE VERDICT TABLE (last 30 days of the daily Meta sync) ===',
        verdictsForPrompt(result),
        '',
        META_KNOWLEDGE,
        '',
        learningsBlock(learnings, client.id),
      ].join('\n')
      const data = await sendChatMessage({
        clientId: client.id,
        system,
        message: 'Run the full Ad Doctor Agent diagnosis on the verdict table and write the plan.',
      })
      setDiagnosis(renderBlocks(data?.content) || 'The model returned nothing readable.')
    } catch (err) {
      setError(err.message)
    } finally {
      setDiagnosing(false)
    }
  }

  if (result === null) return <p className="text-sm text-slate-500">Running the numbers…</p>

  if (result.verdicts.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No ad-level data yet. Verdicts appear once the daily Meta sync has rows for this client.
      </p>
    )
  }

  const actionable = result.verdicts.filter((v) => !['ok', 'paused'].includes(v.verdict))
  const healthy = result.verdicts.filter((v) => v.verdict === 'ok')
  const a = result.account || {}

  return (
    <div className="space-y-3">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <p className="text-xs text-slate-500">
          Last 30 days: ${Number(a.spend || 0).toFixed(0)} spent, {a.leads || 0} leads
          {a.cpl != null && `, $${a.cpl.toFixed(0)} per lead`}
          {a.ctr != null && `, ${(a.ctr * 100).toFixed(2)}% CTR`}
          {a.cpm != null && `, $${a.cpm.toFixed(1)} CPM`}.{' '}
          {result.usingFallback
            ? 'No leads recorded yet, so thresholds use the $60 industry benchmark until real numbers exist.'
            : `Bar: this account's own $${result.medianCpl.toFixed(0)} median cost per lead.`}
        </p>
        <button
          onClick={fullDiagnosis}
          disabled={diagnosing}
          className="flex-shrink-0 px-3 py-1.5 bg-slate-900 text-white rounded text-xs font-medium hover:bg-slate-800 disabled:opacity-50 transition"
          title="Hands the verdict table, the Meta knowledge base and last night's agency learnings to the chat, which writes the plan. Saved into this client's chat."
        >
          {diagnosing ? 'Diagnosing…' : 'Full diagnosis'}
        </button>
      </div>

      {result.adsets.length > 0 && (
        <div className="space-y-1">
          {result.adsets.map((s) => (
            <p key={s.adsetId} className="text-[11px] text-slate-500">
              <span
                className={`mr-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                  s.learningLimited ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'
                }`}
              >
                {s.learningLimited ? 'Learning limited' : 'Out of learning'}
              </span>
              <span className="font-medium text-slate-700">{s.name}</span>: {s.note}
            </p>
          ))}
        </div>
      )}

      {diagnosis && (
        <div className="rounded-lg border border-slate-900/10 bg-slate-50 p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-slate-900">The plan</p>
            <button onClick={() => setDiagnosis('')} className="text-[11px] text-slate-400 hover:text-slate-700">
              Hide
            </button>
          </div>
          <div className="whitespace-pre-wrap text-sm text-slate-800 leading-relaxed">{diagnosis}</div>
          <p className="mt-2 text-[11px] text-slate-400">Also saved in this client&rsquo;s chat.</p>
        </div>
      )}

      {actionable.length === 0 ? (
        <p className="text-sm text-slate-600">
          Nothing needs a decision. {healthy.length} live ad{healthy.length === 1 ? '' : 's'} performing at par.
        </p>
      ) : (
        <div className="space-y-1.5">
          {actionable.map((ad) => (
            <VerdictCard
              key={ad.adId}
              ad={ad}
              justPaused={pausedNow.includes(ad.adId)}
              pausing={pausing === ad.adId}
              onPause={() => doPause(ad)}
            />
          ))}
        </div>
      )}

      {healthy.length > 0 && (
        <div>
          <button onClick={() => setShowHealthy((v) => !v)} className="text-[11px] text-slate-400 hover:text-slate-700">
            {showHealthy ? 'Hide' : 'Show'} {healthy.length} healthy ad{healthy.length === 1 ? '' : 's'} performing at par
          </button>
          {showHealthy && (
            <div className="mt-1.5 space-y-1.5">
              {healthy.map((ad) => (
                <VerdictCard key={ad.adId} ad={ad} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function VerdictCard({ ad, justPaused, pausing, onPause }) {
  const meta = VERDICT_META[ad.verdict]
  return (
    <div className="p-3 bg-white border border-slate-200 rounded-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${meta.cls}`}>{meta.label}</span>
            <span className="text-sm font-medium text-slate-900 truncate">{ad.name}</span>
            <span className="text-[10px] uppercase tracking-wide text-slate-400">{ad.isVideo ? 'video' : 'image'}</span>
            {ad.cause && (
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  ad.cause === 'market' ? 'bg-violet-50 text-violet-700' : 'bg-amber-50 text-amber-800'
                }`}
                title="Where the cost move comes from: CTR down with CPM flat is the creative; CPM up with CTR flat is the auction"
              >
                {ad.cause === 'market' ? 'auction, not the ad' : ad.cause === 'both' ? 'creative + auction' : 'creative'}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
            {ad.campaign && `${ad.campaign} · `}${ad.spend.toFixed(0)} · {ad.leads} lead{ad.leads === 1 ? '' : 's'}
            {ad.cpl !== null && ` · $${ad.cpl.toFixed(0)}/lead`}
            {ad.ctr !== null && ` · ${(ad.ctr * 100).toFixed(2)}% CTR`}
            {ad.cpm !== null && ` · $${ad.cpm.toFixed(1)} CPM`}
            {ad.frequency !== null && ` · freq ${ad.frequency.toFixed(1)}`}
            {ad.holdRate !== null && ` · ${ad.holdRate.toFixed(0)}% hold`}
            {ad.hookRate !== null && ` · ${ad.hookRate.toFixed(0)}% hook`}
            {` · ${ad.days} days`}
          </p>
          {ad.reasons.map((r, i) => (
            <p key={i} className="text-xs text-slate-700 mt-1">
              {r}
            </p>
          ))}
          {ad.signals.map((r, i) => (
            <p key={`s${i}`} className="text-xs text-slate-600 mt-1">
              {r}
            </p>
          ))}
          {ad.prescription && (
            <p className="mt-1.5 text-xs text-slate-900">
              <span className="font-semibold">Next move:</span> {ad.prescription}
            </p>
          )}
        </div>

        {ad.verdict === 'kill' && onPause && (
          <button
            onClick={onPause}
            disabled={pausing || justPaused}
            className="flex-shrink-0 px-3 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition"
          >
            {justPaused ? 'Paused' : pausing ? 'Pausing…' : 'Pause in Meta'}
          </button>
        )}
      </div>
    </div>
  )
}
