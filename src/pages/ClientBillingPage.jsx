import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import PortalTabs from '../components/PortalTabs'
import PortalSidebar from '../components/PortalSidebar'
import { Panel } from '../components/reports/kit'
import { billingPlan } from '../lib/clientBilling'
import { loadClientBilling } from '../lib/clientBillingStore'

/**
 * A client's billing, from the private token in their link: the "Billing"
 * tab of the client's one link, on the same dark surface as their numbers.
 * Their plan and what it includes, whether the setup fee is paid, whether
 * the subscription has started, and the button to pay or to subscribe, which
 * opens Stripe's own checkout with their id stamped on it so the webhook
 * books the money to them. Nothing here charges anyone and nothing here
 * can change anything in the CRM; it reads through client_billing_load.
 */

const AGENCY = 'The Working Class Marketing'

const money = (n) => {
  const v = Number(n) || 0
  return `$${v.toLocaleString('en-US', Number.isInteger(v) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** "Nov 9, 2026". A date-only string is read as a date, not midnight UTC. */
const dateWords = (iso) => {
  if (!iso) return ''
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const TONES = {
  good: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/30',
  due: 'bg-orange-400/10 text-orange-300 ring-orange-400/30',
  bad: 'bg-red-400/10 text-red-300 ring-red-400/30',
  quiet: 'bg-white/5 text-slate-300 ring-white/15',
}

function StatusPill({ tone = 'quiet', children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ring-1 ring-inset ${TONES[tone] || TONES.quiet}`} data-billing-status={children}>
      {children}
    </span>
  )
}

/** The one button that goes to Stripe: big, orange, in a new tab. */
function PayButton({ href, children, secondary = false }) {
  const big = 'inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-bold transition sm:w-auto'
  const look = secondary ? 'border border-white/20 bg-white/[0.04] text-white hover:bg-white/10' : 'bg-orange-500 text-white shadow-lg shadow-orange-900/30 hover:bg-orange-400'
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`${big} ${look}`} data-pay-button>
      {children}
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 17L17 7M9 7h8v8" />
      </svg>
    </a>
  )
}

/** The words when a link is not there yet: never a wrong charge, a line instead. */
function LinkComing() {
  return (
    <p className="text-sm leading-relaxed text-slate-400" data-billing-nolink>
      Your payment link is on its way. Reply to your Monday email if you would like it sooner.
    </p>
  )
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

function SetupCard({ setup }) {
  if (setup.status === 'none') return null
  const paid = setup.status === 'paid'
  return (
    <Panel as="section" className="p-5 sm:p-6" data-billing-setup={setup.status}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-orange-400">Setup fee</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-white">{money(setup.amount)}</p>
          <p className="mt-0.5 text-[12px] text-slate-500">One time</p>
        </div>
        <StatusPill tone={paid ? 'good' : setup.status === 'overdue' ? 'bad' : 'due'}>{paid ? 'Paid' : setup.status === 'overdue' ? 'Past due' : 'Due'}</StatusPill>
      </div>
      {paid ? (
        <p className="mt-4 text-sm leading-relaxed text-slate-300">
          Paid{setup.paidOn ? ` on ${dateWords(setup.paidOn)}` : ''}. Thank you. This covered building your account, your creative and your first ads.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <p className="text-sm leading-relaxed text-slate-300">
            One payment that gets your account built, your creative made and your first ads live.
            {setup.dueOn ? ` Due ${dateWords(setup.dueOn)}.` : ''}
          </p>
          {setup.link ? <PayButton href={setup.link}>Pay the {money(setup.amount)} setup fee</PayButton> : <LinkComing />}
        </div>
      )}
    </Panel>
  )
}

function PlanCard({ monthly }) {
  const { status, amount, package: pkg } = monthly
  const tone = status === 'active' ? 'good' : status === 'failing' ? 'bad' : status === 'paused' ? 'quiet' : 'due'
  const label = status === 'active' ? 'Active' : status === 'failing' ? 'Payment problem' : status === 'paused' ? 'Paused' : 'Not started'
  return (
    <Panel as="section" className="p-5 sm:p-6" data-billing-plan={status}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-orange-400">Your plan</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">{pkg.name}</h2>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-white">
            {money(amount)}
            <span className="ml-1.5 text-base font-medium text-slate-400">a month</span>
          </p>
          {pkg.line && <p className="mt-1 text-sm text-slate-400">{pkg.line}</p>}
        </div>
        <StatusPill tone={tone}>{label}</StatusPill>
      </div>

      {pkg.includes.length > 0 && (
        <ul className="mt-4 grid gap-1.5 sm:grid-cols-2" data-billing-includes>
          {pkg.includes.map((line) => (
            <li key={line} className="flex items-start gap-2 text-sm leading-snug text-slate-300">
              <Check />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 border-t border-white/10 pt-4">
        {status === 'active' && (
          <div className="space-y-1 text-sm leading-relaxed text-slate-300">
            <p>
              {monthly.monthsPaid} {monthly.monthsPaid === 1 ? 'payment' : 'payments'} made
              {monthly.since ? `, since ${dateWords(monthly.since)}` : ''}
              {monthly.lastPaid ? `. Last payment ${dateWords(monthly.lastPaid)}` : ''}.
            </p>
            {monthly.nextDue && <p>Next payment {dateWords(monthly.nextDue)}.</p>}
            <p className="text-slate-500">Stripe charges the card on file each month. Nothing to do.</p>
          </div>
        )}
        {status === 'failing' && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-slate-300">
              Your last payment{monthly.failedAmount ? ` of ${money(monthly.failedAmount)}` : ''} did not go through.{' '}
              {monthly.retryOn ? `Stripe will try the card again on ${dateWords(monthly.retryOn)}.` : 'Stripe has stopped retrying.'} Updating the card keeps your ads running.
            </p>
            {monthly.updateCardUrl ? (
              <PayButton href={monthly.updateCardUrl}>Update your card</PayButton>
            ) : (
              <p className="text-sm text-slate-400">Reply to your Monday email and we will send a link to update the card.</p>
            )}
          </div>
        )}
        {status === 'paused' && (
          <p className="text-sm leading-relaxed text-slate-300">Your plan is on pause, so nothing is charged. Reply to your Monday email when you are ready to start again.</p>
        )}
        {status === 'not-started' && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-slate-300">
              Start your plan here. Stripe charges {money(amount)} a month to the card you enter, starting today, and sends you a receipt each month.
            </p>
            {monthly.link ? <PayButton href={monthly.link}>Start your {money(amount)} a month plan</PayButton> : <LinkComing />}
          </div>
        )}
      </div>
    </Panel>
  )
}

function HistoryCard({ history }) {
  return (
    <Panel as="section" className="p-5 sm:p-6" data-billing-history>
      <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-orange-400">Payments</p>
      {history.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">No payments yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-white/10">
          {history.slice(0, 24).map((h, i) => (
            <li key={`${h.date}-${i}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="text-slate-300">{dateWords(h.date)}</span>
              <span className="flex-1 text-slate-500">{h.type}</span>
              <span className="font-semibold tabular-nums text-white">{money(h.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export default function ClientBillingPage() {
  const { token } = useParams()
  const [data, setData] = useState(undefined)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const row = await loadClientBilling(token)
      setData(row || null)
    } catch (err) {
      setError(err.message)
      setData(null)
    }
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  // Dark to the edges on a phone, and the tab named for the client.
  useEffect(() => {
    const was = document.body.style.background
    const title = document.title
    document.body.style.background = '#070b14'
    document.title = data?.client?.name ? `Billing for ${data.client.name}` : 'Billing'
    return () => {
      document.body.style.background = was
      document.title = title
    }
  }, [data])

  const plan = useMemo(
    () => (data ? billingPlan({ client: data.client, payments: data.payments, links: data.links, email: data.email, today: todayIso() }) : null),
    [data]
  )

  const refresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  if (data === undefined) return <div className="min-h-screen bg-[#070b14] p-6 text-sm text-slate-400">Opening your billing…</div>
  if (data === null)
    return (
      <div className="min-h-screen bg-[#070b14] p-6">
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-[#0f1626] p-6 text-sm text-slate-300">
          This link is not valid or has been replaced. Reply to your weekly email and we will send a fresh one.
          {error && <p className="mt-2 text-xs text-slate-500">{error}</p>}
        </div>
      </div>
    )

  const name = data.client?.name || 'your company'

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-200 lg:pl-64" data-client-billing>
      {/* One link, several tabs: this is the billing tab. */}
      <PortalSidebar token={token} active="billing" name={name} />
      <div className="mx-auto max-w-4xl px-4 pb-6 pt-2 md:px-8 md:pb-8 md:pt-3 lg:pt-6">
        <PortalTabs token={token} active="billing" dark />
        <header className="mt-5">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#f8f7f5]">
              <img src="/brand/wc-mark.jpg" alt="The Working Class" className="h-10 w-10 object-contain" data-brand-logo />
            </span>
            <span className="text-sm font-semibold tracking-tight text-slate-200">{AGENCY}</span>
          </div>
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-orange-400">Billing</p>
          <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight text-white sm:text-3xl">{name}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            Your plan with us and how to pay. Payments run through Stripe, so your card details go to Stripe and never to us.
          </p>
        </header>

        <div className="mt-6 space-y-4">
          <SetupCard setup={plan.setup} />
          <PlanCard monthly={plan.monthly} />
          <HistoryCard history={plan.history} />
        </div>

        <Panel className="mt-4 flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-slate-400" data-billing-refresh>
          <span>Just paid? It can take a minute to show here.</span>
          <button type="button" onClick={refresh} disabled={refreshing} className="min-h-[40px] rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50">
            {refreshing ? 'Checking…' : 'Check again'}
          </button>
        </Panel>

        <footer className="mt-6 px-1 pb-6 text-xs leading-relaxed text-slate-500">
          Payments are processed by Stripe. Questions about your bill? Reply to your Monday email and a real person answers.
          <div className="mt-1 text-slate-600">{AGENCY}</div>
        </footer>
      </div>
    </div>
  )
}
