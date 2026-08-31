import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchChannelSetupNeeded } from '../lib/queries'
import { supabase } from '../lib/supabaseClient'

// Who still needs a given channel switched on. Used once for Meta and once for
// Google LSA, so the two read identically rather than each growing their own
// quirks.
export default function ChannelSetupPanel({
  field,
  icon,
  title,
  markLabel,
  allLiveMessage,
  otherField,
  otherLabel,
  action,
  // Rendered full width under the header. `action` sits in a flex row beside
  // the title, so anything wider than a button gets squeezed into a column
  // there -- which is what a numbered list of steps did.
  footer,
}) {
  const [clients, setClients] = useState(null)
  const [open, setOpen] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [field])

  const load = () =>
    fetchChannelSetupNeeded(field)
      .then(setClients)
      .catch((err) => setError(err.message))

  const markLive = async (client) => {
    // Drop the client the moment the channel is live — this panel exists to
    // show what's outstanding.
    setClients((prev) => prev.filter((c) => c.id !== client.id))

    const { error: err } = await supabase
      .from('clients')
      .update({ [field]: true })
      .eq('id', client.id)

    if (err) {
      setError(err.message)
      load()
    }
  }

  if (error || !clients) return null

  if (clients.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm font-medium text-green-900">✅ {allLiveMessage}</p>
        {action}
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl mb-4 overflow-hidden">
      {/* The collapse toggle is its own button rather than wrapping the row, so
          the action button isn't nested inside another button. */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center justify-between gap-3 text-left"
        >
          <span className="font-semibold text-slate-900">
            {icon} {title}
            <span className="ml-1.5 text-sm font-normal text-slate-500">
              ({clients.length} {clients.length === 1 ? 'client' : 'clients'})
            </span>
          </span>
          <span className="text-slate-400 text-sm flex-shrink-0 sm:hidden">
            {open ? 'Hide' : 'Show'}
          </span>
        </button>
        <div className="flex items-center gap-2 flex-shrink-0">
          {action}
          <button
            onClick={() => setOpen((v) => !v)}
            className="hidden sm:block text-slate-400 text-sm hover:text-slate-600 transition"
          >
            {open ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {footer && <div className="border-t border-slate-100 px-4 pb-3 pt-3">{footer}</div>}

      {open && (
        <div className="border-t border-slate-200 divide-y divide-slate-100">
          {clients.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50 transition"
            >
              <Link
                to={`/client/${c.id}`}
                className="text-sm text-slate-900 truncate hover:text-blue-600"
              >
                {c.name}
                {/* The other channel's state, so it's clear at a glance whether
                    a client is waiting on one thing or on everything. */}
                {c[otherField] && (
                  <span className="ml-2 text-xs text-green-700">{otherLabel} live</span>
                )}
                {field === 'meta_ads_active' && !c.meta_ad_account_id && (
                  <span className="ml-2 text-xs text-amber-700">no ad account linked</span>
                )}
              </Link>
              <button
                onClick={() => markLive(c)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-green-100 hover:text-green-800 transition flex-shrink-0"
              >
                {markLabel}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
