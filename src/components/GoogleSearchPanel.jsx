import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/pagedQuery'
import { diagnoseKeywords, negativeCandidates, wasteSummary } from '../lib/googleSearchRules'

/**
 * Google Search, for one client: where the money went and what to switch off.
 *
 * The two tables are shown separately and never added together, because they
 * measure different things and Google withholds the search term on a large
 * share of clicks -- so search-term spend is always less than keyword spend
 * for the same day, and a combined total would be a number nobody could
 * defend to a client.
 *
 * No writes to Google from here. Pausing a keyword and adding a negative are
 * both one click in the Google Ads UI, and doing them through the API would
 * mean holding write scope for every client account to save that click.
 */
const WINDOWS = [
  [7, '7 days'],
  [14, '14 days'],
  [30, '30 days'],
]

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - (n - 1))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const usd = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const VERDICT = {
  waste: { label: 'Not converting', cls: 'bg-red-100 text-red-800' },
  expensive: { label: 'Too expensive', cls: 'bg-amber-100 text-amber-800' },
  winner: { label: 'Winner', cls: 'bg-green-100 text-green-800' },
  ok: { label: 'OK', cls: 'bg-slate-100 text-slate-700' },
  young: { label: 'Too early', cls: 'bg-slate-100 text-slate-500' },
}

function CustomerIdRow({ client, onUpdate }) {
  const [value, setValue] = useState(client.google_ads_customer_id || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setSaving(true)
    setError('')
    // Digits only. The id is displayed with dashes everywhere in Google's own
    // UI and the API rejects it in that form, so the dashes come off here
    // rather than failing in the nightly sync where nobody would see it.
    const digits = value.replace(/\D/g, '')
    const { error: err } = await supabase
      .from('clients')
      .update({ google_ads_customer_id: digits || null })
      .eq('id', client.id)
    setSaving(false)
    if (err) setError(err.message)
    else onUpdate?.()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-xs text-slate-600">Google Ads customer ID</label>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="123-456-7890"
        className="w-40 rounded border border-slate-300 px-2 py-1 text-xs"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  )
}

export default function GoogleSearchPanel({ client, onUpdate }) {
  const [days, setDays] = useState(30)
  const [keywordRows, setKeywordRows] = useState([])
  const [termRows, setTermRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!client?.id) return
    setLoading(true)
    setError('')
    const since = daysAgo(90)
    try {
      // Paged, because a client running search for a few months is well past
      // the 1000 rows PostgREST returns before it stops without saying so.
      const [keywords, terms] = await Promise.all([
        fetchAllRows(() =>
          supabase
            .from('google_keyword_daily')
            .select('*')
            .eq('client_id', client.id)
            .gte('date', since)
            .order('date', { ascending: true })
            .order('id', { ascending: true })
        ),
        fetchAllRows(() =>
          supabase
            .from('google_search_term_daily')
            .select('*')
            .eq('client_id', client.id)
            .gte('date', since)
            .order('date', { ascending: true })
            .order('id', { ascending: true })
        ),
      ])
      setKeywordRows(keywords)
      setTermRows(terms)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [client?.id])

  useEffect(() => {
    load()
  }, [load])

  const since = useMemo(() => daysAgo(days), [days])
  const keywords = useMemo(() => diagnoseKeywords(keywordRows, { since }), [keywordRows, since])
  const negatives = useMemo(() => negativeCandidates(termRows, { since }), [termRows, since])
  const summary = useMemo(() => wasteSummary(keywords, negatives), [keywords, negatives])

  if (!client?.google_ads_customer_id) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-1 font-semibold text-slate-900">Google Search</h3>
        <p className="mb-3 text-sm text-slate-600">
          Not connected. Put this client&apos;s Google Ads customer ID in and the nightly sync picks
          them up — keywords, search terms and spend.
        </p>
        <CustomerIdRow client={client} onUpdate={onUpdate} />
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900">Google Search</h3>
        <div className="flex items-center gap-1">
          {WINDOWS.map(([n, label]) => (
            <button
              key={n}
              type="button"
              onClick={() => setDays(n)}
              className={`rounded-lg px-2 py-1 text-xs ${
                days === n ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{error}</p>
      ) : keywordRows.length === 0 && termRows.length === 0 ? (
        <p className="text-sm text-slate-600">
          Connected, but nothing has synced yet. The sync runs nightly and reads the last 14 days.
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm font-medium text-slate-900">{summary.headline}</p>

          {negatives.length > 0 && (
            <div className="mb-4">
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Block these searches · {usd(summary.savable)} spent, nothing booked
              </h4>
              <ul className="space-y-1">
                {negatives.slice(0, 12).map((t) => (
                  <li
                    key={t.term}
                    className={`flex flex-wrap items-baseline gap-x-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                      t.certain ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <span className="font-medium text-slate-900">{t.term}</span>
                    <span className="text-slate-600">{t.why}</span>
                    {t.certain && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-800">
                        certain
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {negatives.length > 12 && (
                <p className="mt-1 text-[11px] text-slate-500">
                  and {negatives.length - 12} more.
                </p>
              )}
            </div>
          )}

          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Keywords
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1 pr-2 font-medium">Keyword</th>
                  <th className="py-1 pr-2 font-medium">Clicks</th>
                  <th className="py-1 pr-2 font-medium">Cost</th>
                  <th className="py-1 pr-2 font-medium">Conv.</th>
                  <th className="py-1 pr-2 font-medium">Cost each</th>
                  <th className="py-1 font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {keywords.slice(0, 25).map((k) => {
                  const v = VERDICT[k.verdict] || VERDICT.ok
                  return (
                    <tr key={k.key} className="border-t border-slate-100">
                      <td className="py-1 pr-2">
                        <span className="font-medium text-slate-900">{k.keyword}</span>
                        <span className="ml-1 text-slate-400">{k.matchType?.toLowerCase()}</span>
                      </td>
                      <td className="py-1 pr-2 text-slate-700">{k.clicks}</td>
                      <td className="py-1 pr-2 text-slate-700">{usd(k.cost)}</td>
                      <td className="py-1 pr-2 text-slate-700">{k.conversions}</td>
                      <td className="py-1 pr-2 text-slate-700">{k.cpl === null ? '—' : usd(k.cpl)}</td>
                      <td className="py-1">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${v.cls}`} title={k.signal}>
                          {v.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {keywords.length > 25 && (
            <p className="mt-1 text-[11px] text-slate-500">and {keywords.length - 25} more keywords.</p>
          )}
        </>
      )}

      <div className="mt-4 border-t border-slate-100 pt-3">
        <CustomerIdRow client={client} onUpdate={onUpdate} />
      </div>
    </div>
  )
}
