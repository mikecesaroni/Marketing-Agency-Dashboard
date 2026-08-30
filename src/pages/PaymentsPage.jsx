import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import StripePanel from '../components/StripePanel'
import StripeReconcilePanel from '../components/StripeReconcilePanel'
import OnboardingMoneyPanel from '../components/OnboardingMoneyPanel'
import EthanPayoutPanel from '../components/EthanPayoutPanel'
import Modal from '../components/Modal'
import { supabase } from '../lib/supabaseClient'
import {
  CLIENT_BILLING_COLUMNS,
  calcMRR,
  fetchPayments,
  hasInternalColumn,
  isOverdue,
  money,
  today,
} from '../lib/queries'
import { Badge, Button, Card, Input, Select, StatCard, Textarea } from '../components/ui'

const FILTERS = ['paid', 'overdue', 'upcoming', 'all']
const METHODS = ['card', 'ach', 'check', 'paypal', 'other']

/**
 * Payments gathered under the client who owes them.
 *
 * Collapsed by default with the outstanding balance and the next date on the
 * summary line, because the question this page answers most often is "who owes
 * me what", not "what happened in date order".
 */
function ByClient({ groups, expanded, toggle, renderRow }) {
  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const open = expanded.has(g.id)
        return (
          <Card key={g.id} padding="none" className="overflow-hidden">
            <button
              onClick={() => toggle(g.id)}
              className="w-full flex flex-col sm:flex-row sm:items-center gap-2 p-3 md:p-4 text-left hover:bg-slate-50 transition"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-900">{g.name}</span>
                  {g.stripeLinked && (
                    <Badge tone="success" title={g.stripeLinked}>
                      Stripe linked
                    </Badge>
                  )}
                  {g.overdue > 0 && (
                    <Badge tone="danger">{g.overdue} overdue</Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {money(g.collected)} collected · {money(g.outstanding)} outstanding
                  {g.nextDue && ` · next ${g.nextDue}`}
                </p>
              </div>
              <span className="text-xs text-slate-400 flex-shrink-0">
                {g.rows.length} {g.rows.length === 1 ? 'payment' : 'payments'} · {open ? 'Hide' : 'Show'}
              </span>
            </button>

            {open && (
              <div className="space-y-2 border-t border-slate-200 bg-slate-50/60 p-2 md:p-3">
                {g.rows.map(renderRow)}
              </div>
            )}
          </Card>
        )
      })}
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
  // Ninety-odd rows in one list is a ledger, not a view of who owes what.
  const [view, setView] = useState('client')
  const [expanded, setExpanded] = useState(() => new Set())

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
      let clientsQuery = supabase
        .from('clients')
        .select(CLIENT_BILLING_COLUMNS)
        .order('name')
      if (await hasInternalColumn()) clientsQuery = clientsQuery.eq('is_internal', false)

      const [items, clientsRes] = await Promise.all([fetchPayments(), clientsQuery])
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

  // Deleting is scoped to overdue rows on purpose — a paid payment is a real
  // record and an upcoming one is a real future date, but an overdue row is
  // usually one that should never have been scheduled (a client who churned,
  // a duplicate, a schedule that outlived the client relationship).
  const handleDeletePayment = async (payment) => {
    if (
      !confirm(
        `Delete this overdue ${payment.payment_type} payment (${money(payment.amount)}, due ${payment.due_date}) for ${payment.clients?.name || 'this client'}? This cannot be undone.`
      )
    )
      return

    const { error: err } = await supabase.from('payments').delete().eq('id', payment.id)
    if (err) return setError(err.message)
    loadData()
  }

  const { mrr, count: billingCount, ghl: ghlMrr, ghlCount } = calcMRR(clients, payments)

  // Deliberately all-time. Scoping this to the current calendar month meant it
  // reset to $0 every 1st, hiding money collected days earlier.
  const paidPayments = payments.filter((p) => p.status === 'paid')
  const totalCollected = paidPayments.reduce((sum, p) => sum + p.amount, 0)

  const overdue = payments.filter(isOverdue)

  // Sorted here rather than leaning on the query's order clause, so every view
  // — the paid ledger especially — is chronological no matter what comes back.
  const filtered = useMemo(() => {
    const inScope = payments.filter(
      (p) => clientFilter === 'all' || p.client_id === clientFilter
    )

    // Upcoming answers "what is each client next going to owe me", so it shows
    // exactly one row per client — their earliest unpaid payment — however far
    // out it falls. Anything already past due belongs to the Overdue view.
    if (filter === 'upcoming') {
      const nextByClient = new Map()
      for (const p of inScope) {
        if (p.status === 'paid' || isOverdue(p)) continue
        const current = nextByClient.get(p.client_id)
        if (!current || p.due_date < current.due_date) nextByClient.set(p.client_id, p)
      }
      return [...nextByClient.values()].sort((a, b) => a.due_date.localeCompare(b.due_date))
    }

    const list = inScope.filter((p) => {
      if (filter === 'all') return true
      if (filter === 'paid') return p.status === 'paid'
      return isOverdue(p)
    })
    return list.sort((a, b) => a.due_date.localeCompare(b.due_date))
  }, [payments, filter, clientFilter])

  // One renderer for both views, so a payment looks and behaves the same
  // whichever way the page is sorted.
  const renderPayment = (p) => {
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
            <Badge tone="neutral" className="uppercase">
              {p.payment_type}
            </Badge>
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
          <Button variant="secondary" size="sm" onClick={() => openEdit(p)}>
            Edit
          </Button>
          {p.status === 'paid' ? (
            <Button variant="success" size="sm" onClick={() => handleUnmarkPaid(p)}>
              ✓ Paid
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                setPaidDate(today())
                setMethod('card')
                setMarkingPaid(p)
              }}
            >
              Mark Paid
            </Button>
          )}
          {late && (
            <Button variant="danger" size="sm" onClick={() => handleDeletePayment(p)}>
              Delete
            </Button>
          )}
        </div>
      </div>
    )
  }

  // Grouped from the same filtered set the flat list uses, so the two views
  // never disagree about what is on screen.
  const groups = useMemo(() => {
    const byClient = new Map()
    for (const p of filtered) {
      const g = byClient.get(p.client_id) || {
        id: p.client_id,
        name: p.clients?.name || 'Unknown client',
        rows: [],
        collected: 0,
        outstanding: 0,
        overdue: 0,
        nextDue: null,
      }
      g.rows.push(p)
      if (p.status === 'paid') g.collected += p.amount
      else {
        g.outstanding += p.amount
        if (isOverdue(p)) g.overdue += 1
        if (!g.nextDue || p.due_date < g.nextDue) g.nextDue = p.due_date
      }
      byClient.set(p.client_id, g)
    }
    const linked = new Map(clients.map((c) => [c.id, c.stripe_customer_id]))
    return [...byClient.values()]
      .map((g) => ({ ...g, stripeLinked: linked.get(g.id) || null }))
      .sort((a, b) => b.overdue - a.overdue || b.outstanding - a.outstanding || a.name.localeCompare(b.name))
  }, [filtered, clients])

  return (
    <Layout title="Payments & Revenue" subtitle={`${payments.length} payments tracked`}>
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 mb-4">
          Error: {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6">
        <StatCard
          label="MRR"
          value={money(mrr)}
          sub={
            // The GHL slice is worth calling out because it is invoiced two
            // different ways — on its own for some clients, inside a combined
            // fee for others — so it is not readable off any single number.
            ghlMrr > 0
              ? `${billingCount} ${billingCount === 1 ? 'client' : 'clients'} billing · ${money(ghlMrr)} GHL across ${ghlCount}`
              : `${billingCount} ${billingCount === 1 ? 'client' : 'clients'} billing`
          }
          tone="blue"
        />
        <StatCard
          label="Collected"
          value={money(totalCollected)}
          sub={`${paidPayments.length} ${paidPayments.length === 1 ? 'payment' : 'payments'} all time`}
          tone="green"
        />
        <StatCard
          label="Overdue"
          value={money(overdue.reduce((s, p) => s + p.amount, 0))}
          sub={`${overdue.length} payments`}
          tone={overdue.length > 0 ? 'red' : 'slate'}
        />
      </div>

      {/* Who owes money that no ledger row makes obvious, before the panels
          about reconciling and configuring Stripe. */}
      <OnboardingMoneyPanel clients={clients} payments={payments} todayDate={today()} />

      {/* Above the Stripe setup panel on purpose: a disagreement with Stripe
          is something to act on, and pasting in payment links is not. */}
      <StripeReconcilePanel clients={clients} payments={payments} onFixed={loadData} />
      <StripePanel />
      <EthanPayoutPanel payments={payments} onChange={loadData} />

      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <div className="flex gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {FILTERS.map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'dark' : 'outline'}
              onClick={() => setFilter(f)}
              className="capitalize whitespace-nowrap"
            >
              {f}
            </Button>
          ))}
        </div>
        <div className="md:ml-auto flex gap-1.5">
          {[
            ['client', 'By client'],
            ['date', 'By date'],
          ].map(([key, label]) => (
            <Button
              key={key}
              variant={view === key ? 'dark' : 'outline'}
              onClick={() => setView(key)}
              className="whitespace-nowrap"
            >
              {label}
            </Button>
          ))}
        </div>
        <Select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="w-auto"
        >
          <option value="all">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card padding="lg" className="text-center">
          <p className="text-slate-500">
            {payments.length === 0
              ? 'No payments yet. Open a client, then use Billing Setup to enter their setup fee and monthly amount.'
              : 'Nothing matches these filters.'}
          </p>
        </Card>
      ) : (
        view === 'client' ? (
          <ByClient
            groups={groups}
            expanded={expanded}
            toggle={(id) =>
              setExpanded((prev) => {
                const next = new Set(prev)
                next.has(id) ? next.delete(id) : next.add(id)
                return next
              })
            }
            renderRow={renderPayment}
          />
        ) : (
          <div className="space-y-2">{filtered.map(renderPayment)}</div>
        )
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
              <Input
                type="date"
                size="lg"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Payment method
              </label>
              <Select
                size="lg"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="capitalize"
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="success" size="lg" onClick={handleMarkPaid} className="flex-1">
                Confirm Paid
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setMarkingPaid(null)}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Edit Payment">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Amount</label>
            <Input
              type="number"
              step="0.01"
              size="lg"
              value={editForm.amount}
              onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Due date</label>
            <Input
              type="date"
              size="lg"
              value={editForm.due_date}
              onChange={(e) => setEditForm((f) => ({ ...f, due_date: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Notes</label>
            <Textarea
              rows={3}
              size="lg"
              value={editForm.notes}
              onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button size="lg" onClick={handleSaveEdit} className="flex-1">
              Save Changes
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => setEditing(null)}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  )
}
