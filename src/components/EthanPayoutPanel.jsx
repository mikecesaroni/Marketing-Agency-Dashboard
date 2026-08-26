import { useEffect, useMemo, useState } from 'react'
import { money, today } from '../lib/queries'
import {
  fetchSplitPercent,
  markPaidOut,
  saveSplitPercent,
  suggestedSplit,
  unmarkPaidOut,
} from '../lib/ethanPayouts'

/**
 * Reconciles a second question against every paid client payment: has Ethan
 * actually received his cut of it yet. That is separate from payments.status
 * — a payment can be paid by the client and still owe Ethan a split, so this
 * lives as its own panel rather than another button on the payment row.
 *
 * The default posture is "pay out everything owed" — every owed row starts
 * selected, with one date and one click to clear the whole list. Anything
 * that shouldn't go out this round gets unchecked by hand instead of the
 * other way around, since that is the less common case.
 */
export default function EthanPayoutPanel({ payments, onChange }) {
  const [open, setOpen] = useState(false)
  const [percent, setPercent] = useState(50)
  const [percentDraft, setPercentDraft] = useState('50')
  const [percentSaved, setPercentSaved] = useState(false)
  // Hand-typed overrides, keyed by payment id. Anything not in here falls
  // back to the split percent's suggestion.
  const [amounts, setAmounts] = useState({})
  const [selected, setSelected] = useState(() => new Set())
  const [payDate, setPayDate] = useState(today())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    fetchSplitPercent()
      .then((p) => {
        setPercent(p)
        setPercentDraft(String(p))
      })
      .catch(() => {})
  }, [])

  const owed = useMemo(
    () =>
      payments
        .filter((p) => p.status === 'paid' && !p.ethan_paid_out)
        .sort((a, b) => (a.paid_date || '').localeCompare(b.paid_date || '')),
    [payments]
  )
  const paidOut = useMemo(
    () =>
      payments
        .filter((p) => p.ethan_paid_out)
        .sort((a, b) => (b.ethan_paid_out_date || '').localeCompare(a.ethan_paid_out_date || '')),
    [payments]
  )
  const owedIds = owed.map((p) => p.id).join(',')

  // Reselects everything whenever the owed list changes shape — a fresh
  // payment landing, or one just getting marked and dropping out — so the
  // list is always "everything still open" unless someone has touched a box.
  useEffect(() => {
    setSelected(new Set(owed.map((p) => p.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owedIds])

  const amountFor = (p) => amounts[p.id] ?? suggestedSplit(p, percent).toFixed(2)

  const totalSelected = owed
    .filter((p) => selected.has(p.id))
    .reduce((sum, p) => sum + (parseFloat(amountFor(p)) || 0), 0)

  const totalOwed = owed.reduce((sum, p) => sum + (parseFloat(amountFor(p)) || 0), 0)

  const toggle = (id) => {
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((s) => (s.size === owed.length ? new Set() : new Set(owed.map((p) => p.id))))
  }

  const savePercent = async () => {
    const n = parseFloat(percentDraft)
    if (!Number.isFinite(n) || n <= 0 || n > 100) {
      setError('Split percent must be a number between 0 and 100')
      return
    }
    setError('')
    try {
      await saveSplitPercent(n)
      setPercent(n)
      // A row someone hand-edited under the old percent is indistinguishable
      // from one that was just never touched, so the simple rule wins: a
      // percent change re-suggests every row that isn't marked paid out yet.
      setAmounts({})
      setPercentSaved(true)
      setTimeout(() => setPercentSaved(false), 1500)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleMark = async () => {
    const rows = owed
      .filter((p) => selected.has(p.id))
      .map((p) => ({ id: p.id, amount: parseFloat(amountFor(p)) || 0 }))
    if (rows.length === 0) return
    setBusy(true)
    setError('')
    try {
      await markPaidOut(rows, payDate)
      setAmounts({})
      onChange?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleUnmark = async (id) => {
    setBusy(true)
    setError('')
    try {
      await unmarkPaidOut(id)
      onChange?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl mb-4 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left"
      >
        <span className="font-semibold text-slate-900">
          🤝 Paid out to Ethan
          <span className="ml-1.5 text-sm font-normal text-slate-500">
            {owed.length === 0 ? 'all reconciled' : `${money(totalOwed)} owed`}
          </span>
        </span>
        <span className="text-slate-400 text-sm">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-200 p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Ethan&rsquo;s split
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={percentDraft}
                  onChange={(e) => setPercentDraft(e.target.value)}
                  className="w-20 px-2 py-1.5 border border-slate-300 rounded text-sm"
                />
                <span className="text-sm text-slate-500">%</span>
              </div>
            </div>
            <button
              onClick={savePercent}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                percentSaved ? 'bg-green-600 text-white' : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              {percentSaved ? '✓ Saved' : 'Save'}
            </button>
            <p className="text-xs text-slate-500 pb-1.5">
              Suggests each row&rsquo;s amount below. Edit any row by hand before marking it, the
              exact figure sent is what gets kept.
            </p>
          </div>

          {owed.length === 0 ? (
            <p className="text-xs text-slate-500">
              Nothing owed. Every paid client payment has already been reconciled with Ethan.
            </p>
          ) : (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                  <input type="checkbox" checked={selected.size === owed.length} onChange={toggleAll} />
                  Select all ({owed.length})
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="px-2 py-1.5 border border-slate-300 rounded text-xs"
                  />
                  <button
                    onClick={handleMark}
                    disabled={busy || selected.size === 0}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition whitespace-nowrap"
                  >
                    Mark {selected.size} paid out · {money(totalSelected)}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                {owed.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {p.clients?.name || 'Unknown client'}
                        <span className="ml-1.5 text-[10px] font-bold uppercase text-slate-400">
                          {p.payment_type}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {money(p.amount)} paid {p.paid_date}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-xs text-slate-400">$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={amountFor(p)}
                        onChange={(e) => setAmounts((a) => ({ ...a, [p.id]: e.target.value }))}
                        className="w-20 px-1.5 py-1 border border-slate-300 rounded text-xs text-right"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-slate-200">
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              {showHistory ? 'Hide' : 'Show'} paid-out history ({paidOut.length})
            </button>
            {showHistory && (
              <div className="space-y-1.5 mt-2">
                {paidOut.length === 0 ? (
                  <p className="text-xs text-slate-500">Nothing marked yet.</p>
                ) : (
                  paidOut.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-2 p-2 bg-green-50/60 border border-green-200 rounded-lg"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {p.clients?.name || 'Unknown client'}
                          <span className="ml-1.5 text-[10px] font-bold uppercase text-slate-400">
                            {p.payment_type}
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {money(p.ethan_payout_amount)} sent {p.ethan_paid_out_date}
                        </p>
                      </div>
                      <button
                        onClick={() => handleUnmark(p.id)}
                        disabled={busy}
                        className="px-2 py-1 text-[11px] font-medium bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition flex-shrink-0"
                      >
                        Undo
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
