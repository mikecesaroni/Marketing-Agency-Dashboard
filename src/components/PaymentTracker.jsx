import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Modal from './Modal'
import { formatDate, isOverdue, money, today } from '../lib/queries'

const METHODS = ['card', 'ach', 'check', 'paypal', 'other']

const inputClass =
  'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'

// Steps whole months without rolling over — a 31st becomes the 30th/28th in
// shorter months instead of spilling into the next one.
function addMonths(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1 + n, 1)
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  date.setDate(Math.min(d, lastDay))
  return formatDate(date)
}

export default function PaymentTracker({ client, onClientUpdate }) {
  const clientId = client.id

  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showBilling, setShowBilling] = useState(false)
  const [billing, setBilling] = useState({
    setupFee: '',
    setupDueDate: today(),
    monthlyFee: '',
    firstPaymentDate: today(),
    months: '12',
  })
  const [saving, setSaving] = useState(false)

  const [markingPaid, setMarkingPaid] = useState(null)
  const [paidDate, setPaidDate] = useState(today())
  const [method, setMethod] = useState('card')

  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState({ amount: '', due_date: '', notes: '' })

  useEffect(() => {
    loadPayments()
  }, [clientId])

  const loadPayments = async () => {
    const { data, error: err } = await supabase
      .from('payments')
      .select('*')
      .eq('client_id', clientId)
      .order('due_date', { ascending: true })

    if (err) setError(err.message)
    else setPayments(data || [])
    setLoading(false)
  }

  const openBilling = () => {
    setBilling({
      setupFee: client.setup_fee ? String(client.setup_fee) : '',
      setupDueDate: setupPayment?.due_date || client.contract_start_date || today(),
      monthlyFee: client.monthly_fee ? String(client.monthly_fee) : '998',
      firstPaymentDate:
        monthlyPayments[0]?.due_date || client.contract_start_date || today(),
      months: String(Math.max(monthlyPayments.length, 12)),
    })
    setShowBilling(true)
  }

  // Rebuilds the schedule from the amounts you enter. Payments already marked
  // paid are never touched — only the unpaid ones get replaced.
  const handleSaveBilling = async () => {
    setSaving(true)
    setError('')

    const setupFee = parseFloat(billing.setupFee) || 0
    const monthlyFee = parseFloat(billing.monthlyFee) || 0
    const months = parseInt(billing.months, 10) || 0

    try {
      const { error: delErr } = await supabase
        .from('payments')
        .delete()
        .eq('client_id', clientId)
        .neq('status', 'paid')
      if (delErr) throw delErr

      const paid = payments.filter((p) => p.status === 'paid')
      const setupAlreadyPaid = paid.some((p) => p.payment_type === 'setup')
      const paidMonthlyDates = new Set(
        paid.filter((p) => p.payment_type === 'monthly').map((p) => p.due_date)
      )

      const rows = []
      if (setupFee > 0 && !setupAlreadyPaid) {
        rows.push({
          client_id: clientId,
          payment_type: 'setup',
          amount: setupFee,
          due_date: billing.setupDueDate,
          status: 'pending',
        })
      }
      for (let i = 0; i < months; i++) {
        const dueDate = addMonths(billing.firstPaymentDate, i)
        if (paidMonthlyDates.has(dueDate)) continue
        rows.push({
          client_id: clientId,
          payment_type: 'monthly',
          amount: monthlyFee,
          due_date: dueDate,
          status: 'pending',
        })
      }

      if (rows.length > 0) {
        const { error: insErr } = await supabase.from('payments').insert(rows)
        if (insErr) throw insErr
      }

      const { error: cliErr } = await supabase
        .from('clients')
        .update({
          setup_fee: setupFee,
          monthly_fee: monthlyFee,
          contract_start_date: billing.firstPaymentDate,
        })
        .eq('id', clientId)
      if (cliErr) throw cliErr

      setShowBilling(false)
      await loadPayments()
      onClientUpdate?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleMarkPaid = async () => {
    const { error: err } = await supabase
      .from('payments')
      .update({ status: 'paid', paid_date: paidDate, payment_method: method })
      .eq('id', markingPaid.id)

    if (err) return setError(err.message)
    setMarkingPaid(null)
    loadPayments()
  }

  const handleUnmarkPaid = async (payment) => {
    if (!confirm('Mark this payment as unpaid again?')) return
    const { error: err } = await supabase
      .from('payments')
      .update({ status: 'pending', paid_date: null, payment_method: null })
      .eq('id', payment.id)

    if (err) return setError(err.message)
    loadPayments()
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
    loadPayments()
  }

  const setupPayment = payments.find((p) => p.payment_type === 'setup')
  const monthlyPayments = payments.filter((p) => p.payment_type === 'monthly')
  const totalPaid = payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0)
  const contractValue = payments.reduce((sum, p) => sum + p.amount, 0)
  const nextDue = payments.find((p) => p.status !== 'paid')

  const PaymentRow = ({ payment, label }) => {
    const late = isOverdue(payment)
    return (
      <div
        className={`rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center gap-3 ${
          late
            ? 'bg-red-50 border-red-200'
            : payment.status === 'paid'
              ? 'bg-green-50/60 border-green-200'
              : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-900">{label}</p>
          <p className="text-xs text-slate-500">
            <span className={late ? 'text-red-600 font-semibold' : ''}>
              Due {payment.due_date}
            </span>
            {payment.status === 'paid' &&
              ` · Paid ${payment.paid_date} (${payment.payment_method || '—'})`}
          </p>
          {payment.notes && <p className="text-xs text-slate-600 mt-1">{payment.notes}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <p className="font-bold text-slate-900 mr-1">${payment.amount.toFixed(2)}</p>
          <button
            onClick={() => openEdit(payment)}
            className="px-2.5 py-1.5 text-xs font-medium bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300 transition"
          >
            Edit
          </button>
          {payment.status === 'paid' ? (
            <button
              onClick={() => handleUnmarkPaid(payment)}
              className="px-2.5 py-1.5 text-xs font-medium bg-green-100 text-green-800 rounded-lg hover:bg-green-200 transition"
            >
              ✓ Paid
            </button>
          ) : (
            <button
              onClick={() => {
                setPaidDate(today())
                setMethod('card')
                setMarkingPaid(payment)
              }}
              className="px-2.5 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Mark Paid
            </button>
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg md:rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
        <p className="text-slate-500">Loading payments...</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg md:rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-4">
        <h2 className="text-lg md:text-xl font-bold text-slate-900">Payments & Billing</h2>
        <button
          onClick={openBilling}
          className="w-full md:w-auto px-3 py-2 md:py-1.5 text-sm bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition"
        >
          {payments.length === 0 ? 'Set Up Billing' : 'Billing Setup'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
          {error}
        </div>
      )}

      {payments.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-3xl mb-2">💰</p>
          <p className="text-slate-900 font-medium">No billing set up yet</p>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Enter the setup fee and monthly amount and the whole payment schedule gets
            created — you don't have to wait for onboarding to finish.
          </p>
          <button
            onClick={openBilling}
            className="mt-4 px-4 py-2.5 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition"
          >
            Set Up Billing
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-600 font-medium">Contract Value</p>
              <p className="text-xl font-bold text-blue-900">{money(contractValue)}</p>
              <p className="text-xs text-blue-600 mt-1">
                {monthlyPayments.length} months
                {client.setup_fee > 0 && ` + ${money(client.setup_fee)} setup`}
              </p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs text-green-600 font-medium">Total Paid</p>
              <p className="text-xl font-bold text-green-900">${totalPaid.toFixed(2)}</p>
              <p className="text-xs text-green-600 mt-1">
                {payments.filter((p) => p.status === 'paid').length} payments
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p className="text-xs text-slate-600 font-medium">Next Due</p>
              {nextDue ? (
                <>
                  <p className="text-xl font-bold text-slate-900">
                    ${nextDue.amount.toFixed(2)}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">{nextDue.due_date}</p>
                </>
              ) : (
                <p className="text-xl font-bold text-slate-900">All Paid ✓</p>
              )}
            </div>
          </div>

          {setupPayment && (
            <div className="mb-6">
              <h3 className="font-semibold text-slate-900 mb-2">Setup Fee</h3>
              <PaymentRow payment={setupPayment} label="Setup fee" />
            </div>
          )}

          <h3 className="font-semibold text-slate-900 mb-2">Monthly Payments</h3>
          {monthlyPayments.length === 0 ? (
            <p className="text-slate-500 text-sm">No monthly payments scheduled.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {monthlyPayments.map((p) => (
                <PaymentRow
                  key={p.id}
                  payment={p}
                  label={new Date(`${p.due_date}T00:00:00`).toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* BILLING SETUP */}
      <Modal isOpen={showBilling} onClose={() => setShowBilling(false)} title="Billing Setup">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Setup fee ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={billing.setupFee}
                onChange={(e) => setBilling((b) => ({ ...b, setupFee: e.target.value }))}
                className={inputClass}
                placeholder="0"
              />
              <p className="text-xs text-slate-500 mt-1">Leave blank or 0 for none</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Setup fee due
              </label>
              <input
                type="date"
                value={billing.setupDueDate}
                onChange={(e) => setBilling((b) => ({ ...b, setupDueDate: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Monthly amount ($) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={billing.monthlyFee}
                onChange={(e) => setBilling((b) => ({ ...b, monthlyFee: e.target.value }))}
                className={inputClass}
                placeholder="998"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                First payment date
              </label>
              <input
                type="date"
                value={billing.firstPaymentDate}
                onChange={(e) =>
                  setBilling((b) => ({ ...b, firstPaymentDate: e.target.value }))
                }
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Number of months
            </label>
            <input
              type="number"
              min="1"
              max="60"
              value={billing.months}
              onChange={(e) => setBilling((b) => ({ ...b, months: e.target.value }))}
              className={inputClass}
            />
            <p className="text-xs text-slate-500 mt-1">
              Bills on the same day each month, starting from the first payment date.
            </p>
          </div>

          {payments.some((p) => p.status === 'paid') && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
              Payments already marked paid stay untouched. Only unpaid ones get rebuilt.
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSaveBilling}
              disabled={saving || !billing.monthlyFee}
              className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {saving ? 'Saving...' : 'Save Schedule'}
            </button>
            <button
              onClick={() => setShowBilling(false)}
              className="flex-1 bg-slate-200 text-slate-900 py-2.5 rounded-lg font-medium hover:bg-slate-300 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* MARK PAID */}
      <Modal isOpen={!!markingPaid} onClose={() => setMarkingPaid(null)} title="Mark Payment Paid">
        {markingPaid && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase">Amount</p>
              <p className="text-2xl font-bold text-slate-900">
                ${markingPaid.amount.toFixed(2)}
              </p>
              <p className="text-sm text-slate-500">Due {markingPaid.due_date}</p>
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

      {/* EDIT PAYMENT */}
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
    </div>
  )
}
