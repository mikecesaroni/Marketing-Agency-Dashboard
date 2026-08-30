import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { copyText } from '../lib/intakeSummary'
import { money } from '../lib/queries'
import StripeImportPanel from './StripeImportPanel'
import {
  assignUnmatched,
  clientLink,
  dismissUnmatched,
  fetchStripeLinks,
  fetchUnmatched,
  saveStripeLinks,
} from '../lib/stripeLinks'

// Stripe setup and the money that could not be matched to anyone. Both live on
// the Payments page because that is where you go when the books look wrong.
export default function StripePanel() {
  const [links, setLinks] = useState({ setup: '', monthly: '', monthly1500: '', ghl: '', ghlPriceId: '' })
  const [draft, setDraft] = useState({ setup: '', monthly: '', monthly1500: '', ghl: '', ghlPriceId: '' })
  const [unmatched, setUnmatched] = useState([])
  const [clients, setClients] = useState([])
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)

  const load = async () => {
    try {
      const [l, u, c] = await Promise.all([
        fetchStripeLinks(),
        fetchUnmatched(),
        // Archived clients are included on purpose. Both of the things this
        // panel does are historical — importing an old export, and assigning a
        // payment that arrived unmatched — and a churned client is exactly who
        // an unallocated payment tends to belong to. Sorted so the active ones
        // stay at the top of the list.
        supabase
          .from('clients')
          .select('id, name, archived')
          .order('archived')
          .order('name'),
      ])
      setLinks(l)
      setDraft(l)
      setUnmatched(u)
      setClients(c.data || [])
    } catch (err) {
      // A project without the migration applied should not take the page down.
      setError(err.message)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const save = async () => {
    setError('')
    try {
      await saveStripeLinks(draft)
      setLinks(draft)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err.message)
    }
  }

  const assign = async (row, clientId) => {
    if (!clientId) return
    setBusy(row.id)
    setError('')
    try {
      await assignUnmatched(row, clientId)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const dismiss = async (row) => {
    const label = row.customer_email || row.stripe_customer_id || 'this customer'
    if (!confirm(`Mark ${label} as a different business? Future payments from them will stop showing up here.`))
      return
    setBusy(row.id)
    setError('')
    try {
      await dismissUnmatched(row)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const configured = links.setup || links.monthly || links.monthly1500 || links.ghl

  return (
    <div className="bg-white border border-slate-200 rounded-xl mb-4 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left"
      >
        <span className="font-semibold text-slate-900">
          💳 Stripe
          <span className="ml-1.5 text-sm font-normal text-slate-500">
            {configured ? 'payment links set' : 'not set up yet'}
          </span>
          {unmatched.length > 0 && (
            <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">
              {unmatched.length} unmatched
            </span>
          )}
        </span>
        <span className="text-slate-400 text-sm">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-200 p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              Paste the Payment Link URLs from Stripe. The CRM stamps each client&rsquo;s ID onto
              them, which is how a payment finds its way back to the right client. Use the $998
              link for the original monthly plan and the $1,500 link for the higher tier.
            </p>
            {[
              ['Setup fee link', 'setup', 'https://buy.stripe.com/...'],
              ['Monthly subscription link ($998)', 'monthly', 'https://buy.stripe.com/...'],
              ['Monthly subscription link ($1,500)', 'monthly1500', 'https://buy.stripe.com/...'],
              ['GHL subscription link ($399/mo)', 'ghl', 'https://buy.stripe.com/...'],
              ['GHL price ID (recommended)', 'ghlPriceId', 'price_...'],
            ].map(([label, key, placeholder]) => (
              <div key={key}>
                <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                <input
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-sm font-mono"
                />
              </div>
            ))}
            <p className="text-xs text-slate-500">
              The GHL price ID is what tells an incoming invoice apart from the marketing
              retainer for a client who pays for both. Without it the CRM falls back to
              matching on the amount, which works as long as the two fees differ. Find it in
              Stripe under Product catalogue &rarr; the GHL product &rarr; the price
              (it starts <span className="font-mono">price_</span>).
            </p>
            <button
              onClick={save}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                saved ? 'bg-green-600 text-white' : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              {saved ? '✓ Saved' : 'Save links'}
            </button>
          </div>

          <StripeImportPanel clients={clients} onDone={load} />

          <div className="pt-3 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Unmatched payments</h3>
            {unmatched.length === 0 ? (
              <p className="text-xs text-slate-500">
                Nothing waiting. Money that arrives without a client ID lands here instead of being
                lost.
              </p>
            ) : (
              <div className="space-y-2 mt-2">
                {unmatched.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        {money(row.amount)}{' '}
                        <span className="font-normal text-slate-500">{row.payment_type}</span>
                      </p>
                      <p className="text-[11px] text-slate-600 truncate">
                        {row.customer_email || row.stripe_customer_id || 'no email on the payment'}
                        {row.paid_date && ` · ${row.paid_date}`}
                      </p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <select
                        defaultValue=""
                        disabled={busy === row.id}
                        onChange={(e) => assign(row, e.target.value)}
                        className="px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
                      >
                        <option value="">Assign to client...</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                            {c.archived ? ' (archived)' : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => dismiss(row)}
                        disabled={busy === row.id}
                        title="Not one of our clients — a different business on this Stripe account"
                        className="px-2 py-1.5 border border-slate-300 rounded text-xs bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition whitespace-nowrap"
                      >
                        Not this business
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// The per-client copy buttons, used on the client's own Payments card.
export function StripeLinkButtons({ clientId, stripeCustomerId, ghlPlan }) {
  const [links, setLinks] = useState({ setup: '', monthly: '', monthly1500: '', ghl: '', ghlPriceId: '' })
  const [copied, setCopied] = useState('')

  useEffect(() => {
    fetchStripeLinks().then(setLinks).catch(() => {})
  }, [])

  const copy = async (which, url) => {
    const ok = await copyText(url)
    setCopied(ok ? which : 'fail')
    setTimeout(() => setCopied(''), 2000)
  }

  const buttons = [
    ['setup', 'Setup fee link', links.setup],
    ['monthly', '$998/mo link', links.monthly],
    ['monthly1500', '$1,500/mo link', links.monthly1500],
    // Only for clients actually on the GHL plan. Sending this to anyone else
    // signs them up for a subscription nobody sold them.
    ...(ghlPlan ? [['ghl', 'GHL $399/mo link', links.ghl]] : []),
  ].filter(([, , base]) => base)

  if (buttons.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {buttons.map(([key, label, base]) => {
        const url = clientLink(base, clientId)
        return (
          <button
            key={key}
            onClick={() => copy(key, url)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
              copied === key
                ? 'bg-green-600 text-white'
                : 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200'
            }`}
          >
            {copied === key ? '✓ Copied' : `Copy ${label}`}
          </button>
        )
      })}
      {stripeCustomerId && (
        <span
          title={stripeCustomerId}
          className="text-[11px] text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5"
        >
          ✓ Stripe connected
        </span>
      )}
    </div>
  )
}
