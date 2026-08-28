import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

// "A client filled something in" — on the dashboard, where it gets seen.
//
// Both forms already recorded when they were submitted; what was missing was
// anywhere that surfaced it. Without this a client can complete their
// onboarding and nobody finds out until someone happens to open their page.
//
// Unread is tracked per form rather than per client: the two forms are sent and
// come back at different times, so dismissing one must not hide the other.

function ago(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days}d ago`
}

export default function FormSubmissionAlerts() {
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState('')

  const load = async () => {
    // Embeds the client name so this is one request rather than one per row.
    const { data, error } = await supabase
      .from('onboarding_links')
      .select(
        'id, client_id, intake_submitted_at, ghl_submitted_at, intake_seen_at, ghl_seen_at, clients(name)'
      )
      .or('and(intake_submitted_at.not.is.null,intake_seen_at.is.null),and(ghl_submitted_at.not.is.null,ghl_seen_at.is.null)')

    // A missing table or column means the migration has not been run yet, which
    // is not worth breaking the dashboard over.
    if (error) return

    const rows = []
    for (const link of data || []) {
      const name = link.clients?.name || 'A client'
      if (link.intake_submitted_at && !link.intake_seen_at) {
        rows.push({
          key: `${link.id}:intake`,
          id: link.id,
          column: 'intake_seen_at',
          clientId: link.client_id,
          name,
          form: 'onboarding form',
          at: link.intake_submitted_at,
        })
      }
      if (link.ghl_submitted_at && !link.ghl_seen_at) {
        rows.push({
          key: `${link.id}:ghl`,
          id: link.id,
          column: 'ghl_seen_at',
          clientId: link.client_id,
          name,
          form: 'account setup form',
          at: link.ghl_submitted_at,
        })
      }
    }
    rows.sort((a, b) => new Date(b.at) - new Date(a.at))
    setItems(rows)
  }

  useEffect(() => {
    load()
  }, [])

  const dismiss = async (row) => {
    setBusy(row.key)
    // Optimistic: the row is gone from the list either way, and a failed write
    // only means it comes back on the next load rather than being lost.
    setItems((prev) => prev.filter((r) => r.key !== row.key))
    await supabase
      .from('onboarding_links')
      .update({ [row.column]: new Date().toISOString() })
      .eq('id', row.id)
    setBusy('')
  }

  if (items.length === 0) return null

  return (
    <div className="bg-white rounded-lg md:rounded-xl shadow-sm border border-blue-200 p-4 md:p-6">
      <h2 className="text-lg font-bold text-slate-900 mb-3">
        New from clients
        <span className="ml-2 text-xs font-semibold bg-blue-600 text-white rounded-full px-2 py-0.5">
          {items.length}
        </span>
      </h2>

      <ul className="space-y-2">
        {items.map((row) => (
          <li
            key={row.key}
            className="flex flex-wrap items-center justify-between gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg"
          >
            <span className="text-sm text-slate-800">
              <strong>{row.name}</strong> submitted their {row.form}{' '}
              <span className="text-slate-500">· {ago(row.at)}</span>
            </span>
            <span className="flex gap-2 flex-shrink-0">
              <Link
                to={`/client/${row.clientId}`}
                onClick={() => dismiss(row)}
                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition"
              >
                Open
              </Link>
              <button
                type="button"
                onClick={() => dismiss(row)}
                disabled={busy === row.key}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 transition"
              >
                Dismiss
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
