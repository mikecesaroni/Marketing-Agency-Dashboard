import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button } from './ui'
import { TIERS } from '../lib/clientTiers'
import { copyText } from '../lib/intakeSummary'
import { publicLink } from '../lib/publicSite'
import { joinPath, setupLinkAmount, signupMessage, signupOffer, signupStatus, signupSummary } from '../lib/clientSignup'
import { cancelSignup, createSignup, finishSignups, listSignups, signupLinks } from '../lib/clientSignupStore'

/**
 * SIGNUP LINKS. Pick the plan, get one link to send a new client: they pay
 * the setup fee and start the monthly plan through it, then fill in the
 * onboarding form, and they are in the CRM without anybody adding them
 * (docs/client-signup.md). Under the maker, every link that is out and
 * where it stands.
 *
 * Nobody is a client until money arrives: the Stripe webhook makes the
 * client on the first payment. `onClientMade` is called when this panel
 * finds one it had not seen, so the list behind it can reload.
 */

const money = (n) => `$${(Number(n) || 0).toLocaleString('en-US')}`

export default function SignupLinkPanel({ onClientMade }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [tier, setTier] = useState('')
  const [withSetup, setWithSetup] = useState(true)
  const [links, setLinks] = useState(null)
  const [rows, setRows] = useState(null)
  const [made, setMade] = useState(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  const load = async () => {
    try {
      const list = await listSignups()
      setRows(list)
      // A payment may have made a client since anybody last looked: their
      // onboarding tasks and the channel post are done now.
      const finished = await finishSignups({ force: true, rows: list })
      if (finished) onClientMade?.()
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    signupLinks()
      .then(setLinks)
      .catch(() => setLinks({}))
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setupAmount = useMemo(() => setupLinkAmount(links || {}), [links])
  const offer = useMemo(() => (tier ? signupOffer({ tier, withSetup, links: links || {} }) : null), [tier, withSetup, links])

  const flash = (key) => {
    setCopied(key)
    setTimeout(() => setCopied((c) => (c === key ? '' : c)), 1600)
  }
  const copy = async (key, text) => {
    if (await copyText(text)) flash(key)
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setWorking(true)
    try {
      const row = await createSignup({ businessName: name, email, tier, withSetup, links: links || {} })
      setMade(row)
      setName('')
      setEmail('')
      setTier('')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setWorking(false)
    }
  }

  const cancel = async (row) => {
    if (!window.confirm(`Cancel the signup link for ${row.business_name}? It stops working for them.`)) return
    setError('')
    try {
      await cancelSignup(row.id)
      if (made?.id === row.id) setMade(null)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const url = (row) => publicLink(joinPath(row.token))
  const shown = (rows || []).filter((r) => signupStatus(r).key !== 'cancelled').slice(0, 15)

  return (
    <div className="space-y-5" data-signup-panel>
      <p className="text-sm text-slate-600">
        One link for a new client. They pay through it, then fill in the onboarding form. They show up as a client the moment their first payment lands, with the plan, the payment and the form attached.
      </p>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Business name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="e.g. John's Plumbing"
              required
              data-signup-name
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Their email <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Typed into the checkout for them"
              data-signup-email
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Plan *</label>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Plan">
            {TIERS.map((t) => {
              const on = Number(tier) === t.tier
              return (
                <label
                  key={t.tier}
                  className={`cursor-pointer rounded-lg border px-3 py-2.5 text-sm transition ${on ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-300 hover:border-slate-400'}`}
                  title={t.includes.join(' · ')}
                  data-signup-tier={t.tier}
                >
                  <input type="radio" name="signup-tier" value={t.tier} checked={on} onChange={() => setTier(String(t.tier))} className="sr-only" required />
                  <span className="block font-semibold text-slate-900">{t.short}</span>
                  <span className="block text-xs text-slate-600">{money(t.price)} a month</span>
                </label>
              )
            })}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Setup fee</label>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Setup fee">
            {[
              [true, setupAmount ? `${money(setupAmount)} setup fee` : 'Setup fee', setupAmount ? 'One time, paid first' : 'No setup fee link saved yet'],
              [false, 'No setup fee', 'They only start the monthly plan'],
            ].map(([value, label, hint]) => {
              const on = withSetup === value
              const off = value && !setupAmount && links !== null
              return (
                <label
                  key={String(value)}
                  className={`rounded-lg border px-3 py-2.5 text-sm transition ${off ? 'cursor-not-allowed border-slate-200 opacity-60' : 'cursor-pointer'} ${on ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-300 hover:border-slate-400'}`}
                  data-signup-setup={value ? 'yes' : 'no'}
                >
                  <input type="radio" name="signup-setup" checked={on} disabled={off} onChange={() => setWithSetup(value)} className="sr-only" />
                  <span className="block font-semibold text-slate-900">{label}</span>
                  <span className="block text-xs text-slate-600">{hint}</span>
                </label>
              )
            })}
          </div>
        </div>

        {offer && offer.problems.length === 0 && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700" data-signup-charges>
            They pay {offer.setup > 0 ? `${money(offer.setup)} once, then ` : ''}
            {money(offer.monthly)} a month, through Stripe.
          </p>
        )}
        {offer &&
          offer.problems.map((p) => (
            <p key={p} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" data-signup-problem>
              {p}
            </p>
          ))}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <Button type="submit" variant="dark" size="lg" disabled={working || !tier || !name.trim() || Boolean(offer?.problems.length)} className="w-full sm:w-auto" data-signup-create>
          {working ? 'Making the link…' : 'Get the link'}
        </Button>
      </form>

      {made && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4" data-signup-made>
          <p className="text-sm font-semibold text-green-900">
            Link for {made.business_name} is ready <span className="font-normal text-green-800">· {signupSummary(made)}</span>
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input readOnly value={url(made)} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-lg border border-green-300 bg-white px-3 py-2 text-sm text-slate-800" data-signup-url />
            <Button variant="dark" onClick={() => copy('made', url(made))} data-signup-copy>
              {copied === 'made' ? 'Copied ✓' : 'Copy link'}
            </Button>
            <Button variant="outline" onClick={() => copy('made-msg', signupMessage({ url: url(made) }))}>
              {copied === 'made-msg' ? 'Copied ✓' : 'Copy message'}
            </Button>
          </div>
        </div>
      )}

      <div data-signup-list>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Links out</p>
        {rows === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-slate-500">No signup links yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200">
            {shown.map((r) => {
              const status = signupStatus(r)
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-sm" data-signup-row={status.key}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">
                      {r.client_id ? (
                        <Link to={`/client/${r.client_id}`} className="hover:underline">
                          {r.business_name}
                        </Link>
                      ) : (
                        r.business_name
                      )}
                    </p>
                    <p className="truncate text-xs text-slate-500">{signupSummary(r)}</p>
                  </div>
                  <Badge tone={status.tone}>{status.label}</Badge>
                  {status.key !== 'done' && (
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => copy(r.id, url(r))}>
                        {copied === r.id ? 'Copied ✓' : 'Copy link'}
                      </Button>
                      {!r.client_id && (
                        <Button size="sm" variant="ghost" onClick={() => cancel(r)}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
