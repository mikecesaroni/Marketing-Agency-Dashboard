import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function EditClientForm({ client, onSuccess, onClose }) {
  const [formData, setFormData] = useState({
    name: client.name,
    industry: client.industry || '',
    market: client.market || '',
    meta_budget_per_day: client.meta_budget_per_day || '',
    lsa_budget_per_day: client.lsa_budget_per_day || '',
    status: client.status,
    meta_ads_active: client.meta_ads_active,
    lsa_active: client.lsa_active,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e) => {
    const { name, type, value, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { error } = await supabase
        .from('clients')
        .update({
          name: formData.name,
          industry: formData.industry || null,
          market: formData.market || null,
          meta_budget_per_day: formData.meta_budget_per_day ? parseFloat(formData.meta_budget_per_day) : 0,
          lsa_budget_per_day: formData.lsa_budget_per_day ? parseFloat(formData.lsa_budget_per_day) : 0,
          status: formData.status,
          meta_ads_active: formData.meta_ads_active,
          lsa_active: formData.lsa_active,
        })
        .eq('id', client.id)

      if (error) throw error

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
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Client Name *
        </label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Industry
        </label>
        <input
          type="text"
          name="industry"
          value={formData.industry}
          onChange={handleChange}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="e.g. Plumbing, HVAC, Roofing"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Market
        </label>
        <input
          type="text"
          name="market"
          value={formData.market}
          onChange={handleChange}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="e.g. Denver, CO"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Meta Ads Budget ($/day)
        </label>
        <input
          type="number"
          name="meta_budget_per_day"
          value={formData.meta_budget_per_day}
          onChange={handleChange}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="e.g. 50"
          step="0.01"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          LSA Budget ($/day)
        </label>
        <input
          type="number"
          name="lsa_budget_per_day"
          value={formData.lsa_budget_per_day}
          onChange={handleChange}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="e.g. 30"
          step="0.01"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Status
        </label>
        <select
          name="status"
          value={formData.status}
          onChange={handleChange}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="onboarding">Onboarding</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="churned">Churned</option>
        </select>
      </div>

      <div className="space-y-2 pt-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="meta_ads_active"
            checked={formData.meta_ads_active}
            onChange={handleChange}
            className="w-4 h-4 rounded"
          />
          <span className="text-sm font-medium text-slate-700">Meta Ads Active</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="lsa_active"
            checked={formData.lsa_active}
            onChange={handleChange}
            className="w-4 h-4 rounded"
          />
          <span className="text-sm font-medium text-slate-700">LSA Active</span>
        </label>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-4">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 bg-slate-200 text-slate-900 py-2 rounded-lg font-medium hover:bg-slate-300 transition"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
