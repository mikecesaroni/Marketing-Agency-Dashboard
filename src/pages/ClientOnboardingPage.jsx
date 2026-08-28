import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import GhlSetupFields from '../components/GhlSetupFields'
import {
  CLIENT_INTAKE_SECTIONS,
  CLIENT_INTAKE_KEYS,
  INTAKE_FIELD_TYPES,
  STATUS_OPTIONS,
} from '../lib/intakeSummary'
import { emptyGhlSetup, mergeGhlSetup, missingRequired, GHL_SETUP_KEYS } from '../lib/ghlSetupFields'

// The client-facing onboarding page. No login: the token in the URL is the
// credential, and it only ever reaches the three `onboarding_link_*` functions,
// which resolve it to exactly one client.
//
// This is the thing that replaces reading the intake questions down a phone
// call. Two steps, because Ethan asked for two forms: the general onboarding
// questions, then the GoHighLevel setup details.

function emptyIntake() {
  return Object.fromEntries(
    CLIENT_INTAKE_KEYS.map((key) => [key, INTAKE_FIELD_TYPES[key] === 'checkbox' ? false : ''])
  )
}

function IntakeFields({ data, onChange }) {
  const autoExpand = (e) => {
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 500) + 'px'
  }

  return (
    <>
      {CLIENT_INTAKE_SECTIONS.map((section) => (
        <div key={section.title} className="border-b pb-4">
          <h3 className="font-bold text-slate-900 mb-3">{section.title}</h3>
          <div className="space-y-2">
            {section.fields.map(([key, label]) => {
              const type = INTAKE_FIELD_TYPES[key] || 'text'
              const id = `intake-${key}`

              if (type === 'checkbox') {
                return (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      id={id}
                      type="checkbox"
                      name={key}
                      checked={Boolean(data[key])}
                      onChange={onChange}
                    />
                    <span className="font-medium text-slate-700">{label}</span>
                  </label>
                )
              }

              return (
                <div key={key}>
                  <label className="text-xs font-medium text-slate-600 block mb-1" htmlFor={id}>
                    {label}
                  </label>
                  {type === 'textarea' ? (
                    <textarea
                      id={id}
                      name={key}
                      rows="2"
                      value={data[key] ?? ''}
                      onChange={onChange}
                      onInput={autoExpand}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  ) : type === 'status' ? (
                    <select
                      id={id}
                      name={key}
                      value={data[key] ?? ''}
                      onChange={onChange}
                      className="w-full px-2 py-1 border rounded text-sm"
                    >
                      <option value="">Select...</option>
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={id}
                      type={type === 'number' ? 'number' : type === 'email' ? 'email' : 'text'}
                      name={key}
                      value={data[key] ?? ''}
                      onChange={onChange}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )
}

export default function ClientOnboardingPage() {
  const { token } = useParams()

  const [step, setStep] = useState(1)
  const [clientName, setClientName] = useState('')
  const [intake, setIntake] = useState(emptyIntake)
  const [ghl, setGhl] = useState(emptyGhlSetup)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const { data, error: rpcError } = await supabase.rpc('onboarding_link_load', { p_token: token })

      if (cancelled) return

      if (rpcError || !data) {
        setError(
          'This link is not valid. It may have been replaced with a newer one. Please ask us for a fresh link.'
        )
        setLoading(false)
        return
      }

      setClientName(data.client_name || '')
      if (data.intake) {
        setIntake((prev) => {
          const merged = { ...prev }
          for (const key of CLIENT_INTAKE_KEYS) {
            if (data.intake[key] !== null && data.intake[key] !== undefined) merged[key] = data.intake[key]
          }
          return merged
        })
      }
      if (data.ghl) setGhl((prev) => mergeGhlSetup(prev, data.ghl))
      if (data.intake_submitted_at) setStep(2)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [token])

  const changeIntake = (e) => {
    const { name, type, value, checked } = e.target
    setIntake((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const changeGhl = (e) => {
    const { name, value } = e.target
    setGhl((prev) => ({ ...prev, [name]: value }))
  }

  const blanksToNull = (data, keys) => {
    const clean = {}
    for (const key of keys) {
      const value = data[key]
      clean[key] = typeof value === 'string' && value.trim() === '' ? null : value
    }
    return clean
  }

  const save = async (submit) => {
    setError('')
    setNotice('')
    setSaving(true)

    try {
      if (step === 1) {
        const { error: rpcError } = await supabase.rpc('onboarding_link_save_intake', {
          p_token: token,
          p_data: blanksToNull(intake, CLIENT_INTAKE_KEYS),
          p_submit: submit,
        })
        if (rpcError) throw rpcError
        if (submit) setStep(2)
        else setNotice('Saved. You can close this and come back to it later.')
      } else {
        const { error: rpcError } = await supabase.rpc('onboarding_link_save_ghl', {
          p_token: token,
          p_data: blanksToNull(ghl, GHL_SETUP_KEYS),
          p_submit: submit,
        })
        if (rpcError) throw rpcError
        if (submit) setDone(true)
        else setNotice('Saved. You can close this and come back to it later.')
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err.message || 'Something went wrong saving your answers.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-slate-500">Loading...</div>
  }

  if (error && !clientName) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="max-w-md p-4 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-2xl font-bold text-slate-900">Thank you.</h1>
          <p className="text-slate-600 text-sm">
            We have everything we need to start setting up your account. If anything is missing we
            will come back to you directly rather than sending this form again.
          </p>
        </div>
      </div>
    )
  }

  const missing = missingRequired(ghl)

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm p-6 space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Step {step} of 2
            {step === 1 ? ' - About your business' : ' - Account setup details'}
          </p>
          <h1 className="text-2xl font-bold text-slate-900">
            {clientName ? `${clientName} onboarding` : 'Onboarding'}
          </h1>
          <p className="text-sm text-slate-600">
            {step === 1
              ? 'These are the questions we would normally ask on a call. Take your time, and save as you go. A short, specific answer beats a long vague one.'
              : 'These are the details we need to build your account and register you for text messaging. Most of it is off your business registration.'}
          </p>
        </header>

        {notice && (
          <div className="p-3 bg-green-50 border border-green-200 rounded text-green-800 text-sm">
            {notice}
          </div>
        )}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>
        )}

        <div className="space-y-6">
          {step === 1 ? (
            <IntakeFields data={intake} onChange={changeIntake} />
          ) : (
            <>
              {missing.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs">
                  Fields marked <span className="text-red-500">*</span> are needed before we can
                  register you for text messaging. You can save and come back if you need to look
                  something up.
                </div>
              )}
              <GhlSetupFields data={ghl} onChange={changeGhl} />
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <button
            type="button"
            onClick={() => save(false)}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-slate-200 text-slate-900 text-sm font-medium hover:bg-slate-300 disabled:opacity-50 transition"
          >
            {saving ? 'Saving...' : 'Save for later'}
          </button>

          {step === 2 && (
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 transition"
            >
              Back
            </button>
          )}

          <button
            type="button"
            onClick={() => save(true)}
            disabled={saving}
            className="flex-1 min-w-[10rem] px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {saving ? 'Saving...' : step === 1 ? 'Continue to account setup' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}
