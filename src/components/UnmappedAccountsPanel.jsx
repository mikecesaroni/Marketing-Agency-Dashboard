import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { money } from '../lib/queries'
import {
  fetchUnmappedAccounts,
  ignoreAccount,
  mapAccountToClient,
  unignoreAll,
} from '../lib/metaAccounts'

// Ad accounts the daily sync found that no client claims. Sorted by spend,
// because that is what separates a client you forgot to map from an account
// that has been dormant for two years.
export default function UnmappedAccountsPanel() {
  const [accounts, setAccounts] = useState([])
  const [clients, setClients] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  const load = async () => {
    try {
      const [rows, c] = await Promise.all([
        fetchUnmappedAccounts(),
        supabase.from('clients').select('id, name, meta_ad_account_id').eq('archived', false).order('name'),
      ])
      setAccounts(rows)
      setClients(c.data || [])
      setReady(true)
    } catch {
      // The table may not exist yet on a project without the migration. Staying
      // silent is right here: this panel is an extra, not the page.
      setReady(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const assign = async (account, clientId) => {
    if (!clientId) return
    const client = clients.find((c) => c.id === clientId)
    if (
      client?.meta_ad_account_id &&
      client.meta_ad_account_id !== account.ad_account_id &&
      !confirm(
        `${client.name} is already pointed at ad account ${client.meta_ad_account_id}. ` +
          `Replace it with ${account.ad_account_id}? Their existing history stays, but the ` +
          `daily sync will pull the new account from now on.`
      )
    ) {
      return
    }

    setBusy(account.ad_account_id)
    setError('')
    try {
      await mapAccountToClient(account, clientId)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const dismiss = async (id) => {
    setBusy(id)
    try {
      await ignoreAccount(id)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  if (!ready || accounts.length === 0) return null

  return (
    <div className="bg-white border border-amber-300 rounded-xl mb-4 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left"
      >
        <span className="font-semibold text-slate-900">
          🔍 Unmapped Meta ad accounts
          <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">
            {accounts.length}
          </span>
        </span>
        <span className="text-slate-400 text-sm">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-200 p-4 space-y-2">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
          <p className="text-xs text-slate-500">
            The daily sync can see these but no client claims them. Map one and it joins the sync
            tomorrow.
          </p>

          {accounts.map((a) => (
            <div
              key={a.ad_account_id}
              className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {a.account_name || a.ad_account_id}
                </p>
                <p className="text-[11px] text-slate-600 truncate">
                  {a.ad_account_id}
                  {a.business_name && ` · ${a.business_name}`}
                  {' · '}
                  <span className={a.spend_last_30d > 0 ? 'font-semibold text-slate-800' : ''}>
                    {money(a.spend_last_30d || 0)} last 30d
                  </span>
                  {a.leads_last_30d > 0 && ` · ${a.leads_last_30d} leads`}
                </p>
                {a.is_queryable === false && (
                  <p className="text-[11px] text-red-700">
                    Not readable: {a.not_queryable_reason || 'Meta did not say why'}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <select
                  defaultValue=""
                  disabled={busy === a.ad_account_id}
                  onChange={(e) => assign(a, e.target.value)}
                  className="px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
                >
                  <option value="">Map to client...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.meta_ad_account_id ? ' (has one)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => dismiss(a.ad_account_id)}
                  disabled={busy === a.ad_account_id}
                  className="px-2 py-1.5 rounded text-xs text-slate-500 hover:text-red-700 transition"
                >
                  Ignore
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={() => unignoreAll().then(load)}
            className="text-[11px] text-slate-400 hover:text-slate-700"
          >
            Show accounts I previously ignored
          </button>
        </div>
      )}
    </div>
  )
}
