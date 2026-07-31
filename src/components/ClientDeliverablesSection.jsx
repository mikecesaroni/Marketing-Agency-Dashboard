import { useEffect, useState } from 'react'
import Modal from './Modal'
import DeliverableForm from './DeliverableForm'
import { supabase } from '../lib/supabaseClient'
import { today } from '../lib/queries'

const STATUSES = ['todo', 'in progress', 'review', 'done']

const STATUS_STYLES = {
  todo: 'bg-slate-100 text-slate-700',
  'in progress': 'bg-blue-100 text-blue-800',
  review: 'bg-purple-100 text-purple-800',
  done: 'bg-green-100 text-green-800',
}

export default function ClientDeliverablesSection({ clientId }) {
  const [deliverables, setDeliverables] = useState([])
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    load()
  }, [clientId])

  const load = async () => {
    const { data, error: err } = await supabase
      .from('deliverables')
      .select('*')
      .eq('client_id', clientId)
      .order('due_date', { ascending: true, nullsFirst: false })

    if (err) setError(err.message)
    else {
      setDeliverables(data || [])
      setError('')
    }
  }

  const changeStatus = async (deliverable, status) => {
    setDeliverables((prev) =>
      prev.map((d) => (d.id === deliverable.id ? { ...d, status } : d))
    )
    const { error: err } = await supabase
      .from('deliverables')
      .update({ status, completed_date: status === 'done' ? today() : null })
      .eq('id', deliverable.id)

    if (err) {
      setError(err.message)
      load()
    }
  }

  const open = deliverables.filter((d) => d.status !== 'done')

  return (
    <div className="bg-white rounded-lg md:rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-4">
        <h2 className="text-lg md:text-xl font-bold text-slate-900">
          Deliverables{' '}
          <span className="text-sm font-normal text-slate-500">({open.length} open)</span>
        </h2>
        <button
          onClick={() => setShowAdd(true)}
          className="w-full md:w-auto px-3 py-2 md:py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          + Add Deliverable
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
          {error.toLowerCase().includes('deliverables')
            ? 'Run supabase/deliverables.sql in the Supabase SQL Editor to enable deliverables.'
            : error}
        </div>
      )}

      {deliverables.length === 0 ? (
        <p className="text-slate-500 text-sm">No deliverables yet.</p>
      ) : (
        <div className="space-y-2">
          {deliverables.map((d) => {
            const late = d.status !== 'done' && d.due_date && d.due_date < today()
            return (
              <div
                key={d.id}
                className={`rounded-lg border p-3 flex items-center gap-3 ${
                  late ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <button
                  onClick={() => setEditing(d)}
                  className="flex-1 text-left min-w-0 group"
                >
                  <p className="font-medium text-slate-900 group-hover:text-blue-600 transition truncate">
                    {d.title}
                  </p>
                  <p className="text-xs text-slate-500 capitalize">
                    {d.type}
                    {d.due_date && (
                      <>
                        {' · '}
                        <span className={late ? 'text-red-600 font-semibold' : ''}>
                          due {d.due_date}
                        </span>
                      </>
                    )}
                  </p>
                </button>
                <select
                  value={d.status}
                  onChange={(e) => changeStatus(d, e.target.value)}
                  className={`px-2 py-1 rounded text-xs font-semibold capitalize border-0 cursor-pointer flex-shrink-0 ${
                    STATUS_STYLES[d.status]
                  }`}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="New Deliverable">
        <DeliverableForm
          lockedClientId={clientId}
          onSuccess={load}
          onClose={() => setShowAdd(false)}
        />
      </Modal>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Edit Deliverable">
        {editing && (
          <DeliverableForm
            deliverable={editing}
            lockedClientId={clientId}
            onSuccess={load}
            onClose={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  )
}
