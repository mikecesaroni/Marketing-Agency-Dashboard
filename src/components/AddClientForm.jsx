import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function AddClientForm({ onSuccess, onClose }) {
  const [name, setName] = useState('')
  const [adAccountId, setAdAccountId] = useState('')
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

    try {
      const { error: err } = await supabase.from('clients').insert({
        name: name.trim(),
        status: 'onboarding',
        meta_budget_per_day: 0,
        lsa_budget_per_day: 0,
        meta_ad_account_id: adAccountId || null,
      })

      if (err) throw err

      setName('')
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
