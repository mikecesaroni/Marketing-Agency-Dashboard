import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { money } from '../lib/queries'
import { countedByClient, ledger } from '../lib/partnerSplit'
import {
  addPayout,
  deletePayout,
  fetchSplitPercent,
  saveSplitPercent,
} from '../lib/partnerData'
import { Badge, Button, Card, Field, Input, StatCard } from './ui'

// One running balance, and the payment it justifies.
//
// The whole design goal is that a payout is never a number somebody has to
// take on trust. Every line of the arithmetic is on screen, in the order it
// happens, with the count of things behind each figure -- and underneath it,
// the actual client payments the total is made of. So "you owe Ethan $X" can
// be checked in ten seconds by the person receiving it. A split that cannot be
// audited by both partners is a split that eventually gets argued about.

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

function RecordPayout({ book, partner, onDone }) {
  const owed = book.owed[partner]
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
    setAmount(owed > 0 ? String(owed.toFixed(2)) : '')
    setOpen(true)
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!(Number(amount) > 0)) return setError('Amount has to be more than zero.')
    setSaving(true)
    try {
      await addPayout({ partner, amount: Number(amount), paidOn, method })
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
      <Button variant="dark" onClick={start}>
        Record a payment to {partner === 'ethan' ? 'Ethan' : 'yourself'}
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
        Recording a payment lowers the balance by this much and nothing else. It does not close
        anything off — if an expense or a client payment turns up later, the balance just moves.
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
 * The payments the balance is made of.
 *
 * Grouped by client and collapsed, because the useful question is "which
 * clients is this money from" and the row-by-row detail is the follow-up. The
 * per-payment cut is the cut BEFORE costs and is labelled as such -- costs are
 * pooled, so pretending an employee's wage belongs to one client's invoice
 * would be a tidier screen and a worse number.
 */
function CountedPayments({ book }) {
  const [open, setOpen] = useState(() => new Set())
  const groups = useMemo(() => countedByClient(book.counted), [book.counted])

  const toggle = (client) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(client)) next.delete(client)
      else next.add(client)
      return next
    })

  if (book.counted.length === 0) {
    return (
      <Card padding="lg">
        <h3 className="font-semibold text-slate-900">What the balance is made of</h3>
        <p className="py-4 text-center text-sm text-slate-500">
          No payments marked paid yet, so there is nothing in the total.
        </p>
      </Card>
    )
  }

  return (
    <Card padding="lg">
      <div className="mb-3">
        <h3 className="font-semibold text-slate-900">What the balance is made of</h3>
        <p className="mt-0.5 text-sm text-slate-600">
          Every client payment counted toward the {money(book.collected)} collected, and the{' '}
          {book.splitPercent}% of each that goes to Ethan{' '}
          <span className="text-slate-400">before costs</span>. These add up to{' '}
          {money(book.gross.ethan)}; the {money(book.sharedExpenses)} of shared costs comes off the
          pool, which is what brings it down to {money(book.shares.ethan)}.
        </p>
      </div>

      <div className="space-y-1.5">
        {groups.map((g) => {
          const isOpen = open.has(g.client)
          const rows = book.counted.filter((r) => r.client === g.client)
          return (
            <div key={g.client} className="overflow-hidden rounded-lg border border-slate-200">
              <button
                onClick={() => toggle(g.client)}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left transition hover:bg-slate-50"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                  {g.client}
                </span>
                <span className="flex-shrink-0 text-[11px] text-slate-400">
                  {g.count} {g.count === 1 ? 'payment' : 'payments'}
                </span>
                <span className="w-24 flex-shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">
                  {money(g.total)}
                </span>
                <span className="w-24 flex-shrink-0 text-right text-xs tabular-nums text-slate-500">
                  {money(g.ethanCut)} → Ethan
                </span>
                <span className="w-8 flex-shrink-0 text-right text-xs text-slate-400">
                  {isOpen ? '−' : '+'}
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-slate-200 bg-slate-50/60 px-3 py-1">
                  {rows.map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200/70 py-1.5 last:border-0"
                    >
                      <span className="w-20 flex-shrink-0 text-xs tabular-nums text-slate-500">
                        {r.paidDate}
                      </span>
                      {r.type && (
                        <Badge tone="neutral" className="flex-shrink-0 capitalize">
                          {r.type}
                        </Badge>
                      )}
                      <span className="min-w-0 flex-1" />
                      <span className="w-24 flex-shrink-0 text-right text-sm tabular-nums text-slate-900">
                        {money(r.amount)}
                      </span>
                      <span className="w-24 flex-shrink-0 text-right text-xs tabular-nums text-slate-500">
                        {money(r.ethanCut)} → Ethan
                      </span>
                      <span className="w-8 flex-shrink-0" />
                    </div>
                  ))}
                  {g.clientId && (
                    <div className="py-1.5">
                      <Link
                        to={`/clients/${g.clientId}`}
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
          {book.collectedCount} {book.collectedCount === 1 ? 'payment' : 'payments'} counted
        </span>
        <span className="font-bold tabular-nums text-slate-900">{money(book.collected)}</span>
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

  const history = useMemo(
    () => [...payouts].sort((a, b) => String(b.paid_on).localeCompare(String(a.paid_on))),
    [payouts]
  )

  const saveSplit = async () => {
    const n = Number(splitDraft)
    if (!(n > 0 && n < 100)) return
    await saveSplitPercent(n)
    setSplitPercent(n)
    setEditingSplit(false)
  }

  const removePayout = async (id) => {
    if (!confirm('Remove this recorded payment? It does not move any money — it only removes the record, so the balance goes back up.')) return
    await deletePayout(id)
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

            <div className="mt-4">
              <RecordPayout book={book} partner="ethan" onDone={onChanged} />
            </div>

            {history.length > 0 && (
              <div className="mt-4">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Everything sent
                </p>
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {history.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2"
                    >
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
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      <CountedPayments book={book} />
    </div>
  )
}
