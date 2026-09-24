import { useEffect, useRef, useState } from 'react'
import Modal from '../Modal'
import { Badge, Button, Input, Select, Textarea } from '../ui'
import {
  LIST_COLORS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  isOverdue,
  priorityLabel,
  progress,
  sortTasks,
} from '../../lib/tasks'
import { addComment, createTask, deleteComment, deleteTask, fetchComments, updateTask } from '../../lib/tasksData'

/**
 * One task, opened. ClickUp's task view, cut to the fields the board uses:
 * status, priority, assignees, dates, where it lives, tags, description,
 * checklist, subtasks, comments.
 *
 * Every field saves on change, not on a Save button, because a task view
 * that has to be saved is a task view whose changes get lost when somebody
 * clicks the next task. Title and description save on blur so a keystroke
 * is not a write.
 */

const PRIORITY_DOT = {
  urgent: 'bg-red-500',
  high: 'bg-amber-500',
  normal: 'bg-blue-400',
  low: 'bg-slate-300',
}

export function PriorityFlag({ priority, className = '' }) {
  return (
    <span
      title={priorityLabel(priority)}
      className={`inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ${PRIORITY_DOT[priority] || PRIORITY_DOT.normal} ${className}`}
    />
  )
}

export function StatusPills({ value, onChange, size = 'sm' }) {
  const cls = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
  return (
    <div className="inline-flex flex-wrap gap-1">
      {TASK_STATUSES.map((s) => {
        const on = s.key === value
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onChange(s.key)}
            className={`rounded-full border font-medium ${cls} ${
              on
                ? s.key === 'done'
                  ? 'border-green-600 bg-green-600 text-white'
                  : 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {s.label}
          </button>
        )
      })}
    </div>
  )
}

/** Names as chips with an input to add one; the datalist gives the known names. */
function NameChips({ value = [], onChange, known = [], placeholder = 'Add a person' }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const n = draft.trim()
    if (!n) return
    if (!value.some((v) => v.toLowerCase() === n.toLowerCase())) onChange([...value, n])
    setDraft('')
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {value.map((n) => (
        <span key={n} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-800">
          {n}
          <button type="button" onClick={() => onChange(value.filter((v) => v !== n))} className="text-slate-400 hover:text-slate-700" aria-label={`Remove ${n}`}>
            ×
          </button>
        </span>
      ))}
      <input
        list="task-people"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add()
          }
        }}
        onBlur={add}
        placeholder={placeholder}
        className="min-w-[8rem] flex-1 rounded border border-slate-200 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      <datalist id="task-people">
        {known.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </div>
  )
}

function TagChips({ value = [], onChange, known = [] }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const t = draft.trim().replace(/^#/, '').toLowerCase()
    if (!t) return
    if (!value.includes(t)) onChange([...value, t])
    setDraft('')
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded bg-purple-50 px-1.5 py-0.5 text-[11px] text-purple-800">
          #{t}
          <button type="button" onClick={() => onChange(value.filter((v) => v !== t))} className="text-purple-300 hover:text-purple-800" aria-label={`Remove ${t}`}>
            ×
          </button>
        </span>
      ))}
      <input
        list="task-tags"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
            e.preventDefault()
            add()
          }
        }}
        onBlur={add}
        placeholder="Add a tag"
        className="min-w-[6rem] flex-1 rounded border border-slate-200 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      <datalist id="task-tags">
        {known.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-start gap-2 text-sm">
      <span className="pt-1 text-xs font-medium text-slate-500">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()))

export default function TaskDrawer({
  task,
  allTasks,
  clients,
  lists,
  knownPeople,
  knownTagList,
  me,
  onChanged,
  onClose,
  onOpenTask,
}) {
  // A local copy so typing is instant; every change is also written through.
  const [t, setT] = useState(task)
  const [title, setTitle] = useState(task?.title || '')
  const [description, setDescription] = useState(task?.description || '')
  const [comments, setComments] = useState(null)
  const [comment, setComment] = useState('')
  const [subDraft, setSubDraft] = useState('')
  const [checkDraft, setCheckDraft] = useState('')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const titleRef = useRef(null)

  useEffect(() => {
    setT(task)
    setTitle(task?.title || '')
    setDescription(task?.description || '')
    setConfirmDelete(false)
    setError('')
  }, [task])

  useEffect(() => {
    if (!task?.id) return
    let cancelled = false
    setComments(null)
    fetchComments(task.id)
      .then((rows) => !cancelled && setComments(rows))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [task?.id])

  if (!task) return null

  const save = async (patch) => {
    setT((prev) => ({ ...prev, ...patch }))
    setError('')
    try {
      const saved = await updateTask(task.id, patch)
      onChanged?.(saved)
    } catch (err) {
      setError(err.message)
    }
  }

  const subtasks = sortTasks((allTasks || []).filter((x) => x.parent_id === task.id))
  const parent = task.parent_id ? (allTasks || []).find((x) => x.id === task.parent_id) : null
  const checklist = Array.isArray(t.checklist) ? t.checklist : []
  const prog = progress({ checklist, subtasks })
  const client = clients.find((c) => c.id === t.client_id)
  const list = lists.find((l) => l.id === t.list_id)

  const addSubtask = async () => {
    const title = subDraft.trim()
    if (!title) return
    setSubDraft('')
    try {
      const made = await createTask({
        title,
        parent_id: task.id,
        client_id: t.client_id,
        list_id: t.list_id,
        created_by: me || null,
      })
      onChanged?.(made)
    } catch (err) {
      setError(err.message)
    }
  }

  const addCheck = () => {
    const text = checkDraft.trim()
    if (!text) return
    setCheckDraft('')
    save({ checklist: [...checklist, { id: newId(), text, done: false }] })
  }

  const toggleCheck = (id) =>
    save({ checklist: checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c)) })
  const removeCheck = (id) => save({ checklist: checklist.filter((c) => c.id !== id) })

  const postComment = async () => {
    const body = comment.trim()
    if (!body) return
    setComment('')
    try {
      const made = await addComment(task.id, body, me)
      setComments((prev) => [...(prev || []), made])
    } catch (err) {
      setError(err.message)
    }
  }

  const remove = async () => {
    try {
      await deleteTask(task.id)
      onChanged?.({ id: task.id, deleted: true })
      onClose()
    } catch (err) {
      setError(err.message)
    }
  }

  // Where the task lives: one select over "Inbox", every client, every list.
  const homeValue = t.client_id ? `c:${t.client_id}` : t.list_id ? `l:${t.list_id}` : ''
  const setHome = (v) => {
    if (!v) return save({ client_id: null, list_id: null })
    if (v.startsWith('c:')) return save({ client_id: v.slice(2), list_id: null })
    return save({ client_id: null, list_id: v.slice(2) })
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      onBack={parent && onOpenTask ? () => onOpenTask(parent) : undefined}
      backLabel={parent ? 'Parent task' : 'Back'}
      title={parent ? 'Subtask' : 'Task'}
      wide
    >
      <div className="grid gap-6 md:grid-cols-[1fr_16rem]">
        <div className="space-y-5">
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== t.title && save({ title: title.trim() })}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="w-full rounded-lg border border-transparent px-2 py-1 text-lg font-semibold text-slate-900 hover:border-slate-200 focus:border-slate-300 focus:outline-none"
          />

          <StatusPills value={t.status} onChange={(status) => save({ status })} size="md" />

          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Description</p>
            <Textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => description !== (t.description || '') && save({ description: description || null })}
              placeholder="What, why, and anything the next person needs to know."
            />
          </div>

          {/* CHECKLIST: steps not worth a subtask each. Lives inside the task
              as JSON, so ticking one is a single write on this row. */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">Checklist</p>
              {prog.total > 0 && (
                <span className="text-[11px] text-slate-500">
                  {prog.done}/{prog.total} done
                </span>
              )}
            </div>
            <ul className="space-y-1">
              {checklist.map((c) => (
                <li key={c.id} className="group flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={Boolean(c.done)} onChange={() => toggleCheck(c.id)} className="mt-1" />
                  <span className={`flex-1 ${c.done ? 'line-through text-slate-400' : 'text-slate-800'}`}>{c.text}</span>
                  <button type="button" onClick={() => removeCheck(c.id)} className="invisible text-slate-300 hover:text-red-600 group-hover:visible" aria-label="Remove item">
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <Input
              size="sm"
              value={checkDraft}
              onChange={(e) => setCheckDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCheck()}
              placeholder="+ Add a checklist item, Enter to save"
              className="mt-1"
            />
          </div>

          {/* SUBTASKS: real tasks with their own status, assignees and dates,
              one level deep. A subtask of a subtask is a checklist item. */}
          {!parent && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Subtasks</p>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {subtasks.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={s.status === 'done'}
                      onChange={() =>
                        updateTask(s.id, { status: s.status === 'done' ? 'todo' : 'done' })
                          .then(onChanged)
                          .catch((err) => setError(err.message))
                      }
                    />
                    <button type="button" onClick={() => onOpenTask?.(s)} className={`flex-1 truncate text-left hover:underline ${s.status === 'done' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                      {s.title}
                    </button>
                    {s.assignees?.length > 0 && <span className="text-[11px] text-slate-500">{s.assignees.join(', ')}</span>}
                    {s.due_date && (
                      <span className={`text-[11px] ${isOverdue(s) ? 'text-red-600' : 'text-slate-500'}`}>{s.due_date.slice(5)}</span>
                    )}
                  </li>
                ))}
                {subtasks.length === 0 && <li className="px-2 py-1.5 text-xs text-slate-400">None yet.</li>}
              </ul>
              <Input
                size="sm"
                value={subDraft}
                onChange={(e) => setSubDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
                placeholder="+ Add a subtask, Enter to save"
                className="mt-1"
              />
            </div>
          )}

          {/* COMMENTS: the running log, oldest first, the way ClickUp's
              activity reads. Author is whoever this browser says it is. */}
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Comments</p>
            <ul className="space-y-2">
              {comments === null && <li className="text-xs text-slate-400">Loading…</li>}
              {comments?.map((c) => (
                <li key={c.id} className="group rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="font-medium text-slate-700">{c.author || 'Someone'}</span>
                    <span className="flex items-center gap-2">
                      {new Date(c.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      <button
                        type="button"
                        onClick={() =>
                          deleteComment(c.id)
                            .then(() => setComments((prev) => prev.filter((x) => x.id !== c.id)))
                            .catch((err) => setError(err.message))
                        }
                        className="invisible text-slate-300 hover:text-red-600 group-hover:visible"
                        aria-label="Delete comment"
                      >
                        ×
                      </button>
                    </span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-slate-800">{c.body}</p>
                </li>
              ))}
              {comments?.length === 0 && <li className="text-xs text-slate-400">No comments yet.</li>}
            </ul>
            <div className="mt-2 flex gap-2">
              <Textarea
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postComment()
                }}
                placeholder={me ? `Comment as ${me}…` : 'Comment… (set your name at the top of the board to sign it)'}
              />
              <Button variant="dark" size="sm" onClick={postComment} disabled={!comment.trim()}>
                Post
              </Button>
            </div>
          </div>
        </div>

        {/* THE SIDE COLUMN: ClickUp's field rail. */}
        <div className="space-y-3 md:border-l md:border-slate-200 md:pl-4">
          <Row label="Priority">
            <Select size="sm" value={t.priority} onChange={(e) => save({ priority: e.target.value })}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Row>
          <Row label="Assignees">
            <NameChips value={t.assignees || []} onChange={(assignees) => save({ assignees })} known={knownPeople} />
          </Row>
          <Row label="Start">
            <Input size="sm" type="date" value={t.start_date || ''} onChange={(e) => save({ start_date: e.target.value || null })} />
          </Row>
          <Row label="Due">
            <Input size="sm" type="date" value={t.due_date || ''} onChange={(e) => save({ due_date: e.target.value || null })} invalid={isOverdue(t)} />
          </Row>
          <Row label="Where">
            <Select size="sm" value={homeValue} onChange={(e) => setHome(e.target.value)}>
              <option value="">Inbox (no client or list)</option>
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
            </Select>
            {(client || list) && (
              <p className="mt-1 text-[11px] text-slate-500">{client ? 'Shows on this client’s tab and page.' : `In the ${list.name} list.`}</p>
            )}
          </Row>
          <Row label="Tags">
            <TagChips value={t.tags || []} onChange={(tags) => save({ tags })} known={knownTagList} />
          </Row>
          <Row label="Made">
            <p className="text-xs text-slate-600">
              {new Date(t.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              {t.created_by ? ` by ${t.created_by}` : ''}
              {t.completed_at && (
                <>
                  <br />
                  done {new Date(t.completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </>
              )}
            </p>
          </Row>

          <div className="pt-2">
            {confirmDelete ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="danger" size="sm" onClick={remove}>
                  Delete{subtasks.length ? ` + ${subtasks.length} subtask${subtasks.length === 1 ? '' : 's'}` : ''}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} className="text-red-600">
                Delete task
              </Button>
            )}
          </div>

          {error && <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-800">{error}</p>}
        </div>
      </div>
    </Modal>
  )
}

/** A small coloured square for a list, from its stored hue. */
export function ListDot({ color = 'slate' }) {
  const hue = LIST_COLORS.includes(color) ? color : 'slate'
  const cls = {
    orange: 'bg-orange-500',
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    pink: 'bg-pink-500',
    teal: 'bg-teal-500',
    slate: 'bg-slate-400',
  }[hue]
  return <span className={`inline-block h-2.5 w-2.5 flex-shrink-0 rounded-sm ${cls}`} />
}

export function StatusBadge({ status }) {
  const s = TASK_STATUSES.find((x) => x.key === status)
  return <Badge tone={s?.tone || 'neutral'}>{s?.label || status}</Badge>
}
