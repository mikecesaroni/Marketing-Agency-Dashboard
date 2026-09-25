// The task board's rules. Pure: tasks in, groups and orders out.
//
// The shape is ClickUp's, cut to size. ClickUp's own hierarchy is
// Workspace > Space > Folder > List > Task > Subtask; here the CRM is the
// workspace, each client is a list, task_lists are the internal ones, and a
// task can have one level of subtasks plus a checklist. Statuses are a fixed
// four, priorities ClickUp's four flags, and "Me mode" is a filter on the
// assignee names.
//
// Everything that decides where a task shows up lives here so it can be
// checked (scripts/check-tasks.mjs) without a browser.

export const TASK_STATUSES = [
  { key: 'todo', label: 'To do', tone: 'neutral' },
  { key: 'in_progress', label: 'In progress', tone: 'info' },
  { key: 'review', label: 'Review', tone: 'warning' },
  { key: 'done', label: 'Done', tone: 'success' },
]

export const STATUS_KEYS = TASK_STATUSES.map((s) => s.key)

// ClickUp's flags, in ClickUp's order. Urgent sorts first.
/**
 * How often a task comes back. Marking a repeating task done makes the next
 * one (supabase/task-repeats.sql), due one period on, always in the future.
 */
export const TASK_REPEATS = [
  { key: '', label: 'Does not repeat' },
  { key: 'daily', label: 'Every day' },
  { key: 'weekly', label: 'Every week' },
  { key: 'biweekly', label: 'Every 2 weeks' },
  { key: 'monthly', label: 'Every month' },
]

export function repeatLabel(key) {
  return TASK_REPEATS.find((r) => r.key === (key || ''))?.label || ''
}

/**
 * The due date the next copy gets: one period after the current due date
 * (today when there is none), pushed forward until it is after today. The
 * same rule the database applies; here so the drawer can say "next one lands
 * on the 3rd" before anyone ticks it off.
 */
export function nextDue(due, repeat, today = isoDay()) {
  if (!repeat) return null
  const base = due || today
  const step = (iso) => {
    if (repeat === 'monthly') {
      // Same as Postgres: the day is clamped to the next month's length and
      // stays clamped (Jan 31 -> Feb 28 -> Mar 28).
      const [y, m, d] = iso.split('-').map(Number)
      const last = new Date(y, m + 1, 0).getDate()
      return isoDay(new Date(y, m, Math.min(d, last)))
    }
    return addDays(iso, repeat === 'daily' ? 1 : repeat === 'biweekly' ? 14 : 7)
  }
  let next = step(base)
  let guard = 0
  while (next <= today && guard < 400) {
    next = step(next)
    guard++
  }
  return next
}

export const TASK_PRIORITIES = [
  { key: 'urgent', label: 'Urgent', color: 'red' },
  { key: 'high', label: 'High', color: 'amber' },
  { key: 'normal', label: 'Normal', color: 'blue' },
  { key: 'low', label: 'Low', color: 'slate' },
]

const PRIORITY_RANK = Object.fromEntries(TASK_PRIORITIES.map((p, i) => [p.key, i]))

// The hues a list can be given. Kept to names that exist in Tailwind so a
// stored value always renders.
export const LIST_COLORS = ['orange', 'blue', 'green', 'purple', 'pink', 'teal', 'slate']

// Where a due date puts a task, ClickUp Home style. Order is display order.
export const DUE_BUCKETS = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week', label: 'This week' },
  { key: 'later', label: 'Later' },
  { key: 'none', label: 'No due date' },
]

/** YYYY-MM-DD in local time. */
export function isoDay(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(iso, n) {
  const [y, m, d] = String(iso).split('-').map(Number)
  const date = new Date(y, m - 1, d + n)
  return isoDay(date)
}

/**
 * Which bucket a task's due date lands in, relative to `today` (YYYY-MM-DD).
 *
 * A done task is never overdue: what was late and then finished is finished.
 * It keeps its real bucket otherwise, so a done-today task shows under Today
 * when done tasks are being shown.
 */
export function dueBucket(task, today = isoDay()) {
  const due = task?.due_date
  if (!due) return 'none'
  if (due < today) return task.status === 'done' ? 'later' : 'overdue'
  if (due === today) return 'today'
  if (due === addDays(today, 1)) return 'tomorrow'
  if (due <= addDays(today, 7)) return 'week'
  return 'later'
}

export function isOverdue(task, today = isoDay()) {
  return Boolean(task?.due_date) && task.status !== 'done' && task.due_date < today
}

/**
 * Sort inside a group. Priority first (urgent at the top), then due date
 * (soonest first, none last), then the hand order, then oldest first so a
 * new task lands at the bottom rather than jumping around.
 */
export function compareTasks(a, b) {
  const pa = PRIORITY_RANK[a.priority] ?? 2
  const pb = PRIORITY_RANK[b.priority] ?? 2
  if (pa !== pb) return pa - pb
  const da = a.due_date || '9999-12-31'
  const db = b.due_date || '9999-12-31'
  if (da !== db) return da < db ? -1 : 1
  const sa = a.sort_order ?? 500
  const sb = b.sort_order ?? 500
  if (sa !== sb) return sa - sb
  return String(a.created_at || '').localeCompare(String(b.created_at || ''))
}

export function sortTasks(tasks) {
  return [...tasks].sort(compareTasks)
}

/**
 * The filters the toolbar offers. Every field optional; an unset field
 * matches everything.
 *
 *   scope       {kind:'all'} | {kind:'client', id} | {kind:'list', id} | {kind:'inbox'}
 *   assignee    a name; 'me' is resolved by the caller into a name
 *   priority    a key
 *   status      a key
 *   tag         a tag
 *   showDone    false hides status 'done' (the default, as ClickUp does)
 *   search      matched against title, description, tags, assignees
 *
 * Subtasks follow their parent: they are filtered as themselves here, and the
 * page nests the survivors under their parent when it has one.
 */
export function filterTasks(tasks, f = {}, today = isoDay()) {
  const q = String(f.search || '').trim().toLowerCase()
  return tasks.filter((t) => {
    if (f.scope) {
      if (f.scope.kind === 'client' && t.client_id !== f.scope.id) return false
      if (f.scope.kind === 'list' && t.list_id !== f.scope.id) return false
      if (f.scope.kind === 'inbox' && (t.client_id || t.list_id)) return false
    }
    if (f.assignee && !(t.assignees || []).some((a) => sameName(a, f.assignee))) return false
    if (f.priority && t.priority !== f.priority) return false
    if (f.status && t.status !== f.status) return false
    if (f.tag && !(t.tags || []).includes(f.tag)) return false
    if (!f.showDone && t.status === 'done') return false
    if (f.due === 'overdue' && !isOverdue(t, today)) return false
    if (f.due === 'today' && !['overdue', 'today'].includes(dueBucket(t, today))) return false
    if (f.due === 'week' && !['overdue', 'today', 'tomorrow', 'week'].includes(dueBucket(t, today))) return false
    if (q) {
      const hay = [t.title, t.description, ...(t.tags || []), ...(t.assignees || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

export function sameName(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
}

/**
 * Group for the List view. `by` is one of status | due | priority | assignee |
 * client. Returns [{key, label, tasks}] in display order, empty groups
 * dropped except for status, where an empty column still means something.
 *
 * `names` resolves client ids and list ids to labels: {clients: {id: name},
 * lists: {id: name}}.
 */
export function groupTasks(tasks, by, { today = isoDay(), names = {} } = {}) {
  const sorted = sortTasks(tasks)
  const buckets = new Map()
  const put = (key, label, t) => {
    if (!buckets.has(key)) buckets.set(key, { key, label, tasks: [] })
    buckets.get(key).tasks.push(t)
  }

  if (by === 'status') {
    for (const s of TASK_STATUSES) buckets.set(s.key, { key: s.key, label: s.label, tasks: [] })
    for (const t of sorted) put(t.status, statusLabel(t.status), t)
    return [...buckets.values()]
  }
  if (by === 'due') {
    for (const t of sorted) {
      const b = dueBucket(t, today)
      put(b, DUE_BUCKETS.find((x) => x.key === b)?.label || b, t)
    }
    return DUE_BUCKETS.map((b) => buckets.get(b.key)).filter(Boolean)
  }
  if (by === 'priority') {
    for (const t of sorted) put(t.priority, priorityLabel(t.priority), t)
    return TASK_PRIORITIES.map((p) => buckets.get(p.key)).filter(Boolean)
  }
  if (by === 'assignee') {
    for (const t of sorted) {
      const who = (t.assignees || []).filter(Boolean)
      if (who.length === 0) put('', 'Unassigned', t)
      for (const a of who) put(a.toLowerCase(), a, t)
    }
    return [...buckets.values()].sort((a, b) => {
      if (a.key === '') return 1
      if (b.key === '') return -1
      return a.label.localeCompare(b.label)
    })
  }
  if (by === 'client') {
    for (const t of sorted) {
      if (t.client_id) put(`c:${t.client_id}`, names.clients?.[t.client_id] || 'Client', t)
      else if (t.list_id) put(`l:${t.list_id}`, names.lists?.[t.list_id] || 'List', t)
      else put('inbox', 'Inbox', t)
    }
    return [...buckets.values()].sort((a, b) => {
      if (a.key === 'inbox') return 1
      if (b.key === 'inbox') return -1
      return a.label.localeCompare(b.label)
    })
  }
  return [{ key: 'all', label: 'All', tasks: sorted }]
}

export function statusLabel(key) {
  return TASK_STATUSES.find((s) => s.key === key)?.label || key
}

export function priorityLabel(key) {
  return TASK_PRIORITIES.find((p) => p.key === key)?.label || key
}

/** Top-level tasks with their subtasks attached as `.subtasks`. */
export function nestSubtasks(tasks) {
  const byParent = new Map()
  for (const t of tasks) {
    if (!t.parent_id) continue
    if (!byParent.has(t.parent_id)) byParent.set(t.parent_id, [])
    byParent.get(t.parent_id).push(t)
  }
  const ids = new Set(tasks.map((t) => t.id))
  return tasks
    // A subtask whose parent is not in the set (filtered out, or deleted)
    // shows on its own rather than vanishing.
    .filter((t) => !t.parent_id || !ids.has(t.parent_id))
    .map((t) => ({ ...t, subtasks: sortTasks(byParent.get(t.id) || []) }))
}

/** {done, total} across a task's checklist and its subtasks. */
export function progress(task) {
  const items = Array.isArray(task?.checklist) ? task.checklist : []
  const subs = Array.isArray(task?.subtasks) ? task.subtasks : []
  const total = items.length + subs.length
  const done = items.filter((i) => i?.done).length + subs.filter((s) => s.status === 'done').length
  return { done, total }
}

/**
 * Quick-add shorthand, the way ClickUp's task bar reads a line:
 *
 *   "Fix the Reliable form !high @Ethan #meta due tomorrow"
 *
 *   !urgent !high !low     priority (default normal)
 *   @Name                  an assignee (several allowed; single word)
 *   #tag                   a tag (several allowed)
 *   >reliable              where it goes: a client or list, matched on the
 *                          start of a word in its name; one match wins,
 *                          several matches or none leave it where you are
 *   due today|tomorrow|YYYY-MM-DD|mon..sun   a due date
 *
 * Whatever is left is the title. Nothing is guessed from plain words: "urgent"
 * in a sentence is a word, "!urgent" is a flag.
 *
 * `places` is [{key, name}] for the > shorthand: every client and list.
 */
export function parseQuickAdd(line, today = isoDay(), known = [], places = []) {
  const out = { title: '', priority: 'normal', assignees: [], tags: [], due_date: null, place: null, repeat: null }
  let rest = String(line || '')

  // "every week", "every 2 weeks", "every month", "every day", "weekly",
  // or "every fri": weekly, and due next Friday when no other due is given.
  // "every ..." anywhere; a bare "weekly" only at the end of the line, so
  // "Post the weekly video" keeps its title.
  rest = rest.replace(
    /\bevery\s+(day|week|2\s*weeks|other\s+week|month|mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\s(daily|weekly|biweekly|monthly)\s*$/i,
    (_, every, word) => {
      const w = (every || word).toLowerCase().replace(/\s+/g, ' ')
      if (w === 'day' || w === 'daily') out.repeat = 'daily'
      else if (w === 'week' || w === 'weekly') out.repeat = 'weekly'
      else if (w === '2 weeks' || w === 'other week' || w === 'biweekly') out.repeat = 'biweekly'
      else if (w === 'month' || w === 'monthly') out.repeat = 'monthly'
      else {
        out.repeat = 'weekly'
        out.due_date = resolveDay(w, today)
      }
      return ' '
    }
  )

  rest = rest.replace(/(^|\s)>([\w&'.-]+)/g, (_, sp, word) => {
    const hit = matchPlace(word, places)
    if (hit) out.place = hit.key
    // An unmatched >word is left in the title so it is not silently lost.
    return hit ? sp : `${sp}>${word}`
  })

  rest = rest.replace(/(^|\s)!(urgent|high|normal|low)\b/gi, (_, sp, p) => {
    out.priority = p.toLowerCase()
    return sp
  })
  rest = rest.replace(/(^|\s)#([\w-]+)/g, (_, sp, tag) => {
    out.tags.push(tag.toLowerCase())
    return sp
  })
  rest = rest.replace(/(^|\s)@([\w.-]+)/g, (_, sp, name) => {
    // Match a known name case-insensitively so "@ethan" files under "Ethan".
    const hit = known.find((k) => sameName(k, name))
    out.assignees.push(hit || name)
    return sp
  })
  rest = rest.replace(
    /\bdue\s+(today|tomorrow|\d{4}-\d{2}-\d{2}|mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    (_, when) => {
      out.due_date = resolveDay(when.toLowerCase(), today)
      return ' '
    }
  )
  // A repeating task with no day named is due today, so the chain starts now.
  if (out.repeat && !out.due_date) out.due_date = today

  out.title = rest.replace(/\s+/g, ' ').trim()
  return out
}

/**
 * The one place a word names, or null. A word matches a place when some word
 * of the place's name starts with it ("reli" -> Reliable Heating). Exactly
 * one match is required: "h" hitting Horizon HVAC and Horizon Water Co is
 * nothing, not the first.
 */
export function matchPlace(word, places = []) {
  const w = String(word || '').toLowerCase()
  if (!w) return null
  const hits = places.filter((p) =>
    String(p.name || '')
      .toLowerCase()
      .split(/[^a-z0-9&']+/)
      .some((part) => part.startsWith(w))
  )
  if (hits.length === 1) return hits[0]
  // A whole-name match beats a crowd of prefix matches.
  const exact = hits.find((p) => String(p.name || '').toLowerCase() === w)
  return exact || null
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function resolveDay(word, today) {
  if (word === 'today') return today
  if (word === 'tomorrow') return addDays(today, 1)
  if (/^\d{4}-\d{2}-\d{2}$/.test(word)) return word
  const idx = DAYS.indexOf(word.slice(0, 3))
  if (idx < 0) return null
  const [y, m, d] = today.split('-').map(Number)
  const cur = new Date(y, m - 1, d).getDay()
  // The NEXT such day, never today: "due fri" on a Friday means next Friday.
  const ahead = ((idx - cur + 7) % 7) || 7
  return addDays(today, ahead)
}

/**
 * Names for the pickers: the team roster first, in roster order, then any
 * name seen on a task that is not on the roster (typed before the roster
 * existed, or a contractor). Deduped case-insensitively, roster spelling wins.
 */
export function knownNames(tasks, members = []) {
  const seen = new Map()
  for (const m of members) {
    const k = String(m?.name || '').trim()
    if (k && !seen.has(k.toLowerCase())) seen.set(k.toLowerCase(), k)
  }
  const extra = new Map()
  for (const t of tasks) {
    for (const a of t.assignees || []) {
      const k = String(a).trim()
      if (k && !seen.has(k.toLowerCase()) && !extra.has(k.toLowerCase())) extra.set(k.toLowerCase(), k)
    }
  }
  return [...seen.values(), ...[...extra.values()].sort((a, b) => a.localeCompare(b))]
}

/** Open top-level tasks per assignee name (lower-cased key), for the sidebar. */
export function assigneeCounts(tasks) {
  const out = {}
  for (const t of tasks) {
    if (t.status === 'done' || t.parent_id) continue
    for (const a of t.assignees || []) {
      const k = String(a).trim().toLowerCase()
      if (k) out[k] = (out[k] || 0) + 1
    }
  }
  return out
}

/** "Ethan Cesaroni" -> "EC", "maria" -> "M". */
export function initials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

/**
 * The Team view: one column per roster member, in roster order, then
 * Unassigned, then anyone on a task who is not on the roster. Empty columns
 * stay, because an empty column is the point of the view (who has room).
 * A task with two assignees appears in both columns.
 */
export function personColumns(tasks, members = []) {
  const sorted = sortTasks(tasks)
  const cols = members.map((m) => ({ key: m.name.toLowerCase(), label: m.name, member: m, tasks: [] }))
  const byKey = new Map(cols.map((c) => [c.key, c]))
  const unassigned = { key: '', label: 'Unassigned', member: null, tasks: [] }
  const extras = new Map()
  for (const t of sorted) {
    const who = (t.assignees || []).map((a) => String(a).trim()).filter(Boolean)
    if (who.length === 0) {
      unassigned.tasks.push(t)
      continue
    }
    for (const a of who) {
      const k = a.toLowerCase()
      if (byKey.has(k)) byKey.get(k).tasks.push(t)
      else {
        if (!extras.has(k)) extras.set(k, { key: k, label: a, member: null, tasks: [] })
        extras.get(k).tasks.push(t)
      }
    }
  }
  return [...cols, unassigned, ...[...extras.values()].sort((a, b) => a.label.localeCompare(b.label))]
}

/**
 * Dragging a card from one person's column to another's. The person it left
 * is replaced by the person it landed on; anyone else on the task stays.
 * From Unassigned: the target is added. To Unassigned: the source is removed.
 */
export function reassign(assignees = [], from, to) {
  const rest = assignees.filter((a) => !(from && sameName(a, from)))
  if (!to) return rest
  return rest.some((a) => sameName(a, to)) ? rest : [...rest, to]
}

/** Distinct tags seen across tasks. */
export function knownTags(tasks) {
  const set = new Set()
  for (const t of tasks) for (const tag of t.tags || []) if (tag) set.add(tag)
  return [...set].sort()
}

/** Counts for the sidebar: open tasks, overdue, per client and list. */
export function summarise(tasks, today = isoDay()) {
  const open = tasks.filter((t) => t.status !== 'done' && !t.parent_id)
  const byClient = {}
  const byList = {}
  let inbox = 0
  for (const t of open) {
    if (t.client_id) byClient[t.client_id] = (byClient[t.client_id] || 0) + 1
    else if (t.list_id) byList[t.list_id] = (byList[t.list_id] || 0) + 1
    else inbox++
  }
  return {
    open: open.length,
    overdue: open.filter((t) => isOverdue(t, today)).length,
    dueToday: open.filter((t) => dueBucket(t, today) === 'today').length,
    inbox,
    byClient,
    byList,
  }
}
