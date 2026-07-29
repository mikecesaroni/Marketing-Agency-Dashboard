import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

function getMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.setDate(diff))
}

function formatDate(date) {
  return date.toISOString().split('T')[0]
}

export default function AddWorkLogForm({ clientId, clientName, onSuccess, onClose }) {
  const [formData, setFormData] = useState({
    week_of: formatDate(getMonday(new Date())),
    work_summary: '',
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
      const { error } = await supabase.from('weekly_work_log').insert({
        client_id: clientId,
        week_of: formData.week_of,
        work_summary: formData.work_summary,
      })

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
      <p className="text-sm text-slate-600 mb-4">Work log for: <span className="font-semibold">{clientName}</span></p>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Week Of (Monday) *
        </label>
        <input
          type="date"
          name="week_of"
          value={formData.week_of}
          onChange={handleChange}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Work Summary *
        </label>
        <textarea
          name="work_summary"
          value={formData.work_summary}
          onChange={handleChange}
          rows="4"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="e.g. Updated ad copy on Meta campaigns, reviewed LSA performance, created 3 new ad creatives with Higgsfield"
          required
        />
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
          {loading ? 'Adding...' : 'Add Work Log'}
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
