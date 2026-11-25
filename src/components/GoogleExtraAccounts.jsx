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
 *
 * Two places, one control. On the client page it is a section under the main
 * ID. On the Google Ads report's "Connected accounts" panel it sits beside
 * each connected client's name (`dark`, `inline`): there the box stays folded
 * behind "+ Add another account" until it is wanted, so a list of fifteen
 * clients is not fifteen empty boxes.
 */

const ROW_TABLES = ['google_campaign_daily', 'google_keyword_daily', 'google_search_term_daily', 'lsa_leads']

export default function GoogleExtraAccounts({ client, onSaved, dark = false, inline = false }) {
  const extras = extraCustomerIds(client)
  const status = client.google_ads_extra_status || {}
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState('') // '' | 'adding' | 'syncing' | the id being removed
  const [note, setNote] = useState(null) // { ok, text }
  const [open, setOpen] = useState(!inline)

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
  // The two skins: the client page is light, the reports are dark.
  const t = dark
    ? {
        row: 'border-white/[0.07] bg-black/20',
        id: 'text-white',
        quiet: 'text-slate-500',
        ok: 'text-emerald-300',
        warn: 'text-amber-300',
        remove: 'text-slate-400 hover:bg-white/10 hover:text-white',
        input: 'bg-white/[0.04] text-white placeholder:text-slate-600 focus:ring-emerald-400/60',
        inputEdge: 'border-white/15',
        button: 'bg-emerald-500 text-slate-950 hover:bg-emerald-400',
        link: 'text-emerald-300 hover:text-emerald-200',
      }
    : {
        row: 'border-slate-200 bg-slate-50',
        id: 'text-slate-900',
        quiet: 'text-slate-500',
        ok: 'text-emerald-700',
        warn: 'text-amber-800',
        remove: 'text-slate-500 hover:bg-slate-200 hover:text-slate-800',
        input: 'bg-white focus:ring-blue-400',
        inputEdge: 'border-slate-300',
        button: 'bg-blue-600 text-white hover:bg-blue-700',
        link: 'text-blue-600 hover:text-blue-800',
      }
  return (
    <div className={inline ? '' : 'mt-3 border-t border-slate-100 pt-3'} data-google-extra-accounts>
      {!inline && (
        <p className="text-xs font-semibold text-slate-800">
          Other Google Ads accounts
          <span className="ml-1 font-normal text-slate-500">a second account, an old one, or Local Services in an account of its own</span>
        </p>
      )}
      {extras.length > 0 && (
        <ul className={`${inline ? '' : 'mt-2 '}space-y-1.5`}>
          {extras.map((id) => {
            const s = status[id]
            return (
              <li key={id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-2.5 py-1.5 text-xs ${t.row}`} data-extra-account={id}>
                <span className={`font-mono tabular-nums ${t.id}`}>{dashedId(id)}</span>
                {!s ? (
                  <span className={t.quiet}>Not read yet. Tonight’s sync will pick it up.</span>
                ) : s.ok ? (
                  <span className={t.ok}>
                    ✓ Connected{Number(s.spend) > 0 ? `, $${Number(s.spend).toLocaleString('en-US', { maximumFractionDigits: 0 })} in the last sync` : ', no spend in the last sync'}
                  </span>
                ) : (
                  <span className={t.warn}>{explainSyncError(s.error)}</span>
                )}
                <button
                  type="button"
                  onClick={() => remove(id)}
                  disabled={working}
                  className={`ml-auto rounded px-1.5 py-0.5 disabled:opacity-40 ${t.remove}`}
                  aria-label={`Remove account ${dashedId(id)}`}
                >
                  {busy === id ? 'Removing…' : 'Remove'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={`${extras.length ? 'mt-1.5 ' : ''}text-xs font-medium ${t.link}`} data-add-another>
          + Add another account
        </button>
      ) : (
      <div className={`${inline && !extras.length ? '' : 'mt-2 '}flex flex-wrap items-center gap-2`}>
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
          autoFocus={inline}
          className={`w-36 rounded-lg border px-2.5 py-1 font-mono text-xs tabular-nums focus:outline-none focus:ring-2 ${t.input} ${
            digits.length > 0 && !cleanCustomerId(value) ? 'border-amber-400' : t.inputEdge
          }`}
        />
        <button
          type="button"
          onClick={add}
          disabled={working || !digits}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium disabled:opacity-40 ${t.button}`}
        >
          {busy === 'adding' ? 'Saving…' : busy === 'syncing' ? 'Checking access…' : 'Add account & sync'}
        </button>
      </div>
      )}
      {note && <p className={`mt-1.5 text-xs ${note.ok ? t.ok : t.warn}`}>{note.ok ? '✓ ' : ''}{note.text}</p>}
    </div>
  )
}
