import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import { supabase } from '../lib/supabaseClient'
import { fetchPayments, formatDate, isOverdue, money, today } from '../lib/queries'

const FILTERS = ['paid', 'overdue', 'upcoming', 'all']
const METHODS = ['card', 'ach', 'check', 'paypal', 'other']

const inputClass =
  'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'

function StatCard({ label, value, sub, tone = 'slate' }) {
  const tones = {
    slate: 'bg-white border-slate-200',
    green: 'bg-green-50 border-green-200',
    blue: 'bg-blue-50 border-blue-200',
    red: 'bg-red-50 border-red-200',
  }
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('paid')
  const [clientFilter, setClientFilter] = useState('all')

  const [markingPaid, setMarkingPaid] = useState(null)
  const [paidDate, setPaidDate] = useState(today())
  const [method, setMethod] = useState('card')

  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState({ amount: '', due_date: '', notes: '' })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [items, clientsRes] = await Promise.all([
        fetchPayments(),
        supabase.from('clients').select('id, name, monthly_fee, status').order('name'),
      ])
      if (clientsRes.error) throw clientsRes.error
      setPayments(items)
      setClients(clientsRes.data || [])
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleMarkPaid = async () => {
    const { error: err } = await supabase
      .from('payments')
      .update({ status: 'paid', paid_date: paidDate, payment_method: method })
      .eq('id', markingPaid.id)

    if (err) return setError(err.message)
    setMarkingPaid(null)
    loadData()
  }

  const openEdit = (payment) => {
    setEditForm({
      amount: String(payment.amount),
      due_date: payment.due_date,
      notes: payment.notes || '',
    })
    setEditing(payment)
  }

  const handleSaveEdit = async () => {
    const { error: err } = await supabase
      .from('payments')
      .update({
        amount: parseFloat(editForm.amount),
        due_date: editForm.due_date,
        notes: editForm.notes || null,
      })
      .eq('id', editing.id)

    if (err) return setError(err.message)
    setEditing(null)
    loadData()
  }

  const handleUnmarkPaid = async (payment) => {
    if (!confirm('Mark this payment as unpaid again?')) return
    const { error: err } = await supabase
      .from('payments')
      .update({ status: 'pending', paid_date: null, payment_method: null })
      .eq('id', payment.id)

    if (err) return setError(err.message)
    loadData()
  }

  const thisMonth = today().slice(0, 7)

  const mrr = clients
    .filter((c) => c.status === 'active')
    .reduce((sum, c) => sum + (c.monthly_fee || 0), 0)

  const collectedThisMonth = payments
    .filter((p) => p.status === 'paid' && p.paid_date?.startsWith(thisMonth))
    .reduce((sum, p) => sum + p.amount, 0)

  const overdue = payments.filter(isOverdue)

  // "Upcoming" means the next month's worth of bills, not every unpaid row on
  // the books — otherwise a year of scheduled payments buries what's actually
  // due soon.
  const oneMonthOut = (() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return formatDate(d)
  })()

  // Sorted here rather than leaning on the query's order clause, so every view
  // — the paid ledger especially — is chronological no matter what comes back.
  const filtered = useMemo(() => {
    const list = payments.filter((p) => {
      if (clientFilter !== 'all' && p.client_id !== clientFilter) return false
      if (filter === 'all') return true
      if (filter === 'paid') return p.status === 'paid'
      if (filter === 'overdue') return isOverdue(p)
      return p.status !== 'paid' && !isOverdue(p) && p.due_date <= oneMonthOut
    })
    return list.sort((a, b) => a.due_date.localeCompare(b.due_date))
  }, [payments, filter, clientFilter, oneMonthOut])

  return (
    <Layout title="Payments & Revenue" subtitle={`${payments.length} payments tracked`}>
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 mb-4">
          Error: {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6">
        <StatCard label="MRR" value={money(mrr)} sub="Active clients" tone="blue" />
        <StatCard
          label="Collected"
          value={money(collectedThisMonth)}
          sub="This month"
          tone="green"
        />
        <StatCard
          label="Overdue"
          value={money(overdue.reduce((s, p) => s + p.amount, 0))}
          sub={`${overdue.length} payments`}
          tone={overdue.length > 0 ? 'red' : 'slate'}
        />
      </div>

      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <div className="flex gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-sm font-medium capitalize whitespace-nowrap transition ${
                filter === f
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
              }`}
            >
              {f}
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
            {payments.length === 0
              ? 'No payments yet. Open a client, then use Billing Setup to enter their setup fee and monthly amount.'
              : 'Nothing matches these filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => {
            const late = isOverdue(p)
            return (
              <div
                key={p.id}
                className={`rounded-xl border p-3 md:p-4 flex flex-col md:flex-row md:items-center gap-3 ${
                  late
                    ? 'bg-red-50 border-red-200'
                    : p.status === 'paid'
                      ? 'bg-green-50/50 border-green-200'
                      : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to={`/client/${p.client_id}`}
                      className="font-semibold text-slate-900 hover:text-blue-600 transition"
                    >
                      {p.clients?.name || 'Unknown client'}
                    </Link>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold uppercase">
                      {p.payment_type}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    <span className={late ? 'text-red-600 font-semibold' : ''}>
                      Due {p.due_date}
                    </span>
                    {p.status === 'paid' && ` · Paid ${p.paid_date} (${p.payment_method || '—'})`}
                  </p>
                  {p.notes && <p className="text-xs text-slate-600 mt-1">{p.notes}</p>}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <p className="text-lg font-bold text-slate-900 mr-1">
                    ${p.amount.toFixed(2)}
                  </p>
                  <button
                    onClick={() => openEdit(p)}
                    className="px-2.5 py-1.5 text-xs font-medium bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300 transition"
                  >
                    Edit
                  </button>
                  {p.status === 'paid' ? (
                    <button
                      onClick={() => handleUnmarkPaid(p)}
                      className="px-2.5 py-1.5 text-xs font-medium bg-green-100 text-green-800 rounded-lg hover:bg-green-200 transition"
                    >
                      ✓ Paid
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setPaidDate(today())
                        setMethod('card')
                        setMarkingPaid(p)
                      }}
                      className="px-2.5 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      Mark Paid
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal isOpen={!!markingPaid} onClose={() => setMarkingPaid(null)} title="Mark Payment Paid">
        {markingPaid && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase">Amount</p>
              <p className="text-2xl font-bold text-slate-900">
                ${markingPaid.amount.toFixed(2)}
              </p>
              <p className="text-sm text-slate-500">
                {markingPaid.clients?.name} · due {markingPaid.due_date}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Date paid</label>
              <input
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Payment method
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className={`${inputClass} capitalize`}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleMarkPaid}
                className="flex-1 bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700 transition"
              >
                Confirm Paid
              </button>
              <button
                onClick={() => setMarkingPaid(null)}
                className="flex-1 bg-slate-200 text-slate-900 py-2.5 rounded-lg font-medium hover:bg-slate-300 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Edit Payment">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Amount</label>
            <input
              type="number"
              step="0.01"
              value={editForm.amount}
              onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Due date</label>
            <input
              type="date"
              value={editForm.due_date}
              onChange={(e) => setEditForm((f) => ({ ...f, due_date: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
            <textarea
              rows="3"
              value={editForm.notes}
              onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSaveEdit}
              className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Save Changes
            </button>
            <button
              onClick={() => setEditing(null)}
              className="flex-1 bg-slate-200 text-slate-900 py-2.5 rounded-lg font-medium hover:bg-slate-300 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </Layout>
  )
}
