import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

// "A client filled something in" — on the dashboard, where it gets seen.
//
// Both forms already recorded when they were submitted; what was missing was
// anywhere that surfaced it. Without this a client can complete their
// onboarding and nobody finds out until someone happens to open their page.
//
// THE TWO FORMS CLEAR DIFFERENTLY, ON PURPOSE.
//
// The onboarding form is information: read it once and it is dealt with, so it
// clears when it is dismissed.
//
// The GHL form is a job. It is the client handing over what is needed to build
// their GoHighLevel account, and dismissing the notice does not build it --
// Reliable Heating and Plumbquick were both dismissed days ago and neither
// account has been set up. So that row does not offer a Dismiss at all: it
// stays until the GoHighLevel template setup deliverable for that client is
// marked done, and the button on the row is what marks it. The one action that
// makes the notice go away is the one that means the work happened.

// The deliverable that stands for "their GHL account exists". Seeded for every
// client on GoHighLevel by supabase/deliverable-templates.sql.
const GHL_SETUP_KEY = 'ghl-template'

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
    //
    // Unfiltered, and filtered in JS below. There is one row per client -- a
    // couple of dozen -- and whether a row still needs showing now depends on
    // a deliverable in another table, so the filter cannot be expressed as one
    // condition anyway. A half-expressible PostgREST filter is worse than
    // none: get it slightly wrong and the query errors, and this panel treats
    // an error as "nothing to show" and vanishes.
    const [linksRes, setupRes] = await Promise.all([
      supabase
        .from('onboarding_links')
        .select(
          'id, client_id, intake_submitted_at, ghl_submitted_at, intake_seen_at, ghl_seen_at, clients(name)'
        ),
      supabase
        .from('deliverables')
        .select('id, client_id, status')
        .eq('template_key', GHL_SETUP_KEY),
    ])

    // A missing table or column means the migration has not been run yet, which
    // is not worth breaking the dashboard over.
    if (linksRes.error) return

    // Keyed by client rather than looked up per row: one client has one GHL
    // account, however many times they submitted the form.
    const ghlSetup = new Map()
    for (const d of setupRes.data || []) ghlSetup.set(d.client_id, d)

    const rows = []
    for (const link of linksRes.data || []) {
      const name = link.clients?.name || 'A client'
      if (link.intake_submitted_at && !link.intake_seen_at) {
        rows.push({
          key: `${link.id}:intake`,
          kind: 'intake',
          id: link.id,
          column: 'intake_seen_at',
          clientId: link.client_id,
          name,
          message: 'submitted their onboarding form',
          at: link.intake_submitted_at,
        })
      }

      if (link.ghl_submitted_at) {
        const setup = ghlSetup.get(link.client_id)
        // Done, or -- if the deliverable was deleted by hand -- fall back to
        // the old dismissal so the row cannot become impossible to clear.
        const settled = setup ? setup.status === 'done' : !!link.ghl_seen_at
        if (!settled) {
          rows.push({
            key: `${link.id}:ghl`,
            kind: 'ghl',
            id: link.id,
            column: 'ghl_seen_at',
            deliverableId: setup?.id || null,
            clientId: link.client_id,
            name,
            message: 'needs their GHL account set up',
            at: link.ghl_submitted_at,
          })
        }
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

  // Marks the work done rather than merely marking it seen. Writes the
  // deliverable so the Deliverables page and this notice cannot disagree, and
  // stamps ghl_seen_at too so the row stays gone even if the deliverable is
  // later deleted.
  const markGhlSetUp = async (row) => {
    setBusy(row.key)
    setItems((prev) => prev.filter((r) => r.key !== row.key))
    if (row.deliverableId) {
      await supabase
        .from('deliverables')
        .update({ status: 'done', completed_date: new Date().toISOString().slice(0, 10) })
        .eq('id', row.deliverableId)
    }
    await supabase
      .from('onboarding_links')
      .update({ ghl_seen_at: new Date().toISOString() })
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
            className={`flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border ${
              row.kind === 'ghl'
                ? 'bg-amber-50 border-amber-200'
                : 'bg-blue-50 border-blue-100'
            }`}
          >
            <span className="text-sm text-slate-800">
              <strong>{row.name}</strong> {row.message}{' '}
              <span className="text-slate-500">
                · {row.kind === 'ghl' ? 'form came in ' : ''}
                {ago(row.at)}
              </span>
            </span>
            <span className="flex gap-2 flex-shrink-0">
              <Link
                to={`/client/${row.clientId}`}
                // Opening the onboarding form IS dealing with it. Opening a GHL
                // row deliberately does not clear it -- going to look at the
                // answers is how the account gets built, not proof that it was.
                onClick={row.kind === 'intake' ? () => dismiss(row) : undefined}
                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition"
              >
                Open
              </Link>
              {row.kind === 'ghl' ? (
                <button
                  type="button"
                  onClick={() => markGhlSetUp(row)}
                  disabled={busy === row.key}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 transition"
                  title="Marks the GoHighLevel template setup deliverable done for this client"
                >
                  ✓ GHL is set up
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => dismiss(row)}
                  disabled={busy === row.key}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 transition"
                >
                  Dismiss
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
