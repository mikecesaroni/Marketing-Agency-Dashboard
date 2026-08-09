import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchLsaSetupNeeded } from '../lib/queries'
import { supabase } from '../lib/supabaseClient'
import { copyText } from '../lib/intakeSummary'
import { LSA_SETUP_MESSAGE } from '../lib/lsaSetupMessage'



function CopyMessageButton() {
  const [copied, setCopied] = useState(null)

  const handleCopy = async () => {
    const ok = await copyText(LSA_SETUP_MESSAGE)
    setCopied(ok ? 'ok' : 'fail')
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
        copied === 'ok'
          ? 'bg-green-600 text-white'
          : copied === 'fail'
            ? 'bg-red-100 text-red-700'
            : 'bg-slate-900 text-white hover:bg-slate-800'
      }`}
    >
      {copied === 'ok' ? '✓ Copied' : copied === 'fail' ? 'Copy failed' : 'Copy setup message'}
    </button>
  )
}



export default function LsaSetupPanel() {
  const [clients, setClients] = useState(null)
  const [open, setOpen] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  const load = () =>
    fetchLsaSetupNeeded()
      .then(setClients)
      .catch((err) => setError(err.message))

  const markLive = async (client) => {
    // Drop the client from the list the moment their LSA is live — this panel
    // exists to show what's outstanding.
    setClients((prev) => prev.filter((c) => c.id !== client.id))

    const { error: err } = await supabase
      .from('clients')
      .update({ lsa_active: true })
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
        <p className="text-sm font-medium text-green-900">
          ✅ LSA is active for every client.
        </p>
        <CopyMessageButton />
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl mb-4 overflow-hidden">
      {/* The toggle is its own button rather than wrapping the whole row, so
          the copy button isn't nested inside another button. */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center justify-between gap-3 text-left"
        >
          <span className="font-semibold text-slate-900">
            📍 LSA setup still needed
            <span className="ml-1.5 text-sm font-normal text-slate-500">
              ({clients.length} {clients.length === 1 ? 'client' : 'clients'})
            </span>
          </span>
          <span className="text-slate-400 text-sm flex-shrink-0 sm:hidden">
            {open ? 'Hide' : 'Show'}
          </span>
        </button>
        <div className="flex items-center gap-2 flex-shrink-0">
          <CopyMessageButton />
          <button
            onClick={() => setOpen((v) => !v)}
            className="hidden sm:block text-slate-400 text-sm hover:text-slate-600 transition"
          >
            {open ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-200 divide-y divide-slate-100">
          {/* The button sits outside the link — inside it, marking a client
              live would also navigate away from the page. */}
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
                {c.meta_ads_active && (
                  <span className="ml-2 text-xs text-green-700">Meta live</span>
                )}
              </Link>
              <button
                onClick={() => markLive(c)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-green-100 hover:text-green-800 transition flex-shrink-0"
              >
                Mark LSA live
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
