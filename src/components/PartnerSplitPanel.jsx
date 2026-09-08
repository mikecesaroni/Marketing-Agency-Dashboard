import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { money } from '../lib/queries'
import { countedByClient, ledger, payoutPreview } from '../lib/partnerSplit'
import {
  addPayout,
  deletePayout,
  fetchSplitPercent,
  saveSplitPercent,
} from '../lib/partnerData'
import { Badge, Button, Card, Field, Input, StatCard } from './ui'

// The split with Ethan, answering three questions and nothing else on the
// first screen:
//
//   1. What is owed to Ethan right now, and from which clients.
//   2. What has already been paid to him, and which client payments each
//      transfer covered.
//   3. Every client payment, with its client, its date, Ethan's share of it,
//      and whether that share has been paid or is still owed.
//
// The arithmetic behind the numbers (collected, less costs, split, less sent)
// is still all here, folded away under "How this is worked out", because the
// balance must never be a number somebody has to take on trust -- but it is
// the audit trail, not the headline.
//
// SETTLING UP IS THE SAME ARITHMETIC OVER FEWER ROWS. Every owed payment
// starts ticked; the "Send" button's amount is `payoutPreview` over exactly
// the ticked ones, which is the same `ledger` that produces the balance, so
// the two cannot disagree. Untick a payment to hold it back.

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

function RecordPayout({ preview, onDone }) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const start = () => {
    setAmount(preview.amount > 0 ? String(preview.amount.toFixed(2)) : '')
    setOpen(true)
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!(Number(amount) > 0)) return setError('Amount has to be more than zero.')
    setSaving(true)
    try {
      await addPayout({
        partner: 'ethan',
        amount: Number(amount),
        paidOn,
        method,
        paymentIds: preview.paymentIds,
        expenseIds: preview.expenseIds,
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
      <Button variant="dark" onClick={start} disabled={preview.count === 0 || preview.negative}>
        {preview.count === 0
          ? 'Tick the payments to pay out'
          : `Record ${money(preview.amount)} paid to Ethan`}
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
        Marks the {preview.count} ticked {preview.count === 1 ? 'payment' : 'payments'} as paid to Ethan
        {preview.expensesDeducted > 0 && `, along with ${money(preview.expensesDeducted)} of costs`}.
        To undo it, remove the transfer from the &ldquo;Paid to Ethan Already&rdquo; list.
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

function ClientName({ name, clientId, className = '' }) {
  return clientId ? (
    <Link to={`/client/${clientId}`} className={`hover:text-blue-600 ${className}`}>
      {name}
    </Link>
  ) : (
    <span className={className}>{name}</span>
  )
}

/**
 * One transfer to Ethan and the client payments it covered, always open:
 * "$3,498 to Ethan" is not checkable, "$3,498, being half of these four" is.
 */
function PaidRow({ entry, onDelete }) {
  const off = Math.abs(entry.difference) >= 0.01
  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <span className="text-base font-bold tabular-nums text-slate-900">{money(entry.amount)}</span>
        <span className="text-xs text-slate-500">paid {entry.paidOn}</span>
        {entry.method && (
          <Badge tone="neutral" className="capitalize">
            {entry.method}
          </Badge>
        )}
        <span className="text-[11px] text-slate-400">
          {entry.covers === 0
            ? 'no payments recorded against it'
            : `covers ${entry.payments.length} client ${entry.payments.length === 1 ? 'payment' : 'payments'}${
                entry.costs.length > 0 ? ` and ${entry.costs.length} cost${entry.costs.length === 1 ? '' : 's'}` : ''
              }`}
        </span>
        <button
          onClick={() => onDelete(entry)}
          className="ml-auto flex-shrink-0 text-[11px] text-slate-400 underline hover:text-red-600"
          title="No money moves. The record goes and these payments go back to owed."
        >
          Remove
        </button>
      </div>

      {entry.covers > 0 && (
        <div className="border-t border-slate-200 bg-slate-50/60 px-3 py-1">
          {entry.payments.map((r) => (
            <div key={r.id} className="flex items-center gap-x-3 border-b border-slate-200/70 py-1 last:border-0">
              <span className="w-20 flex-shrink-0 text-[11px] tabular-nums text-slate-500">{r.paidDate}</span>
              <ClientName name={r.client} clientId={r.clientId} className="min-w-0 flex-1 text-xs font-medium leading-tight text-slate-800" />
              {r.type && <span className="hidden sm:block flex-shrink-0 text-[10px] uppercase text-slate-400">{r.type}</span>}
              <span className="hidden sm:block w-20 flex-shrink-0 text-right text-xs tabular-nums text-slate-600">{money(r.amount)}</span>
              <span className="w-20 sm:w-24 flex-shrink-0 text-right text-xs font-medium tabular-nums text-slate-900">
                {money(r.ethanCut)}
              </span>
            </div>
          ))}
          {entry.costs.map((c) => (
            <div key={c.id} className="flex items-center gap-x-3 border-b border-slate-200/70 py-1 last:border-0">
              <span className="w-20 flex-shrink-0 text-[11px] tabular-nums text-slate-500">{c.spentOn}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-600">
                {c.payee}
                {c.frontedByEthan && <span className="ml-1 text-[10px] text-slate-400">Ethan fronted it</span>}
              </span>
              <span className="w-20 sm:w-24 flex-shrink-0 text-right text-xs tabular-nums text-red-700">− {money(c.amount)}</span>
              <span className="hidden sm:block w-20 flex-shrink-0" />
            </div>
          ))}
          {off && (
            <p className="py-1 text-[11px] text-amber-800">
              These rows come to {money(entry.entitled)} for Ethan; {money(entry.amount)} was sent.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * What is owed, client by client. Each client opens to its payments. Tick
 * boxes decide what the next transfer covers; everything starts ticked.
 */
function OwedByClient({ book, preview, selected, onToggle, onToggleGroup, onSelectAll, onClear, onDone }) {
  const [open, setOpen] = useState(() => new Set())
  const groups = useMemo(() => countedByClient(book.counted).filter((g) => g.openCount > 0), [book.counted])

  const toggleOpen = (client) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(client)) next.delete(client)
      else next.add(client)
      return next
    })

  const tickable = book.counted.filter((r) => !r.settled).map((r) => r.id)
  const ticked = tickable.filter((id) => selected.has(id)).length
  const allTicked = tickable.length > 0 && ticked === tickable.length

  return (
    <Card padding="lg">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Owed to Ethan, by client</h3>
          <p className="mt-0.5 text-sm text-slate-600">
            {book.unsettledCount === 0
              ? 'Every collected payment has been paid out. Nothing owed.'
              : `${book.unsettledCount} collected ${book.unsettledCount === 1 ? 'payment' : 'payments'} not yet paid out to Ethan. Open a client to see each one.`}
          </p>
        </div>
        {book.unsettledCount > 0 && <RecordPayout preview={preview} onDone={onDone} />}
      </div>

      {groups.length > 0 && (
        <>
          <label className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <input
              type="checkbox"
              checked={allTicked}
              ref={(el) => {
                if (el) el.indeterminate = ticked > 0 && !allTicked
              }}
              onChange={() => (allTicked ? onClear() : onSelectAll())}
              className="h-4 w-4 flex-shrink-0 rounded"
            />
            <span className="text-sm text-slate-700">
              {ticked === tickable.length ? 'All' : ticked} of {tickable.length} ticked for the next payout
            </span>
            <span className="ml-auto text-sm tabular-nums">
              {preview.negative ? (
                <span className="text-amber-800">short by {money(Math.abs(preview.amount))}</span>
              ) : (
                <>
                  <span className="font-semibold text-slate-900">{money(preview.amount)}</span>
                  <span className="text-slate-500"> to send</span>
                </>
              )}
            </span>
          </label>

          <div className="hidden sm:flex items-center gap-x-3 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <span className="w-4 flex-shrink-0" />
            <span className="min-w-0 flex-1">Client</span>
            <span className="hidden sm:block w-24 flex-shrink-0 text-right">Collected</span>
            <span className="w-24 sm:w-28 flex-shrink-0 text-right">Owed to Ethan</span>
            <span className="w-6 flex-shrink-0" />
          </div>

          <div className="space-y-1.5">
            {groups.map((g) => {
              const isOpen = open.has(g.client)
              const rows = book.counted.filter((r) => r.client === g.client && !r.settled)
              const gTicked = g.openIds.filter((id) => selected.has(id)).length
              const gAll = gTicked === g.openCount
              return (
                <div key={g.client} className="overflow-hidden rounded-lg border border-slate-200">
                  <div className="flex items-center gap-x-3 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={gAll}
                      ref={(el) => {
                        if (el) el.indeterminate = gTicked > 0 && !gAll
                      }}
                      onChange={() => onToggleGroup(g.openIds, !gAll)}
                      className="h-4 w-4 flex-shrink-0 rounded"
                      title={`Tick all of ${g.client}`}
                    />
                    <button onClick={() => toggleOpen(g.client)} className="flex min-w-0 flex-1 items-center gap-x-3 text-left">
                      <span className="min-w-0 flex-1 text-sm font-semibold leading-tight text-slate-900">
                        {g.client}
                        <span className="ml-2 whitespace-nowrap text-[11px] font-normal text-slate-400">
                          {g.openCount} {g.openCount === 1 ? 'payment' : 'payments'}
                        </span>
                      </span>
                      <span className="hidden sm:block w-24 flex-shrink-0 text-right text-sm tabular-nums text-slate-600">{money(g.openTotal)}</span>
                      <span className="w-24 sm:w-28 flex-shrink-0 text-right text-sm font-bold tabular-nums text-slate-900">
                        {money(g.openEthanCut)}
                      </span>
                      <span className="w-6 flex-shrink-0 text-right text-xs text-slate-400">{isOpen ? '−' : '+'}</span>
                    </button>
                  </div>

                  {isOpen && (
                    <div className="border-t border-slate-200 bg-slate-50/60 px-3 py-1">
                      {rows.map((r) => (
                        <div key={r.id} className="flex items-center gap-x-3 border-b border-slate-200/70 py-1.5 last:border-0">
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() => onToggle(r.id)}
                            className="h-4 w-4 flex-shrink-0 rounded"
                            title="Include in the next payout"
                          />
                          <span className="w-20 flex-shrink-0 text-xs tabular-nums text-slate-500">{r.paidDate}</span>
                          <span className="min-w-0 flex-1 text-[10px] uppercase text-slate-400">{r.type || ''}</span>
                          <span className="hidden sm:block w-24 flex-shrink-0 text-right text-sm tabular-nums text-slate-600">{money(r.amount)}</span>
                          <span className="w-24 sm:w-28 flex-shrink-0 text-right text-sm font-medium tabular-nums text-slate-900">
                            {money(r.ethanCut)}
                          </span>
                          <span className="w-6 flex-shrink-0" />
                        </div>
                      ))}
                      {g.clientId && (
                        <div className="py-1.5">
                          <Link to={`/client/${g.clientId}`} className="text-xs text-slate-500 underline hover:text-slate-800">
                            Open {g.client}
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-3 flex items-center gap-x-3 border-t border-slate-300 px-3 pt-2 text-sm">
            <span className="w-4 flex-shrink-0" />
            <span className="min-w-0 flex-1 font-semibold text-slate-900">Total owed</span>
            <span className="hidden sm:block w-24 flex-shrink-0 text-right tabular-nums text-slate-600">{money(book.unsettledTotal)}</span>
            <span className="w-24 sm:w-28 flex-shrink-0 text-right font-bold tabular-nums text-slate-900">
              {money(book.owed.ethan)}
            </span>
            <span className="w-6 flex-shrink-0" />
          </div>
          {book.sharedExpenses > 0 && (
            <p className="mt-1 px-3 text-[11px] text-slate-500">
              The per-client figures are Ethan&rsquo;s share before costs. The total owed has the shared
              costs taken off, which is why it can be lower than the column above it.
            </p>
          )}
        </>
      )}
    </Card>
  )
}

/** Every collected payment, one row each, with where its share stands. */
function EveryPayment({ book }) {
  const [filter, setFilter] = useState('all')
  const rows = book.counted.filter((r) => (filter === 'all' ? true : filter === 'owed' ? !r.settled : r.settled))

  return (
    <Card padding="lg">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Every payment</h3>
          <p className="mt-0.5 text-sm text-slate-600">
            All {book.collectedCount} collected payments, newest first, with Ethan&rsquo;s {book.splitPercent}% of each
            and whether it has been paid to him.
          </p>
        </div>
        <div className="flex flex-shrink-0 gap-1 text-xs">
          {[
            ['all', `All ${book.collectedCount}`],
            ['owed', `Owed ${book.unsettledCount}`],
            ['paid', `Paid ${book.settledCount}`],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-full px-2.5 py-1 ${
                filter === key ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">Nothing here.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map((r) => (
            <div key={r.id} className="flex items-start gap-3 py-2">
              <div className="min-w-0 flex-1">
                <ClientName name={r.client} clientId={r.clientId} className="block text-sm font-medium leading-tight text-slate-900" />
                <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
                  {r.paidDate}
                  {r.type && <span className="ml-1.5 uppercase text-slate-400">{r.type}</span>}
                  <span className="ml-1.5">{money(r.amount)} collected</span>
                </p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums text-slate-900">{money(r.ethanCut)}</p>
                <p className="mt-0.5">
                  {r.settled ? <Badge tone="success">paid {r.settledOn}</Badge> : <Badge tone="warning">owed</Badge>}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {book.uncountedCount > 0 && (
        <p className="mt-2 text-[11px] text-slate-500">
          {book.uncountedCount} other {book.uncountedCount === 1 ? 'payment' : 'payments'} worth {money(book.uncounted)} are
          not in here because they are not marked paid yet. They join the day they are collected.
        </p>
      )}
    </Card>
  )
}

/** The derivation, folded away. Everything the headline numbers are made of. */
function HowItWorks({ book, splitPercent, onSplitChange }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(splitPercent))

  useEffect(() => setDraft(String(splitPercent)), [splitPercent])

  const save = async () => {
    const n = Number(draft)
    if (!(n > 0 && n < 100)) return
    await onSplitChange(n)
    setEditing(false)
  }

  return (
    <Card padding="lg">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
        <span className="font-semibold text-slate-900">How this is worked out</span>
        <span className="text-xs text-slate-400">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="mt-3 grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">All time</p>
            <Line label="Collected" sub={`${book.collectedCount} payments`} value={book.collected} />
            <Line label="Shared expenses" sub={`${book.sharedExpenseCount} items`} value={book.sharedExpenses} negative />
            <Line label="Net profit" value={book.net} strong rule />
            <div className="mt-3 space-y-0.5">
              <Line label={`Ethan's ${book.splitPercent}%`} value={book.shares.ethan} />
              <Line label={`Remaining ${100 - book.splitPercent}%`} value={book.shares.me} />
            </div>
            {(book.fronted.ethan > 0 || book.fronted.me > 0) && (
              <div className="mt-3 rounded-lg bg-slate-50 p-2">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Paid out of pocket, owed back</p>
                {book.fronted.ethan > 0 && <Line label="Ethan fronted" value={book.fronted.ethan} />}
                {book.fronted.me > 0 && <Line label="The other partner fronted" value={book.fronted.me} />}
              </div>
            )}
            {book.personalExpenses > 0 && (
              <p className="mt-2 text-[11px] text-slate-500">
                {money(book.personalExpenses)} of personal costs recorded and deliberately left out of the split.
              </p>
            )}
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              {editing ? (
                <>
                  <Input value={draft} onChange={(e) => setDraft(e.target.value)} inputMode="decimal" className="w-20" />
                  <Button variant="dark" size="sm" onClick={save}>
                    Save
                  </Button>
                  <button onClick={() => setEditing(false)} className="underline">
                    Cancel
                  </button>
                </>
              ) : (
                <button onClick={() => setEditing(true)} className="underline hover:text-slate-800" title="Ethan's percentage. The other partner takes the remainder.">
                  Split is {splitPercent}/{100 - splitPercent}. Change it
                </button>
              )}
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ethan</p>
            <Line label="Earned" sub={book.fronted.ethan > 0 ? 'share plus what he fronted' : 'his share'} value={book.earned.ethan} strong />
            <Line label="Paid to him" sub={`${book.payoutCount} transfer${book.payoutCount === 1 ? '' : 's'}`} value={book.paid.ethan} negative />
            <Line label={book.owed.ethan < 0 ? 'Overpaid' : 'Owed'} value={Math.abs(book.owed.ethan)} strong rule />
            {book.owed.ethan < 0 && (
              <p className="mt-1 text-[11px] text-amber-800">
                Ethan has had {money(Math.abs(book.owed.ethan))} more than the split works out to. It comes off the next payment.
              </p>
            )}
            {Math.abs(book.unattributed) >= 0.01 && (
              <p className="mt-3 text-[11px] text-amber-800">
                {book.unattributed > 0
                  ? `${money(book.unattributed)} of what has been paid is not accounted for by the payments marked paid.`
                  : `${money(Math.abs(book.unattributed))} less has been paid than the payments marked paid came to.`}{' '}
                The balance above is the one to trust.
              </p>
            )}
            <p className="mt-3 text-[11px] text-slate-500">
              Cash basis, all time. Payments count when collected, costs when spent, transfers when sent. A late
              expense moves the balance instead of restating a month.
            </p>
          </div>
        </div>
      )}
    </Card>
  )
}

export default function PartnerSplitPanel({ payments, expenses, payouts, onChanged }) {
  const [splitPercent, setSplitPercent] = useState(50)
  const [selected, setSelected] = useState(() => new Set())

  useEffect(() => {
    fetchSplitPercent().then(setSplitPercent)
  }, [])

  const book = useMemo(
    () => ledger({ payments, expenses, payouts, splitPercent }),
    [payments, expenses, payouts, splitPercent]
  )

  const unsettledIds = useMemo(() => book.counted.filter((r) => !r.settled).map((r) => r.id), [book.counted])

  // Everything owed starts ticked, so "pay him everything since last time" is
  // one click and already agrees with the balance.
  useEffect(() => {
    setSelected(new Set(unsettledIds))
  }, [unsettledIds])

  const preview = useMemo(
    () => payoutPreview({ payments, expenses, selectedIds: selected, splitPercent }),
    [payments, expenses, selected, splitPercent]
  )

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleGroup = (ids, on) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })

  const changeSplit = async (n) => {
    await saveSplitPercent(n)
    setSplitPercent(n)
  }

  const removePayout = async (p) => {
    if (
      !confirm(
        `Remove the ${money(p.amount)} paid on ${p.paidOn}? No money moves. The record goes, and the payments it covered go back to owed.`
      )
    )
      return
    await deletePayout(p.id)
    onChanged()
  }

  return (
    <div className="mb-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        <StatCard
          className="col-span-2 md:col-span-1"
          label={book.owed.ethan < 0 ? 'Ethan overpaid' : 'Owed to Ethan'}
          value={money(Math.abs(book.owed.ethan))}
          sub={`${book.unsettledCount} ${book.unsettledCount === 1 ? 'payment' : 'payments'} not yet paid out`}
          alert={book.owed.ethan > 0}
        />
        <StatCard
          label="Paid to Ethan Already"
          value={money(book.paid.ethan)}
          sub={`${book.payoutCount} transfer${book.payoutCount === 1 ? '' : 's'}, covering ${book.settledCount} payments`}
        />
        <StatCard
          label="Collected all time"
          value={money(book.collected)}
          sub={
            book.sharedExpenses > 0
              ? `${book.collectedCount} payments, ${money(book.sharedExpenses)} costs off the top`
              : `${book.collectedCount} payments, no shared costs yet`
          }
        />
      </div>

      {!book.balances && (
        <Card tone="danger" padding="lg">
          <p className="text-sm font-semibold text-red-800">These numbers do not balance.</p>
          <p className="mt-1 text-xs text-red-700">
            What the two partners have earned between them ({money(book.earned.ethan + book.earned.me)}) does not add up
            to what the business account did ({money(book.businessCashChange)}). That is a data problem, not rounding.
            Do not pay from this until it is found.
          </p>
        </Card>
      )}

      <OwedByClient
        book={book}
        preview={preview}
        selected={selected}
        onToggle={toggle}
        onToggleGroup={toggleGroup}
        onSelectAll={() => setSelected(new Set(unsettledIds))}
        onClear={() => setSelected(new Set())}
        onDone={onChanged}
      />

      <Card padding="lg">
        <h3 className="font-semibold text-slate-900">Paid to Ethan Already</h3>
        <p className="mt-0.5 mb-3 text-sm text-slate-600">
          {book.coverage.length === 0
            ? 'Nothing paid out yet.'
            : `${book.coverage.length} transfer${book.coverage.length === 1 ? '' : 's'}, ${money(book.paid.ethan)} in total. Each one lists the client payments it covered.`}
        </p>
        <div className="space-y-2">
          {book.coverage.map((entry) => (
            <PaidRow key={entry.id} entry={entry} onDelete={removePayout} />
          ))}
        </div>
      </Card>

      <EveryPayment book={book} />

      <HowItWorks book={book} splitPercent={splitPercent} onSplitChange={changeSplit} />
    </div>
  )
}
