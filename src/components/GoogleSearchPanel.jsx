import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/pagedQuery'
import { diagnoseKeywords, negativeCandidates, wasteSummary } from '../lib/googleSearchRules'
import { discoverGoogleAdsAccounts } from '../lib/googleAdsDiscover'
import { buildGoogleAdsAccessMessage, buildGoogleAdsLinkWalkthrough, GOOGLE_ADS_MANAGER_ID_DISPLAY } from '../lib/googleAdsAccessMessage'
import CopySetupMessageButton from './CopySetupMessageButton'
import GoogleAdsIdInput from './GoogleAdsIdInput'
import { dashedId, explainSyncError, isAccessError } from '../lib/googleAdsId'
import { AGENCY_EMAIL, AGENCY_EMAIL_DOMAIN } from '../lib/agencyEmail'

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

const dashed = dashedId

/**
 * Find the client's account among what is linked under the manager, so the
 * id is picked from a list rather than typed. The nightly run saves the sure
 * matches on its own; this is for the day someone does not want to wait, and
 * for a name that was not close enough to be sure.
 */
function FindAccount({ client, onUpdate }) {
  const [state, setState] = useState('idle') // idle | looking | shown | saving
  const [found, setFound] = useState(null)
  const [error, setError] = useState('')

  const look = async () => {
    setState('looking')
    setError('')
    try {
      const res = await discoverGoogleAdsAccounts({ dryRun: true })
      setFound(res)
      setState('shown')
    } catch (err) {
      setError(err.message)
      setState('idle')
    }
  }

  const use = async (customerId) => {
    setState('saving')
    const { error: err } = await supabase
      .from('clients')
      .update({ google_ads_customer_id: customerId })
      .eq('id', client.id)
    if (err) {
      setError(err.message)
      setState('shown')
    } else onUpdate?.()
  }

  const mine = found?.candidates?.[client.id] || []
  const sure = found?.matches?.find((m) => m.client_id === client.id) || null
  const viaOf = new Map((found?.linked || []).map((a) => [a.id, a.via]))
  const ranked = [
    ...(sure ? [{ customer_id: sure.customer_id, account: sure.account, score: 1 }] : []),
    ...mine.filter((c) => c.customer_id !== sure?.customer_id),
  ]
  const others = (found?.unclaimed || []).filter((a) => !ranked.some((c) => c.customer_id === a.id))
  const pending = found?.pending || []

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={look}
          disabled={state === 'looking' || state === 'saving'}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {state === 'looking' ? 'Looking…' : '🔎 Find their account'}
        </button>
        <span className="text-xs text-slate-500">
          Lists what is linked under our manager account ({GOOGLE_ADS_MANAGER_ID_DISPLAY}), and any account
          that added our email as a user, and picks the one that matches this client.
        </span>
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

      {state !== 'idle' && state !== 'looking' && found && (
        <div className="mt-3 space-y-2">
          {found.linked.length === 0 ? (
            <p className="text-xs text-slate-700">
              Nothing is linked under the manager account yet. Send the access message below; once
              the client accepts the link, this fills in by itself on the next nightly run.
            </p>
          ) : ranked.length === 0 && others.length === 0 ? (
            <p className="text-xs text-slate-700">
              Every linked account is already on a client. If this client&apos;s account is linked, it
              is saved on the wrong client, or under a name the CRM does not have.
            </p>
          ) : (
            <>
              {ranked.length > 0 && (
                <ul className="space-y-1">
                  {ranked.map((c, i) => (
                    <li key={c.customer_id} className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs">
                      <span className="font-medium text-slate-900">{c.account || '(no name)'}</span>
                      <span className="text-slate-500">{dashed(c.customer_id)}</span>
                      {viaOf.get(c.customer_id) === 'user' && <span className="text-slate-400">added us as a user</span>}
                      {i === 0 && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">
                          {c.score >= 1 ? 'match' : 'closest'}
                        </span>
                      )}
                      <button type="button" onClick={() => use(c.customer_id)} disabled={state === 'saving'} className="ml-auto rounded-lg bg-emerald-600 px-2.5 py-1 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                        Use this
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {others.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-slate-600">
                    {ranked.length ? `${others.length} other linked ${others.length === 1 ? 'account' : 'accounts'} not on any client` : `${others.length} linked ${others.length === 1 ? 'account' : 'accounts'}, none named like this client`}
                  </summary>
                  <ul className="mt-1 space-y-1">
                    {others.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                        <span className="font-medium text-slate-900">{a.name || '(no name)'}</span>
                        <span className="text-slate-500">{dashed(a.id)}</span>
                        {a.via === 'user' && <span className="text-slate-400">added us as a user</span>}
                        {a.status && a.status !== 'ENABLED' && <span className="text-slate-400">{a.status.toLowerCase()}</span>}
                        <button type="button" onClick={() => use(a.id)} disabled={state === 'saving'} className="ml-auto rounded-lg border border-slate-300 px-2.5 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                          Use this
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
          {pending.length > 0 && (
            <p className="text-xs text-slate-600">
              Link {pending.length === 1 ? 'request' : 'requests'} sent and waiting on the client:{' '}
              {pending.map(dashed).join(', ')}. They accept it in Google Ads under Admin → Access and
              security → Managers.
            </p>
          )}
        </div>
      )}
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
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-900">Google Ads</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <Link to={`/reports/client/${client.id}/keyword-plan`} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700">✦ Keyword plan</Link>
            <CopySetupMessageButton message={buildGoogleAdsAccessMessage()} label="Copy access request" />
            <CopySetupMessageButton message={buildGoogleAdsLinkWalkthrough()} label="Copy step-by-step" />
          </div>
        </div>
        <p className="mb-3 text-sm text-slate-600">
          Not connected. Send the client the message: they allow {AGENCY_EMAIL_DOMAIN} on their
          Google Ads Security tab and add {AGENCY_EMAIL} as a user. Accept the invite in that inbox, read the customer ID off our
          manager account (it appears under Accounts once we are in), put it in below, and it syncs straight away.
        </p>
        <div className="space-y-3">
          <GoogleAdsIdInput client={client} onSaved={onUpdate} />
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer">No ID from them? Look through the accounts we can already see</summary>
            <div className="mt-2">
              <FindAccount client={client} onUpdate={onUpdate} />
            </div>
          </details>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900">Google Ads</h3>
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
      ) : isAccessError(client.google_ads_sync_error) ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">No access yet</p>
          <p className="mt-0.5">{explainSyncError(client.google_ads_sync_error)}</p>
          <div className="mt-2">
            <CopySetupMessageButton message={buildGoogleAdsLinkWalkthrough()} label="Copy step-by-step" />
          </div>
        </div>
      ) : keywordRows.length === 0 && termRows.length === 0 ? (
        <p className="text-sm text-slate-600">
          {client.google_ads_synced_at
            ? 'Connected. Google let us in, but there is no keyword or search activity in the last 90 days.'
            : 'Connected, but nothing has synced yet. The sync runs nightly and reads the last 14 days.'}
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

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-3">
        <span className="text-xs text-slate-600">Google Ads customer ID</span>
        <GoogleAdsIdInput client={client} onSaved={onUpdate} compact />
      </div>
    </div>
  )
}
