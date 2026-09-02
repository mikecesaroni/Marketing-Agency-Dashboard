import { useMemo, useState } from 'react'
import { money } from '../lib/queries'
import {
  EXPENSE_CATEGORIES,
  PAID_BY,
  expensesByPayee,
  periodOf,
  periodLabel,
} from '../lib/partnerSplit'
import { addExpense, deleteExpense } from '../lib/partnerData'
import { Badge, Button, Card, Field, Input, Select, Textarea } from './ui'

// What the business spent, and on whom.
//
// The bar to clear is that logging a cost has to be faster than not logging it.
// A form that asks eight questions gets used twice and then the real numbers
// live in somebody's texts -- so the form is one row wide, defaults to today,
// to an employee, to shared, and to the business account. Payee is free text
// on purpose: making someone create an employee record before they can write
// down that they paid Sam $400 is exactly the friction that kills this.

const PAID_BY_LABEL = {
  business: 'Business account',
  me: 'I paid personally',
  ethan: 'Ethan paid personally',
}

function ExpenseRow({ expense, onDeleted }) {
  const [busy, setBusy] = useState(false)

  const remove = async () => {
    if (!confirm(`Delete the ${money(expense.amount)} to ${expense.payee}?`)) return
    setBusy(true)
    try {
      await deleteExpense(expense.id)
      onDeleted()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-1 py-2 last:border-0">
      <span className="w-20 flex-shrink-0 text-xs tabular-nums text-slate-500">
        {expense.spent_on}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
        {expense.payee}
      </span>
      <Badge tone="neutral" className="flex-shrink-0 capitalize">
        {expense.category}
      </Badge>
      {expense.shared === false && (
        <Badge tone="warning" className="flex-shrink-0">
          not in the split
        </Badge>
      )}
      {expense.paid_by !== 'business' && (
        <Badge tone="info" className="flex-shrink-0">
          {expense.paid_by === 'ethan' ? 'Ethan fronted' : 'you fronted'}
        </Badge>
      )}
      {expense.clients?.name && (
        <span className="flex-shrink-0 text-[11px] text-slate-400">{expense.clients.name}</span>
      )}
      <span className="w-24 flex-shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">
        {money(expense.amount)}
      </span>
      <button
        onClick={remove}
        disabled={busy}
        className="flex-shrink-0 text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
        title="Delete"
      >
        ✕
      </button>
    </div>
  )
}

export default function ExpensesPanel({ expenses, clients = [], onChanged }) {
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [monthFilter, setMonthFilter] = useState('all')

  const blank = {
    spent_on: new Date().toISOString().slice(0, 10),
    amount: '',
    payee: '',
    category: 'employee',
    shared: true,
    paid_by: 'business',
    client_id: '',
    notes: '',
  }
  const [form, setForm] = useState(blank)
  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const months = useMemo(() => {
    const keys = new Set(expenses.map((e) => periodOf(e.spent_on)).filter(Boolean))
    return [...keys].sort().reverse()
  }, [expenses])

  const shown = useMemo(
    () => (monthFilter === 'all' ? expenses : expenses.filter((e) => periodOf(e.spent_on) === monthFilter)),
    [expenses, monthFilter]
  )

  const byPayee = useMemo(() => expensesByPayee(shown), [shown])
  const total = shown.reduce((t, e) => t + Number(e.amount || 0), 0)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.payee.trim()) return setError('Who was paid?')
    if (!(Number(form.amount) > 0)) return setError('Amount has to be more than zero.')

    setSaving(true)
    try {
      await addExpense(form)
      setForm({ ...blank, spent_on: form.spent_on, payee: '', amount: '' })
      setAdding(false)
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card padding="lg" className="mb-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-900">Expenses</h3>
          <p className="mt-0.5 text-sm text-slate-600">
            What the business paid out. Everything marked shared comes off the top before the
            split.
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {months.length > 0 && (
            <Select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="w-auto">
              <option value="all">All time</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {periodLabel(m)}
                </option>
              ))}
            </Select>
          )}
          <Button variant={adding ? 'outline' : 'dark'} onClick={() => setAdding(!adding)}>
            {adding ? 'Cancel' : '+ Expense'}
          </Button>
        </div>
      </div>

      {adding && (
        <form onSubmit={submit} className="mb-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Paid to" required>
              <Input value={form.payee} onChange={set('payee')} placeholder="Sam" autoFocus />
            </Field>
            <Field label="Amount" required>
              <Input value={form.amount} onChange={set('amount')} inputMode="decimal" placeholder="400.00" />
            </Field>
            <Field label="Date">
              <Input type="date" value={form.spent_on} onChange={set('spent_on')} />
            </Field>
            <Field label="Category">
              <Select value={form.category} onChange={set('category')} className="capitalize">
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Paid from" hint="who was actually out of pocket">
              <Select value={form.paid_by} onChange={set('paid_by')}>
                {PAID_BY.map((p) => (
                  <option key={p} value={p}>
                    {PAID_BY_LABEL[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="For a client" hint="optional">
              <Select value={form.client_id} onChange={set('client_id')}>
                <option value="">Not client-specific</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notes" hint="optional">
              <Textarea rows={1} value={form.notes} onChange={set('notes')} />
            </Field>
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.shared}
              onChange={set('shared')}
              className="mt-0.5 h-4 w-4 flex-shrink-0 rounded"
            />
            <span>
              Comes off before the 50/50
              <span className="block text-[11px] text-slate-500">
                Untick for something one of you is carrying alone — it stays recorded but does not
                touch the other partner&rsquo;s share.
              </span>
            </span>
          </label>

          {/* The one combination the split cannot attribute: the business paid
              for something the split is not sharing, which is a draw against
              one partner rather than a cost. Flagged rather than forbidden. */}
          {!form.shared && form.paid_by === 'business' && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
              The business paid for something that is not being shared. That is really a draw
              against whoever it was for, and the split cannot tell whose it was — so it will be
              left out of the statement entirely rather than guessed at.
            </p>
          )}

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
          )}

          <Button type="submit" variant="dark" disabled={saving}>
            {saving ? 'Saving…' : 'Add expense'}
          </Button>
        </form>
      )}

      {shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">
          {expenses.length === 0
            ? 'Nothing logged yet. Add what you have paid out and the split starts accounting for it.'
            : 'Nothing in that month.'}
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <span className="font-semibold text-slate-900">{money(total)}</span>
            <span className="text-slate-500">
              across {shown.length} {shown.length === 1 ? 'expense' : 'expenses'}
            </span>
            {byPayee.slice(0, 4).map((r) => (
              <span key={r.payee} className="text-xs text-slate-500">
                {r.payee} {money(r.total)}
              </span>
            ))}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {shown.map((e) => (
              <ExpenseRow key={e.id} expense={e} onDeleted={onChanged} />
            ))}
          </div>
        </>
      )}
    </Card>
  )
}
