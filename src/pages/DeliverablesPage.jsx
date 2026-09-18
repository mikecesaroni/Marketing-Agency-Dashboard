import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import DeliverableForm from '../components/DeliverableForm'
import LsaSetupPanel from '../components/LsaSetupPanel'
import MetaSetupPanel from '../components/MetaSetupPanel'
import GbpSetupPanel from '../components/GbpSetupPanel'
import MetaAccessReport from '../components/MetaAccessReport'
import SetupMessageModal from '../components/SetupMessageModal'
import OnboardingLinkPanel from '../components/OnboardingLinkPanel'
import { PipelineStrip } from '../components/NextUpBar'
import { supabase } from '../lib/supabaseClient'
import { today } from '../lib/queries'
import { fetchNextStepsForAll } from '../lib/nextStepsData'
import { OWNER, urgency } from '../lib/nextSteps'
import { MODAL_KINDS, stepHref } from '../lib/stepLinks'
import { NOT_MARKABLE, canUndo, markStepDone, undoStepDone, whoAmI } from '../lib/completeStep'

function DoneButton({ step, onDone, onUndo, size = 'sm' }) {
  if (step.done) {
    if (!canUndo(step)) return null
    return (
      <button type="button" onClick={() => onUndo(step)} title="Take this back" className="flex-shrink-0 text-[11px] text-slate-400 hover:text-slate-700 hover:underline">
        undo
      </button>
    )
  }
  if (step.blocked || NOT_MARKABLE.has(step.key)) return null
  return (
    <button
      type="button"
      onClick={() => onDone(step)}
      title="Mark this step done"
      className={`flex-shrink-0 rounded-lg border border-green-300 bg-white text-green-700 hover:bg-green-50 ${size === 'lg' ? 'px-2.5 py-1.5 text-xs font-semibold' : 'px-1.5 py-0.5 text-[11px]'}`}
    >
      ✓ Mark done
    </button>
  )
}
import { DELIVERABLE_STATUSES, TYPE_ICONS, isLate } from '../lib/deliverables'
import { Badge, Button, Card } from '../components/ui'

/**
 * The team board.
 *
 * One row per client, every client at once, sorted by who needs a hand
 * first: clients with a step of ours open, then clients waiting longest on
 * something of theirs, then launched-and-quiet. Each row is the same
 * pipeline the client page's Next-up bar shows, so the two never disagree,
 * and the row's button does the step right here: copy the message, open the
 * Studio on the right tab, jump to the toggle.
 *
 * Open a row for the whole plan plus the hand-typed work for that client,
 * with an assignee on each item. The filters and the counts stay pinned at
 * the top while the list scrolls.
 *
 * The old view was eight seeded rows per client and a status dropdown each.
 * Those rows still exist and still complete themselves; they are read by the
 * pipeline rather than shown as a list, and anything typed by hand shows in
 * the row's Extra work.
 */

const STATUS_STYLES = {
  todo: 'bg-slate-100 text-slate-700',
  'in progress': 'bg-blue-100 text-blue-800',
  review: 'bg-purple-100 text-purple-800',
  done: 'bg-green-100 text-green-800',
}

const VIEWS = [
  ['us', 'Needs us'],
  ['client', 'Waiting on client'],
  ['all', 'Everyone'],
  ['launched', 'Launched'],
]

function OwnerChip({ owner }) {
  return owner === OWNER.client ? (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">client</span>
  ) : (
    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-800">us</span>
  )
}

function StepButton({ clientId, step, onModal, size = 'sm' }) {
  const cls = `rounded-lg px-2.5 py-1 text-xs font-semibold ${size === 'lg' ? 'text-white ' + (step.owner === OWNER.us ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700') : 'text-blue-700 hover:underline'}`
  if (MODAL_KINDS.has(step.action.kind)) {
    return (
      <button type="button" onClick={() => onModal(step)} className={cls}>
        {step.action.label}
      </button>
    )
  }
  return (
    <Link to={stepHref(clientId, step)} className={cls}>
      {step.action.label}
    </Link>
  )
}

/** One hand-typed deliverable: title, assignee, status. */
function ExtraRow({ d, onEdit, onStatus, onAssign }) {
  const late = isLate(d, today())
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${late ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
      <button type="button" onClick={() => onEdit(d)} className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-2">
          <span>{TYPE_ICONS[d.type] || TYPE_ICONS.other}</span>
          <span className={`truncate text-sm font-medium ${d.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{d.title}</span>
          {d.priority === 'high' && d.status !== 'done' && <Badge tone="danger">High</Badge>}
        </span>
        {(d.due_date || d.notes) && (
          <span className="mt-0.5 block pl-6 text-[11px] text-slate-500">
            {d.due_date && <span className={late ? 'font-semibold text-red-600' : ''}>due {d.due_date}</span>}
            {d.due_date && d.notes && ' · '}
            {d.notes}
          </span>
        )}
      </button>
      <input
        defaultValue={d.assigned_to || ''}
        onBlur={(e) => e.target.value.trim() !== (d.assigned_to || '') && onAssign(d, e.target.value.trim())}
        placeholder="Assign"
        list="team-names"
        className="w-28 rounded border border-slate-200 px-2 py-1 text-xs"
      />
      <select
        value={d.status}
        onChange={(e) => onStatus(d, e.target.value)}
        className={`cursor-pointer rounded-lg border-0 px-2.5 py-1.5 text-xs font-semibold capitalize ${STATUS_STYLES[d.status]}`}
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

function ClientRow({ row, open, onToggle, onModal, onEdit, onStatus, onAssign, onAssignClient, onAdd, onDone, onUndo }) {
  const { client, result, deliverables } = row
  const next = result.next
  const extras = deliverables.filter((d) => d.source !== 'auto')
  const openExtras = extras.filter((d) => d.status !== 'done')
  const lastMoved = deliverables.reduce((m, d) => (d.updated_at && d.updated_at > m ? d.updated_at : m), '')
  const stripe = result.launched && !next ? 'bg-green-500' : next?.owner === OWNER.us ? 'bg-blue-500' : next ? 'bg-amber-400' : 'bg-slate-300'

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex">
        <div className={`w-1 flex-shrink-0 ${stripe}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2 p-4">
            <button type="button" onClick={onToggle} aria-expanded={open} className="flex-shrink-0 pt-0.5 text-slate-400 hover:text-slate-700" aria-label={open ? 'Collapse' : 'Expand'}>
              {open ? '▾' : '▸'}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <Link to={`/client/${client.id}`} className="text-sm font-semibold text-slate-900 hover:text-blue-700 hover:underline">
                  {client.name}
                </Link>
                <span className="text-[11px] uppercase tracking-wide text-slate-400">{result.phase}</span>
                <span className="text-[11px] tabular-nums text-slate-400">
                  {result.progress.done}/{result.progress.total}
                </span>
                {result.launched && !next && <Badge tone="success">Running</Badge>}
                <input
                  defaultValue={client.assigned_to || ''}
                  onBlur={(e) => e.target.value.trim() !== (client.assigned_to || '') && onAssignClient(client, e.target.value.trim())}
                  placeholder="Owner"
                  list="team-names"
                  title="Who on the team owns this client"
                  className="ml-auto w-24 rounded border border-slate-200 px-2 py-0.5 text-[11px]"
                />
              </div>
              <div className="mt-1">
                <PipelineStrip result={result} compact />
              </div>
              {next ? (
                <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="text-slate-500">Next:</span>
                  <span className="font-medium text-slate-900">{next.title}</span>
                  <OwnerChip owner={next.owner} />
                  <span className="text-slate-600">{next.detail}</span>
                  {next.waitingDays > 0 && <span className="text-amber-700">{next.waitingDays}d waiting</span>}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-slate-600">{result.launched ? 'Nothing outstanding this week.' : 'Nothing outstanding.'}</p>
              )}
              <p className="mt-0.5 text-[11px] text-slate-400">
                {result.ours.length} step{result.ours.length === 1 ? '' : 's'} ours · {result.theirs.length} on the client
                {openExtras.length > 0 && ` · ${openExtras.length} extra task${openExtras.length === 1 ? '' : 's'}`}
                {lastMoved && ` · last moved ${lastMoved.slice(0, 10)}`}
              </p>
            </div>
            {next && (
              <div className="flex flex-shrink-0 items-center gap-2">
                <StepButton clientId={client.id} step={next} onModal={onModal} size="lg" />
                <DoneButton step={next} onDone={(x) => onDone(client, x)} onUndo={(x) => onUndo(client, x)} size="lg" />
              </div>
            )}
          </div>

          {open && (
            <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 p-4">
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">The plan</p>
                <ol className="grid gap-1.5 md:grid-cols-2">
                  {result.steps.map((s) => (
                    <li
                      key={s.key}
                      className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                        s.done ? 'border-green-100 bg-green-50/60' : s.blocked ? 'border-slate-100 bg-white text-slate-500' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <span className={`mt-1 inline-block h-2 w-2 flex-shrink-0 rounded-full ${s.done ? 'bg-green-500' : s.blocked ? 'bg-slate-200' : s.owner === OWNER.client ? 'bg-amber-400' : 'bg-blue-500'}`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-1.5">
                          <span className={`font-medium ${s.done ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{s.title}</span>
                          {!s.done && <OwnerChip owner={s.owner} />}
                          {s.blocked && <span className="text-slate-400">after: {result.steps.find((x) => x.key === s.blockedBy)?.title || s.blockedBy}</span>}
                        </span>
                        <span className="block text-slate-600">{s.detail}</span>
                      </span>
                      {!s.done && !s.blocked && <StepButton clientId={client.id} step={s} onModal={onModal} />}
                      <DoneButton step={s} onDone={(x) => onDone(client, x)} onUndo={(x) => onUndo(client, x)} />
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                    Extra work <span className="font-normal tabular-nums text-slate-400">{openExtras.length} open</span>
                  </p>
                  <button type="button" onClick={() => onAdd(client)} className="text-xs text-blue-600 hover:underline">
                    + Add a task
                  </button>
                </div>
                {extras.length === 0 ? (
                  <p className="text-xs text-slate-500">Nothing beyond the standard launch.</p>
                ) : (
                  <div className="space-y-1.5">
                    {[...extras].sort((a, b) => (a.status === 'done') - (b.status === 'done')).map((d) => (
                      <ExtraRow key={d.id} d={d} onEdit={onEdit} onStatus={onStatus} onAssign={onAssign} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

export default function DeliverablesPage() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [view, setView] = useState('us')
  const [who, setWho] = useState('all')
  const [query, setQuery] = useState('')
  const [toggled, setToggled] = useState({})
  const [modal, setModal] = useState(null) // { kind, row }
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(null) // client or 'any'

  const load = () =>
    fetchNextStepsForAll()
      .then((r) => {
        setRows(r)
        setError('')
      })
      .catch((err) => setError(err.message))

  useEffect(() => {
    load()
  }, [])

  const names = useMemo(() => {
    const set = new Set()
    for (const r of rows || []) {
      if (r.client.assigned_to) set.add(r.client.assigned_to)
      for (const d of r.deliverables) if (d.assigned_to) set.add(d.assigned_to)
    }
    return [...set].sort()
  }, [rows])

  const sorted = useMemo(() => [...(rows || [])].sort((a, b) => urgency(b.result) - urgency(a.result) || a.client.name.localeCompare(b.client.name)), [rows])

  const matching = useMemo(
    () =>
      sorted.filter((r) => {
        if (who !== 'all' && (r.client.assigned_to || '') !== who) return false
        if (query && !r.client.name.toLowerCase().includes(query.toLowerCase())) return false
        if (view === 'us') return r.result.ours.length > 0
        if (view === 'client') return r.result.theirs.length > 0 && r.result.ours.length === 0
        if (view === 'launched') return r.result.launched
        return true
      }),
    [sorted, view, who, query]
  )

  // THE LIST HOLDS STILL WHILE YOU WORK. Marking a step done re-reads the
  // roster, and the client just worked on is by definition less urgent than
  // a moment ago, so a live re-sort moved it (or dropped it out of "Needs
  // us") and the eye landed on someone else. The order and membership are
  // frozen when the filters are set and kept through every save; they are
  // recomputed only when a filter changes. A row that no longer matches
  // stays where it was, showing its new state, until you change the filter.
  const [frozen, setFrozen] = useState(null)
  useEffect(() => {
    setFrozen(null)
  }, [view, who, query])
  useEffect(() => {
    if (frozen === null && rows) setFrozen(matching.map((r) => r.client.id))
  }, [frozen, rows, matching])

  const shown = useMemo(() => {
    if (!frozen) return matching
    const byId = new Map((rows || []).map((r) => [r.client.id, r]))
    return frozen.map((id) => byId.get(id)).filter(Boolean)
  }, [frozen, matching, rows])

  const counts = useMemo(() => {
    const all = rows || []
    return {
      us: all.filter((r) => r.result.ours.length > 0).length,
      client: all.filter((r) => r.result.theirs.length > 0 && r.result.ours.length === 0).length,
      launched: all.filter((r) => r.result.launched).length,
      all: all.length,
      stale: all.filter((r) => r.result.theirs.some((s) => (s.waitingDays || 0) >= 7)).length,
    }
  }, [rows])

  const changeStatus = async (d, status) => {
    setRows((prev) => prev.map((r) => ({ ...r, deliverables: r.deliverables.map((x) => (x.id === d.id ? { ...x, status } : x)) })))
    const { error: err } = await supabase.from('deliverables').update({ status, completed_date: status === 'done' ? today() : null }).eq('id', d.id)
    if (err) {
      setError(err.message)
      load()
    }
  }
  const assign = async (d, name) => {
    const { error: err } = await supabase.from('deliverables').update({ assigned_to: name || null }).eq('id', d.id)
    if (err) setError(err.message)
    load()
  }
  const assignClient = async (client, name) => {
    const { error: err } = await supabase.from('clients').update({ assigned_to: name || null }).eq('id', client.id)
    if (err) setError(err.message)
    load()
  }

  // Mark a pipeline step done, or take it back. Real flags are written where
  // they live; everything else becomes an override row with a name on it.
  const markDone = async (client, step) => {
    setError('')
    try {
      await markStepDone(client, step, { by: whoAmI() })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }
  const undo = async (client, step) => {
    setError('')
    try {
      await undoStepDone(client, step)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const openRow = (id, fallback) => toggled[id] ?? fallback
  const toggle = (id, fallback) => setToggled((prev) => ({ ...prev, [id]: !(prev[id] ?? fallback) }))

  const modalRow = modal?.row
  const modalKind = modal?.step?.action?.kind

  return (
    <Layout
      title="Deliverables"
      subtitle={rows ? `${counts.us} need us · ${counts.client} waiting on a client · ${counts.launched} launched` : 'Loading…'}
      actions={
        <Button variant="dark" size="lg" onClick={() => setAdding('any')} className="w-full md:w-auto">
          + New task
        </Button>
      }
    >
      <datalist id="team-names">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {/* Pinned: the state of the book of work and the filters stay in view
          while the list scrolls. */}
      <div className="sticky top-[68px] z-20 -mx-4 mb-4 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur md:top-[76px] md:-mx-8 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {VIEWS.map(([key, label]) => (
              <Button key={key} size="sm" variant={view === key ? 'dark' : 'outline'} onClick={() => setView(key)} className="whitespace-nowrap">
                {label}
                <span className="ml-1.5 tabular-nums opacity-70">{counts[key] ?? ''}</span>
              </Button>
            ))}
          </div>
          <div className="flex flex-1 items-center gap-2 sm:justify-end">
            {counts.stale > 0 && (
              <span className="hidden text-[11px] text-amber-700 sm:inline" title="A client-side step open seven days or more">
                {counts.stale} waiting 7d+
              </span>
            )}
            <select value={who} onChange={(e) => setWho(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs">
              <option value="all">Any owner</option>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a client" className="w-36 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs" />
          </div>
        </div>
      </div>

      {!rows ? (
        <p className="text-slate-500">Loading…</p>
      ) : shown.length === 0 ? (
        <Card padding="lg" className="text-center text-sm text-slate-500">
          {view === 'us' ? 'Nothing needs us right now. Check "Waiting on client" for the chases.' : 'Nothing here.'}
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => (
            <ClientRow
              key={r.client.id}
              row={r}
              open={openRow(r.client.id, false)}
              onToggle={() => toggle(r.client.id, false)}
              onModal={(step) => setModal({ step, row: r })}
              onEdit={setEditing}
              onStatus={changeStatus}
              onAssign={assign}
              onAssignClient={assignClient}
              onAdd={(client) => setAdding(client)}
              onDone={markDone}
              onUndo={undo}
            />
          ))}
        </div>
      )}

      {/* Agency-wide access tools, folded: the per-client rows above carry the
          same messages, so this is for the sweep, not the daily work. */}
      <details className="mt-8 border-t border-slate-200 pt-6">
        <summary className="cursor-pointer text-lg font-semibold tracking-tight text-slate-900">Access sweep: who still needs each channel</summary>
        <p className="mb-4 mt-1 text-sm text-slate-500">
          Every client missing a channel, with the message to send. Connecting a Meta ad account completes that client&rsquo;s access step on its own.
        </p>
        <MetaAccessReport />
        <MetaSetupPanel />
        <LsaSetupPanel />
        <GbpSetupPanel />
      </details>

      {modalRow && ['meta-access', 'lsa-access', 'gbp'].includes(modalKind) && (
        <SetupMessageModal
          channel={modalKind === 'meta-access' ? 'meta' : modalKind === 'lsa-access' ? 'lsa' : 'gbp'}
          client={modalRow.client}
          intake={modalRow.intake}
          onClose={() => setModal(null)}
        />
      )}
      <Modal
        isOpen={Boolean(modalRow && ['send-onboarding', 'send-ghl'].includes(modalKind))}
        onClose={() => {
          setModal(null)
          load()
        }}
        title={modalKind === 'send-ghl' ? `Send the GHL setup link · ${modalRow?.client.name}` : `Send the onboarding link · ${modalRow?.client.name}`}
      >
        {modalRow && (
          <OnboardingLinkPanel
            client={modalRow.client}
            fixedMode={modalKind === 'send-ghl' ? 'ghl' : modalRow.client.ghl_plan && !modalRow.result.steps.find((s) => s.key === 'ghl-form')?.done ? 'both' : 'intake'}
          />
        )}
      </Modal>

      <Modal isOpen={Boolean(adding)} onClose={() => setAdding(null)} title={adding && adding !== 'any' ? `New task · ${adding.name}` : 'New task'}>
        {adding && (
          <DeliverableForm
            clients={(rows || []).map((r) => r.client)}
            lockedClientId={adding !== 'any' ? adding.id : undefined}
            onSuccess={load}
            onClose={() => setAdding(null)}
          />
        )}
      </Modal>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Edit task">
        {editing && <DeliverableForm deliverable={editing} clients={(rows || []).map((r) => r.client)} onSuccess={load} onClose={() => setEditing(null)} />}
      </Modal>
    </Layout>
  )
}
