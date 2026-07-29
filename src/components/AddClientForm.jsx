import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function AddClientForm({ onSuccess, onClose }) {
  const [formData, setFormData] = useState({
    name: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { error } = await supabase.from('clients').insert({
        name: formData.name,
        status: 'onboarding',
        meta_budget_per_day: 0,
        lsa_budget_per_day: 0,
      })

      if (error) throw error

      setFormData({
        name: '',
      })
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
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Business Name *
        </label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="e.g. John's Plumbing"
          autoFocus
          required
        />
      </div>

      <p className="text-sm text-slate-500 mt-4">
        You'll fill in all other details (industry, market, budgets, etc.) in the onboarding intake form after creating the client.
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
          className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {loading ? 'Creating...' : 'Create Client'}
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
