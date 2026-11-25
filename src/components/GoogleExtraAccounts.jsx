import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { readFunctionError } from '../lib/functionError'
import { cleanCustomerId, dashedId, explainSyncError, extraCustomerIds, extraIdProblem } from '../lib/googleAdsId'

/**
 * A client's other Google Ads accounts.
 *
 * Most clients have one account and never see more than the "add" line here.
 * Some have two or three: an old account next to a new one, a second
 * location, or Local Services in an account of its own. Each one added is
 * read by the sync exactly like the main account, and its campaigns,
 * keywords, search terms and pay-per-lead leads are counted under this
 * client everywhere, because every report reads by client.
 *
 * Adding saves the ID, syncs straight away and says whether Google let us
 * into THAT account. Removing takes the account's numbers off the client
 * too, so nothing it spent keeps being counted here.
 *
 * One account belongs to one client: an ID another client already carries is
 * refused, because the same spend would be counted twice.
 */

const ROW_TABLES = ['google_campaign_daily', 'google_keyword_daily', 'google_search_term_daily', 'lsa_leads']

export default function GoogleExtraAccounts({ client, onSaved }) {
  const extras = extraCustomerIds(client)
  const status = client.google_ads_extra_status || {}
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState('') // '' | 'adding' | 'syncing' | the id being removed
  const [note, setNote] = useState(null) // { ok, text }

  const sync = async () => {
    const { data, error } = await supabase.functions.invoke('google-daily-sync', { body: { client_id: client.id, days: 30 } })
    if (error) {
      const { detail } = await readFunctionError(error)
      throw new Error(detail || 'The Google sync did not answer. The change is saved and tonight’s sync will pick it up.')
    }
    return (data?.results || [])[0] || null
  }

  const add = async () => {
    setNote(null)
    setBusy('adding')
    try {
      // Every client's accounts, to refuse one that is somebody else's.
      const { data: all, error: readErr } = await supabase
        .from('clients')
        .select('id, name, google_ads_customer_id, google_ads_extra_customer_ids, lsa_customer_id')
      if (readErr) throw new Error(readErr.message)
      // This client as the database has it now, not as the page loaded it:
      // two accounts added back to back must not write over each other.
      const fresh = (all || []).find((c) => c.id === client.id) || client
      const problem = extraIdProblem(value, fresh, all || [])
      if (problem) {
        setNote({ ok: false, text: problem })
        return
      }
      const id = cleanCustomerId(value)
      const { error } = await supabase
        .from('clients')
        .update({ google_ads_extra_customer_ids: [...extraCustomerIds(fresh), id] })
        .eq('id', client.id)
      if (error) throw new Error(error.message)
      setValue('')
      setBusy('syncing')
      const line = await sync()
      const refused = (line?.extra_errors || []).find((e) => e.account === id)
      if (line?.error) setNote({ ok: false, text: `Added ${dashedId(id)}. The main account did not sync: ${explainSyncError(line.error)}` })
      else if (refused) setNote({ ok: false, text: `Added ${dashedId(id)}. ${explainSyncError(refused.error)}` })
      else setNote({ ok: true, text: `Added ${dashedId(id)} and pulled its last 30 days. Its numbers are counted under ${client.name} from now on.` })
    } catch (err) {
      setNote({ ok: false, text: err.message })
    } finally {
      setBusy('')
      onSaved?.()
    }
  }

  const remove = async (id) => {
    if (!window.confirm(`Take ${dashedId(id)} off ${client.name}? Its spend, leads, keywords and search terms stop being counted for this client.`)) return
    setNote(null)
    setBusy(id)
    try {
      const { data: fresh } = await supabase
        .from('clients')
        .select('id, google_ads_customer_id, google_ads_extra_customer_ids')
        .eq('id', client.id)
        .maybeSingle()
      const { error } = await supabase
        .from('clients')
        .update({ google_ads_extra_customer_ids: extraCustomerIds(fresh || client).filter((x) => x !== id) })
        .eq('id', client.id)
      if (error) throw new Error(error.message)
      // The account's rows go with it, or the reports would keep adding
      // them in. The sync then rebuilds the weekly totals without them.
      for (const table of ROW_TABLES) {
        const { error: delErr } = await supabase.from(table).delete().eq('client_id', client.id).eq('customer_id', id)
        if (delErr) throw new Error(`${table}: ${delErr.message}`)
      }
      await sync().catch(() => null)
      setNote({ ok: true, text: `Took ${dashedId(id)} off ${client.name}, with its numbers.` })
    } catch (err) {
      setNote({ ok: false, text: err.message })
    } finally {
      setBusy('')
      onSaved?.()
    }
  }

  const working = Boolean(busy)
  const digits = value.replace(/\D/g, '')
  return (
    <div className="mt-3 border-t border-slate-100 pt-3" data-google-extra-accounts>
      <p className="text-xs font-semibold text-slate-800">
        Other Google Ads accounts
        <span className="ml-1 font-normal text-slate-500">a second account, an old one, or Local Services in an account of its own</span>
      </p>
      {extras.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {extras.map((id) => {
            const s = status[id]
            return (
              <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs" data-extra-account={id}>
                <span className="font-mono tabular-nums text-slate-900">{dashedId(id)}</span>
                {!s ? (
                  <span className="text-slate-500">Not read yet. Tonight’s sync will pick it up.</span>
                ) : s.ok ? (
                  <span className="text-emerald-700">
                    ✓ Connected{Number(s.spend) > 0 ? `, $${Number(s.spend).toLocaleString('en-US', { maximumFractionDigits: 0 })} in the last sync` : ', no spend in the last sync'}
                  </span>
                ) : (
                  <span className="text-amber-800">{explainSyncError(s.error)}</span>
                )}
                <button
                  type="button"
                  onClick={() => remove(id)}
                  disabled={working}
                  className="ml-auto rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 disabled:opacity-40"
                  aria-label={`Remove account ${dashedId(id)}`}
                >
                  {busy === id ? 'Removing…' : 'Remove'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setNote(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && !working && digits && add()}
          inputMode="numeric"
          placeholder="123-456-7890"
          aria-label={`Another Google Ads customer ID for ${client.name}`}
          className={`w-36 rounded-lg border bg-white px-2.5 py-1 font-mono text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-400 ${
            digits.length > 0 && !cleanCustomerId(value) ? 'border-amber-400' : 'border-slate-300'
          }`}
        />
        <button
          type="button"
          onClick={add}
          disabled={working || !digits}
          className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {busy === 'adding' ? 'Saving…' : busy === 'syncing' ? 'Checking access…' : 'Add account & sync'}
        </button>
      </div>
      {note && <p className={`mt-1.5 text-xs ${note.ok ? 'text-emerald-700' : 'text-amber-800'}`}>{note.ok ? '✓ ' : ''}{note.text}</p>}
    </div>
  )
}
