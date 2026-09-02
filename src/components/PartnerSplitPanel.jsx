import { useEffect, useMemo, useState } from 'react'
import { money } from '../lib/queries'
import {
  overall,
  payoutDrift,
  periodLabel,
  periodStart,
  periodsPresent,
  statement,
} from '../lib/partnerSplit'
import {
  addPayout,
  deletePayout,
  fetchSplitPercent,
  saveSplitPercent,
} from '../lib/partnerData'
import { Badge, Button, Card, Field, Input, Select, StatCard } from './ui'

// The month's statement, and the payment it justifies.
//
// The whole design goal is that a payout is never a number somebody has to
// take on trust. Every line of the arithmetic is on screen, in the order it
// happens, with the count of things behind each figure -- so "you owe Ethan
// $X" can be checked in ten seconds by the person receiving it. A split that
// cannot be audited by both partners is a split that eventually gets argued
// about.

function Line({ label, value, sub, strong, negative, rule }) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-1.5 ${
        rule ? 'border-t border-slate-300 mt-1 pt-2' : ''
      }`}
    >
      <span className={`min-w-0 text-sm ${strong ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
        {label}
        {sub && <span className="ml-1.5 text-[11px] text-slate-400">{sub}</span>}
      </span>
      <span
        className={`flex-shrink-0 tabular-nums ${
          strong ? 'text-base font-bold text-slate-900' : 'text-sm text-slate-700'
        } ${negative ? 'text-red-700' : ''}`}
      >
        {negative ? `− ${money(Math.abs(value))}` : money(value)}
      </span>
    </div>
  )
}

function RecordPayout({ stmt, partner, onDone }) {
  const outstanding = stmt.outstanding[partner]
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const start = () => {
    // Prefilled with what is owed, because that is the number nine times out
    // of ten -- but editable, because what actually left the bank is the fact
    // worth recording, not what should have.
    setAmount(outstanding > 0 ? String(outstanding.toFixed(2)) : '')
    setOpen(true)
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!(Number(amount) > 0)) return setError('Amount has to be more than zero.')
    setSaving(true)
    try {
      await addPayout({
        period: periodStart(stmt.period),
        partner,
        amount: Number(amount),
        paidOn,
        method,
        basis: {
          collected: stmt.collected,
          sharedExpenses: stmt.sharedExpenses,
          net: stmt.net,
          splitPercent: stmt.splitPercent,
          reimbursement: stmt.fronted[partner],
        },
      })
      setOpen(false)
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <Button variant="dark" onClick={start} disabled={outstanding === 0}>
        {outstanding > 0
          ? `Record a payment to ${partner === 'ethan' ? 'Ethan' : 'yourself'}`
          : 'Settled'}
      </Button>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Amount sent" required>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoFocus />
        </Field>
        <Field label="Date sent">
          <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
        <Field label="How" hint="optional">
          <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Zelle" />
        </Field>
      </div>

      <p className="text-[11px] text-slate-500">
        This also records the arithmetic above — {money(stmt.collected)} in, {money(stmt.sharedExpenses)}{' '}
        out, {money(stmt.net)} net at {stmt.splitPercent}%. If an expense is back-dated into this
        month later, the statement will show that rather than quietly restating what you agreed.
      </p>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" variant="dark" disabled={saving}>
          {saving ? 'Saving…' : 'Record it'}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export default function PartnerSplitPanel({ payments, expenses, payouts, onChanged }) {
  const [splitPercent, setSplitPercent] = useState(50)
  const [editingSplit, setEditingSplit] = useState(false)
  const [splitDraft, setSplitDraft] = useState('50')
  const [period, setPeriod] = useState('')

  useEffect(() => {
    fetchSplitPercent().then((p) => {
      setSplitPercent(p)
      setSplitDraft(String(p))
    })
  }, [])

  const periods = useMemo(
    () => periodsPresent({ payments, expenses, payouts }),
    [payments, expenses, payouts]
  )

  // Default to the newest month with anything in it, but only once — changing
  // it out from under someone who picked a month would be worse than useless.
  useEffect(() => {
    if (!period && periods.length > 0) setPeriod(periods[0])
  }, [periods, period])

  const totals = useMemo(
    () => overall({ payments, expenses, payouts, splitPercent }),
    [payments, expenses, payouts, splitPercent]
  )

  const stmt = useMemo(
    () => (period ? statement({ period, payments, expenses, payouts, splitPercent }) : null),
    [period, payments, expenses, payouts, splitPercent]
  )

  const periodPayouts = useMemo(
    () => payouts.filter((p) => String(p.period).slice(0, 7) === period),
    [payouts, period]
  )

  const saveSplit = async () => {
    const n = Number(splitDraft)
    if (!(n > 0 && n < 100)) return
    await saveSplitPercent(n)
    setSplitPercent(n)
    setEditingSplit(false)
  }

  const removePayout = async (id) => {
    if (!confirm('Remove this recorded payment? It does not move any money — it only removes the record.')) return
    await deletePayout(id)
    onChanged()
  }

  return (
    <div className="mb-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <StatCard label="Collected all time" value={money(totals.collected)} sub="cash in" />
        <StatCard label="Expenses" value={money(totals.sharedExpenses)} sub="shared, off the top" />
        <StatCard label="Net profit" value={money(totals.net)} sub="what gets split" />
        <StatCard
          label="Owed to Ethan"
          value={money(totals.outstandingEthan)}
          sub={`${money(totals.paidEthan)} already sent`}
          alert={totals.outstandingEthan > 0}
        />
      </div>

      {totals.unbalanced.length > 0 && (
        <Card tone="danger" padding="lg">
          <p className="text-sm font-semibold text-red-800">
            {totals.unbalanced.length} month{totals.unbalanced.length === 1 ? '' : 's'} do not
            balance: {totals.unbalanced.join(', ')}
          </p>
          <p className="mt-1 text-xs text-red-700">
            What the two partners are owed does not add up to what the business account did. That is
            a data problem rather than a rounding one — do not pay from these until it is found.
          </p>
        </Card>
      )}

      <Card padding="lg">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-slate-900">The split, month by month</h3>
            <p className="mt-0.5 text-sm text-slate-600">
              Cash basis: what actually came in and went out that month. Every line is shown so the
              payout can be checked rather than trusted.
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            {editingSplit ? (
              <>
                <Input
                  value={splitDraft}
                  onChange={(e) => setSplitDraft(e.target.value)}
                  inputMode="decimal"
                  className="w-20"
                />
                <Button variant="dark" size="sm" onClick={saveSplit}>
                  Save
                </Button>
              </>
            ) : (
              <button
                onClick={() => setEditingSplit(true)}
                className="text-xs text-slate-500 underline hover:text-slate-800"
                title="Ethan's percentage. The other partner takes the remainder."
              >
                {splitPercent}/{100 - splitPercent} split
              </button>
            )}
            {periods.length > 0 && (
              <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-auto">
                {periods.map((p) => (
                  <option key={p} value={p}>
                    {periodLabel(p)}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </div>

        {!stmt ? (
          <p className="py-4 text-center text-sm text-slate-500">
            No months with any money in them yet.
          </p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {stmt.label}
              </p>

              <Line
                label="Collected"
                sub={`${stmt.collectedCount} payment${stmt.collectedCount === 1 ? '' : 's'}`}
                value={stmt.collected}
              />
              <Line
                label="Shared expenses"
                sub={`${stmt.sharedExpenseRows.length} item${stmt.sharedExpenseRows.length === 1 ? '' : 's'}`}
                value={stmt.sharedExpenses}
                negative
              />
              <Line label="Net profit" value={stmt.net} strong rule />

              <div className="mt-3 space-y-0.5">
                <Line label={`Ethan's ${stmt.splitPercent}%`} value={stmt.shares.ethan} />
                <Line label={`Your ${100 - stmt.splitPercent}%`} value={stmt.shares.me} />
              </div>

              {(stmt.fronted.ethan > 0 || stmt.fronted.me > 0) && (
                <div className="mt-3 rounded-lg bg-slate-50 p-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Paid out of pocket, owed back
                  </p>
                  {stmt.fronted.ethan > 0 && <Line label="Ethan fronted" value={stmt.fronted.ethan} />}
                  {stmt.fronted.me > 0 && <Line label="You fronted" value={stmt.fronted.me} />}
                </div>
              )}

              {stmt.personalExpenses > 0 && (
                <p className="mt-2 text-[11px] text-slate-500">
                  {money(stmt.personalExpenses)} of personal costs recorded this month and
                  deliberately left out of the split.
                </p>
              )}
            </div>

            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Settlement
              </p>

              <Line label="Ethan is owed" value={stmt.owed.ethan} strong />
              <Line label="Already sent" value={stmt.paid.ethan} />
              <Line
                label={stmt.outstanding.ethan < 0 ? 'Overpaid' : 'Still to send'}
                value={Math.abs(stmt.outstanding.ethan)}
                strong
                rule
              />

              {stmt.outstanding.ethan < 0 && (
                <p className="mt-1 text-[11px] text-amber-800">
                  Ethan has had {money(Math.abs(stmt.outstanding.ethan))} more than this month
                  works out to. Carry it against next month rather than asking for it back.
                </p>
              )}

              <div className="mt-4">
                <RecordPayout stmt={stmt} partner="ethan" onDone={onChanged} />
              </div>

              {periodPayouts.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Recorded this month
                  </p>
                  <div className="space-y-1">
                    {periodPayouts.map((p) => {
                      const drift = payoutDrift(p, stmt)
                      return (
                        <div key={p.id} className="rounded-lg border border-slate-200 px-2.5 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold tabular-nums text-slate-900">
                              {money(p.amount)}
                            </span>
                            <span className="text-xs text-slate-500">
                              to {p.partner === 'ethan' ? 'Ethan' : 'you'} · {p.paid_on}
                            </span>
                            {p.method && (
                              <Badge tone="neutral" className="capitalize">
                                {p.method}
                              </Badge>
                            )}
                            <button
                              onClick={() => removePayout(p.id)}
                              className="ml-auto text-xs text-slate-400 hover:text-red-600"
                              title="Remove the record"
                            >
                              ✕
                            </button>
                          </div>

                          {/* The reason the basis is stored. Two people agreed a
                              number; if the month has moved since, say so
                              instead of pretending it always said this. */}
                          {drift && (
                            <p className="mt-1.5 border-t border-slate-100 pt-1.5 text-[11px] text-amber-900">
                              Agreed when the net was {money(drift.wasNet)}. It is now{' '}
                              {money(drift.nowNet)} — a change of{' '}
                              {drift.difference < 0 ? '−' : '+'}
                              {money(Math.abs(drift.difference))}, because something was added to
                              this month afterwards. The payment itself is unchanged.
                            </p>
                          )}
                          {p.method === 'migrated' && (
                            <p className="mt-1.5 border-t border-slate-100 pt-1.5 text-[11px] text-slate-500">
                              Carried over from the old per-payment split, so it has no monthly
                              basis to compare against.
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
