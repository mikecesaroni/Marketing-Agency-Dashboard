import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import DeliverableForm from '../components/DeliverableForm'
import LsaSetupPanel from '../components/LsaSetupPanel'
import MetaSetupPanel from '../components/MetaSetupPanel'
import GbpSetupPanel from '../components/GbpSetupPanel'
import { supabase } from '../lib/supabaseClient'
import { fetchDeliverables, hasInternalColumn, today } from '../lib/queries'
import {
  DELIVERABLE_STATUSES,
  TYPE_ICONS,
  groupByClient,
  groupByStage,
  isLate,
  launchSummary,
  mergeOverallProgress,
} from '../lib/deliverables'
import { Badge, Button, Card, Select, StatCard } from '../components/ui'

const STATUS_FILTERS = ['open', 'todo', 'in progress', 'review', 'done', 'all']

const STATUS_STYLES = {
  todo: 'bg-slate-100 text-slate-700',
  'in progress': 'bg-blue-100 text-blue-800',
  review: 'bg-purple-100 text-purple-800',
  done: 'bg-green-100 text-green-800',
}

// How far along, at a glance. Green only at 100%, because a bar that is green
// at 60% reads as "fine" when the honest answer is "not finished".
function Bar({ percent }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className={`h-full rounded-full transition-all ${
          percent === 100 ? 'bg-green-500' : 'bg-blue-500'
        }`}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

/**
 * One deliverable.
 *
 * The title opens the edit form and the status changes in place, because
 * moving something forward is the common action by a wide margin and should
 * not need a modal. An auto-created item that completed itself says so, so
 * nobody wonders who ticked it.
 */
function Row({ deliverable, onEdit, onStatus, showClient }) {
  const late = isLate(deliverable, today())
  const autoDone =
    deliverable.source === 'auto' &&
    deliverable.status === 'done' &&
    ['meta-access', 'meta-live'].includes(deliverable.template_key)

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center ${
        late ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'
      }`}
    >
      <button onClick={() => onEdit(deliverable)} className="group min-w-0 flex-1 text-left">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex-shrink-0">{TYPE_ICONS[deliverable.type] || TYPE_ICONS.other}</span>
          <span
            className={`truncate text-sm font-medium transition group-hover:text-blue-600 ${
              deliverable.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-900'
            }`}
          >
            {showClient ? deliverable.clients?.name || 'Unknown client' : deliverable.title}
          </span>
          {deliverable.priority === 'high' && deliverable.status !== 'done' && (
            <Badge tone="danger" className="flex-shrink-0 uppercase">
              High
            </Badge>
          )}
        </div>

        {(deliverable.due_date || deliverable.notes || autoDone) && (
          <p className="mt-0.5 pl-6 text-[11px] text-slate-500">
            {deliverable.due_date && (
              <span className={late ? 'font-semibold text-red-600' : ''}>
                due {deliverable.due_date}
              </span>
            )}
            {deliverable.due_date && (deliverable.notes || autoDone) && ' · '}
            {autoDone ? 'completed automatically by the CRM' : deliverable.notes}
          </p>
        )}
      </button>

      <select
        value={deliverable.status}
        onChange={(e) => onStatus(deliverable, e.target.value)}
        className={`flex-shrink-0 cursor-pointer rounded-lg border-0 px-2.5 py-1.5 text-xs font-semibold capitalize ${
          STATUS_STYLES[deliverable.status]
        }`}
      >
        {DELIVERABLE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  )
}

export default function DeliverablesPage() {
  const [deliverables, setDeliverables] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState('client')
  const [statusFilter, setStatusFilter] = useState('open')
  const [clientFilter, setClientFilter] = useState('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editing, setEditing] = useState(null)
  // Only the ones the reader has deliberately opened or shut. Everything else
  // follows the default, which depends on whether there is anything left to do.
  const [toggled, setToggled] = useState({})

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      let clientsQuery = supabase
        .from('clients')
        .select('id, name, meta_ads_active')
        .eq('archived', false)
        .order('name')
      if (await hasInternalColumn()) clientsQuery = clientsQuery.eq('is_internal', false)

      const [items, clientsRes] = await Promise.all([fetchDeliverables(), clientsQuery])
      if (clientsRes.error) throw clientsRes.error
      setDeliverables(items)
      setClients(clientsRes.data || [])
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const changeStatus = async (deliverable, status) => {
    setDeliverables((prev) =>
      prev.map((d) => (d.id === deliverable.id ? { ...d, status } : d))
    )
    const { error: err } = await supabase
      .from('deliverables')
      .update({ status, completed_date: status === 'done' ? today() : null })
      .eq('id', deliverable.id)

    if (err) {
      setError(err.message)
      loadData()
    }
  }

  const filtered = useMemo(
    () =>
      deliverables.filter((d) => {
        if (clientFilter !== 'all' && d.client_id !== clientFilter) return false
        if (statusFilter === 'all') return true
        if (statusFilter === 'open') return d.status !== 'done'
        return d.status === statusFilter
      }),
    [deliverables, statusFilter, clientFilter]
  )

  // The summary reads the whole book of work, not the filtered slice. Filtering
  // to "done" should not make it say every client is launched.
  const allGroups = useMemo(() => groupByClient(deliverables), [deliverables])
  const summary = launchSummary(allGroups)
  const lateCount = deliverables.filter((d) => isLate(d, today())).length

  // Rows come from the filtered list, counts from the whole one — see
  // mergeOverallProgress for why they cannot both come from the same place.
  const allStages = useMemo(() => groupByStage(deliverables), [deliverables])
  const clientGroups = useMemo(
    () => mergeOverallProgress(groupByClient(filtered), allGroups),
    [filtered, allGroups]
  )
  const stageGroups = useMemo(
    () => mergeOverallProgress(groupByStage(filtered), allStages, 'key'),
    [filtered, allStages]
  )

  const isOpen = (key, fallback) => toggled[key] ?? fallback
  const toggle = (key, fallback) =>
    setToggled((prev) => ({ ...prev, [key]: !(prev[key] ?? fallback) }))

  const tableMissing = error.toLowerCase().includes('deliverables')

  return (
    <Layout
      title="Deliverables"
      subtitle={
        loading
          ? 'Loading…'
          : `${summary.inFlight} in flight · ${summary.launched} launched` +
            (lateCount > 0 ? ` · ${lateCount} past due` : '')
      }
      actions={
        <Button variant="dark" size="lg" onClick={() => setShowAddModal(true)} className="w-full md:w-auto">
          + New Deliverable
        </Button>
      }
    >
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {tableMissing ? (
            <>
              <p className="mb-1 font-semibold">The deliverables table doesn&rsquo;t exist yet.</p>
              <p>
                Open the Supabase SQL Editor and run{' '}
                <code className="rounded bg-red-100 px-1">supabase/deliverables.sql</code>, then{' '}
                <code className="rounded bg-red-100 px-1">
                  supabase/deliverable-templates.sql
                </code>
                , and refresh.
              </p>
            </>
          ) : (
            `Error: ${error}`
          )}
        </div>
      )}

      <div className="mb-6 grid grid-cols-3 gap-3 md:gap-4">
        <StatCard label="Clients in flight" value={summary.inFlight} sub="launch not finished" />
        <StatCard
          label="Fully launched"
          value={summary.launched}
          sub={`of ${summary.clients} clients`}
        />
        <StatCard
          label="Past due"
          value={lateCount}
          sub={lateCount === 0 ? 'nothing overdue' : 'needs a date moved or the work done'}
          alert={lateCount > 0}
        />
      </div>

      {/* Two questions, two groupings. By client is "what is left for Belk";
          by stage is "how many videos do I owe", which is the one that lets
          four of the same job be done in one sitting. */}
      {/* Two rows rather than one. Crammed onto a single line the six status
          filters got squeezed to single letters between the view toggle and
          the client dropdown -- the grouping is the primary control and should
          not have to fight for width. */}
      <div className="mb-4 space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex gap-1.5">
            {[
              ['client', 'By client'],
              ['stage', 'By stage'],
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
            className="w-auto sm:ml-auto"
          >
            <option value="all">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {STATUS_FILTERS.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? 'primary' : 'outline'}
              onClick={() => setStatusFilter(s)}
              className="capitalize whitespace-nowrap"
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card padding="lg" className="text-center">
          <p className="text-slate-500">
            {deliverables.length === 0
              ? 'No deliverables yet. They are created automatically for a new client — add one by hand for anything outside the standard launch.'
              : 'Nothing matches these filters.'}
          </p>
        </Card>
      ) : view === 'client' ? (
        <div className="space-y-3">
          {clientGroups.map((group) => {
            // Finished clients arrive shut. They are the ones you do not need
            // to look at, and leaving them open buries the ones you do.
            const defaultOpen = group.done < group.total
            const open = isOpen(group.clientId, defaultOpen)

            return (
              <Card key={group.clientId} padding="none" className="overflow-hidden">
                <div className="flex items-center gap-3 p-4">
                  <button
                    onClick={() => toggle(group.clientId, defaultOpen)}
                    className="flex-shrink-0 text-slate-400 hover:text-slate-700"
                    aria-label={open ? 'Collapse' : 'Expand'}
                  >
                    {open ? '▾' : '▸'}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/client/${group.clientId}`}
                        className="truncate font-semibold text-slate-900 hover:text-blue-600"
                      >
                        {group.clientName}
                      </Link>
                      {group.done === group.total && (
                        <Badge tone="success" className="flex-shrink-0">
                          Launched
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Bar percent={group.percent} />
                      <span className="flex-shrink-0 text-xs tabular-nums text-slate-500">
                        {group.done}/{group.total}
                      </span>
                    </div>
                  </div>
                </div>

                {open && (
                  <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 p-4">
                    {group.phases.map((phase) => (
                      <div key={phase.phase}>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                          {phase.phase}{' '}
                          <span className="font-normal tabular-nums text-slate-400">
                            {phase.done}/{phase.total}
                          </span>
                        </p>
                        <div className="space-y-1.5">
                          {phase.items.map((d) => (
                            <Row
                              key={d.id}
                              deliverable={d}
                              onEdit={setEditing}
                              onStatus={changeStatus}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {stageGroups.map((stage) => {
            const defaultOpen = stage.done < stage.total
            const open = isOpen(stage.key, defaultOpen)

            return (
              <Card key={stage.key} padding="none" className="overflow-hidden">
                <div className="flex items-center gap-3 p-4">
                  <button
                    onClick={() => toggle(stage.key, defaultOpen)}
                    className="flex-shrink-0 text-slate-400 hover:text-slate-700"
                    aria-label={open ? 'Collapse' : 'Expand'}
                  >
                    {open ? '▾' : '▸'}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span>{TYPE_ICONS[stage.type] || TYPE_ICONS.other}</span>
                      <span className="truncate font-semibold text-slate-900">{stage.title}</span>
                      <Badge tone="neutral" className="flex-shrink-0">
                        {stage.phase}
                      </Badge>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Bar percent={stage.percent} />
                      <span className="flex-shrink-0 text-xs tabular-nums text-slate-500">
                        {stage.done}/{stage.total} clients
                      </span>
                    </div>
                  </div>
                </div>

                {open && (
                  <div className="space-y-1.5 border-t border-slate-100 bg-slate-50/60 p-4">
                    {stage.items.map((d) => (
                      <Row
                        key={d.id}
                        deliverable={d}
                        onEdit={setEditing}
                        onStatus={changeStatus}
                        showClient
                      />
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Below the queue, not above it. These are agency-wide tools for asking
          a client for access — the thing the first Meta deliverable needs —
          rather than per-client work, and they were pushing the actual list
          off the screen. */}
      <div className="mt-8 border-t border-slate-200 pt-6">
        <h2 className="mb-1 text-lg font-semibold tracking-tight text-slate-900">
          Ask a client for access
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          Who still needs each channel connected, and the message to send them. Connecting a Meta
          ad account completes that client&rsquo;s access deliverable on its own.
        </p>
        <MetaSetupPanel />
        <LsaSetupPanel />
        <GbpSetupPanel />
      </div>

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="New Deliverable">
        <DeliverableForm
          clients={clients}
          onSuccess={loadData}
          onClose={() => setShowAddModal(false)}
        />
      </Modal>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Edit Deliverable">
        {editing && (
          <DeliverableForm
            deliverable={editing}
            clients={clients}
            onSuccess={loadData}
            onClose={() => setEditing(null)}
          />
        )}
      </Modal>
    </Layout>
  )
}
