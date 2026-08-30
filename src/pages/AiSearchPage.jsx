import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import AiScanReport from '../components/AiScanReport'
import AiScanComparison from '../components/AiScanComparison'
import { supabase } from '../lib/supabaseClient'
import {
  deleteScan,
  fetchBaseline,
  fetchComparableScans,
  fetchScan,
  fetchScans,
  runScan,
  scoreBand,
} from '../lib/aiVisibility'

function ScoreChip({ score, status }) {
  if (status !== 'complete') {
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
        {status}
      </span>
    )
  }
  const band = scoreBand(score)
  const cls = {
    green: 'bg-green-100 text-green-800',
    amber: 'bg-amber-100 text-amber-800',
    orange: 'bg-orange-100 text-orange-800',
    red: 'bg-red-100 text-red-800',
    slate: 'bg-slate-100 text-slate-700',
  }[band.tone]
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold tabular-nums ${cls}`}>
      {score} · {band.label}
    </span>
  )
}

/**
 * The AI visibility tool.
 *
 * Deliberately takes a bare URL rather than requiring a client: the most
 * valuable use is scanning a business that is NOT a client yet and walking the
 * report into the room. Attaching it to a client is optional, and only there so
 * a client's score can be tracked over time.
 */
export default function AiSearchPage() {
  const [clients, setClients] = useState([])
  const [scans, setScans] = useState([])
  const [open, setOpen] = useState(null)
  // The scan `open` is measured against, plus any others it could be compared
  // with. Loaded only when a report is opened.
  const [baseline, setBaseline] = useState(null)
  const [olderScans, setOlderScans] = useState([])
  const [view, setView] = useState('report')

  const [websiteUrl, setWebsiteUrl] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [location, setLocation] = useState('')
  const [industry, setIndustry] = useState('')
  const [clientId, setClientId] = useState('')

  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')

  const loadScans = () => fetchScans().then(setScans).catch(() => setScans([]))

  useEffect(() => {
    loadScans()
    supabase
      .from('clients')
      .select('id, name, market, industry')
      .eq('archived', false)
      .order('name')
      .then(({ data }) => setClients(data || []))
  }, [])

  // Picking a client fills in what the CRM already knows, so the common case
  // is one click and Scan rather than retyping the market and trade.
  const pickClient = (id) => {
    setClientId(id)
    const c = clients.find((x) => x.id === id)
    if (!c) return
    if (!businessName) setBusinessName(c.name)
    if (!location && c.market) setLocation(c.market)
    if (!industry && c.industry) setIndustry(c.industry)
  }

  const scan = async () => {
    setError('')
    setOpen(null)
    try {
      const result = await runScan(
        { businessName, websiteUrl, location, industry, clientId: clientId || null },
        setProgress
      )
      await showScan(result)
      await loadScans()
    } catch (err) {
      setError(err.message)
    } finally {
      setProgress(null)
    }
  }

  // Loads a report and whatever it can be compared against. Kept in one place
  // so a scan opened from the list and one just finished behave identically.
  const showScan = async (scanOrId) => {
    const scan = typeof scanOrId === 'string' ? await fetchScan(scanOrId) : scanOrId
    setOpen(scan)
    const [base, older] = await Promise.all([
      fetchBaseline(scan),
      fetchComparableScans(scan),
    ])
    setBaseline(base)
    setOlderScans(older)
    // A re-scan is opened on the comparison, because that is the reason it was
    // run. A first scan has nothing to compare and opens on the report.
    setView(base ? 'compare' : 'report')
  }

  const openScan = async (id) => {
    setError('')
    try {
      await showScan(id)
    } catch (err) {
      setError(err.message)
    }
  }

  // Comparing against a scan other than the recorded baseline.
  const compareWith = async (id) => {
    setError('')
    try {
      setBaseline(await fetchScan(id))
      setView('compare')
    } catch (err) {
      setError(err.message)
    }
  }

  const remove = async (id) => {
    if (!confirm('Delete this scan and its answers?')) return
    try {
      await deleteScan(id)
      if (open?.id === id) {
        setOpen(null)
        setBaseline(null)
      }
      await loadScans()
    } catch (err) {
      setError(err.message)
    }
  }

  const busy = Boolean(progress)
  const canScan = websiteUrl.trim().length > 3 && !busy

  return (
    <Layout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">AI Search Visibility</h1>
          <p className="text-sm text-slate-600 mt-1">
            When someone asks an AI assistant who to call, does this business get named — and if
            not, who does instead? Works on any business, client or not.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg md:rounded-xl shadow-sm border border-slate-200 p-4 md:p-6 space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Website</label>
              <input
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="horizonhvacinc.com"
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Business name{' '}
                <span className="font-normal text-slate-400">what an assistant would call them</span>
              </label>
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Horizon HVAC"
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                City / service area
              </label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Rochester, NY"
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Trade</label>
              <input
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="HVAC"
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Attach to client <span className="font-normal text-slate-400">optional</span>
              </label>
              <select
                value={clientId}
                onChange={(e) => pickClient(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
              >
                <option value="">Prospect — not a client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={scan}
              disabled={!canScan}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition"
            >
              {busy ? 'Scanning…' : 'Run the scan'}
            </button>
            <p className="text-[11px] text-slate-500">
              Asks 15 real buyer questions with live web search. Takes a couple of minutes.
            </p>
          </div>

          {progress && (
            <div className="pt-1">
              <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                <span>
                  {progress.phase === 'building' && 'Reading the site and writing the questions…'}
                  {progress.phase === 'running' && 'Asking the questions…'}
                  {progress.phase === 'scoring' && 'Working out what it means…'}
                </span>
                {progress.total > 0 && (
                  <span className="tabular-nums">
                    {progress.done}/{progress.total}
                  </span>
                )}
              </div>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-slate-900 transition-all duration-500"
                  style={{
                    width:
                      progress.total > 0
                        ? `${Math.max(4, (progress.done / progress.total) * 100)}%`
                        : '8%',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {open && (
          <div className="bg-white rounded-lg md:rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{open.business_name}</h2>
                <p className="text-xs text-slate-500">
                  {open.domain}
                  {open.location ? ` · ${open.location}` : ''}
                </p>
              </div>
              <button
                onClick={() => {
                  setOpen(null)
                  setBaseline(null)
                }}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>

            {/* Only worth a toggle when there is something on the other side
                of it. A first scan just shows its report. */}
            {baseline && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {[
                  ['compare', 'Before / after'],
                  ['report', 'This scan'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setView(key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      view === key
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                {olderScans.length > 1 && (
                  <select
                    value={baseline.id}
                    onChange={(e) => compareWith(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                  >
                    {olderScans.map((o) => (
                      <option key={o.id} value={o.id}>
                        vs {new Date(o.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                        {o.visibility_score !== null ? ` · scored ${o.visibility_score}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* A client with an earlier scan but no baseline recorded: the
                re-scan predates prompt reuse, or was run for a prospect and
                only later attached to a client. Offer it rather than hiding
                that a comparison is possible. */}
            {!baseline && olderScans.length > 0 && (
              <button
                onClick={() => compareWith(olderScans[0].id)}
                className="mb-4 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Compare with the scan from{' '}
                {new Date(olderScans[0].created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </button>
            )}

            {view === 'compare' && baseline ? (
              <AiScanComparison baseline={baseline} current={open} />
            ) : (
              <AiScanReport scan={open} />
            )}
          </div>
        )}

        <div className="bg-white rounded-lg md:rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-3">Past scans</h2>
          {scans.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nothing scanned yet. Put a URL in above — a competitor or a prospect is a good first
              one.
            </p>
          ) : (
            <div className="space-y-1.5">
              {scans.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 p-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
                >
                  <button onClick={() => openScan(s.id)} className="flex-1 min-w-0 text-left">
                    <span className="block text-sm font-medium text-slate-900 truncate">
                      {s.business_name}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      {s.domain} · {new Date(s.created_at).toLocaleDateString()}
                    </span>
                  </button>
                  <ScoreChip score={s.visibility_score} status={s.status} />
                  <button
                    onClick={() => remove(s.id)}
                    className="text-[11px] text-slate-400 hover:text-red-600 flex-shrink-0"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
