import { useEffect, useState } from 'react'
import Button from './ui/Button'
import { copyText } from '../lib/intakeSummary'
import {
  FORM_QUESTIONS,
  createLeadForm,
  listLeadForms,
  recommendFormQuestions,
} from '../lib/metaPublish'

/**
 * Builds a Meta instant form on the client's Page, on its own.
 *
 * WHY THIS EXISTS SEPARATELY FROM LeadFormPicker. The picker builds a form
 * mid-publish, as a convenience when you notice there isn't one. But a form
 * has to exist BEFORE the ad in practice: creating it is step one, and step
 * two is a workflow in GoHighLevel that connects to it by id, which is
 * somebody switching tabs and pasting. Making that wait on a finished ad meant
 * either publishing an ad you weren't ready to publish, or building the form
 * in Meta's own interface and losing everything the CRM knows about the
 * client.
 *
 * So the form id is the deliverable here, not the form. It is shown big, with
 * a copy button, the moment the form exists.
 */

// Meta's own field names read like a database. These are what a person calls
// them, and the note says which ones cost nothing to ask.
const PREFILLED = new Set(FORM_QUESTIONS.map((q) => q.type))

function QuestionRow({ q, on, toggle, why }) {
  const custom = q.type === 'CUSTOM'
  return (
    <label
      className={`flex items-start gap-2 rounded-lg border p-2 text-xs transition ${
        on ? 'border-orange-300 bg-orange-50' : 'border-slate-200 bg-white'
      }`}
    >
      <input type="checkbox" checked={on} onChange={toggle} className="mt-0.5 flex-shrink-0" />
      <span className="min-w-0">
        <span className="font-medium text-slate-900">{q.label}</span>
        {!custom && PREFILLED.has(q.type) && (
          // The single most useful thing to know while choosing: a prefilled
          // answer barely dents completion, a typed one does.
          <span className="ml-1.5 text-[10px] text-green-700">prefilled — nearly free</span>
        )}
        {custom && <span className="ml-1.5 text-[10px] text-amber-700">typed — costs completions</span>}
        {why && <span className="mt-0.5 block text-slate-500">{why}</span>}
      </span>
    </label>
  )
}

export default function LeadFormStudio({ client }) {
  const [forms, setForms] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [copied, setCopied] = useState('')

  const [formName, setFormName] = useState(`${client.name} — enquiries`)
  // Standard fields ticked, by type. Custom questions are their own list
  // because each carries a label the standard ones do not.
  const [picked, setPicked] = useState(['FULL_NAME', 'PHONE', 'EMAIL', 'ZIP'])
  const [customs, setCustoms] = useState([])
  const [newCustom, setNewCustom] = useState('')
  const [privacyUrl, setPrivacyUrl] = useState(client.privacy_policy_url || '')
  const [thankYou, setThankYou] = useState(
    'Thanks — we have your details and will call you shortly.'
  )
  const [why, setWhy] = useState({})
  const [note, setNote] = useState('')
  const [made, setMade] = useState(null)

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

  const copy = async (key, text) => {
    const ok = await copyText(text)
    setCopied(ok ? key : '')
    setTimeout(() => setCopied(''), 2000)
  }

  /**
   * Asks Claude what to put on the form.
   *
   * It reads the onboarding answers and the latest chat itself, server-side,
   * so this only sends a client id. The reply is applied straight into the
   * ticks and boxes rather than offered as a suggestion to accept: everything
   * it sets is visible and editable right here, and a form nobody adjusts is
   * the normal case.
   */
  const recommend = async () => {
    setBusy('recommend')
    setError('')
    try {
      const out = await recommendFormQuestions(client.id)
      const standard = out.questions.filter((q) => q.type !== 'CUSTOM')
      const typed = out.questions.filter((q) => q.type === 'CUSTOM')

      setPicked(standard.map((q) => q.type))
      setCustoms(typed.map((q) => ({ label: q.label, why: q.why })))
      setWhy(Object.fromEntries(out.questions.map((q) => [q.type === 'CUSTOM' ? q.label : q.type, q.why])))
      if (out.formName) setFormName(out.formName)
      if (out.thankYou) setThankYou(out.thankYou)
      setNote(
        out.usedChat
          ? out.note
          : `${out.note} (No chat for ${client.name} yet, so this is from the onboarding form only.)`
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const toggle = (type) =>
    setPicked((cur) => (cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type]))

  const build = async () => {
    setBusy('build')
    setError('')
    try {
      const questions = [
        ...picked.map((type) => ({ type })),
        ...customs.map((c) => ({ type: 'CUSTOM', label: c.label })),
      ]
      const out = await createLeadForm({
        clientId: client.id,
        formName: formName.trim(),
        questions,
        privacyPolicyUrl: privacyUrl.trim() || undefined,
        thankYouMessage: thankYou.trim() || undefined,
      })
      setMade({ id: out.form_id, name: formName.trim() })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const total = picked.length + customs.length

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">Instant form</p>
        <p className="mt-0.5 text-xs text-slate-600">
          Built on {client.name}&rsquo;s Facebook Page, without publishing anything. Make it here
          first, wire the GoHighLevel workflow to the id, then attach it to an ad when you are
          ready.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* SAID UP FRONT, because Meta refuses every form without one and no
          client here has one on file. Learning that after choosing the
          questions and pressing Create is the version of this that wastes a
          minute every time. */}
      {!client.privacy_policy_url && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
          Meta will not accept a form without a privacy policy URL, and{' '}
          {client.name} has none saved. Put one in the box below — it is kept
          with the form, not with the client, unless you add it to their Meta card.
        </div>
      )}

      {/* THE DELIVERABLE. A new form's id is what GHL needs, and hunting for it
          in Meta's interface afterwards is the step this whole panel exists to
          remove. */}
      {made && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-xs font-semibold text-green-900">
            &ldquo;{made.name}&rdquo; is live on the Page.
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <code className="rounded border border-green-300 bg-white px-2 py-1 font-mono text-sm text-slate-900">
              {made.id}
            </code>
            <Button size="sm" variant="outline" onClick={() => copy('made', made.id)}>
              {copied === 'made' ? 'Copied' : 'Copy form ID'}
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-green-800">
            Paste that into the GoHighLevel workflow trigger so leads land in the pipeline. Leads
            submitted before the workflow exists are still in Meta and can be exported.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-700">What it asks</p>
          <Button size="sm" variant="outline" disabled={busy === 'recommend'} onClick={recommend}>
            {busy === 'recommend' ? 'Reading the chat and intake…' : '✨ Recommend the questions'}
          </Button>
        </div>

        {note && <p className="text-[11px] text-slate-600">{note}</p>}

        <div className="grid gap-1.5 sm:grid-cols-2">
          {FORM_QUESTIONS.map((q) => (
            <QuestionRow
              key={q.type}
              q={q}
              on={picked.includes(q.type)}
              toggle={() => toggle(q.type)}
              why={why[q.type]}
            />
          ))}
        </div>

        {customs.length > 0 && (
          <div className="space-y-1.5">
            {customs.map((c, i) => (
              <QuestionRow
                key={`${c.label}-${i}`}
                q={{ type: 'CUSTOM', label: c.label }}
                on
                toggle={() => setCustoms((cur) => cur.filter((_, j) => j !== i))}
                why={c.why}
              />
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={newCustom}
            onChange={(e) => setNewCustom(e.target.value)}
            placeholder="Ask something in their words — e.g. What is the unit doing?"
            className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!newCustom.trim()}
            onClick={() => {
              setCustoms((cur) => [...cur, { label: newCustom.trim(), why: '' }])
              setNewCustom('')
            }}
          >
            Add
          </Button>
        </div>

        <input
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          placeholder="Form name — what you will see in Meta"
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
        />
        <textarea
          value={thankYou}
          onChange={(e) => setThankYou(e.target.value)}
          rows={2}
          placeholder="What they read after submitting"
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
        />
        <input
          value={privacyUrl}
          onChange={(e) => setPrivacyUrl(e.target.value)}
          placeholder="Privacy policy URL — Meta requires one on every form"
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy === 'build' || total === 0 || !formName.trim()} onClick={build}>
            {busy === 'build' ? 'Building it on the Page…' : 'Create the form'}
          </Button>
          <span className="text-[11px] text-slate-500">
            {total} question{total === 1 ? '' : 's'}
            {customs.length > 0 && ` · ${customs.length} typed`}
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <p className="mb-1.5 text-xs font-semibold text-slate-700">
          Forms already on the Page
          {/* leads_count is why reuse beats making another one: a form owns its
              leads, so five near-identical forms is five places to look. */}
        </p>
        {forms === null ? (
          <p className="text-xs text-slate-500">Reading the Page…</p>
        ) : forms.length === 0 ? (
          <p className="text-xs text-slate-500">None yet.</p>
        ) : (
          <ul className="space-y-1">
            {forms.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-slate-900">{f.name}</span>
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
                  {f.id}
                </code>
                <button
                  type="button"
                  onClick={() => copy(f.id, f.id)}
                  className="text-slate-500 underline hover:text-slate-800"
                >
                  {copied === f.id ? 'Copied' : 'Copy ID'}
                </button>
                <span className="text-slate-500">
                  {Number(f.leads_count) || 0} lead{Number(f.leads_count) === 1 ? '' : 's'}
                </span>
                {f.status && f.status !== 'ACTIVE' && (
                  <span className="text-amber-700">{f.status}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
