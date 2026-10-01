import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { createTask, readMe, updateTask } from '../lib/tasksData'
import { isOverdue, isoDay, knownNames, parseQuickAdd, repeatLabel, sortTasks } from '../lib/tasks'
import { extractTasksFromChat } from '../lib/clientTasks'
import { Button, Card } from './ui'
import { cached, keys } from '../lib/pageCache'

/**
 * This client's tasks, straight from the Tasks tab.
 *
 * One list, not two: a task added here is on the Tasks tab under this
 * client, and one made there shows here. Ticking one marks it done, which is
 * also what makes a repeating task's next copy. The quick-add line takes the
 * same shorthand as the Tasks tab ("@Kyle fri", "every week", "!urgent").
 *
 * The old per-client checklist (client_tasks) is no longer shown; its rows
 * are still in the database, untouched.
 */
export default function ClientTasksPanel({ client, onAsk, onChange }) {
  const [tasks, setTasks] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [line, setLine] = useState('')
  const [error, setError] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    try {
      await cached(
        keys.clientTasks(client.id),
        async () => {
          const [t, m] = await Promise.all([
            supabase.from('tasks').select('*').eq('client_id', client.id).is('parent_id', null).order('created_at'),
            supabase.from('team_members').select('name').eq('active', true).order('sort_order').order('name'),
          ])
          if (t.error) throw t.error
          return { tasks: t.data || [], members: m.data || [] }
        },
        (d) => {
          setTasks(d.tasks)
          setMembers(d.members)
          setLoading(false)
        }
      )
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }, [client.id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    onChange?.(tasks)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks])

  const today = isoDay()
  const open = useMemo(() => sortTasks(tasks.filter((t) => t.status !== 'done')), [tasks])
  const done = useMemo(
    () => tasks.filter((t) => t.status === 'done').sort((a, b) => String(b.completed_at || b.updated_at || '').localeCompare(String(a.completed_at || a.updated_at || ''))),
    [tasks]
  )
  const names = useMemo(() => knownNames(tasks, members), [tasks, members])

  const add = async () => {
    const text = line.trim()
    if (!text) return
    const parsed = parseQuickAdd(text, today, names)
    if (!parsed.title) return
    setLine('')
    setError('')
    try {
      const row = await createTask({ ...parsed, client_id: client.id, created_by: readMe() || null })
      setTasks((prev) => [...prev, row])
    } catch (err) {
      setError(err.message)
      setLine(text)
    }
  }

  const toggle = async (task) => {
    const next = task.status === 'done' ? 'todo' : 'done'
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)))
    try {
      await updateTask(task.id, { status: next })
      // Marking a repeating task done makes its next copy in the database;
      // reload so it shows up here.
      if (next === 'done' && task.repeat) load()
    } catch (err) {
      setError(err.message)
      load()
    }
  }

  const pullFromChat = async () => {
    setExtracting(true)
    setNote('')
    setError('')
    try {
      const res = await extractTasksFromChat(client.id)
      setNote(res.inserted > 0 ? `Added ${res.inserted} task${res.inserted === 1 ? '' : 's'} from the chat.` : res.note || 'Nothing new to pull from the chat.')
      if (res.inserted > 0) load()
    } catch (err) {
      setError(err.message)
    } finally {
      setExtracting(false)
      setTimeout(() => setNote(''), 5000)
    }
  }

  return (
    <Card id="tasks" padding="none" className="mb-6 scroll-mt-40 p-4 md:mb-8 md:p-6">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Tasks</h2>
          <p className="text-xs text-slate-500">The same list as the Tasks tab, for {client.name}.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={pullFromChat} disabled={extracting} title="Sweep this client's chat history for to-dos and add them here and to the Tasks tab">
            {extracting ? 'Reading chat…' : 'Pull from chat'}
          </Button>
          <Link to="/tasks" className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Open Tasks tab →
          </Link>
        </div>
      </div>

      <div className="mb-3 flex gap-2">
        <input
          value={line}
          onChange={(e) => setLine(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder='Add a task. "@Kyle fri", "every week" and "!urgent" work here too'
          aria-label={`Add a task for ${client.name}`}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <Button onClick={add} disabled={!line.trim()}>
          Add
        </Button>
      </div>
      {note && <p className="mb-2 text-xs text-slate-500">{note}</p>}
      {error && <p className="mb-2 text-xs text-red-700">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : open.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing open for {client.name}.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {open.map((t) => (
            <TaskRow key={t.id} task={t} today={today} onToggle={toggle} onAsk={onAsk} />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowDone((v) => !v)} className="text-xs font-medium text-slate-500 hover:text-slate-800">
            {showDone ? '▾' : '▸'} {done.length} done
          </button>
          {showDone && (
            <ul className="mt-1 divide-y divide-slate-100">
              {done.slice(0, 20).map((t) => (
                <TaskRow key={t.id} task={t} today={today} onToggle={toggle} onAsk={onAsk} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}

function TaskRow({ task, today, onToggle, onAsk }) {
  const isDone = task.status === 'done'
  const late = !isDone && isOverdue(task, today)
  return (
    <li className="flex items-start gap-3 py-2">
      <input
        type="checkbox"
        checked={isDone}
        onChange={() => onToggle(task)}
        className="mt-0.5 h-4 w-4 flex-shrink-0 rounded"
        aria-label={`${isDone ? 'Reopen' : 'Mark done'}: ${task.title}`}
      />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onAsk?.(task)}
          title="Ask the chat how to do this well"
          className={`text-left text-sm hover:text-blue-600 hover:underline ${isDone ? 'text-slate-400 line-through' : 'text-slate-800'}`}
        >
          {task.title}
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
          {task.assignees?.length > 0 && <span className="font-medium text-slate-600">{task.assignees.join(', ')}</span>}
          {task.due_date && <span className={late ? 'font-semibold text-red-600' : ''}>{late ? 'overdue · ' : 'due '}{task.due_date}</span>}
          {task.repeat && <span title={repeatLabel(task.repeat)}>↻ {repeatLabel(task.repeat).toLowerCase()}</span>}
          {task.status === 'in_progress' && <span className="rounded bg-blue-50 px-1.5 text-blue-700">in progress</span>}
          {task.status === 'review' && <span className="rounded bg-amber-50 px-1.5 text-amber-700">review</span>}
          {task.priority === 'urgent' && <span className="rounded bg-red-50 px-1.5 font-semibold text-red-700">urgent</span>}
          {task.priority === 'high' && <span className="rounded bg-orange-50 px-1.5 text-orange-700">high</span>}
          {task.tags?.includes('from chat') && <span className="rounded bg-purple-50 px-1.5 text-purple-700">from chat</span>}
        </div>
        {task.description && <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{task.description}</p>}
      </div>
    </li>
  )
}
