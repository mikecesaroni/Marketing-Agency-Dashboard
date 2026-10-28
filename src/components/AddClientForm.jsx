import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { TIERS, TIER_BY_NUMBER } from '../lib/clientTiers'
import { announceClient } from '../lib/teamBriefClient'

/**
 * A new client: the name, the package they signed for, and their Meta ad
 * account if it is already known. The package is picked here rather than
 * guessed later from the fee ("when we add a new client we pick which tier
 * they are on"), it sets the monthly and setup fees, and the moment the
 * client lands the Slack channel hears "new client added to the agency",
 * with the tier and the dollars.
 */
export default function AddClientForm({ onSuccess, onClose }) {
  const [name, setName] = useState('')
  const [tier, setTier] = useState('')
  const [adAccountId, setAdAccountId] = useState('')
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // Offered here so a client can be pointed at their ad account during
  // onboarding rather than having to come back for it later.
  useEffect(() => {
    Promise.all([
      supabase.from('meta_ad_accounts').select('ad_account_id, name, business_name').order('name'),
      supabase.from('clients').select('name, meta_ad_account_id').not('meta_ad_account_id', 'is', null),
    ]).then(([accountsRes, clientsRes]) => {
      const takenBy = {}
      for (const c of clientsRes.data || []) takenBy[c.meta_ad_account_id] = c.name
      setAccounts((accountsRes.data || []).map((a) => ({ ...a, takenBy: takenBy[a.ad_account_id] })))
    })
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const picked = TIER_BY_NUMBER[Number(tier)]
    if (!picked) {
      setError('Pick the package they signed for.')
      setLoading(false)
      return
    }

    try {
      const { data: row, error: err } = await supabase
        .from('clients')
        .insert({
          name: name.trim(),
          tier: picked.tier,
          // The package IS the price. Changeable on their page if the deal
          // differs; the pipeline and the brief read the tier, not the fee.
          monthly_fee: picked.price,
          setup_fee: picked.setup,
          meta_budget_per_day: 0,
          lsa_budget_per_day: 0,
          meta_ad_account_id: adAccountId || null,
        })
        .select('id')
        .single()

      if (err) throw err

      // The channel hears it now. Best effort: the client exists either way,
      // and a channel that is not connected is not a reason to block the form.
      try {
        const out = await announceClient(row.id)
        if (out?.posted === false && out?.error) setNotice(`Added. Slack did not take the post: ${out.error}`)
      } catch (postErr) {
        setNotice(`Added. The channel was not told: ${postErr.message}`)
      }

      setName('')
      setTier('')
      setAdAccountId('')
      onSuccess()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Business Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="e.g. John's Plumbing"
          autoFocus
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Package *</label>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Package">
          {TIERS.map((t) => {
            const on = Number(tier) === t.tier
            return (
              <label
                key={t.tier}
                className={`cursor-pointer rounded-lg border px-3 py-2.5 text-sm transition ${on ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-300 hover:border-slate-400'}`}
                title={t.includes.join(' · ')}
                data-tier-option={t.tier}
              >
                <input type="radio" name="tier" value={t.tier} checked={on} onChange={() => setTier(String(t.tier))} className="sr-only" required />
                <span className="block font-semibold text-slate-900">{t.short}</span>
                <span className="block text-xs text-slate-600">
                  ${t.price.toLocaleString()}/mo{t.setup ? ` + $${t.setup.toLocaleString()} setup` : ''}
                </span>
              </label>
            )
          })}
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Sets their monthly fee and the steps on their plan. The channel is told the moment they are added.
        </p>
      </div>

      {accounts.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Meta ad account <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <select
            value={adAccountId}
            onChange={(e) => setAdAccountId(e.target.value)}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">Connect later</option>
            {accounts.map((a) => (
              <option key={a.ad_account_id} value={a.ad_account_id}>
                {a.name || a.business_name || a.ad_account_id}
                {a.takenBy ? ` — already on ${a.takenBy}` : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-1">
            Connects their Meta spend and leads. Changeable any time on their page.
          </p>
        </div>
      )}

      <p className="text-sm text-slate-500">
        You'll fill in the rest (industry, market, budgets) in the intake form after creating the
        client.
      </p>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}
      {notice && <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">{notice}</div>}

      <div className="flex gap-2 pt-4">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {loading ? 'Creating...' : 'Create Client'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 bg-slate-200 text-slate-900 py-2.5 rounded-lg font-medium hover:bg-slate-300 transition"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
