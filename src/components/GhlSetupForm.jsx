import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { copyText } from '../lib/intakeSummary'
import GhlSetupFields from './GhlSetupFields'
import {
  emptyGhlSetup,
  mergeGhlSetup,
  formatGhlSetup,
  missingRequired,
  GHL_SETUP_KEYS,
} from '../lib/ghlSetupFields'

// Staff-facing GHL setup form. Same shape as OnboardingIntakeForm: talks to
// the table directly, because whoever has this open is already authenticated.
// The client-facing version of the same fields is ClientOnboardingPage, which
// goes through the token functions instead.
export default function GhlSetupForm({ client, onSuccess, onClose }) {
  const [formData, setFormData] = useState(emptyGhlSetup)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [existing, setExisting] = useState(null)
  const [copied, setCopied] = useState(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const { data } = await supabase
        .from('ghl_setup')
        .select('*')
        .eq('client_id', client.id)
        .maybeSingle()

      if (cancelled || !data) return
      setExisting(data)
      setFormData((prev) => mergeGhlSetup(prev, data))
    }

    load()
    return () => {
      cancelled = true
    }
  }, [client.id])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Empty string is not the same as "not answered" once this reaches the
      // setup step, so blanks go in as null.
      const clean = {}
      for (const key of GHL_SETUP_KEYS) {
        const value = formData[key]
        clean[key] = typeof value === 'string' && value.trim() === '' ? null : value
      }

      const { error: writeError } = existing
        ? await supabase.from('ghl_setup').update(clean).eq('id', existing.id)
        : await supabase.from('ghl_setup').insert({ client_id: client.id, ...clean })

      if (writeError) throw writeError

      onSuccess()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Copies what is on screen rather than what is saved, so it works before
  // anyone has hit Save. This is the paste that drives the actual GHL build.
  const handleCopy = async () => {
    const ok = await copyText(formatGhlSetup(formData, client.name))
    setCopied(ok ? 'ok' : 'fail')
    setTimeout(() => setCopied(null), 2000)
  }

  const missing = missingRequired(formData)

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
      <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
        <p className="text-xs text-slate-600">
          Copy everything filled in so far as the GHL setup brief.
        </p>
        <button
          type="button"
          onClick={handleCopy}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition flex-shrink-0 ${
            copied === 'ok'
              ? 'bg-green-600 text-white'
              : copied === 'fail'
                ? 'bg-red-100 text-red-700'
                : 'bg-slate-900 text-white hover:bg-slate-800'
          }`}
        >
          {copied === 'ok' ? '✓ Copied' : copied === 'fail' ? 'Copy failed' : 'Copy Setup Brief'}
        </button>
      </div>

      {missing.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs">
          <strong>{missing.length} required field{missing.length === 1 ? '' : 's'} still empty.</strong>{' '}
          You can save a partial form, but A2P registration cannot be filed until the EIN and legal
          business details are in.
        </div>
      )}

      <GhlSetupFields data={formData} onChange={handleChange} highlightMissing={missing} />

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>
      )}

      <div className="flex gap-2 pt-4 sticky bottom-0 bg-white border-t">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {loading ? 'Saving...' : existing ? 'Update GHL Setup' : 'Save GHL Setup'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 bg-slate-200 text-slate-900 py-2 rounded font-medium hover:bg-slate-300 transition"
        >
          Close
        </button>
      </div>
    </form>
  )
}
