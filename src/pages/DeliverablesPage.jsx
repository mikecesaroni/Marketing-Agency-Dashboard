import { useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import DeliverableForm from '../components/DeliverableForm'
import LsaSetupPanel from '../components/LsaSetupPanel'
import MetaSetupPanel from '../components/MetaSetupPanel'
import { supabase } from '../lib/supabaseClient'
import { fetchDeliverables, today } from '../lib/queries'

const STATUS_FILTERS = ['open', 'todo', 'in progress', 'review', 'done', 'all']
const STATUSES = ['todo', 'in progress', 'review', 'done']

const STATUS_STYLES = {
  todo: 'bg-slate-100 text-slate-700',
  'in progress': 'bg-blue-100 text-blue-800',
  review: 'bg-purple-100 text-purple-800',
  done: 'bg-green-100 text-green-800',
}

const TYPE_ICONS = {
  creative: '🎨',
  campaign: '🚀',
  report: '📄',
  'landing page': '🖥️',
  other: '📌',
}

export default function DeliverablesPage() {
  const [deliverables, setDeliverables] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('open')
  const [clientFilter, setClientFilter] = useState('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [items, clientsRes] = await Promise.all([
        fetchDeliverables(),
        supabase.from('clients').select('id, name, meta_ads_active').eq('archived', false).order('name'),
      ])
      if (clientsRes.error) throw clientsRes.error
      setDeliverables(items)
      setClients(clientsRes.data || [])
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Inline status change straight from the row — the common case is just
  // moving something forward, which shouldn't need the whole edit form.
  const changeStatus = async (deliverable, status) => {
    setDeliverables((prev) =>
      prev.map((d) => (d.id === deliverable.id ? { ...d, status } : d))
    )
    const { error: err } = await supabase
      .from('deliverables')
      .update({
        status,
        completed_date: status === 'done' ? today() : null,
      })
      .eq('id', deliverable.id)

    if (err) {
      setError(err.message)
      loadData()
    }
  }

  const filtered = useMemo(() => {
    return deliverables.filter((d) => {
      if (clientFilter !== 'all' && d.client_id !== clientFilter) return false
      if (statusFilter === 'all') return true
      if (statusFilter === 'open') return d.status !== 'done'
      return d.status === statusFilter
    })
  }, [deliverables, statusFilter, clientFilter])

  const openCount = deliverables.filter((d) => d.status !== 'done').length
  const lateCount = deliverables.filter(
    (d) => d.status !== 'done' && d.due_date && d.due_date < today()
  ).length

  const tableMissing = error.toLowerCase().includes('deliverables')

  const addButton = (
    <button
      onClick={() => setShowAddModal(true)}
      className="w-full md:w-auto px-4 py-2.5 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition"
    >
      + New Deliverable
    </button>
  )

  return (
    <Layout
      title="Deliverables"
      subtitle={`${openCount} open${lateCount > 0 ? ` · ${lateCount} past due` : ''}`}
      actions={addButton}
    >
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 mb-4 text-sm">
          {tableMissing ? (
            <>
              <p className="font-semibold mb-1">The deliverables table doesn't exist yet.</p>
              <p>
                Open the Supabase SQL Editor and run the contents of{' '}
                <code className="bg-red-100 px-1 rounded">supabase/deliverables.sql</code>, then
                refresh this page.
              </p>
            </>
          ) : (
            `Error: ${error}`
          )}
        </div>
      )}

      <MetaSetupPanel />
      <LsaSetupPanel />

      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <div className="flex gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 rounded-lg text-sm font-medium capitalize whitespace-nowrap transition ${
                statusFilter === s
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="md:ml-auto px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="all">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-slate-500">
            {deliverables.length === 0
              ? 'No deliverables yet. Add one to start tracking work.'
              : 'Nothing matches these filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => {
            const late = d.status !== 'done' && d.due_date && d.due_date < today()
            return (
              <div
                key={d.id}
                className={`rounded-xl border p-3 md:p-4 flex flex-col md:flex-row md:items-center gap-3 ${
                  late ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'
                }`}
              >
                <button
                  onClick={() => setEditing(d)}
                  className="flex-1 text-left min-w-0 group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span>{TYPE_ICONS[d.type] || '📌'}</span>
                    <span className="font-semibold text-slate-900 group-hover:text-blue-600 transition truncate">
                      {d.title}
                    </span>
                    {d.priority === 'high' && (
                      <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold uppercase flex-shrink-0">
                        High
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {d.clients?.name || 'Unknown client'}
                    {d.due_date && (
                      <>
                        {' · '}
                        <span className={late ? 'text-red-600 font-semibold' : ''}>
                          due {d.due_date}
                        </span>
                      </>
                    )}
                  </p>
                  {d.notes && (
                    <p className="text-xs text-slate-600 mt-1.5 line-clamp-2">{d.notes}</p>
                  )}
                </button>

                <select
                  value={d.status}
                  onChange={(e) => changeStatus(d, e.target.value)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold capitalize border-0 cursor-pointer flex-shrink-0 ${
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

      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="New Deliverable"
      >
        <DeliverableForm
          clients={clients}
          onSuccess={loadData}
          onClose={() => setShowAddModal(false)}
        />
      </Modal>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Edit Deliverable">
        {editing && (
          <DeliverableForm
            deliverable={editing}
            clients={clients}
            onSuccess={loadData}
            onClose={() => setEditing(null)}
          />
        )}
      </Modal>
    </Layout>
  )
}
