import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { Button, Card, Input, Select } from '../components/ui'
import TaskDrawer, { ListDot, PriorityFlag } from '../components/tasks/TaskDrawer'
import {
  DUE_BUCKETS,
  LIST_COLORS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  filterTasks,
  groupTasks,
  isOverdue,
  knownNames,
  knownTags,
  nestSubtasks,
  parseQuickAdd,
  progress,
  summarise,
} from '../lib/tasks'
import { createList, createTask, fetchBoard, readMe, saveMe, updateTask } from '../lib/tasksData'

/**
 * The team's task board. ClickUp, sized for five people.
 *
 * ClickUp's shape, kept: a sidebar of places work lives (here: every client,
 * plus the agency's own lists), a List view grouped by status, due date,
 * priority, assignee or client, a Board view with a column per status you
 * drag cards between, Me mode, a quick-add bar that reads "!high @Ethan
 * #meta due fri" off the end of a title, and a task view with subtasks,
 * checklist and comments.
 *
 * ClickUp's shape, dropped: per-list statuses, custom fields, time tracking,
 * dependencies, recurring tasks, Gantt, goals, docs. None asked for; each is
 * a table or two when one is.
 *
 * Everything is read once and filtered here (lib/tasks.js, checked), so the
 * counts in the sidebar, the groups in the list and the columns on the board
 * are all the same rows and cannot disagree.
 */

const GROUPINGS = [
  ['status', 'Status'],
  ['due', 'Due date'],
  ['priority', 'Priority'],
  ['assignee', 'Assignee'],
  ['client', 'Client / list'],
]

const fmtDay = (iso) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function SideItem({ active, onClick, children, count, dim }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
        active ? 'bg-slate-900 text-white' : dim ? 'text-slate-500 hover:bg-slate-100' : 'text-slate-700 hover:bg-slate-100'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2 truncate">{children}</span>
      {count != null && count > 0 && (
        <span className={`rounded-full px-1.5 text-[11px] ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>{count}</span>
      )}
    </button>
  )
}

function Where({ task, clients, lists }) {
  if (task.client_id) {
    const c = clients.find((x) => x.id === task.client_id)
    return (
      <Link to={`/client/${task.client_id}`} onClick={(e) => e.stopPropagation()} className="truncate rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-800 hover:underline">
        {c?.name || 'Client'}
      </Link>
    )
  }
  if (task.list_id) {
    const l = lists.find((x) => x.id === task.list_id)
    return (
      <span className="inline-flex items-center gap-1 truncate rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">
        <ListDot color={l?.color} />
        {l?.name || 'List'}
      </span>
    )
  }
  return null
}

function Meta({ task }) {
  const prog = progress(task)
  const late = isOverdue(task)
  return (
    <>
      {task.assignees?.length > 0 && (
        <span className="truncate text-[11px] text-slate-600">{task.assignees.join(', ')}</span>
      )}
      {task.due_date && (
        <span className={`whitespace-nowrap text-[11px] ${late ? 'font-semibold text-red-600' : task.status === 'done' ? 'text-slate-400' : 'text-slate-500'}`}>
          {late ? 'Overdue · ' : ''}
          {fmtDay(task.due_date)}
        </span>
      )}
      {prog.total > 0 && (
        <span className={`whitespace-nowrap text-[11px] ${prog.done === prog.total ? 'text-green-700' : 'text-slate-500'}`}>
          {prog.done}/{prog.total}
        </span>
      )}
      {task.tags?.map((t) => (
        <span key={t} className="rounded bg-purple-50 px-1 text-[10px] text-purple-800">
          #{t}
        </span>
      ))}
    </>
  )
}

function TaskRow({ task, clients, lists, onOpen, onToggle, sub = false }) {
  const done = task.status === 'done'
  return (
    <li
      className={`flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 ${sub ? 'pl-10' : ''}`}
      onClick={() => onOpen(task)}
    >
      <input
        type="checkbox"
        checked={done}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggle(task)}
        className="flex-shrink-0"
        title={done ? 'Reopen' : 'Mark done'}
      />
      <PriorityFlag priority={task.priority} />
      <span className={`min-w-0 flex-1 truncate text-sm ${done ? 'line-through text-slate-400' : 'text-slate-900'}`}>{task.title}</span>
      <span className="hidden flex-shrink-0 items-center gap-2 md:flex">
        <Where task={task} clients={clients} lists={lists} />
        <Meta task={task} />
      </span>
    </li>
  )
}

function BoardCard({ task, clients, lists, onOpen, onDragStart }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart(task.id)
      }}
      onClick={() => onOpen(task)}
      className="cursor-grab rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm hover:border-slate-300 active:cursor-grabbing"
    >
      <div className="flex items-start gap-1.5">
        <PriorityFlag priority={task.priority} className="mt-1.5" />
        <p className={`text-sm leading-snug ${task.status === 'done' ? 'line-through text-slate-400' : 'text-slate-900'}`}>{task.title}</p>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Where task={task} clients={clients} lists={lists} />
        <Meta task={task} />
      </div>
      {task.subtasks?.length > 0 && (
        <p className="mt-1 text-[11px] text-slate-500">
          {task.subtasks.filter((s) => s.status === 'done').length}/{task.subtasks.length} subtasks
        </p>
      )}
    </div>
  )
}

export default function TasksPage() {
  const [board, setBoard] = useState({ tasks: [], lists: [], clients: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [me, setMe] = useState(readMe)

  const [view, setView] = useState('list')
  const [groupBy, setGroupBy] = useState('status')
  const [scope, setScope] = useState({ kind: 'all' })
  const [filters, setFilters] = useState({ assignee: '', priority: '', tag: '', due: '', showDone: false, search: '' })
  const [collapsed, setCollapsed] = useState({})
  const [selectedId, setSelectedId] = useState(null)
  const [quick, setQuick] = useState('')
  const [listDraft, setListDraft] = useState('')
  const [addingList, setAddingList] = useState(false)
  const [allClients, setAllClients] = useState(false)
  const [dragging, setDragging] = useState(null)

  const load = useCallback(async () => {
    try {
      setBoard(await fetchBoard())
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // A database that cannot be reached at all does not fail, it waits: the
  // client library never settles the request. An HTTP error shows up as an
  // error above; this covers the silence.
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!loading) return
    const t = setTimeout(() => setSlow(true), 12000)
    return () => clearTimeout(t)
  }, [loading])

  // One task changed (or was deleted): patch it in place rather than reload,
  // so the board does not flicker on every checkbox.
  const absorb = useCallback((row) => {
    if (!row?.id) return
    setBoard((prev) => {
      if (row.deleted) {
        return { ...prev, tasks: prev.tasks.filter((t) => t.id !== row.id && t.parent_id !== row.id) }
      }
      const exists = prev.tasks.some((t) => t.id === row.id)
      return { ...prev, tasks: exists ? prev.tasks.map((t) => (t.id === row.id ? { ...t, ...row } : t)) : [...prev.tasks, row] }
    })
  }, [])

  const { tasks, lists, clients } = board
  const people = useMemo(() => knownNames(tasks), [tasks])
  const tagList = useMemo(() => knownTags(tasks), [tasks])
  const summary = useMemo(() => summarise(tasks), [tasks])
  const names = useMemo(
    () => ({
      clients: Object.fromEntries(clients.map((c) => [c.id, c.name])),
      lists: Object.fromEntries(lists.map((l) => [l.id, l.name])),
    }),
    [clients, lists]
  )

  // Sidebar shortcuts are scopes plus a filter or two.
  const effective = useMemo(() => {
    const f = { ...filters, scope }
    if (scope.kind === 'me') {
      f.scope = { kind: 'all' }
      f.assignee = me
    }
    if (scope.kind === 'today') {
      f.scope = { kind: 'all' }
      f.due = 'today'
    }
    if (scope.kind === 'overdue') {
      f.scope = { kind: 'all' }
      f.due = 'overdue'
    }
    return f
  }, [filters, scope, me])

  const visible = useMemo(() => filterTasks(tasks, effective), [tasks, effective])
  const nested = useMemo(() => nestSubtasks(visible), [visible])
  const groups = useMemo(() => groupTasks(nested, groupBy, { names }), [nested, groupBy, names])
  const columns = useMemo(() => groupTasks(nested, 'status', { names }), [nested, names])

  const selected = selectedId ? tasks.find((t) => t.id === selectedId) : null

  const toggle = async (task) => {
    const status = task.status === 'done' ? 'todo' : 'done'
    absorb({ ...task, status })
    try {
      absorb(await updateTask(task.id, { status }))
    } catch (err) {
      setError(err.message)
      load()
    }
  }

  const quickAdd = async () => {
    const parsed = parseQuickAdd(quick, undefined, people)
    if (!parsed.title) return
    setQuick('')
    const home = {}
    if (scope.kind === 'client') home.client_id = scope.id
    if (scope.kind === 'list') home.list_id = scope.id
    if (scope.kind === 'me' && me && parsed.assignees.length === 0) parsed.assignees = [me]
    if (scope.kind === 'today' && !parsed.due_date) parsed.due_date = new Date().toISOString().slice(0, 10)
    try {
      absorb(await createTask({ ...parsed, ...home, created_by: me || null }))
    } catch (err) {
      setError(err.message)
    }
  }

  const addList = async () => {
    const name = listDraft.trim()
    if (!name) return
    try {
      const made = await createList(name, LIST_COLORS[lists.length % LIST_COLORS.length])
      setBoard((prev) => ({ ...prev, lists: [...prev.lists, made] }))
      setListDraft('')
      setAddingList(false)
      setScope({ kind: 'list', id: made.id })
    } catch (err) {
      setError(err.message)
    }
  }

  const dropOn = async (status) => {
    if (!dragging) return
    const task = tasks.find((t) => t.id === dragging)
    setDragging(null)
    if (!task || task.status === status) return
    absorb({ ...task, status })
    try {
      absorb(await updateTask(task.id, { status }))
    } catch (err) {
      setError(err.message)
      load()
    }
  }

  const askMe = () => {
    const name = (prompt('Your name, for Me mode and to sign what you do:', me) || '').trim()
    if (name) {
      saveMe(name)
      setMe(name)
    }
  }

  const clientsShown = allClients ? clients : clients.filter((c) => summary.byClient[c.id])
  const scopeLabel =
    scope.kind === 'client'
      ? names.clients[scope.id]
      : scope.kind === 'list'
        ? names.lists[scope.id]
        : { all: 'Everything', me: me ? `${me}’s tasks` : 'My tasks', inbox: 'Inbox', today: 'Due today', overdue: 'Overdue' }[scope.kind]

  return (
    <Layout
      title="Tasks"
      subtitle={loading ? 'Loading…' : `${summary.open} open · ${summary.overdue} overdue · ${summary.dueToday} due today`}
      actions={
        <button type="button" onClick={askMe} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50" title="Used for Me mode, who made a task, and who commented">
          {me ? `You: ${me}` : 'Set your name'}
        </button>
      }
    >
      {error && <Card tone="danger" padding="sm" className="mb-3 text-sm text-red-800">{error}</Card>}

      <div className="grid gap-4 md:grid-cols-[13rem_1fr]">
        {/* SIDEBAR: where work lives. Clients are lists already; the agency's
            own lists sit under them. */}
        <aside className="space-y-4 md:sticky md:top-4 md:self-start">
          <div className="space-y-0.5">
            <SideItem active={scope.kind === 'all'} onClick={() => setScope({ kind: 'all' })} count={summary.open}>
              Everything
            </SideItem>
            <SideItem active={scope.kind === 'me'} onClick={() => (me ? setScope({ kind: 'me' }) : askMe())}>
              My tasks
            </SideItem>
            <SideItem active={scope.kind === 'today'} onClick={() => setScope({ kind: 'today' })} count={summary.dueToday + summary.overdue}>
              Due today
            </SideItem>
            <SideItem active={scope.kind === 'overdue'} onClick={() => setScope({ kind: 'overdue' })} count={summary.overdue}>
              <span className={summary.overdue ? 'text-red-700' : ''}>Overdue</span>
            </SideItem>
            <SideItem active={scope.kind === 'inbox'} onClick={() => setScope({ kind: 'inbox' })} count={summary.inbox} dim>
              Inbox
            </SideItem>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between px-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Clients</p>
              <button type="button" onClick={() => setAllClients((v) => !v)} className="text-[10px] text-slate-500 hover:underline">
                {allClients ? 'with tasks' : 'all'}
              </button>
            </div>
            <div className="max-h-72 space-y-0.5 overflow-y-auto">
              {clientsShown.map((c) => (
                <SideItem key={c.id} active={scope.kind === 'client' && scope.id === c.id} onClick={() => setScope({ kind: 'client', id: c.id })} count={summary.byClient[c.id]}>
                  {c.name}
                </SideItem>
              ))}
              {clientsShown.length === 0 && <p className="px-2 text-xs text-slate-400">No client has open tasks. Click &ldquo;all&rdquo; to pick one.</p>}
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between px-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Lists</p>
              <button type="button" onClick={() => setAddingList((v) => !v)} className="text-[10px] text-slate-500 hover:underline">
                + new
              </button>
            </div>
            <div className="space-y-0.5">
              {lists.map((l) => (
                <SideItem key={l.id} active={scope.kind === 'list' && scope.id === l.id} onClick={() => setScope({ kind: 'list', id: l.id })} count={summary.byList[l.id]}>
                  <ListDot color={l.color} />
                  {l.name}
                </SideItem>
              ))}
              {addingList && (
                <Input
                  size="sm"
                  autoFocus
                  value={listDraft}
                  onChange={(e) => setListDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addList()
                    if (e.key === 'Escape') setAddingList(false)
                  }}
                  placeholder="List name, Enter to save"
                />
              )}
            </div>
          </div>
        </aside>

        <div className="min-w-0 space-y-3">
          {/* TOOLBAR */}
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-base font-semibold text-slate-900">{scopeLabel}</h2>
            <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs">
              {[
                ['list', 'List'],
                ['board', 'Board'],
              ].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setView(k)} className={`rounded-md px-2.5 py-1 ${view === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                  {label}
                </button>
              ))}
            </div>
            {/* The kit's controls are full-width and cn() does not merge
                Tailwind classes, so each gets a content-sized wrapper. */}
            {view === 'list' && (
              <div>
                <Select size="sm" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
                  {GROUPINGS.map(([k, label]) => (
                    <option key={k} value={k}>
                      Group: {label}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div>
              <Select size="sm" value={filters.assignee} onChange={(e) => setFilters((f) => ({ ...f, assignee: e.target.value }))} disabled={scope.kind === 'me'}>
                <option value="">Anyone</option>
                {people.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Select size="sm" value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}>
                <option value="">Any priority</option>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
            {tagList.length > 0 && (
              <div>
                <Select size="sm" value={filters.tag} onChange={(e) => setFilters((f) => ({ ...f, tag: e.target.value }))}>
                  <option value="">Any tag</option>
                  {tagList.map((t) => (
                    <option key={t} value={t}>
                      #{t}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" checked={filters.showDone} onChange={(e) => setFilters((f) => ({ ...f, showDone: e.target.checked }))} />
              Show done
            </label>
            <div className="w-40">
              <Input size="sm" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} placeholder="Search" />
            </div>
          </div>

          {/* QUICK ADD: one line, ClickUp's shorthand on the end. */}
          <div>
            <Input
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
              placeholder={`+ Add a task${scope.kind === 'client' || scope.kind === 'list' ? ` to ${scopeLabel}` : ''}… try "Fix the form !high @${me || 'Name'} #meta due fri"`}
            />
            <p className="mt-1 px-1 text-[11px] text-slate-400">
              Enter to add. <span className="font-mono">!urgent !high !low</span> priority · <span className="font-mono">@name</span> assignee · <span className="font-mono">#tag</span> · <span className="font-mono">due today / tomorrow / fri / 2026-10-01</span>
            </p>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">
              Loading tasks…
              {slow && <span className="block text-xs text-amber-700">Still waiting on the database. If this does not clear, Supabase may be unreachable or paused.</span>}
            </p>
          ) : visible.length === 0 ? (
            <Card padding="lg" className="text-center text-sm text-slate-500">
              {tasks.length === 0 ? 'No tasks yet. Type one above.' : 'Nothing matches. Clear a filter, or tick “Show done”.'}
            </Card>
          ) : view === 'list' ? (
            <div className="space-y-3">
              {groups.map((g) => {
                if (g.tasks.length === 0 && groupBy !== 'status') return null
                const open = !collapsed[g.key]
                return (
                  <Card key={g.key} padding="none" className="overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setCollapsed((c) => ({ ...c, [g.key]: open }))}
                      className="flex w-full items-center gap-2 bg-slate-50 px-3 py-1.5 text-left"
                    >
                      <span className="text-slate-400">{open ? '▾' : '▸'}</span>
                      <span className={`text-xs font-semibold ${g.key === 'overdue' ? 'text-red-700' : 'text-slate-700'}`}>{g.label}</span>
                      <span className="text-[11px] text-slate-500">{g.tasks.length}</span>
                    </button>
                    {open && (
                      <ul className="divide-y divide-slate-100">
                        {g.tasks.map((t) => (
                          <li key={t.id}>
                            <ul>
                              <TaskRow task={t} clients={clients} lists={lists} onOpen={(x) => setSelectedId(x.id)} onToggle={toggle} />
                              {t.subtasks?.map((s) => (
                                <TaskRow key={s.id} task={s} clients={clients} lists={lists} onOpen={(x) => setSelectedId(x.id)} onToggle={toggle} sub />
                              ))}
                            </ul>
                          </li>
                        ))}
                        {g.tasks.length === 0 && <li className="px-3 py-2 text-xs text-slate-400">Nothing here.</li>}
                      </ul>
                    )}
                  </Card>
                )
              })}
            </div>
          ) : (
            /* BOARD: a column per status. Drag a card to move it. Done tasks
               show in their column only when "Show done" is on, the same as
               the list. */
            <div className="grid gap-3 md:grid-cols-4">
              {columns.map((col) => {
                const spec = TASK_STATUSES.find((s) => s.key === col.key)
                return (
                  <div
                    key={col.key}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      dropOn(col.key)
                    }}
                    className={`flex min-h-[12rem] flex-col rounded-xl border p-2 ${dragging ? 'border-dashed border-slate-400 bg-slate-50' : 'border-slate-200 bg-slate-50/60'}`}
                  >
                    <div className="mb-2 flex items-center justify-between px-1">
                      <span className="text-xs font-semibold text-slate-700">{spec?.label || col.label}</span>
                      <span className="text-[11px] text-slate-500">{col.tasks.length}</span>
                    </div>
                    <div className="flex-1 space-y-2">
                      {col.tasks.map((t) => (
                        <BoardCard key={t.id} task={t} clients={clients} lists={lists} onOpen={(x) => setSelectedId(x.id)} onDragStart={setDragging} />
                      ))}
                      {col.key === 'done' && !filters.showDone && col.tasks.length === 0 && (
                        <p className="px-1 text-[11px] text-slate-400">Hidden. Tick &ldquo;Show done&rdquo; to see finished work.</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Due-date legend when grouped by due: what the buckets mean. */}
          {view === 'list' && groupBy === 'due' && (
            <p className="text-[11px] text-slate-400">
              {DUE_BUCKETS.map((b) => b.label).join(' · ')}. A finished task is never overdue.
            </p>
          )}
        </div>
      </div>

      {selected && (
        <TaskDrawer
          task={selected}
          allTasks={tasks}
          clients={clients}
          lists={lists}
          knownPeople={people}
          knownTagList={tagList}
          me={me}
          onChanged={absorb}
          onClose={() => setSelectedId(null)}
          onOpenTask={(t) => setSelectedId(t.id)}
        />
      )}
    </Layout>
  )
}
