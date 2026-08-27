import { useEffect, useState } from 'react'
import {
  DEFAULT_FORM_QUESTIONS,
  FORM_QUESTIONS,
  createLeadForm,
  listLeadForms,
} from '../lib/metaPublish'

/**
 * Picks an existing instant form, or builds a new one on the client's Page.
 *
 * Reuse is the default and is offered first: a form owns its leads, so five
 * near-identical forms means five places to go looking for them.
 */
export default function LeadFormPicker({ client, value, onChange }) {
  const [forms, setForms] = useState(null)
  const [error, setError] = useState('')
  const [building, setBuilding] = useState(false)
  const [creating, setCreating] = useState(false)

  const [formName, setFormName] = useState(`${client.name} — enquiries`)
  const [picked, setPicked] = useState(DEFAULT_FORM_QUESTIONS)
  const [customQuestion, setCustomQuestion] = useState('')
  const [privacyUrl, setPrivacyUrl] = useState(client.privacy_policy_url || '')
  const [thankYou, setThankYou] = useState(
    'Thanks — we have your details and will call you shortly.'
  )

  const load = () =>
    listLeadForms(client.id)
      .then((found) => {
        setForms(found)
        setError('')
      })
      .catch((err) => {
        setError(err.message)
        setForms([])
      })

  useEffect(() => {
    load()
  }, [client.id])

  const toggle = (type) =>
    setPicked((cur) => (cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type]))

  const build = async () => {
    setCreating(true)
    setError('')
    try {
      const questions = [
        ...picked.map((type) => ({ type })),
        ...(customQuestion.trim() ? [{ type: 'CUSTOM', label: customQuestion.trim() }] : []),
      ]
      const made = await createLeadForm({
        clientId: client.id,
        formName: formName.trim(),
        questions,
        privacyPolicyUrl: privacyUrl.trim() || undefined,
        thankYouMessage: thankYou.trim() || undefined,
      })
      onChange({ id: made.form_id, name: formName.trim() })
      setBuilding(false)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  if (forms === null) return <p className="text-xs text-slate-500">Loading forms from the Page…</p>

  return (
    <div className="space-y-2">
      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {error}
        </div>
      )}

      {!building ? (
        <>
          {forms.length > 0 ? (
            <select
              value={value?.id || ''}
              onChange={(e) => {
                const found = forms.find((f) => f.id === e.target.value)
                onChange(found ? { id: found.id, name: found.name } : null)
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
            >
              <option value="">Pick a form…</option>
              {forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {typeof f.leads_count === 'number' ? ` — ${f.leads_count} leads` : ''}
                  {f.status && f.status !== 'ACTIVE' ? ` (${f.status})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-slate-500">
              No instant forms on this Page yet. Build the first one below.
            </p>
          )}

          <button
            onClick={() => setBuilding(true)}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            + Build a new form
          </button>
        </>
      ) : (
        <div className="p-3 border border-slate-300 rounded-lg space-y-3 bg-slate-50">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Form name</label>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
            />
            <p className="text-[11px] text-slate-400 mt-0.5">
              Internal only — nobody filling it in sees this.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">What to ask</label>
            <div className="flex flex-wrap gap-1.5">
              {FORM_QUESTIONS.map((q) => (
                <button
                  key={q.type}
                  onClick={() => toggle(q.type)}
                  className={`px-2.5 py-1 rounded text-xs font-medium border transition ${
                    picked.includes(q.type)
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              All of these are prefilled from the person&rsquo;s Facebook profile, which is why
              instant forms convert — most people submit without typing anything.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              One custom question <span className="font-normal text-slate-400">optional</span>
            </label>
            <input
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
              placeholder="What do you need help with?"
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
            />
            <p className="text-[11px] text-slate-400 mt-0.5">
              This one is not prefilled, so it costs completions. Worth it only if the answer
              changes how you follow up.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Privacy policy URL
            </label>
            <input
              value={privacyUrl}
              onChange={(e) => setPrivacyUrl(e.target.value)}
              placeholder="https://example.com/privacy"
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
            />
            <p className="text-[11px] text-slate-400 mt-0.5">
              Meta requires one and rejects the form without it.
              {client.privacy_policy_url ? ' Prefilled from the client.' : ' Not set on the client yet.'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Thank-you message</label>
            <input
              value={thankYou}
              onChange={(e) => setThankYou(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={build}
              disabled={creating || picked.length === 0 || !privacyUrl.trim()}
              className="px-3 py-1.5 bg-slate-900 text-white rounded text-xs font-medium hover:bg-slate-800 disabled:opacity-50 transition"
            >
              {creating ? 'Building on the Page…' : 'Create form'}
            </button>
            <button
              onClick={() => setBuilding(false)}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Cancel
            </button>
            {picked.length === 0 && (
              <span className="text-[11px] text-slate-400">Pick at least one field.</span>
            )}
          </div>
        </div>
      )}

      {value && !building && (
        <p className="text-[11px] text-green-700">
          Leads from this ad go to &ldquo;{value.name}&rdquo;.
        </p>
      )}
    </div>
  )
}
