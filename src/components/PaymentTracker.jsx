import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function PaymentTracker({ clientId, clientName, monthlyFee = 998, setupFee = 0 }) {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState(null)
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split('T')[0])
  const [paymentMethod, setPaymentMethod] = useState('card')

  useEffect(() => {
    loadPayments()
  }, [clientId])

  const loadPayments = async () => {
    try {
      const { data, error: err } = await supabase
        .from('payments')
        .select('*')
        .eq('client_id', clientId)
        .order('due_date', { ascending: true })

      if (err) throw err
      setPayments(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleMarkPaid = async () => {
    if (!selectedPayment) return

    try {
      const { error: err } = await supabase
        .from('payments')
        .update({
          status: 'paid',
          paid_date: paidDate,
          payment_method: paymentMethod,
        })
        .eq('id', selectedPayment.id)

      if (err) throw err

      setShowPaymentModal(false)
      setSelectedPayment(null)
      await loadPayments()
    } catch (err) {
      setError(err.message)
    }
  }

  const getStatusColor = (status) => {
    if (status === 'paid') return 'bg-green-100 text-green-800'
    if (status === 'overdue') return 'bg-red-100 text-red-800'
    return 'bg-yellow-100 text-yellow-800'
  }

  const getStatusIcon = (status) => {
    if (status === 'paid') return '✓'
    if (status === 'overdue') return '⚠️'
    return '⏳'
  }

  const totalPaid = payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0)

  const nextPaymentDue = payments.find((p) => p.status !== 'paid')

  const setupPayment = payments.find((p) => p.payment_type === 'setup')
  const monthlyPayments = payments.filter((p) => p.payment_type === 'monthly')

  if (loading) {
    return <div className="text-slate-500">Loading payments...</div>
  }

  return (
    <div className="bg-white rounded-lg md:rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
      <h2 className="text-xl font-bold text-slate-900 mb-4">Payments & Billing</h2>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
          {error}
        </div>
      )}

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-600 font-medium">Contract Value</p>
          <p className="text-xl font-bold text-blue-900">
            ${setupFee > 0 ? setupFee + monthlyFee * 12 : monthlyFee * 12}
          </p>
          <p className="text-xs text-blue-600 mt-1">Annual (+ ${setupFee} setup)</p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-xs text-green-600 font-medium">Total Paid</p>
          <p className="text-xl font-bold text-green-900">${totalPaid.toFixed(2)}</p>
          <p className="text-xs text-green-600 mt-1">{payments.filter((p) => p.status === 'paid').length} payments</p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <p className="text-xs text-slate-600 font-medium">Next Due</p>
          {nextPaymentDue ? (
            <>
              <p className="text-xl font-bold text-slate-900">${nextPaymentDue.amount.toFixed(2)}</p>
              <p className="text-xs text-slate-600 mt-1">{nextPaymentDue.due_date}</p>
            </>
          ) : (
            <p className="text-xl font-bold text-slate-900">All Paid ✓</p>
          )}
        </div>
      </div>

      {/* SETUP FEE */}
      {setupPayment && (
        <div className="mb-6">
          <h3 className="font-semibold text-slate-900 mb-2">Setup Fee</h3>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-900">${setupPayment.amount.toFixed(2)}</p>
              <p className="text-xs text-slate-600">Due: {setupPayment.due_date}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-1 rounded text-xs font-semibold inline-flex items-center gap-1 ${getStatusColor(
                  setupPayment.status
                )}`}
              >
                {getStatusIcon(setupPayment.status)} {setupPayment.status}
              </span>
              {setupPayment.status !== 'paid' && (
                <button
                  onClick={() => {
                    setSelectedPayment(setupPayment)
                    setShowPaymentModal(true)
                  }}
                  className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                >
                  Mark Paid
                </button>
              )}
              {setupPayment.status === 'paid' && (
                <span className="text-xs text-slate-600">Paid {setupPayment.paid_date}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MONTHLY PAYMENTS */}
      <div>
        <h3 className="font-semibold text-slate-900 mb-3">Monthly Payments</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {monthlyPayments.length === 0 ? (
            <p className="text-slate-500 text-sm">No monthly payments yet</p>
          ) : (
            monthlyPayments.map((payment) => (
              <div
                key={payment.id}
                className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between hover:bg-slate-100 transition"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {new Date(payment.due_date).toLocaleDateString('en-US', {
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                  <p className="text-sm font-semibold text-slate-900">${payment.amount.toFixed(2)}</p>
                  <p className="text-xs text-slate-600">Due: {payment.due_date}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold inline-flex items-center gap-1 ${getStatusColor(
                      payment.status
                    )}`}
                  >
                    {getStatusIcon(payment.status)} {payment.status}
                  </span>
                  {payment.status !== 'paid' && (
                    <button
                      onClick={() => {
                        setSelectedPayment(payment)
                        setShowPaymentModal(true)
                      }}
                      className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                    >
                      Mark Paid
                    </button>
                  )}
                  {payment.status === 'paid' && (
                    <span className="text-xs text-slate-600">{payment.payment_method}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* MARK PAID MODAL */}
      {showPaymentModal && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Mark Payment Paid</h3>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Payment Amount</label>
                <p className="text-2xl font-bold text-slate-900">${selectedPayment.amount.toFixed(2)}</p>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Due Date</label>
                <p className="text-slate-900">{selectedPayment.due_date}</p>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-2">Date Paid</label>
                <input
                  type="date"
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 block mb-2">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="card">Credit Card</option>
                  <option value="ach">ACH/Bank Transfer</option>
                  <option value="check">Check</option>
                  <option value="paypal">PayPal</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleMarkPaid}
                className="flex-1 bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 transition"
              >
                Confirm Paid
              </button>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 bg-slate-200 text-slate-900 py-2 rounded-lg font-medium hover:bg-slate-300 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
