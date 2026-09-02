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

// One running balance, the payments it is made of, and the payment it justifies.
//
// The whole design goal is that a payout is never a number somebody has to
// take on trust. Every line of the arithmetic is on screen, in the order it
// happens, and underneath it the actual client payments the total is made of --
// each one saying whether it has been split with Ethan yet.
//
// SETTLING UP IS THE SAME ARITHMETIC, OVER FEWER ROWS. Tick the payments this
// transfer covers and the amount is `payoutPreview` over exactly those: the
// same `ledger` function that produces the balance above. There is no second
// formula that could drift from the first, which is why ticking a box can be
// trusted to move the number correctly.
//
// Everything unsettled starts ticked, so the common case -- "send him his half
// of everything since last time" -- is one click and its amount already agrees
// with what the balance says is owed. Unticking is for the times it does not.

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

/**
 * Records the transfer and marks what it covered.
 *
 * The amount is prefilled from the ticked payments but stays editable, because
 * what actually left the bank is the fact worth recording. Typing a different
 * figure is allowed and then reported: the balance shows the gap rather than
 * quietly disagreeing with the payments it says are settled.
 */
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
          ? 'Tick the payments to settle'
          : `Send ${money(preview.amount)} for ${preview.count} ${
              preview.count === 1 ? 'payment' : 'payments'
            }`}
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
        Marks {preview.count} {preview.count === 1 ? 'payment' : 'payments'} as split with Ethan
        {preview.expensesDeducted > 0 && `, along with ${money(preview.expensesDeducted)} of costs`}.
        To undo it, delete the payout from the list below — the payments go back to unsettled.
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

/**
 * One transfer that was sent, and the client payments it covered.
 *
 * "$3,498 to Ethan" is not a checkable statement on its own; "$3,498, being
 * half of these four payments" is. So the row opens.
 *
 * The tie-out line at the bottom is the point of opening it: what it covers,
 * what that entitled him to, and what actually went. On a payout recorded from
 * a selection those agree and the line simply confirms it. The two migrated
 * rows have nothing attributed, and that reads as "no payments recorded
 * against this one" rather than as money gone missing.
 */
function SentRow({ entry, onDelete }) {
  const [open, setOpen] = useState(false)
  const off = Math.abs(entry.difference) >= 0.01

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-2 px-2.5 py-2 text-left transition hover:bg-slate-50"
      >
        <span className="text-sm font-semibold tabular-nums text-slate-900">
          {money(entry.amount)}
        </span>
        <span className="text-xs text-slate-500">
          to {entry.partner === 'ethan' ? 'Ethan' : 'you'} · {entry.paidOn}
        </span>
        {entry.method && (
          <Badge tone="neutral" className="capitalize">
            {entry.method}
          </Badge>
        )}
        <span className="text-[11px] text-slate-400">
          {entry.covers === 0
            ? 'nothing recorded'
            : `${entry.payments.length} payment${entry.payments.length === 1 ? '' : 's'}${
                entry.costs.length > 0 ? ` · ${entry.costs.length} cost${entry.costs.length === 1 ? '' : 's'}` : ''
              }`}
        </span>
        <span className="ml-auto text-xs text-slate-400">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-200 bg-slate-50/60 px-2.5 py-1.5">
          {entry.payments.length === 0 ? (
            <p className="py-1 text-[11px] text-slate-500">
              No payments were recorded against this transfer — it predates being able to tick
              them. The money is counted in the balance either way; only the attribution is
              missing.
            </p>
          ) : (
            <>
              {entry.payments.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-slate-200/70 py-1 last:border-0"
                >
                  <span className="w-20 flex-shrink-0 text-[11px] tabular-nums text-slate-500">
                    {r.paidDate}
                  </span>
                  {r.clientId ? (
                    <Link
                      to={`/client/${r.clientId}`}
                      className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 hover:text-blue-600"
                    >
                      {r.client}
                    </Link>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800">
                      {r.client}
                    </span>
                  )}
                  {r.type && (
                    <span className="flex-shrink-0 text-[10px] uppercase text-slate-400">
                      {r.type}
                    </span>
                  )}
                  <span className="w-20 flex-shrink-0 text-right text-xs tabular-nums text-slate-900">
                    {money(r.amount)}
                  </span>
                </div>
              ))}

              {entry.costs.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-slate-200/70 py-1 last:border-0"
                >
                  <span className="w-20 flex-shrink-0 text-[11px] tabular-nums text-slate-500">
                    {c.spentOn}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-600">
                    {c.payee}
                    {c.frontedByEthan && (
                      <span className="ml-1 text-[10px] text-slate-400">he fronted it</span>
                    )}
                  </span>
                  <span className="w-20 flex-shrink-0 text-right text-xs tabular-nums text-red-700">
                    − {money(c.amount)}
                  </span>
                </div>
              ))}
            </>
          )}

          {entry.covers > 0 && (
            <p className="mt-1.5 border-t border-slate-300 pt-1.5 text-[11px] text-slate-600">
              {money(entry.paymentsTotal)} of payments
              {entry.costsTotal > 0 && `, less ${money(entry.costsTotal)} of costs`} — his share of
              that is <span className="font-semibold">{money(entry.entitled)}</span>, and{' '}
              {money(entry.amount)} was sent
              {off ? '.' : ', which ties out exactly.'}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 pt-1.5">
            {off ? (
              <span className="text-[11px] text-amber-800">
                {entry.difference > 0
                  ? `${money(entry.difference)} more was sent than these rows come to.`
                  : `${money(Math.abs(entry.difference))} less was sent than these rows come to.`}
              </span>
            ) : (
              <span />
            )}
            <button
              onClick={() => onDelete(entry)}
              className="flex-shrink-0 text-[11px] text-slate-400 underline hover:text-red-600"
            >
              Remove this record
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The payments still to split, and on request the ones already split.
 *
 * SHOWS ONLY WHAT IS STILL TO SETTLE by default -- including in the group
 * totals, which is the part that matters. Showing a client at $11,498 when
 * $2,500 of that was settled weeks ago makes the section describe history
 * rather than work, and the number you want to see next to a tick box is the
 * number that tick box is worth. "Show already split" switches the whole card
 * over: same groups, full totals, settled rows badged.
 *
 * Grouped by client and collapsed, because the useful question is "which
 * clients is this money from" and the row-by-row detail is the follow-up. The
 * per-payment cut is the cut BEFORE costs and is labelled as such -- costs are
 * pooled, so pretending an employee's wage belongs to one client's invoice
 * would be a tidier screen and a worse number.
 */
function CountedPayments({ book, preview, selected, onToggle, onToggleGroup, onSelectAll, onClear }) {
  const [open, setOpen] = useState(() => new Set())
  const [showSettled, setShowSettled] = useState(false)
  const groups = useMemo(() => countedByClient(book.counted), [book.counted])

  const toggleOpen = (client) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(client)) next.delete(client)
      else next.add(client)
      return next
    })

  if (book.counted.length === 0) {
    return (
      <Card padding="lg">
        <h3 className="font-semibold text-slate-900">Payments to split with Ethan</h3>
        <p className="py-4 text-center text-sm text-slate-500">
          No payments marked paid yet, so there is nothing to split.
        </p>
      </Card>
    )
  }

  const shown = groups.filter((g) => showSettled || g.openCount > 0)

  // Every tick box on screen. The master box acts on exactly these, so
  // "all" always means what is visible rather than something hidden below.
  const tickable = book.counted.filter((r) => !r.settled).map((r) => r.id)
  const ticked = tickable.filter((id) => selected.has(id)).length
  const allTicked = tickable.length > 0 && ticked === tickable.length

  return (
    <Card padding="lg">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-900">
            {showSettled ? 'Every payment in the balance' : 'Payments to split with Ethan'}
          </h3>
          <p className="mt-0.5 text-sm text-slate-600">
            {showSettled ? (
              <>
                All {book.collectedCount} payments behind the {money(book.collected)} collected,
                the {book.settledCount} already split included. The {book.splitPercent}% shown against each is{' '}
                <span className="text-slate-400">before costs</span>.
              </>
            ) : (
              <>
                The {book.unsettledCount} {book.unsettledCount === 1 ? 'payment' : 'payments'} not
                yet split with Ethan, worth {money(book.unsettledTotal)}. Tick what a transfer
                covers — the amount to send is worked out above.
              </>
            )}
          </p>
        </div>
        {book.settledCount > 0 && (
          <button
            onClick={() => setShowSettled((v) => !v)}
            className="flex-shrink-0 text-xs text-slate-500 underline hover:text-slate-800"
          >
            {showSettled
              ? 'Only what is left to split'
              : `Show ${book.settledCount} already split`}
          </button>
        )}
      </div>

      {/* One box for the whole list, because "send him his half of everything
          since last time" is the normal case and it should cost one click. */}
      {tickable.length > 0 && (
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
          <span className="text-sm font-medium text-slate-900">
            All {tickable.length} unsettled
          </span>
          <span className="ml-auto text-xs text-slate-500">
            {ticked} ticked ·{' '}
            {preview.negative ? (
              <>
                short by{' '}
                <span className="font-semibold tabular-nums text-amber-800">
                  {money(Math.abs(preview.amount))}
                </span>
              </>
            ) : (
              <>
                <span className="font-semibold tabular-nums text-slate-900">
                  {money(preview.amount)}
                </span>{' '}
                to send
              </>
            )}
          </span>
        </label>
      )}

      <div className="space-y-1.5">
        {shown.map((g) => {
          const isOpen = open.has(g.client)
          const rows = book.counted.filter(
            (r) => r.client === g.client && (showSettled || !r.settled)
          )
          const ticked = g.openIds.filter((id) => selected.has(id)).length
          const allTicked = g.openCount > 0 && ticked === g.openCount
          // The figures next to a tick box have to be what that box is worth,
          // so they are the unsettled ones unless the settled rows are on show.
          const count = showSettled ? g.count : g.openCount
          const total = showSettled ? g.total : g.openTotal
          const cut = showSettled ? g.ethanCut : g.openEthanCut

          return (
            <div key={g.client} className="overflow-hidden rounded-lg border border-slate-200">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allTicked}
                  // Some but not all: the box shows the group is partly in.
                  ref={(el) => {
                    if (el) el.indeterminate = ticked > 0 && !allTicked
                  }}
                  disabled={g.openCount === 0}
                  onChange={() => onToggleGroup(g.openIds, !allTicked)}
                  className="h-4 w-4 flex-shrink-0 rounded disabled:opacity-30"
                  title={g.openCount === 0 ? 'All settled' : `Tick all of ${g.client}`}
                />
                <button
                  onClick={() => toggleOpen(g.client)}
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                    {g.client}
                  </span>
                  <span className="flex-shrink-0 text-[11px] text-slate-400">
                    {count} {count === 1 ? 'payment' : 'payments'}
                    {showSettled && g.settledCount > 0 && ` · ${g.settledCount} split`}
                  </span>
                  <span className="w-24 flex-shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">
                    {money(total)}
                  </span>
                  <span className="w-28 flex-shrink-0 text-right text-xs tabular-nums text-slate-500">
                    {money(cut)} → Ethan
                  </span>
                  <span className="w-6 flex-shrink-0 text-right text-xs text-slate-400">
                    {isOpen ? '−' : '+'}
                  </span>
                </button>
              </div>

              {isOpen && (
                <div className="border-t border-slate-200 bg-slate-50/60 px-3 py-1">
                  {rows.map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200/70 py-1.5 last:border-0"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        disabled={r.settled}
                        onChange={() => onToggle(r.id)}
                        className="h-4 w-4 flex-shrink-0 rounded disabled:opacity-30"
                        title={
                          r.settled
                            ? 'Already split with Ethan. Delete its payout to undo.'
                            : 'Include in the next payout'
                        }
                      />
                      <span className="w-20 flex-shrink-0 text-xs tabular-nums text-slate-500">
                        {r.paidDate}
                      </span>
                      {r.type && (
                        <Badge tone="neutral" className="flex-shrink-0 capitalize">
                          {r.type}
                        </Badge>
                      )}
                      <span className="min-w-0 flex-1">
                        {r.settled && (
                          <Badge tone="success" className="flex-shrink-0">
                            split &amp; sent {r.settledOn}
                          </Badge>
                        )}
                      </span>
                      <span className="w-24 flex-shrink-0 text-right text-sm tabular-nums text-slate-900">
                        {money(r.amount)}
                      </span>
                      <span className="w-28 flex-shrink-0 text-right text-xs tabular-nums text-slate-500">
                        {money(r.ethanCut)} → Ethan
                      </span>
                      <span className="w-6 flex-shrink-0" />
                    </div>
                  ))}
                  {g.clientId && (
                    <div className="py-1.5">
                      <Link
                        to={`/client/${g.clientId}`}
                        className="text-xs text-slate-500 underline hover:text-slate-800"
                      >
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

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-300 pt-2 text-sm">
        <span className="font-semibold text-slate-900">
          {showSettled ? (
            <>
              {book.collectedCount} {book.collectedCount === 1 ? 'payment' : 'payments'} counted
              <span className="ml-2 font-normal text-slate-500">
                {book.settledCount} split with Ethan, {book.unsettledCount} not yet
              </span>
            </>
          ) : (
            <>
              {book.unsettledCount} {book.unsettledCount === 1 ? 'payment' : 'payments'} to split
              {book.settledCount > 0 && (
                <span className="ml-2 font-normal text-slate-500">
                  {book.settledCount} already split, {money(book.settledTotal)}
                </span>
              )}
            </>
          )}
        </span>
        <span className="font-bold tabular-nums text-slate-900">
          {money(showSettled ? book.collected : book.unsettledTotal)}
        </span>
      </div>

      {/* Why the total is smaller than the payments page shows. Left
          unexplained, this is the first thing that makes someone distrust the
          number. */}
      {book.uncountedCount > 0 && (
        <p className="mt-2 text-[11px] text-slate-500">
          {book.uncountedCount} other {book.uncountedCount === 1 ? 'payment' : 'payments'} worth{' '}
          {money(book.uncounted)} are not in this total — they are not marked paid, or have no paid
          date. They join the split the day they are marked collected.
        </p>
      )}
    </Card>
  )
}

export default function PartnerSplitPanel({ payments, expenses, payouts, onChanged }) {
  const [splitPercent, setSplitPercent] = useState(50)
  const [editingSplit, setEditingSplit] = useState(false)
  const [splitDraft, setSplitDraft] = useState('50')
  const [selected, setSelected] = useState(() => new Set())

  useEffect(() => {
    fetchSplitPercent().then((p) => {
      setSplitPercent(p)
      setSplitDraft(String(p))
    })
  }, [])

  const book = useMemo(
    () => ledger({ payments, expenses, payouts, splitPercent }),
    [payments, expenses, payouts, splitPercent]
  )

  const unsettledIds = useMemo(
    () => book.counted.filter((r) => !r.settled).map((r) => r.id),
    [book.counted]
  )

  // Everything not yet settled, ticked, whenever the data changes -- including
  // after recording a payout, when what is unsettled has just changed.
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

  const saveSplit = async () => {
    const n = Number(splitDraft)
    if (!(n > 0 && n < 100)) return
    await saveSplitPercent(n)
    setSplitPercent(n)
    setEditingSplit(false)
  }

  const removePayout = async (p) => {
    if (
      !confirm(
        `Remove the ${money(p.amount)} sent on ${p.paid_on}? No money moves — the record goes, the balance goes back up, and any payments it covered go back to unsettled.`
      )
    )
      return
    await deletePayout(p.id)
    onChanged()
  }

  return (
    <div className="mb-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <StatCard label="Collected all time" value={money(book.collected)} sub={`${book.collectedCount} payments`} />
        <StatCard label="Expenses" value={money(book.sharedExpenses)} sub="shared, off the top" />
        <StatCard label="Net profit" value={money(book.net)} sub="what gets split" />
        <StatCard
          label={book.owed.ethan < 0 ? 'Ethan overpaid' : 'Owed to Ethan'}
          value={money(Math.abs(book.owed.ethan))}
          sub={`${money(book.paid.ethan)} sent so far`}
          alert={book.owed.ethan > 0}
        />
      </div>

      {!book.balances && (
        <Card tone="danger" padding="lg">
          <p className="text-sm font-semibold text-red-800">These numbers do not balance.</p>
          <p className="mt-1 text-xs text-red-700">
            What the two partners have earned between them ({money(book.earned.ethan + book.earned.me)}
            ) does not add up to what the business account did ({money(book.businessCashChange)}).
            That is a data problem rather than a rounding one — do not pay from this until it is
            found.
          </p>
        </Card>
      )}

      <Card padding="lg">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-slate-900">The split, all time</h3>
            <p className="mt-0.5 text-sm text-slate-600">
              One running balance. Everything ever collected, minus everything ever spent, split,
              minus everything ever sent. Nothing closes off, so a late expense just moves the
              balance instead of restating a month.
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
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              All time
            </p>

            <Line
              label="Collected"
              sub={`${book.collectedCount} payment${book.collectedCount === 1 ? '' : 's'}`}
              value={book.collected}
            />
            <Line
              label="Shared expenses"
              sub={`${book.sharedExpenseCount} item${book.sharedExpenseCount === 1 ? '' : 's'}`}
              value={book.sharedExpenses}
              negative
            />
            <Line label="Net profit" value={book.net} strong rule />

            <div className="mt-3 space-y-0.5">
              <Line label={`Ethan's ${book.splitPercent}%`} value={book.shares.ethan} />
              <Line label={`Your ${100 - book.splitPercent}%`} value={book.shares.me} />
            </div>

            {(book.fronted.ethan > 0 || book.fronted.me > 0) && (
              <div className="mt-3 rounded-lg bg-slate-50 p-2">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Paid out of pocket, owed back
                </p>
                {book.fronted.ethan > 0 && <Line label="Ethan fronted" value={book.fronted.ethan} />}
                {book.fronted.me > 0 && <Line label="You fronted" value={book.fronted.me} />}
              </div>
            )}

            {book.personalExpenses > 0 && (
              <p className="mt-2 text-[11px] text-slate-500">
                {money(book.personalExpenses)} of personal costs recorded and deliberately left out
                of the split.
              </p>
            )}
          </div>

          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Ethan
            </p>

            <Line
              label="Earned"
              sub={book.fronted.ethan > 0 ? 'share plus what he fronted' : 'his share'}
              value={book.earned.ethan}
              strong
            />
            <Line
              label="Sent"
              sub={`${book.payoutCount} payment${book.payoutCount === 1 ? '' : 's'}`}
              value={book.paid.ethan}
              negative
            />
            <Line
              label={book.owed.ethan < 0 ? 'Overpaid' : 'Owed'}
              value={Math.abs(book.owed.ethan)}
              strong
              rule
            />

            {book.owed.ethan < 0 && (
              <p className="mt-1 text-[11px] text-amber-800">
                Ethan has had {money(Math.abs(book.owed.ethan))} more than the split works out to.
                It comes off the next payment rather than needing to be sent back.
              </p>
            )}

            {/* The next transfer, worked out from the ticked payments. Same
                arithmetic as the column on the left, over fewer rows. */}
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Settle up
              </p>

              {book.unsettledCount === 0 && preview.count === 0 ? (
                <p className="py-1 text-sm text-slate-600">
                  Every payment has been split with Ethan. Nothing to settle.
                </p>
              ) : (
                <>
                  <Line
                    label="Ticked payments"
                    sub={`${preview.count} of ${book.unsettledCount} unsettled`}
                    value={preview.selectedTotal}
                  />
                  <Line label={`His ${book.splitPercent}%`} value={preview.grossCut} />
                  {preview.expensesDeducted > 0 && (
                    <Line
                      label="Less his share of costs"
                      sub={`${money(preview.expensesDeducted)} not yet settled`}
                      value={preview.expenseShare}
                      negative
                    />
                  )}
                  {preview.frontedBack > 0 && (
                    <Line label="Plus what he fronted" value={preview.frontedBack} />
                  )}
                  <Line
                    label={preview.negative ? 'Short by' : 'To send'}
                    value={Math.abs(preview.amount)}
                    negative={preview.negative}
                    strong
                    rule
                  />

                  {preview.negative && (
                    <p className="mt-1 text-[11px] text-amber-800">
                      The unsettled costs come to more than these payments earn. Tick more
                      payments, or the business genuinely lost money over the ones ticked.
                    </p>
                  )}

                  <div className="mt-3">
                    <RecordPayout preview={preview} onDone={onChanged} />
                  </div>
                </>
              )}
            </div>

            {book.coverage.length > 0 && (
              <div className="mt-4">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Everything sent
                  <span className="ml-1.5 font-normal normal-case tracking-normal text-slate-400">
                    open one to see which payments it covered
                  </span>
                </p>
                <div className="max-h-80 space-y-1 overflow-y-auto">
                  {book.coverage.map((entry) => (
                    <SentRow key={entry.id} entry={entry} onDelete={removePayout} />
                  ))}
                </div>
              </div>
            )}

            {/* Sent, versus what the payments marked settled actually entitled
                him to. Zero unless somebody typed a different figure, and
                worth saying out loud when it is not. */}
            {Math.abs(book.unattributed) >= 0.01 && (
              <p className="mt-3 text-[11px] text-amber-800">
                {book.unattributed > 0
                  ? `${money(book.unattributed)} of what has been sent is not accounted for by the payments marked settled.`
                  : `${money(Math.abs(book.unattributed))} less has been sent than the payments marked settled came to.`}{' '}
                Both figures are real — the balance above is the one to trust.
              </p>
            )}
          </div>
        </div>
      </Card>

      <CountedPayments
        book={book}
        preview={preview}
        selected={selected}
        onToggle={toggle}
        onToggleGroup={toggleGroup}
        onSelectAll={() => setSelected(new Set(unsettledIds))}
        onClear={() => setSelected(new Set())}
      />
    </div>
  )
}
