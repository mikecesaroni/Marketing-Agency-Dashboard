import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchLsaSetupNeeded } from '../lib/queries'

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
    fetchLsaSetupNeeded()
      .then(setClients)
      .catch((err) => setError(err.message))
  }, [])

  if (error || !clients) return null

  if (clients.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
        <p className="text-sm font-medium text-green-900">
          ✅ LSA is active for every client.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl mb-4 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-4 hover:bg-slate-50 transition text-left"
      >
        <span className="font-semibold text-slate-900">
          📍 LSA setup still needed
          <span className="ml-1.5 text-sm font-normal text-slate-500">
            ({clients.length} {clients.length === 1 ? 'client' : 'clients'})
          </span>
        </span>
        <span className="text-slate-400 text-sm flex-shrink-0">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-200 divide-y divide-slate-100">
          {clients.map((c) => (
            <Link
              key={c.id}
              to={`/client/${c.id}`}
              className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50 transition"
            >
              <span className="text-sm text-slate-900 truncate">
                {c.name}
                <span className="ml-2 text-xs text-slate-400 capitalize">{c.status}</span>
              </span>
              <span
                className={`px-2 py-0.5 rounded text-xs font-semibold flex-shrink-0 ${
                  LSA_STATUS_STYLES[c.lsaStatus] || 'bg-slate-100 text-slate-600'
                }`}
              >
                {c.lsaStatus}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
