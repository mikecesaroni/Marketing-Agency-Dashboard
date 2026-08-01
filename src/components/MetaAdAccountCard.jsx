import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function MetaAdAccountCard({ client, weeklyKPIs = [], onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(client.meta_ad_account_id || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    // People paste the ID straight out of Ads Manager, where it wears an "act_"
    // prefix. The API call adds that itself, so store the bare number.
    const cleaned = value.trim().replace(/^act_/i, '')

    const { error: err } = await supabase
      .from('clients')
      .update({ meta_ad_account_id: cleaned || null })
      .eq('id', client.id)

    if (err) {
      setError(
        err.message.includes('meta_ad_account_id')
          ? 'Run supabase/meta-sync.sql in the Supabase SQL Editor to add this field.'
          : err.message
      )
      setSaving(false)
      return
    }

    setEditing(false)
    setSaving(false)
    onUpdate?.()
  }

  const lastSynced = weeklyKPIs
    .filter((k) => k.channel === 'Meta' && k.notes === 'Synced from Meta Ads')
    .sort((a, b) => b.week_of.localeCompare(a.week_of))[0]

  return (
    <div className="bg-white rounded-lg md:rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-3">
        <h2 className="text-lg md:text-xl font-bold text-slate-900">Meta Ads Sync</h2>
        {!editing && (
          <button
            onClick={() => {
              setValue(client.meta_ad_account_id || '')
              setEditing(true)
            }}
            className="w-full md:w-auto px-3 py-2 md:py-1.5 text-sm bg-slate-200 text-slate-800 rounded-lg font-medium hover:bg-slate-300 transition"
          >
            {client.meta_ad_account_id ? 'Change' : 'Connect Account'}
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-3">
          {error}
        </div>
      )}

      {editing ? (
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Meta ad account ID
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 1234567890123456"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              autoFocus
            />
            <p className="text-xs text-slate-500 mt-1">
              Numbers only — the "act_" prefix is stripped automatically. Leave blank to stop
              syncing this client.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 md:flex-none px-4 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 md:flex-none px-4 bg-slate-200 text-slate-900 py-2.5 rounded-lg font-medium hover:bg-slate-300 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : client.meta_ad_account_id ? (
        <div>
          <p className="font-mono text-sm text-slate-900">{client.meta_ad_account_id}</p>
          <p className="text-xs text-slate-500 mt-1">
            {lastSynced
              ? `Last synced week of ${lastSynced.week_of} — $${lastSynced.ad_spend.toFixed(2)}, ${lastSynced.leads} leads`
              : 'Connected. Meta spend and leads will fill in on the next weekly run.'}
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Not connected. Add this client's Meta ad account ID to pull their spend and leads in
          automatically each week instead of logging them by hand.
        </p>
      )}
    </div>
  )
}
