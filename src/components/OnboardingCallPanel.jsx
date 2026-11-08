// The live onboarding call, worked as a sheet on the client page.
//
// Sits under the client forms because it is the same moment in a client's
// life: the forms are what the client sends back, this is what happens on the
// Zoom where the agency gets every access live. The steps, their one-line
// how-tos and which ones tick themselves are all in src/lib/onboardingCall.js;
// this file only draws them and stores the ticks a person makes.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Button, Card } from './ui'
import { copyText } from '../lib/intakeSummary'
import { driveServiceAccount } from '../lib/driveAssets'
import { publicLink } from '../lib/publicSite'
import { MARKED_DONE, markStepDone, undoStepDone, whoAmI } from '../lib/completeStep'
import {
  COPY_BLOCKS,
  callProgress,
  stepState,
  visibleSections,
} from '../lib/onboardingCall'

const COPY_LABELS = {
  preCallEmail: 'Copy pre-call email',
  callOpening: 'Copy opening lines',
  whyAdmin: 'Copy the why',
  recapEmail: 'Copy recap email',
}

export default function OnboardingCallPanel({ client, intake }) {
  const [done, setDone] = useState(new Set())
  const [link, setLink] = useState(null)
  const [ghl, setGhl] = useState(null)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState('')
  const [crmDriveEmail, setCrmDriveEmail] = useState('')
  const [error, setError] = useState('')
  // The 'marked-done' row, when the call was marked done by hand: who and when.
  const [marked, setMarked] = useState(null)
  const [marking, setMarking] = useState(false)

  const load = useCallback(async () => {
    if (!client?.id) return
    const [steps, links, setup] = await Promise.all([
      supabase.from('onboarding_call_steps').select('step_key, done_at, done_by').eq('client_id', client.id),
      supabase
        .from('onboarding_links')
        .select('token, ghl_submitted_at, intake_submitted_at, revoked')
        .eq('client_id', client.id)
        .eq('revoked', false)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase.from('ghl_setup').select('completed_at, authorized_rep_name').eq('client_id', client.id).maybeSingle(),
    ])
    if (steps.error) setError(steps.error.message)
    setDone(new Set((steps.data || []).map((r) => r.step_key)))
    setMarked((steps.data || []).find((r) => r.step_key === MARKED_DONE) || null)
    setLink(links.data?.[0] || null)
    setGhl(setup.data || null)
  }, [client?.id])

  // "Mark the call done": one row on the sheet, so the Client tiers board and
  // the morning brief stop calling the call our next move ("make so I can
  // click if the onboarding call has been done yet"). Undo takes that one
  // row back and leaves the ticks made on the call alone.
  const markCallDone = async () => {
    setMarking(true)
    setError('')
    try {
      await markStepDone(client, { key: 'onboarding-call' }, { by: whoAmI() })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setMarking(false)
    }
  }
  const unmarkCallDone = async () => {
    setMarking(true)
    setError('')
    try {
      await undoStepDone(client, { key: 'onboarding-call' })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setMarking(false)
    }
  }
  // The call counts as done with any tick on the sheet (nextSteps.js reads it
  // the same way), so the button only shows while nothing says it happened.
  const callHappened = [...done].some((k) => k !== MARKED_DONE) || Boolean(marked)

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    // The email still reads without it; the address is the one thing the
    // client could not guess, so it is worth trying and not worth blocking on.
    driveServiceAccount().then(setCrmDriveEmail).catch(() => setCrmDriveEmail(''))
  }, [])

  const ctx = useMemo(
    () => ({
      client,
      intake,
      link,
      ghl,
      onboardingUrl: link?.token ? publicLink(`/onboarding/${link.token}`) : '',
      driveUrl: client?.drive_folder_id ? `https://drive.google.com/drive/folders/${client.drive_folder_id}` : '',
      crmDriveEmail,
    }),
    [client, intake, link, ghl, crmDriveEmail]
  )

  // The pre-call email is the first thing that goes to a new client, so this
  // is usually the moment the onboarding link comes into existence. Without
  // this the email said "our onboarding form" and carried no link.
  const ensureLink = async () => {
    if (link?.token) return link
    const { data, error: err } = await supabase
      .from('onboarding_links')
      .insert({ client_id: client.id })
      .select('token, ghl_submitted_at, intake_submitted_at, revoked')
      .single()
    if (err) throw err
    setLink(data)
    return data
  }

  const sections = useMemo(() => visibleSections(ctx), [ctx])
  const progress = useMemo(() => callProgress(ctx, done), [ctx, done])

  const toggle = async (step) => {
    const state = stepState(step, ctx, done)
    if (state === 'auto') return
    setError('')
    if (state === 'done') {
      const next = new Set(done)
      next.delete(step.key)
      setDone(next)
      const { error: err } = await supabase
        .from('onboarding_call_steps')
        .delete()
        .eq('client_id', client.id)
        .eq('step_key', step.key)
      if (err) {
        setError(err.message)
        load()
      }
      return
    }
    setDone(new Set([...done, step.key]))
    const { error: err } = await supabase
      .from('onboarding_call_steps')
      .upsert({ client_id: client.id, step_key: step.key }, { onConflict: 'client_id,step_key' })
    if (err) {
      setError(err.message)
      load()
    }
  }

  const copy = async (step) => {
    const fn = COPY_BLOCKS[step.copy]
    if (!fn) return
    let c = ctx
    if (step.copy === 'preCallEmail') {
      try {
        const l = await ensureLink()
        c = { ...ctx, link: l, onboardingUrl: publicLink(`/onboarding/${l.token}`) }
      } catch (err) {
        setError(`Could not make the onboarding link: ${err.message}`)
        return
      }
    }
    const text = step.copy === 'recapEmail' ? fn(c, done) : fn(c)
    await copyText(text)
    setCopied(step.key)
    setTimeout(() => setCopied(''), 1500)
  }

  const complete = progress.total > 0 && progress.done === progress.total

  return (
    <Card padding="none" className="mb-6 p-4 md:mb-8 md:p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Live onboarding call</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            One Zoom, their screen, every access done together. Work it top to bottom; the greyed ticks
            are things the CRM can already see.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Whether the call happened, in one click. The board and the
              morning brief read the same row, so once this is ticked the
              line stops saying "do the onboarding call". */}
          {marked ? (
            <span className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-800" data-call-done="marked">
              ✓ Call done{marked.done_by ? ` · ${marked.done_by}` : ''}{marked.done_at ? ` · ${new Date(marked.done_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
              <button type="button" onClick={unmarkCallDone} disabled={marking} className="text-green-700 underline-offset-2 hover:underline disabled:opacity-50" title="Take the mark back; the ticks made on the call stay">
                Undo
              </button>
            </span>
          ) : callHappened ? (
            <span className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-800" data-call-done="sheet" title="Steps were ticked on the call, so the board and the brief count it done">
              ✓ Call done
            </span>
          ) : (
            <Button variant="outline" size="sm" onClick={markCallDone} disabled={marking} data-mark-call-done title="The call happened: tell the Client tiers board and the morning brief, so it stops being our next move">
              {marking ? 'Saving…' : '✓ Mark the call done'}
            </Button>
          )}
          <div className="w-32 h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className={`h-full transition-all ${complete ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${progress.pct}%` }}
            />
          </div>
          <span className="text-sm font-semibold text-slate-600 tabular-nums">
            {progress.done}/{progress.total}
          </span>
          <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide' : complete ? 'Show' : 'Open sheet'}
          </Button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}

      {open && (
        <div className="mt-4 space-y-5">
          {sections.map((section) => (
            <div key={section.key}>
              <div className="flex items-baseline gap-2 mb-1.5">
                <h3 className="text-sm font-semibold text-slate-900">{section.title}</h3>
                <p className="text-xs text-slate-500">{section.intro}</p>
              </div>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {section.steps.map((step) => {
                  const state = stepState(step, ctx, done)
                  const ticked = state !== 'open'
                  return (
                    <li key={step.key} className="flex gap-3 p-3">
                      <button
                        onClick={() => toggle(step)}
                        disabled={state === 'auto'}
                        title={
                          state === 'auto'
                            ? 'The CRM can see this is done'
                            : ticked
                              ? 'Un-tick'
                              : 'Tick when done on the call'
                        }
                        aria-pressed={ticked}
                        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border text-[11px] font-bold transition ${
                          state === 'auto'
                            ? 'border-slate-300 bg-slate-200 text-slate-500 cursor-default'
                            : ticked
                              ? 'border-green-600 bg-green-600 text-white'
                              : 'border-slate-300 bg-white hover:border-slate-500'
                        }`}
                      >
                        {ticked ? '✓' : ''}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium ${ticked ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-900'}`}>
                          {step.title}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-600 leading-snug">{step.how}</p>
                        {step.copy && (
                          <button
                            onClick={() => copy(step)}
                            className="mt-1.5 text-xs font-medium text-blue-600 hover:text-blue-800"
                          >
                            {copied === step.key ? 'Copied' : COPY_LABELS[step.copy]}
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
