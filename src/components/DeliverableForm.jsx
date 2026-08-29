import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// 'ghl setup' is a real unit of work with a due date and an owner, so it
// belongs in the same list as the rest rather than living only as a flag on
// the client. The dashboard surfaces the queue automatically either way --
// this is for when a build needs scheduling against a date.
const TYPES = ['creative', 'campaign', 'report', 'landing page', 'ghl setup', 'other']
const STATUSES = ['todo', 'in progress', 'review', 'done']
const PRIORITIES = ['low', 'normal', 'high']

const inputClass =
  'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'

// Used for both adding and editing. Pass `deliverable` to edit, omit to create.
// Pass `lockedClientId` from a client page so the client picker is hidden.
export default function DeliverableForm({
  deliverable,
  clients = [],
  lockedClientId,
  onSuccess,
  onClose,
}) {
  const [form, setForm] = useState({
    client_id: deliverable?.client_id || lockedClientId || '',
    title: deliverable?.title || '',
    type: deliverable?.type || 'creative',
    status: deliverable?.status || 'todo',
    priority: deliverable?.priority || 'normal',
    due_date: deliverable?.due_date || '',
    notes: deliverable?.notes || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Picking several clients only makes sense when creating. Editing targets one
  // existing row, and the client page already knows whose deliverable it is.
  const bulkMode = !deliverable && !lockedClientId
  const [selectedIds, setSelectedIds] = useState([])

  const toggleClient = (id) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )

  const set = (name) => (e) => setForm((prev) => ({ ...prev, [name]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (bulkMode && selectedIds.length === 0) {
      setError('Pick at least one client.')
      return
    }

    setError('')
    setLoading(true)

    const payload = {
      client_id: form.client_id,
      title: form.title.trim(),
      type: form.type,
      status: form.status,
      priority: form.priority,
      due_date: form.due_date || null,
      notes: form.notes.trim() || null,
      completed_date:
        form.status === 'done'
          ? deliverable?.completed_date || new Date().toISOString().split('T')[0]
          : null,
    }

    try {
      // One row per selected client — same title, dates and notes across all.
      const insertPayload = bulkMode
        ? selectedIds.map((id) => ({ ...payload, client_id: id }))
        : payload

      const { error: err } = deliverable
        ? await supabase.from('deliverables').update(payload).eq('id', deliverable.id)
        : await supabase.from('deliverables').insert(insertPayload)

      if (err) throw err

      onSuccess()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this deliverable?')) return
    setLoading(true)
    try {
      const { error: err } = await supabase
        .from('deliverables')
        .delete()
        .eq('id', deliverable.id)
      if (err) throw err
      onSuccess()
      onClose()
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {bulkMode ? (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-slate-700">
              Clients *{' '}
              <span className="font-normal text-slate-500">
                ({selectedIds.length} selected)
              </span>
            </label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedIds(clients.map((c) => c.id))}
                className="px-2 py-1 text-xs bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="px-2 py-1 text-xs bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition"
              >
                None
              </button>
            </div>
          </div>
          <div className="border border-slate-300 rounded-lg max-h-44 overflow-y-auto divide-y divide-slate-100">
            {clients.length === 0 ? (
              <p className="p-3 text-sm text-slate-500">No clients yet.</p>
            ) : (
              clients.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(c.id)}
                    onChange={() => toggleClient(c.id)}
                    className="w-4 h-4 rounded flex-shrink-0"
                  />
                  <span className="text-slate-900 truncate">{c.name}</span>
                  {c.meta_ads_active && (
                    <span className="ml-auto text-xs text-green-700 flex-shrink-0">Meta live</span>
                  )}
                </label>
              ))
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Creates the same deliverable for everyone ticked.
          </p>
        </div>
      ) : (
        !lockedClientId && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Client *</label>
            <select
              value={form.client_id}
              onChange={set('client_id')}
              className={inputClass}
              required
            >
              <option value="">Select a client...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Deliverable *</label>
        <input
          type="text"
          value={form.title}
          onChange={set('title')}
          className={inputClass}
          placeholder="e.g. 5 new video creatives"
          required
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Type</label>
          <select value={form.type} onChange={set('type')} className={`${inputClass} capitalize`}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
          <select
            value={form.status}
            onChange={set('status')}
            className={`${inputClass} capitalize`}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Priority</label>
          <select
            value={form.priority}
            onChange={set('priority')}
            className={`${inputClass} capitalize`}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Due date</label>
          <input type="date" value={form.due_date} onChange={set('due_date')} className={inputClass} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
        <textarea value={form.notes} onChange={set('notes')} rows="3" className={inputClass} />
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {loading
            ? 'Saving...'
            : deliverable
              ? 'Save Changes'
              : bulkMode && selectedIds.length > 1
                ? `Add to ${selectedIds.length} Clients`
                : 'Add Deliverable'}
        </button>
        {deliverable ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="px-4 bg-red-50 text-red-700 rounded-lg font-medium hover:bg-red-100 transition"
          >
            Delete
          </button>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-slate-200 text-slate-900 py-2.5 rounded-lg font-medium hover:bg-slate-300 transition"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
