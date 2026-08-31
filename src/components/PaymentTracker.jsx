import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Modal from './Modal'
import { StripeLinkButtons } from './StripePanel'
import { formatDate, isOverdue, money, today } from '../lib/queries'

const METHODS = ['card', 'ach', 'check', 'paypal', 'other']

// Every client is on the same 12-month agreement, so the schedule length isn't
// something worth asking about each time.
const MONTHS = 12

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

function monthLabel(dueDate) {
  return new Date(`${dueDate}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

export default function PaymentTracker({ client, onClientUpdate }) {
  const clientId = client.id

  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showBilling, setShowBilling] = useState(false)
  const [billing, setBilling] = useState({
    setupFee: '',
    setupPaid: false,
    splitSetup: false,
    setup1Amount: '',
    setup1Date: today(),
    setup1Paid: false,
    setup2Amount: '',
    setup2Date: today(),
    setup2Paid: false,
    monthlyFee: '',
    firstPaymentDate: today(),
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
    const [first, second] = setupPayments
    setBilling({
      setupFee: client.setup_fee ? String(client.setup_fee) : '',
      setupPaid: first?.status === 'paid',
      splitSetup: setupPayments.length > 1,
      setup1Amount: first ? String(first.amount) : '',
      setup1Date: first?.due_date || today(),
      setup1Paid: first?.status === 'paid',
      setup2Amount: second ? String(second.amount) : '',
      setup2Date: second?.due_date || today(),
      setup2Paid: second?.status === 'paid',
      monthlyFee: client.monthly_fee ? String(client.monthly_fee) : '998',
      firstPaymentDate:
        monthlyPayments[0]?.due_date || client.contract_start_date || today(),
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

    try {
      const { error: delErr } = await supabase
        .from('payments')
        .delete()
        .eq('client_id', clientId)
        .neq('status', 'paid')
      if (delErr) throw delErr

      const paid = payments.filter((p) => p.status === 'paid')
      const paidSetupRows = paid.filter((p) => p.payment_type === 'setup')
      const paidMonthlyDates = new Set(
        paid.filter((p) => p.payment_type === 'monthly').map((p) => p.due_date)
      )

      // One row when the fee is taken in full, two when it's split. Parts the
      // form marks paid and that already exist in the database are consumed in
      // order rather than written again, so reopening Billing Setup to change
      // something else doesn't duplicate money already collected.
      const parts = billing.splitSetup
        ? [
            {
              amount: parseFloat(billing.setup1Amount) || 0,
              due: billing.setup1Date,
              paid: billing.setup1Paid,
            },
            {
              amount: parseFloat(billing.setup2Amount) || 0,
              due: billing.setup2Date,
              paid: billing.setup2Paid,
            },
          ]
        : [{ amount: setupFee, due: today(), paid: billing.setupPaid }]

      const rows = []
      let paidCursor = 0

      for (const part of parts) {
        if (part.amount <= 0) continue

        if (part.paid) {
          if (paidCursor < paidSetupRows.length) {
            paidCursor++
            continue
          }
          rows.push({
            client_id: clientId,
            payment_type: 'setup',
            amount: part.amount,
            due_date: part.due,
            status: 'paid',
            paid_date: part.due,
          })
        } else {
          rows.push({
            client_id: clientId,
            payment_type: 'setup',
            amount: part.amount,
            due_date: part.due,
            status: 'pending',
            paid_date: null,
          })
        }
      }
      for (let i = 0; i < MONTHS; i++) {
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

  const setupPayments = payments.filter((p) => p.payment_type === 'setup')
  const monthlyPayments = payments.filter((p) => p.payment_type === 'monthly')
  const totalPaid = payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0)
  // Falls back to the schedule itself for clients billed before monthly_fee
  // was recorded on the client row.
  const monthlyAmount = client.monthly_fee || monthlyPayments[0]?.amount || 0
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

      {/* Send these instead of the raw Stripe links: they carry the client's ID,
          which is the only thing that tells the webhook whose payment it is. */}
      <div className="mb-4">
        <StripeLinkButtons
          clientId={clientId}
          stripeCustomerId={client.stripe_customer_id}
          monthlyFee={monthlyAmount}
        />
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
            created — no need to wait for their ads to go live.
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
              <p className="text-xs text-blue-600 font-medium">Monthly Payment</p>
              {/* Their whole monthly total, whatever the package includes. */}
              <p className="text-xl font-bold text-blue-900">{money(monthlyAmount)}</p>
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

          {setupPayments.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold text-slate-900 mb-2">Setup Fee</h3>
              <div className="space-y-2">
                {setupPayments.map((p, i) => (
                  <PaymentRow
                    key={p.id}
                    payment={p}
                    label={
                      setupPayments.length > 1
                        ? `Setup fee — part ${i + 1} of ${setupPayments.length}`
                        : 'Setup fee'
                    }
                  />
                ))}
              </div>
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
                  label={monthLabel(p.due_date)}
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
                Paid?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: true, label: 'Yes' },
                  { value: false, label: 'No' },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setBilling((b) => ({ ...b, setupPaid: opt.value }))}
                    className={`py-2.5 rounded-lg text-sm font-medium border transition ${
                      billing.setupPaid === opt.value
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-1">Has it been collected already?</p>
            </div>
          </div>

          {parseFloat(billing.setupFee) > 0 && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={billing.splitSetup}
                onChange={(e) => {
                  const on = e.target.checked
                  const total = parseFloat(billing.setupFee) || 0
                  // Prefill an even split so the common case is one click.
                  const half = Math.round((total / 2) * 100) / 100
                  setBilling((b) => ({
                    ...b,
                    splitSetup: on,
                    setup1Amount: b.setup1Amount || String(half),
                    setup2Amount: b.setup2Amount || String(Math.round((total - half) * 100) / 100),
                    setup1Paid: b.setupPaid,
                  }))
                }}
              />
              Split the setup fee into two payments
            </label>
          )}

          {billing.splitSetup && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-4">
              {[1, 2].map((n) => (
                <div key={n}>
                  <p className="text-xs font-semibold text-slate-700 uppercase mb-2">
                    Payment {n}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Amount ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={billing[`setup${n}Amount`]}
                        onChange={(e) =>
                          setBilling((b) => ({ ...b, [`setup${n}Amount`]: e.target.value }))
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Due date
                      </label>
                      <input
                        type="date"
                        value={billing[`setup${n}Date`]}
                        onChange={(e) =>
                          setBilling((b) => ({ ...b, [`setup${n}Date`]: e.target.value }))
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {[
                      { value: true, label: 'Paid' },
                      { value: false, label: 'Not yet' },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() =>
                          setBilling((b) => ({ ...b, [`setup${n}Paid`]: opt.value }))
                        }
                        className={`py-2 rounded-lg text-xs font-medium border transition ${
                          billing[`setup${n}Paid`] === opt.value
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {(() => {
                const total = parseFloat(billing.setupFee) || 0
                const split =
                  (parseFloat(billing.setup1Amount) || 0) +
                  (parseFloat(billing.setup2Amount) || 0)
                const diff = Math.round((split - total) * 100) / 100
                // A silent mismatch between the parts and the stated fee is how
                // you end up under-billing without noticing.
                return diff !== 0 ? (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                    The two parts add up to {money(split)}, but the setup fee is{' '}
                    {money(total)} ({diff > 0 ? 'over' : 'under'} by {money(Math.abs(diff))}).
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">Parts add up to {money(total)}.</p>
                )
              })()}
            </div>
          )}

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

          <p className="text-xs text-slate-500">
            Bills the same day each month for {MONTHS} months, starting from the first payment
            date.
          </p>

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
