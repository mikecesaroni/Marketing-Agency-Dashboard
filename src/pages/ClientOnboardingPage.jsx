import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import DriveFolderStep from '../components/DriveFolderStep'
import { Button, Input, Select, Textarea } from '../components/ui'
import {
  RADIUS_CHIPS,
  emptyAnswers,
  mergeAnswers,
  missingOnStep,
  prefillAccount,
  progress,
  splitAnswers,
  stepsFor,
} from '../lib/clientForm'

// The client-facing onboarding form. No login: the token in the URL is the
// credential, and it only ever reaches the `onboarding_link_*` functions,
// which resolve it to exactly one client.
//
// One form, seven short steps, and the GoHighLevel account details are the
// last of them rather than a second form on a second link: every client is
// on GHL now. Each Continue saves that step, so nothing is lost if they stop.
// Older links still carry ?form=intake or ?form=ghl and get that half only.

const AGENCY = 'The Working Class Marketing'

function fieldId(key) {
  return `q-${key}`
}

/** One question. Big inputs, a line of help, red only when it is missing. */
function Question({ field, value, onChange, invalid }) {
  const id = fieldId(field.key)
  const areaRef = useRef(null)
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 480) + 'px'
  }, [value])

  let control
  if (field.type === 'textarea') {
    control = (
      <Textarea
        ref={areaRef}
        id={id}
        name={field.key}
        size="lg"
        rows={2}
        value={value ?? ''}
        onChange={(e) => onChange(field.key, e.target.value)}
        placeholder={field.placeholder}
        invalid={invalid}
      />
    )
  } else if (field.type === 'select') {
    control = (
      <Select id={id} name={field.key} size="lg" value={value ?? ''} onChange={(e) => onChange(field.key, e.target.value)} invalid={invalid}>
        <option value="">Choose…</option>
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    )
  } else if (field.type === 'radius') {
    control = (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {RADIUS_CHIPS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(field.key, String(n))}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                String(value) === String(n)
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500'
              }`}
            >
              {n} miles
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-28">
            <Input
              id={id}
              name={field.key}
              size="lg"
              type="number"
              inputMode="numeric"
              min={1}
              max={300}
              value={value ?? ''}
              onChange={(e) => onChange(field.key, e.target.value)}
              placeholder="miles"
              invalid={invalid}
            />
          </div>
          <span className="text-sm text-slate-500">miles, or type your own</span>
        </div>
      </div>
    )
  } else {
    control = (
      <Input
        id={id}
        name={field.key}
        size="lg"
        type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text'}
        inputMode={field.type === 'number' ? 'decimal' : field.type === 'tel' ? 'tel' : undefined}
        value={value ?? ''}
        onChange={(e) => onChange(field.key, e.target.value)}
        placeholder={field.placeholder}
        invalid={invalid}
      />
    )
  }

  return (
    <div className={`space-y-1.5 ${field.half ? '' : 'sm:col-span-2'}`}>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-900">
        {field.label}
        {field.required ? <span className="text-orange-600"> *</span> : <span className="ml-1.5 text-xs font-normal text-slate-400">optional</span>}
      </label>
      {field.help && <p className="text-xs text-slate-500">{field.help}</p>}
      {control}
      {invalid && <p className="text-xs text-red-600">Needed before you continue.</p>}
    </div>
  )
}

function Stepper({ steps, index, onJump, done }) {
  return (
    <ol className="flex flex-wrap gap-1.5">
      {steps.map((s, i) => {
        const state = i < index || done.has(s.key) ? 'done' : i === index ? 'now' : 'todo'
        return (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => onJump(i)}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                state === 'now'
                  ? 'bg-slate-900 text-white'
                  : state === 'done'
                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    : 'bg-white/70 text-slate-500 hover:bg-white'
              }`}
            >
              <span className={`grid h-4 w-4 place-items-center rounded-full text-[10px] ${state === 'now' ? 'bg-white/20' : state === 'done' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {state === 'done' ? '✓' : i + 1}
              </span>
              <span className="hidden sm:inline">{s.title}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

export default function ClientOnboardingPage() {
  const { token } = useParams()
  const [params] = useSearchParams()
  const only = params.get('form') || ''
  const steps = useMemo(() => stepsFor(only), [only])

  const [index, setIndex] = useState(0)
  const [clientName, setClientName] = useState('')
  const [answers, setAnswers] = useState(emptyAnswers)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [done, setDone] = useState(false)
  const [submittedBefore, setSubmittedBefore] = useState(false)
  const [savedSteps, setSavedSteps] = useState(() => new Set())
  const [missing, setMissing] = useState([])
  const [driveConnected, setDriveConnected] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error: rpcError } = await supabase.rpc('onboarding_link_load', { p_token: token })
      if (cancelled) return
      if (rpcError || !data) {
        setError('This link is not valid. It may have been replaced with a newer one. Please ask us for a fresh link.')
        setLoading(false)
        return
      }
      setClientName(data.client_name || '')
      setAnswers((prev) => mergeAnswers(prev, data.intake, data.ghl))
      setDriveConnected(Boolean(data.drive_connected))
      setSubmittedBefore(Boolean(data.intake_submitted_at && (only === 'intake' || data.ghl_submitted_at)))
      // A returning visitor who already sent the business half lands on the
      // account step rather than at the top.
      if (!only && data.intake_submitted_at && !data.ghl_submitted_at) {
        const at = stepsFor('').findIndex((s) => s.key === 'account')
        if (at >= 0) setIndex(at)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [token, only])

  const step = steps[index]
  const isLast = index === steps.length - 1
  const prog = progress(answers, steps)

  const change = (key, value) => {
    setAnswers((prev) => ({ ...prev, [key]: value }))
    if (missing.includes(key)) setMissing((prev) => prev.filter((k) => k !== key))
  }

  /** Save what this step owns. `submit` marks the whole form sent. */
  const saveStep = async (current, submit) => {
    const { intake, ghl } = splitAnswers(prefillAccount(answers))
    const tables = new Set(current.fields.map((f) => f.table))
    const wantsIntake = tables.has('intake') || (submit && steps.some((s) => s.fields.some((f) => f.table === 'intake')))
    const wantsGhl = tables.has('ghl') || (submit && steps.some((s) => s.fields.some((f) => f.table === 'ghl')))
    if (wantsIntake) {
      const { error: e } = await supabase.rpc('onboarding_link_save_intake', { p_token: token, p_data: intake, p_submit: submit })
      if (e) throw e
    }
    if (wantsGhl) {
      const { error: e } = await supabase.rpc('onboarding_link_save_ghl', { p_token: token, p_data: ghl, p_submit: submit })
      if (e) throw e
    }
  }

  const go = async (toIndex, { submit = false, force = false } = {}) => {
    setError('')
    setNotice('')
    // Moving forward, or sending in: the step's must-haves have to be in.
    if (!force && (toIndex > index || submit)) {
      const gaps = missingOnStep(step, answers)
      if (gaps.length > 0) {
        setMissing(gaps)
        document.getElementById(fieldId(gaps[0]))?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
    }
    setSaving(true)
    try {
      await saveStep(step, submit)
      setSavedSteps((prev) => new Set([...prev, step.key]))
      if (submit) {
        setDone(true)
      } else {
        // Carry the business answers into the account step the first time
        // it is opened, so the EIN is about the only thing left to type.
        const next = steps[toIndex]
        if (next?.key === 'account') setAnswers((prev) => prefillAccount(prev))
        setIndex(toIndex)
        setMissing([])
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err.message || 'Something went wrong saving your answers.')
    } finally {
      setSaving(false)
    }
  }

  const saveForLater = async () => {
    setError('')
    setSaving(true)
    try {
      await saveStep(step, false)
      setSavedSteps((prev) => new Set([...prev, step.key]))
      setNotice('Saved. You can close this and come back to the same link later.')
    } catch (err) {
      setError(err.message || 'Something went wrong saving your answers.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-slate-100 text-slate-500">Loading…</div>
  }

  if (error && !clientName) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 p-6">
        <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="grid min-h-screen place-items-center bg-gradient-to-b from-slate-950 to-slate-800 p-6">
        <div className="max-w-md space-y-4 rounded-3xl bg-white p-8 text-center shadow-2xl">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div>
          <h1 className="text-2xl font-bold text-slate-900">Thank you{clientName ? `, ${clientName}` : ''}.</h1>
          <p className="text-sm text-slate-600">
            We have what we need to build your ads and set up your account. If anything is missing we
            will come back to you directly rather than sending this form again.
          </p>
          <p className="text-xs text-slate-400">You can reopen this link any time to change an answer.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-100 px-4 pb-16 pt-6 md:pt-10">
      <div className="mx-auto max-w-2xl">
        {/* HEADER: who, what, how long. */}
        <header className="mb-5 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-300">{AGENCY}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
            {clientName ? `Welcome, ${clientName}.` : 'Welcome.'}
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            {only === 'ghl'
              ? 'A few details off your business registration, and your account is on its way.'
              : 'About ten minutes. Everything here goes into your ads and your account, so short and specific beats long and vague. It saves as you go.'}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-300 transition-all" style={{ width: `${Math.round((prog.required / Math.max(1, prog.requiredTotal)) * 100)}%` }} />
            </div>
            <span className="text-[11px] text-slate-300">
              {prog.required} of {prog.requiredTotal} must-haves
            </span>
          </div>
          <div className="mt-3">
            <Stepper steps={steps} index={index} onJump={(i) => (i < index ? go(i, { force: true }) : i === index ? null : go(i))} done={savedSteps} />
          </div>
        </header>

        {submittedBefore && (
          <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
            You have already sent this in. Change anything you like and submit again; we see the update.
          </div>
        )}
        {notice && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">{notice}</div>}
        {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}

        {/* THE STEP. */}
        <section className="rounded-3xl bg-white p-5 shadow-2xl shadow-slate-900/20 md:p-7" key={step.key}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Step {index + 1} of {steps.length}
          </p>
          <h2 className="mt-0.5 text-xl font-bold text-slate-900 md:text-2xl">{step.title}</h2>
          <p className="mt-1 text-sm text-slate-500">{step.blurb}</p>

          {step.drive ? (
            <div className="mt-5">
              <DriveFolderStep token={token} connected={driveConnected} />
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {step.fields.map((f) => (
                <Question key={f.key} field={f} value={answers[f.key]} onChange={change} invalid={missing.includes(f.key)} />
              ))}
            </div>
          )}

          {missing.length > 0 && (
            <p className="mt-4 rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-800">
              {missing.length === 1 ? 'One thing' : `${missing.length} things`} still needed on this step, marked in red.
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            {index > 0 && (
              <Button variant="outline" size="lg" onClick={() => go(index - 1, { force: true })} disabled={saving}>
                ← Back
              </Button>
            )}
            <Button variant="ghost" size="lg" onClick={saveForLater} disabled={saving} className="text-slate-500">
              {saving ? 'Saving…' : 'Save for later'}
            </Button>
            <Button
              variant="dark"
              size="lg"
              onClick={() => (isLast ? go(index, { submit: true, force: false }) : go(index + 1))}
              disabled={saving}
              className="ml-auto min-w-[10rem] bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-700 hover:to-amber-600"
            >
              {saving ? 'Saving…' : isLast ? 'Send it in' : 'Continue →'}
            </Button>
          </div>
        </section>

        <p className="mt-4 text-center text-[11px] text-slate-500">
          Questions? Reply to the message this link came in, or call us. Nothing here is shared outside {AGENCY}.
        </p>
      </div>
    </div>
  )
}
