import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { readFunctionError } from '../lib/functionError'
import { cleanCustomerId, dashedId, explainSyncError } from '../lib/googleAdsId'

/**
 * The one place a Google Ads customer ID is typed in.
 *
 * Paste it however Google showed it (123-456-7890), press Save, and this
 * saves it, syncs that client straight away and says in plain words whether
 * it worked: the spend and leads it found, or that Google refused us and
 * what the client still has to do. So "I put the ID in" and "it is working"
 * are the same moment, not a question left until tomorrow's numbers.
 *
 * Used on the client page's Google Search panel and on the Google Search
 * report, beside every client still waiting.
 */
export default function GoogleAdsIdInput({ client, onSaved, compact = false, dark = false }) {
  const [value, setValue] = useState(client.google_ads_customer_id ? dashedId(client.google_ads_customer_id) : '')
  const [state, setState] = useState('idle') // idle | saving | syncing | done
  const [result, setResult] = useState(null) // { ok, text }

  useEffect(() => {
    setValue(client.google_ads_customer_id ? dashedId(client.google_ads_customer_id) : '')
  }, [client.google_ads_customer_id])

  const digits = String(value).replace(/\D/g, '')
  const valid = cleanCustomerId(value)
  const unchanged = valid && valid === String(client.google_ads_customer_id || '')

  const save = async () => {
    if (!valid) {
      setResult({ ok: false, text: 'A Google Ads customer ID is ten digits, like 123-456-7890.' })
      return
    }
    setState('saving')
    setResult(null)
    const { error } = await supabase
      .from('clients')
      .update({ google_ads_customer_id: valid, google_ads_sync_error: null })
      .eq('id', client.id)
    if (error) {
      setState('idle')
      setResult({ ok: false, text: error.message })
      return
    }
    setValue(dashedId(valid))
    setState('syncing')
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('google-daily-sync', {
        body: { client_id: client.id, days: 30 },
      })
      if (fnErr) {
        const { detail } = await readFunctionError(fnErr)
        throw new Error(detail || 'The Google sync did not answer. The ID is saved and tonight\'s sync will try again.')
      }
      const line = (data?.results || [])[0]
      if (!line) {
        setResult({ ok: true, text: 'Saved. Tonight\'s sync will pick it up.' })
      } else if (line.error) {
        setResult({ ok: false, text: `ID saved. ${explainSyncError(line.error)}` })
      } else {
        const spend = Number(line.spend || 0)
        setResult({
          ok: true,
          text:
            spend > 0 || line.leads > 0
              ? `Connected. Pulled the last 30 days: $${spend.toLocaleString('en-US', { maximumFractionDigits: 0 })} spend, ${line.leads} leads.`
              : 'Connected. Google let us in, but the account had no spend in the last 30 days.',
        })
      }
    } catch (err) {
      setResult({ ok: false, text: err.message })
    } finally {
      setState('done')
      onSaved?.()
    }
  }

  const busy = state === 'saving' || state === 'syncing'
  return (
    <div className={compact ? '' : 'rounded-lg border border-blue-200 bg-blue-50/60 p-3'}>
      {!compact && (
        <label htmlFor={`gads-${client.id}`} className="mb-1.5 block text-xs font-semibold text-slate-800">
          Their Google Ads customer ID
          <span className="ml-1 font-normal text-slate-500">top right of their Google Ads, ten digits</span>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`gads-${client.id}`}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setResult(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && !busy && save()}
          inputMode="numeric"
          placeholder="123-456-7890"
          aria-label={`${client.name} Google Ads customer ID`}
          className={`rounded-lg border px-2.5 font-mono tabular-nums focus:outline-none focus:ring-2 ${dark ? 'bg-white/[0.04] text-white placeholder:text-slate-600 focus:ring-emerald-400/60' : 'bg-white text-slate-900 focus:ring-blue-400'} ${
            compact ? 'w-36 py-1 text-xs' : 'w-44 py-1.5 text-sm'
          } ${digits.length > 0 && !valid ? 'border-amber-400' : dark ? 'border-white/15' : 'border-slate-300'}`}
        />
        <button
          type="button"
          onClick={save}
          disabled={busy || !digits || (unchanged && !client.google_ads_sync_error)}
          className={`rounded-lg font-medium disabled:opacity-40 ${dark ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' : 'bg-blue-600 text-white hover:bg-blue-700'} ${compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'}`}
        >
          {state === 'saving' ? 'Saving…' : state === 'syncing' ? 'Checking access…' : unchanged ? (client.google_ads_sync_error ? 'Check again' : 'Saved') : 'Save & sync'}
        </button>
      </div>
      {result && (
        <p className={`mt-1.5 text-xs ${result.ok ? (dark ? 'text-emerald-300' : 'text-emerald-700') : dark ? 'text-amber-300' : 'text-amber-800'}`}>{result.ok ? '✓ ' : ''}{result.text}</p>
      )}
    </div>
  )
}
