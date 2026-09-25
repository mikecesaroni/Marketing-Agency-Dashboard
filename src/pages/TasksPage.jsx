import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { Card, Input, Select } from '../components/ui'
import TaskDrawer, { ListDot, PriorityFlag } from '../components/tasks/TaskDrawer'
import TeamPanel, { MemberBadge } from '../components/tasks/TeamPanel'
import {
  LIST_COLORS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  assigneeCounts,
  filterTasks,
  groupTasks,
  isOverdue,
  isoDay,
  knownNames,
  knownTags,
  nestSubtasks,
  parseQuickAdd,
  personColumns,
  progress,
  reassign,
  summarise,
} from '../lib/tasks'
import { createList, createTask, fetchBoard, readMe, saveMe, updateTask } from '../lib/tasksData'

/**
 * The team's task board.
 *
 * Work has two axes anyone here cares about: WHO is doing it and WHICH CLIENT
 * it is for. So the screen is four views, not a folder tree:
 *
 *   My day    your overdue, today, this week, later. Open the page, see it.
 *   Team      one column per person. Drag a card to hand it to someone else.
 *             The empty column is the point: who has room.
 *   Clients   grouped by client, then the agency's own lists, then the inbox.
 *   All       the full list grouped any way, or a board by status.
 *
 * One quick-add bar files a task wherever you are looking: on Maria's chip it
 * is hers, on Reliable it is Reliable's. The people are avatar chips, the
 * client or list is one dropdown, and both double as filters and as where a
 * new task goes. ClickUp's model underneath (docs/tasks.md); its sidebar
 * tree left out, because five people do not need a tree.
 */

const VIEWS = [
  ['day', 'My day'],
  ['team', 'Team'],
  ['clients', 'Clients'],
  ['all', 'All'],
]

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

// ------------------------------------------------------------ small parts

function DuePill({ task }) {
  if (!task.due_date) return null
  const late = isOverdue(task)
  const isToday = task.due_date === isoDay() && task.status !== 'done'
  const cls = late
    ? 'bg-red-100 text-red-700'
    : isToday
      ? 'bg-amber-100 text-amber-800'
      : task.status === 'done'
        ? 'bg-slate-100 text-slate-400'
        : 'bg-slate-100 text-slate-600'
  return (
    <span className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      {late ? `Overdue · ${fmtDay(task.due_date)}` : isToday ? 'Today' : fmtDay(task.due_date)}
    </span>
  )
}

function Where({ task, clients, lists }) {
  if (task.client_id) {
    const c = clients.find((x) => x.id === task.client_id)
    return (
      <Link to={`/client/${task.client_id}`} onClick={(e) => e.stopPropagation()} className="truncate rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-800 hover:underline">
        {c?.name || 'Client'}
      </Link>
    )
  }
  if (task.list_id) {
    const l = lists.find((x) => x.id === task.list_id)
    return (
      <span className="inline-flex items-center gap-1 truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
        <ListDot color={l?.color} />
        {l?.name || 'List'}
      </span>
    )
  }
  return null
}

function Avatars({ task, members }) {
  if (!task.assignees?.length) return null
  return (
    <span className="inline-flex items-center -space-x-1">
      {task.assignees.map((a) => (
        <MemberBadge key={a} name={a} members={members} />
      ))}
    </span>
  )
}

function Progress({ task }) {
  const p = progress(task)
  if (!p.total) return null
  const full = p.done === p.total
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] ${full ? 'text-green-700' : 'text-slate-500'}`}>
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-slate-200">
        <span className={`block h-full ${full ? 'bg-green-500' : 'bg-slate-400'}`} style={{ width: `${(p.done / p.total) * 100}%` }} />
      </span>
      {p.done}/{p.total}
    </span>
  )
}

function Tags({ task }) {
  return task.tags?.map((t) => (
    <span key={t} className="rounded bg-purple-50 px-1 text-[10px] text-purple-800">
      #{t}
    </span>
  ))
}

/** A row in any list. */
function TaskRow({ task, clients, lists, members, onOpen, onToggle, sub = false, hideWhere = false, hideWho = false }) {
  const done = task.status === 'done'
  return (
    <li className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-slate-50 ${sub ? 'pl-10' : ''}`} onClick={() => onOpen(task)}>
      <input
        type="checkbox"
        checked={done}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggle(task)}
        className="h-4 w-4 flex-shrink-0 rounded border-slate-300 accent-green-600"
        title={done ? 'Reopen' : 'Mark done'}
      />
      <PriorityFlag priority={task.priority} />
      <span className={`min-w-0 flex-1 truncate text-sm ${done ? 'line-through text-slate-400' : 'text-slate-900'}`}>{task.title}</span>
      <span className="flex flex-shrink-0 items-center gap-2">
        {!hideWhere && <Where task={task} clients={clients} lists={lists} />}
        <span className="hidden md:inline-flex md:items-center md:gap-2">
          <Tags task={task} />
          <Progress task={task} />
        </span>
        {task.repeat && (
          <span className="text-[11px] text-slate-400" title={`Repeats ${task.repeat}`}>
            ↻
          </span>
        )}
        {!hideWho && <Avatars task={task} members={members} />}
        <DuePill task={task} />
      </span>
    </li>
  )
}

/** A card on any board. */
function TaskCard({ task, clients, lists, members, onOpen, onDragStart, hideWhere = false, hideWho = false }) {
  const done = task.status === 'done'
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart(task.id)
      }}
      onClick={() => onOpen(task)}
      className="cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-px hover:border-slate-300 hover:shadow active:cursor-grabbing"
    >
      <div className="flex items-start gap-2">
        <PriorityFlag priority={task.priority} className="mt-1.5" />
        <p className={`flex-1 text-sm leading-snug ${done ? 'line-through text-slate-400' : 'text-slate-900'}`}>{task.title}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {!hideWhere && <Where task={task} clients={clients} lists={lists} />}
        <Tags task={task} />
        <Progress task={task} />
        <span className="ml-auto inline-flex items-center gap-1.5">
          {task.repeat && (
            <span className="text-[11px] text-slate-400" title={`Repeats ${task.repeat}`}>
              ↻
            </span>
          )}
          {!hideWho && <Avatars task={task} members={members} />}
          <DuePill task={task} />
        </span>
      </div>
    </div>
  )
}

function GroupCard({ label, count, tone = 'default', children, defaultOpen = true, right }) {
  const [open, setOpen] = useState(defaultOpen)
  const labelCls = tone === 'danger' ? 'text-red-700' : tone === 'warning' ? 'text-amber-800' : 'text-slate-800'
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex items-center gap-2 bg-slate-50/80 px-3 py-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-2 text-left">
          <span className="text-slate-400">{open ? '▾' : '▸'}</span>
          <span className={`text-xs font-semibold ${labelCls}`}>{label}</span>
          <span className="rounded-full bg-white px-1.5 text-[11px] text-slate-500 ring-1 ring-slate-200">{count}</span>
        </button>
        {right}
      </div>
      {open && children}
    </Card>
  )
}

function Empty({ children }) {
  return (
    <Card padding="lg" className="text-center text-sm text-slate-500">
      {children}
    </Card>
  )
}

/** A drop target column, for the Team and Status boards. */
function Column({ id, header, tasks, dragging, onDrop, render, footer }) {
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        onDrop()
      }}
      data-column={id}
      className={`flex min-h-[14rem] w-72 flex-shrink-0 flex-col rounded-2xl border p-2.5 transition md:w-auto md:flex-shrink ${
        over ? 'border-orange-400 bg-orange-50/60' : dragging ? 'border-dashed border-slate-300 bg-slate-50' : 'border-slate-200 bg-slate-50/70'
      }`}
    >
      {header}
      <div className="mt-2 flex-1 space-y-2">
        {tasks.map(render)}
        {tasks.length === 0 && <p className="px-1 pt-2 text-center text-[11px] text-slate-400">{footer || 'Nothing here'}</p>}
      </div>
    </div>
  )
}

/** Rows for a group, with subtasks folded under their parent. */
function Rows({ tasks, rowProps, hideWhere, hideWho }) {
  return (
    <ul className="divide-y divide-slate-100">
      {tasks.map((t) => (
        <li key={t.id}>
          <ul>
            <TaskRow task={t} {...rowProps} hideWhere={hideWhere} hideWho={hideWho} />
            {t.subtasks?.map((s) => (
              <TaskRow key={s.id} task={s} {...rowProps} sub hideWhere={hideWhere} hideWho={hideWho} />
            ))}
          </ul>
        </li>
      ))}
      {tasks.length === 0 && <li className="px-3 py-2 text-xs text-slate-400">Nothing here.</li>}
    </ul>
  )
}

// ---------------------------------------------------------------- the page

export default function TasksPage() {
  const [board, setBoard] = useState({ tasks: [], lists: [], clients: [], members: [] })
  const [loading, setLoading] = useState(true)
  const [slow, setSlow] = useState(false)
  const [error, setError] = useState('')
  const [me, setMe] = useState(readMe)

  // Always opens on Team: who has what is the first question every time,
  // and a remembered view meant the page opened somewhere different for
  // each person. Asked for on 2026-09-24.
  const [view, setView] = useState('team')
  const [allMode, setAllMode] = useState('list')
  const [groupBy, setGroupBy] = useState('status')
  // The two filters that are also where a new task goes.
  const [person, setPerson] = useState('')
  const [where, setWhere] = useState('') // '' | 'inbox' | 'c:<id>' | 'l:<id>'
  const [filters, setFilters] = useState({ priority: '', tag: '', showDone: false, search: '' })
  const [selectedId, setSelectedId] = useState(null)
  const [quick, setQuick] = useState('')
  // The add bar's own "for whom" and "where". They follow the filters above
  // (pick Reliable up there and the bar files under Reliable) but can be
  // changed right in the bar without changing what you are looking at.
  const [addWhere, setAddWhere] = useState('')
  const [addPerson, setAddPerson] = useState('')
  const [teamOpen, setTeamOpen] = useState(false)
  const [addingList, setAddingList] = useState(false)
  const [listDraft, setListDraft] = useState('')
  // {id, from}: the card being dragged and the person column it left.
  const [dragging, setDragging] = useState(null)

  useEffect(() => {
    setAddWhere(where === 'inbox' ? '' : where)
  }, [where])
  useEffect(() => {
    if (view === 'day') setAddPerson(me || '')
    else if (view !== 'team') setAddPerson(person)
  }, [person, view, me])

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

  // A database that cannot be reached does not fail, it waits. Say so.
  useEffect(() => {
    if (!loading) return
    const t = setTimeout(() => setSlow(true), 12000)
    return () => clearTimeout(t)
  }, [loading])

  // One task changed (or was deleted): patch in place, no flicker.
  const absorb = useCallback((row) => {
    if (!row?.id) return
    setBoard((prev) => {
      if (row.deleted) return { ...prev, tasks: prev.tasks.filter((t) => t.id !== row.id && t.parent_id !== row.id) }
      const exists = prev.tasks.some((t) => t.id === row.id)
      return { ...prev, tasks: exists ? prev.tasks.map((t) => (t.id === row.id ? { ...t, ...row } : t)) : [...prev.tasks, row] }
    })
  }, [])

  const { tasks, lists, clients, members } = board
  const people = useMemo(() => knownNames(tasks, members), [tasks, members])
  const tagList = useMemo(() => knownTags(tasks), [tasks])
  const summary = useMemo(() => summarise(tasks), [tasks])
  const perPerson = useMemo(() => assigneeCounts(tasks), [tasks])
  const names = useMemo(
    () => ({
      clients: Object.fromEntries(clients.map((c) => [c.id, c.name])),
      lists: Object.fromEntries(lists.map((l) => [l.id, l.name])),
    }),
    [clients, lists]
  )

  const scope = useMemo(() => {
    if (where === 'inbox') return { kind: 'inbox' }
    if (where.startsWith('c:')) return { kind: 'client', id: where.slice(2) }
    if (where.startsWith('l:')) return { kind: 'list', id: where.slice(2) }
    return { kind: 'all' }
  }, [where])

  // The shared filter every view starts from. The Team view ignores `person`
  // (people are its columns); My day uses me instead.
  const base = useMemo(() => ({ ...filters, scope }), [filters, scope])
  const visibleAll = useMemo(
    () => nestSubtasks(filterTasks(tasks, { ...base, assignee: view === 'team' ? '' : person })),
    [tasks, base, person, view]
  )
  const mine = useMemo(() => nestSubtasks(filterTasks(tasks, { ...base, assignee: me })), [tasks, base, me])

  const dayGroups = useMemo(() => groupTasks(mine, 'due', { names }), [mine, names])
  const teamCols = useMemo(() => personColumns(visibleAll, members).filter((c) => c.member || c.tasks.length > 0), [visibleAll, members])
  const clientGroups = useMemo(() => groupTasks(visibleAll, 'client', { names }), [visibleAll, names])
  const allGroups = useMemo(() => groupTasks(visibleAll, groupBy, { names }), [visibleAll, groupBy, names])
  const statusCols = useMemo(() => groupTasks(visibleAll, 'status', { names }), [visibleAll, names])

  const selected = selectedId ? tasks.find((t) => t.id === selectedId) : null

  // ------------------------------------------------------------ actions

  const patch = async (task, fields) => {
    absorb({ ...task, ...fields })
    try {
      absorb(await updateTask(task.id, fields))
    } catch (err) {
      setError(err.message)
      load()
    }
  }
  const toggle = (task) => patch(task, { status: task.status === 'done' ? 'todo' : 'done' })

  const places = useMemo(
    () => [...clients.map((c) => ({ key: `c:${c.id}`, name: c.name })), ...lists.map((l) => ({ key: `l:${l.id}`, name: l.name }))],
    [clients, lists]
  )

  const quickAdd = async () => {
    const parsed = parseQuickAdd(quick, undefined, people, places)
    if (!parsed.title) return
    setQuick('')
    // Where: ">reli" in the line wins, then the bar's own picker.
    const target = parsed.place || addWhere
    const home = {}
    if (target.startsWith('c:')) home.client_id = target.slice(2)
    if (target.startsWith('l:')) home.list_id = target.slice(2)
    // Who: "@name" in the line wins, then the bar's own picker.
    if (parsed.assignees.length === 0 && addPerson) parsed.assignees = [addPerson]
    if (view === 'day' && !parsed.due_date) parsed.due_date = isoDay()
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
      setWhere(`l:${made.id}`)
    } catch (err) {
      setError(err.message)
    }
  }

  const dropOnStatus = (status) => {
    const task = tasks.find((t) => t.id === dragging?.id)
    setDragging(null)
    if (task && task.status !== status) patch(task, { status })
  }

  const dropOnPerson = (toName) => {
    const task = tasks.find((t) => t.id === dragging?.id)
    const from = dragging?.from ?? null
    setDragging(null)
    if (!task) return
    const next = reassign(task.assignees || [], from, toName)
    if (JSON.stringify(next) !== JSON.stringify(task.assignees || [])) patch(task, { assignees: next })
  }

  const askMe = () => {
    const name = (prompt('Your name, for My day and to sign what you do:', me) || '').trim()
    if (name) {
      saveMe(name)
      setMe(name)
    }
  }
  const chooseMe = (v) => {
    if (v === '__other') return askMe()
    if (!v) return
    saveMe(v)
    setMe(v)
  }

  const open = (t) => setSelectedId(t.id)
  const rowProps = { clients, lists, members, onOpen: open, onToggle: toggle }
  const cardProps = { clients, lists, members, onOpen: open }
  const whereLabel = scope.kind === 'client' ? names.clients[scope.id] : scope.kind === 'list' ? names.lists[scope.id] : scope.kind === 'inbox' ? 'the inbox' : ''
  const target = [view === 'day' ? me : view !== 'team' ? person : '', whereLabel].filter(Boolean).join(' · ')
  const teamButton = (label) => (
    <button type="button" onClick={() => setTeamOpen(true)} className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-500 hover:border-slate-500 hover:text-slate-800">
      {label}
    </button>
  )

  // ------------------------------------------------------------ render

  return (
    <Layout
      title="Tasks"
      subtitle={loading ? 'Loading…' : `${summary.open} open · ${summary.overdue} overdue · ${summary.dueToday} due today`}
      actions={
        members.length > 0 ? (
          <label className="flex items-center gap-1.5 text-xs text-slate-600" title="Used for My day, who made a task, and who commented">
            You:
            <select
              value={members.some((m) => m.name === me) ? me : me ? '__other' : ''}
              onChange={(e) => chooseMe(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
            >
              <option value="">Pick your name</option>
              {members.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name}
                </option>
              ))}
              <option value="__other">{me && !members.some((m) => m.name === me) ? `${me} (not on team)` : 'Someone else…'}</option>
            </select>
          </label>
        ) : (
          <button type="button" onClick={askMe} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
            {me ? `You: ${me}` : 'Set your name'}
          </button>
        )
      }
    >
      {error && (
        <Card tone="danger" padding="sm" className="mb-3 text-sm text-red-800">
          {error}
        </Card>
      )}

      {/* THE TOP: three numbers, four views. */}
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div className="grid grid-cols-3 gap-2 md:max-w-md">
          {[
            ['Overdue', summary.overdue, summary.overdue ? 'text-red-600' : 'text-slate-900'],
            ['Due today', summary.dueToday, summary.dueToday ? 'text-amber-600' : 'text-slate-900'],
            ['Open', summary.open, 'text-slate-900'],
          ].map(([label, n, cls]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              <p className={`text-xl font-bold tabular-nums ${cls}`}>{loading ? '–' : n}</p>
            </div>
          ))}
        </div>
        <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm">
          {VIEWS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setView(k)}
              className={`rounded-lg px-3.5 py-1.5 font-medium transition ${view === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* QUICK ADD: one line, plus who it is for and where it goes, right
          here. The two pickers follow the filters above but are the bar's
          own, so "add one for Reliable" never means changing what you see. */}
      <div className="mb-3 rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 to-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg leading-none text-orange-500">+</span>
          <input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
            placeholder="Add a task…"
            className="min-w-[12rem] flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <select
            value={addWhere}
            onChange={(e) => setAddWhere(e.target.value)}
            title="Which client or list this task is for"
            className={`max-w-[12rem] rounded-lg border px-2 py-1.5 text-xs ${addWhere ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-slate-300 bg-white text-slate-600'}`}
          >
            <option value="">Where: inbox</option>
            <optgroup label="Clients">
              {clients.map((c) => (
                <option key={c.id} value={`c:${c.id}`}>
                  {c.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Lists">
              {lists.map((l) => (
                <option key={l.id} value={`l:${l.id}`}>
                  {l.name}
                </option>
              ))}
            </optgroup>
          </select>
          {members.length > 0 && (
            <select
              value={members.some((m) => m.name === addPerson) ? addPerson : ''}
              onChange={(e) => setAddPerson(e.target.value)}
              title="Who this task is for"
              className={`max-w-[10rem] rounded-lg border px-2 py-1.5 text-xs ${addPerson ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-600'}`}
            >
              <option value="">For: anyone</option>
              {members.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={quickAdd} disabled={!quick.trim()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-30">
            Add
          </button>
        </div>
      </div>

      {/* PEOPLE + WHERE: filters that are also the target. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {view === 'team' || view === 'day' ? (
          teamButton(members.length ? 'Manage team' : '+ Add your team')
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            {members.map((m) => {
              const on = person === m.name
              const n = perPerson[m.name.toLowerCase()]
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPerson(on ? '' : m.name)}
                  title={m.title || m.name}
                  className={`inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs transition ${
                    on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                  }`}
                >
                  <MemberBadge name={m.name} members={members} />
                  {m.name}
                  {n > 0 && <span className={`rounded-full px-1 text-[10px] ${on ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{n}</span>}
                </button>
              )
            })}
            {teamButton(members.length ? 'Team' : '+ Add your team')}
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div>
            <Select size="sm" value={where} onChange={(e) => setWhere(e.target.value)}>
              <option value="">Every client and list</option>
              <option value="inbox">Inbox (unfiled)</option>
              <optgroup label="Clients">
                {clients.map((c) => (
                  <option key={c.id} value={`c:${c.id}`}>
                    {c.name}
                    {summary.byClient[c.id] ? ` (${summary.byClient[c.id]})` : ''}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Lists">
                {lists.map((l) => (
                  <option key={l.id} value={`l:${l.id}`}>
                    {l.name}
                    {summary.byList[l.id] ? ` (${summary.byList[l.id]})` : ''}
                  </option>
                ))}
              </optgroup>
            </Select>
          </div>
          {addingList ? (
            <div className="w-44">
              <Input
                size="sm"
                autoFocus
                value={listDraft}
                onChange={(e) => setListDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addList()
                  if (e.key === 'Escape') setAddingList(false)
                }}
                placeholder="New list name, Enter"
              />
            </div>
          ) : (
            <button type="button" onClick={() => setAddingList(true)} className="text-xs text-slate-500 hover:text-slate-900 hover:underline">
              + list
            </button>
          )}
          {view === 'all' && (
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
          )}
          {view === 'all' && tagList.length > 0 && (
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
          <div className="w-36">
            <Input size="sm" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} placeholder="Search" />
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">
          Loading tasks…
          {slow && <span className="block text-xs text-amber-700">Still waiting on the database. If this does not clear, Supabase may be unreachable or paused.</span>}
        </p>
      ) : view === 'day' ? (
        /* MY DAY --------------------------------------------------------- */
        !me ? (
          <Empty>Pick your name at the top right and this becomes your day: what is overdue, what is due today, what is coming.</Empty>
        ) : mine.length === 0 ? (
          <Empty>Nothing on your plate{whereLabel ? ` for ${whereLabel}` : ''}. Add one above, or look at the Team view.</Empty>
        ) : (
          <div className="space-y-3">
            {dayGroups.map((g) => (
              <GroupCard
                key={g.key}
                label={g.label}
                count={g.tasks.length}
                tone={g.key === 'overdue' ? 'danger' : g.key === 'today' ? 'warning' : 'default'}
                defaultOpen={g.key !== 'later' && g.key !== 'none'}
              >
                <Rows tasks={g.tasks} rowProps={rowProps} hideWho />
              </GroupCard>
            ))}
          </div>
        )
      ) : view === 'team' ? (
        /* TEAM ----------------------------------------------------------- */
        members.length === 0 ? (
          <Empty>
            Add your team and this becomes a column per person. Drag a card between columns to hand work over.
            <div className="mt-3">
              <button type="button" onClick={() => setTeamOpen(true)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                + Add your team
              </button>
            </div>
          </Empty>
        ) : (
          <div
            className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:px-0"
            style={{ gridTemplateColumns: `repeat(${Math.min(teamCols.length, 5)}, minmax(0, 1fr))` }}
          >
            {teamCols.map((col) => {
              const overdue = col.tasks.filter((t) => isOverdue(t)).length
              const name = col.member ? col.member.name : col.key ? col.label : null
              return (
                <Column
                  key={col.key}
                  id={col.key || 'unassigned'}
                  tasks={col.tasks}
                  dragging={dragging}
                  onDrop={() => dropOnPerson(name)}
                  footer={col.member ? `${col.label} has room` : 'Everything is with someone'}
                  header={
                    <div className="flex items-center gap-2 px-1">
                      {col.member ? (
                        <MemberBadge name={col.label} members={members} size="md" />
                      ) : (
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-slate-300 text-[11px] text-slate-400">?</span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{col.label}</p>
                        {col.member?.title && <p className="truncate text-[11px] text-slate-500">{col.member.title}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums text-slate-900">{col.tasks.filter((t) => t.status !== 'done').length}</p>
                        {overdue > 0 && <p className="text-[10px] font-semibold text-red-600">{overdue} overdue</p>}
                      </div>
                    </div>
                  }
                  render={(t) => <TaskCard key={t.id} task={t} {...cardProps} hideWho onDragStart={(id) => setDragging({ id, from: name })} />}
                />
              )
            })}
          </div>
        )
      ) : view === 'clients' ? (
        /* CLIENTS -------------------------------------------------------- */
        clientGroups.length === 0 ? (
          <Empty>No open tasks{target ? ` for ${target}` : ''}. Pick a client in the dropdown and add one above.</Empty>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {clientGroups.map((g) => {
              const overdue = g.tasks.filter((t) => isOverdue(t)).length
              const clientId = g.key.startsWith('c:') ? g.key.slice(2) : null
              return (
                <GroupCard
                  key={g.key}
                  label={g.label}
                  count={g.tasks.length}
                  right={
                    <span className="flex items-center gap-2">
                      {overdue > 0 && <span className="text-[11px] font-semibold text-red-600">{overdue} overdue</span>}
                      {clientId && (
                        <Link to={`/client/${clientId}`} className="text-[11px] text-blue-700 hover:underline">
                          open client →
                        </Link>
                      )}
                    </span>
                  }
                >
                  <Rows tasks={g.tasks} rowProps={rowProps} hideWhere />
                </GroupCard>
              )
            })}
          </div>
        )
      ) : (
        /* ALL ------------------------------------------------------------ */
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs">
              {[
                ['list', 'List'],
                ['board', 'Board'],
              ].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setAllMode(k)} className={`rounded-md px-2.5 py-1 ${allMode === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                  {label}
                </button>
              ))}
            </div>
            {allMode === 'list' && (
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
            <span className="text-xs text-slate-500">{visibleAll.length} shown</span>
          </div>

          {visibleAll.length === 0 ? (
            <Empty>{tasks.length === 0 ? 'No tasks yet. Type one above.' : 'Nothing matches. Clear a filter, or tick Show done.'}</Empty>
          ) : allMode === 'list' ? (
            allGroups.map((g) =>
              g.tasks.length === 0 && groupBy !== 'status' ? null : (
                <GroupCard key={g.key} label={g.label} count={g.tasks.length} tone={g.key === 'overdue' ? 'danger' : 'default'}>
                  <Rows tasks={g.tasks} rowProps={rowProps} />
                </GroupCard>
              )
            )
          ) : (
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:px-0">
              {statusCols.map((col) => {
                const spec = TASK_STATUSES.find((s) => s.key === col.key)
                return (
                  <Column
                    key={col.key}
                    id={col.key}
                    tasks={col.tasks}
                    dragging={dragging}
                    onDrop={() => dropOnStatus(col.key)}
                    footer={col.key === 'done' && !filters.showDone ? 'Hidden. Tick Show done to see finished work.' : 'Nothing here'}
                    header={
                      <div className="flex items-center justify-between px-1">
                        <span className="text-sm font-semibold text-slate-900">{spec?.label || col.label}</span>
                        <span className="text-xs text-slate-500">{col.tasks.length}</span>
                      </div>
                    }
                    render={(t) => <TaskCard key={t.id} task={t} {...cardProps} onDragStart={(id) => setDragging({ id, from: null })} />}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}

      {selected && (
        <TaskDrawer
          task={selected}
          allTasks={tasks}
          clients={clients}
          lists={lists}
          members={members}
          knownTagList={tagList}
          me={me}
          onChanged={absorb}
          onClose={() => setSelectedId(null)}
          onOpenTask={(t) => setSelectedId(t.id)}
        />
      )}
      {teamOpen && <TeamPanel members={members} onChanged={load} onClose={() => setTeamOpen(false)} />}
    </Layout>
  )
}
