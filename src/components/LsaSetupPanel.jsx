import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchLsaSetupNeeded } from '../lib/queries'
import { supabase } from '../lib/supabaseClient'
import { copyText } from '../lib/intakeSummary'
import { LSA_SETUP_MESSAGE } from '../lib/lsaSetupMessage'

// Matches the options on the intake form, so the two can't drift apart.
const LSA_STATUSES = ['Not started', 'In progress', 'Active', 'Paused', 'Needs work']

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

const LSA_STATUS_STYLES = {
  'Not started': 'bg-red-100 text-red-800',
  'In progress': 'bg-blue-100 text-blue-800',
  'Needs work': 'bg-amber-100 text-amber-800',
  Paused: 'bg-slate-200 text-slate-700',
  'No intake yet': 'bg-slate-100 text-slate-600',
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

  const changeStatus = async (client, lsaStatus) => {
    // Drop the client from the list as soon as their LSA is live — this panel
    // exists to show what's outstanding.
    setClients((prev) =>
      lsaStatus === 'Active'
        ? prev.filter((c) => c.id !== client.id)
        : prev.map((c) => (c.id === client.id ? { ...c, lsaStatus } : c))
    )

    // A client whose intake was never filled in has no row to update yet, so
    // one is created carrying just the status. The intake form merges into
    // whatever it finds, so the rest of the form still fills in later.
    const { error: err } = client.intakeId
      ? await supabase
          .from('onboarding_intake')
          .update({ lsa_status: lsaStatus })
          .eq('id', client.intakeId)
      : await supabase
          .from('onboarding_intake')
          .insert({ client_id: client.id, lsa_status: lsaStatus })

    if (err) {
      setError(err.message)
      load()
    } else if (!client.intakeId) {
      // Pick up the new row's id so a second change updates instead of
      // inserting a duplicate.
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
          {/* The dropdown sits outside the link — inside it, every change would
              also navigate away from the page. */}
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
                <span className="ml-2 text-xs text-slate-400 capitalize">{c.status}</span>
              </Link>
              <select
                value={LSA_STATUSES.includes(c.lsaStatus) ? c.lsaStatus : ''}
                onChange={(e) => changeStatus(c, e.target.value)}
                className={`px-2 py-1 rounded text-xs font-semibold border-0 cursor-pointer flex-shrink-0 ${
                  LSA_STATUS_STYLES[c.lsaStatus] || 'bg-slate-100 text-slate-600'
                }`}
              >
                {/* Shown only until a real status is picked, so "never filled
                    in" stays distinguishable from "not started". */}
                {!LSA_STATUSES.includes(c.lsaStatus) && (
                  <option value="" disabled>
                    {c.lsaStatus}
                  </option>
                )}
                {LSA_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
