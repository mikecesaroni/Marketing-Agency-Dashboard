import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Panel } from '../components/reports/kit'
import { signupPlan } from '../lib/clientSignup'
import { loadSignup } from '../lib/clientSignupStore'

/**
 * A new client's signup, from the private token in the link the agency sent
 * them (/join/<token>): the plan they are starting, the payments to make
 * (the setup fee when there is one, and the monthly plan), and then their
 * onboarding form, which opens once the money is in.
 *
 * Nothing here charges anyone. The buttons open Stripe's own checkout in a
 * new tab, stamped with this signup's id; the webhook books the payment and
 * makes the client, and this page finds out by asking again every few
 * seconds while it is open. It reads through client_signup_load and can
 * change nothing in the CRM. docs/client-signup.md.
 */

const AGENCY = 'The Working Class Marketing'
const CHECK_EVERY_MS = 5000

const money = (n) => `$${(Number(n) || 0).toLocaleString('en-US')}`

function Tick({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

/** The button that goes to Stripe (new tab) or to the form (this tab). */
function GoButton({ href, children, newTab = false, ...rest }) {
  return (
    <a
      href={href}
      {...(newTab ? { target: '_blank', rel: 'noreferrer' } : {})}
      className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 text-[15px] font-bold text-white shadow-lg shadow-orange-900/30 transition hover:bg-orange-400 sm:w-auto"
      {...rest}
    >
      {children}
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={newTab ? 'M7 17L17 7M9 7h8v8' : 'M5 12h14M13 6l6 6-6 6'} />
      </svg>
    </a>
  )
}

/**
 * One numbered step. state: done | now | later. A done step folds to its
 * title and a tick; the one to do now is lit; a later one is dimmed.
 */
function Step({ number, state, title, amount, children, ...rest }) {
  const done = state === 'done'
  const later = state === 'later'
  return (
    <Panel as="section" className={`p-5 sm:p-6 ${later ? 'opacity-60' : ''} ${state === 'now' ? 'ring-1 ring-orange-400/40' : ''}`} data-step-state={state} {...rest}>
      <div className="flex items-start gap-4">
        <span
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            done ? 'bg-emerald-400/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/30' : state === 'now' ? 'bg-orange-500 text-white' : 'bg-white/5 text-slate-400 ring-1 ring-inset ring-white/15'
          }`}
        >
          {done ? <Tick /> : number}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
            {amount && <p className="text-lg font-semibold tabular-nums text-white">{amount}</p>}
          </div>
          <div className="mt-2 space-y-4 text-sm leading-relaxed text-slate-300">{children}</div>
        </div>
      </div>
    </Panel>
  )
}

function LinkComing() {
  return (
    <p className="text-slate-400" data-join-nolink>
      Your payment link is on its way. Reply to whoever sent you this page and we will get it to you today.
    </p>
  )
}

export default function ClientJoinPage() {
  const { token } = useParams()
  const [data, setData] = useState(undefined)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  const load = useCallback(async () => {
    try {
      const row = await loadSignup(token)
      setData(row || null)
      setError('')
    } catch (err) {
      setError(err.message)
      // A failed re-check keeps what is on screen; only a first load with
      // nothing to show becomes the "not valid" card.
      setData((had) => (had === undefined ? null : had))
    }
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  const plan = useMemo(() => (data ? signupPlan(data) : null), [data])
  const stage = plan?.stage || ''

  // Stripe opens in another tab, so this one keeps asking until the payment
  // shows: every few seconds while it is the tab in front, and at once when
  // they come back to it. It stops when there is nothing left to wait for.
  useEffect(() => {
    if (!stage || stage === 'done') return undefined
    const tick = () => {
      if (document.visibilityState === 'visible') load()
    }
    const timer = setInterval(tick, CHECK_EVERY_MS)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [stage, load])

  // Dark to the edges on a phone, and the tab named for the business.
  useEffect(() => {
    const was = document.body.style.background
    const title = document.title
    document.body.style.background = '#070b14'
    document.title = plan?.name ? `Get started: ${plan.name}` : 'Get started'
    return () => {
      document.body.style.background = was
      document.title = title
    }
  }, [plan?.name])

  const check = async () => {
    setChecking(true)
    await load()
    setChecking(false)
  }

  if (data === undefined) return <div className="min-h-screen bg-[#070b14] p-6 text-sm text-slate-400">Opening your page…</div>
  if (data === null)
    return (
      <div className="min-h-screen bg-[#070b14] p-6">
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-[#0f1626] p-6 text-sm text-slate-300" data-join-invalid>
          This link is not valid or has been replaced. Reply to whoever sent it and we will send a fresh one.
          {error && <p className="mt-2 text-xs text-slate-500">{error}</p>}
        </div>
      </div>
    )

  const { setup, monthly, form } = plan
  const pkg = monthly.package
  const hasSetup = setup.status !== 'none'
  // The steps in order, numbered as they are shown: a waived setup fee is
  // not a step at all.
  const setupState = setup.status === 'paid' ? 'done' : 'now'
  const monthlyState = monthly.status === 'active' ? 'done' : hasSetup && setup.status !== 'paid' ? 'later' : 'now'
  const formState = form.status === 'done' ? 'done' : form.status === 'open' ? 'now' : 'later'
  let n = 0

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-200" data-client-join data-stage={plan.stage}>
      <div className="mx-auto max-w-2xl px-4 pb-10 pt-6 md:px-8 md:pt-10">
        <header>
          <div className="mb-5 flex items-center gap-2.5">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#f8f7f5]">
              <img src="/brand/wc-mark.jpg" alt="The Working Class" className="h-10 w-10 object-contain" data-brand-logo />
            </span>
            <span className="text-sm font-semibold tracking-tight text-slate-200">{AGENCY}</span>
          </div>
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-orange-400">{plan.stage === 'done' ? 'You are in' : 'Get started'}</p>
          <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight text-white sm:text-3xl">{plan.name ? `Welcome, ${plan.name}` : 'Welcome'}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            {plan.stage === 'done'
              ? 'Everything is in. Here is what you signed up for.'
              : `${hasSetup ? 'Three' : 'Two'} quick steps and we get to work. Payments run through Stripe, so your card details go to Stripe and never to us.`}
          </p>
        </header>

        <Panel as="section" className="mt-6 p-5 sm:p-6" data-join-plan>
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-orange-400">Your plan</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">{pkg.name}</h2>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-white">
            {money(monthly.amount)}
            <span className="ml-1.5 text-base font-medium text-slate-400">a month</span>
            {hasSetup && <span className="ml-2 text-base font-medium text-slate-400">+ {money(setup.amount)} setup, one time</span>}
          </p>
          {pkg.line && <p className="mt-1 text-sm text-slate-400">{pkg.line}</p>}
          {pkg.includes.length > 0 && (
            <ul className="mt-4 grid gap-1.5 sm:grid-cols-2" data-join-includes>
              {pkg.includes.map((line) => (
                <li key={line} className="flex items-start gap-2 text-sm leading-snug text-slate-300">
                  <span className="mt-0.5 flex-shrink-0 text-emerald-400">
                    <Tick />
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="mt-4 space-y-4">
          {hasSetup && (
            <Step number={++n} state={setupState} title="Pay the setup fee" amount={money(setup.amount)} data-join-setup={setup.status}>
              {setup.status === 'paid' ? (
                <p>Paid. Thank you.</p>
              ) : (
                <>
                  <p>One payment that gets your account built, your creative made and your first ads live.</p>
                  {setup.link ? (
                    <GoButton href={setup.link} newTab data-pay-button="setup">
                      Pay the {money(setup.amount)} setup fee
                    </GoButton>
                  ) : (
                    <LinkComing />
                  )}
                </>
              )}
            </Step>
          )}

          <Step number={++n} state={monthlyState} title="Start your monthly plan" amount={`${money(monthly.amount)} a month`} data-join-monthly={monthly.status}>
            {monthly.status === 'active' ? (
              <p>Started. Stripe charges the card on file each month and sends you a receipt.</p>
            ) : (
              <>
                <p>
                  Stripe charges {money(monthly.amount)} a month to the card you enter, starting today, and sends you a receipt each month.
                </p>
                {monthly.link ? (
                  <GoButton href={monthly.link} newTab data-pay-button="monthly">
                    Start your {money(monthly.amount)} a month plan
                  </GoButton>
                ) : (
                  <LinkComing />
                )}
              </>
            )}
          </Step>

          <Step number={++n} state={formState} title="Tell us about your business" data-join-form={form.status}>
            {form.status === 'done' ? (
              <p>Your form is in. Thank you.</p>
            ) : form.status === 'open' ? (
              <>
                <p>A short form about your business, where you work and what you want more of. It takes about ten minutes and it is what your ads are built from.</p>
                <GoButton href={form.path} data-form-button>
                  Fill out your onboarding form
                </GoButton>
              </>
            ) : (
              <p className="text-slate-400">A short form about your business. It opens here as soon as your {hasSetup ? 'payments are' : 'payment is'} in.</p>
            )}
          </Step>
        </div>

        {plan.stage === 'done' ? (
          <Panel className="mt-4 p-5 text-sm leading-relaxed text-slate-300 sm:p-6" data-join-done>
            <p className="text-base font-semibold text-white">You are all set.</p>
            <p className="mt-1">We have your payment and your form. We will reach out to book your onboarding call, and we start building from what you told us.</p>
          </Panel>
        ) : (
          plan.stage === 'pay' && (
            <Panel className="mt-4 flex flex-col gap-3 p-4 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between" data-join-refresh>
              <span>Stripe opens in a new tab. Come back here when you have paid. It can take a minute to show.</span>
              <button type="button" onClick={check} disabled={checking} className="min-h-[40px] flex-shrink-0 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50">
                {checking ? 'Checking…' : 'Check again'}
              </button>
            </Panel>
          )
        )}

        <footer className="mt-6 px-1 text-xs leading-relaxed text-slate-500">
          Payments are processed by Stripe. Questions? Reply to whoever sent you this page and a real person answers.
          <div className="mt-1 text-slate-600">{AGENCY}</div>
        </footer>
      </div>
    </div>
  )
}
