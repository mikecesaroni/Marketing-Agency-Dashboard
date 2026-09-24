import { useState } from 'react'
import Modal from '../Modal'
import { Button, Input, Select } from '../ui'
import { LIST_COLORS, initials, sameName } from '../../lib/tasks'
import { createMember, removeMember, renameMember, updateMember } from '../../lib/tasksData'

/**
 * The team roster behind the task board: who tasks can be assigned to.
 *
 * Names, not logins. Login is off, and a person can be on the team without
 * one. Tasks store the name, so renaming goes through a database function
 * that renames the person on every task at once, and removing someone takes
 * them off the pickers without touching what they already had.
 */

const BG = {
  orange: 'bg-orange-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  purple: 'bg-purple-500',
  pink: 'bg-pink-500',
  teal: 'bg-teal-500',
  slate: 'bg-slate-500',
}

/** Initials in a coloured circle. Falls back to grey for a name not on the roster. */
export function MemberBadge({ name, members = [], size = 'sm' }) {
  const m = members.find((x) => sameName(x.name, name))
  const cls = BG[m?.color] || 'bg-slate-400'
  const dim = size === 'sm' ? 'h-5 w-5 text-[9px]' : 'h-7 w-7 text-[11px]'
  return (
    <span title={name} className={`inline-flex flex-shrink-0 items-center justify-center rounded-full font-semibold text-white ${cls} ${dim}`}>
      {initials(name) || '?'}
    </span>
  )
}

/**
 * Assignee picker: one chip per team member, click to toggle, plus a box for
 * a name that is not on the roster. The roster is the fast path; the box is
 * for the contractor who does one thing.
 */
export function MemberPicker({ value = [], onChange, members = [], allowOther = true }) {
  const [other, setOther] = useState('')
  const on = (name) => value.some((v) => sameName(v, name))
  const toggle = (name) => onChange(on(name) ? value.filter((v) => !sameName(v, name)) : [...value, name])
  const extras = value.filter((v) => !members.some((m) => sameName(m.name, v)))
  const addOther = () => {
    const n = other.trim()
    if (!n) return
    if (!on(n)) onChange([...value, n])
    setOther('')
  }
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => toggle(m.name)}
            className={`inline-flex items-center gap-1 rounded-full border py-0.5 pl-0.5 pr-2 text-xs ${
              on(m.name) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <MemberBadge name={m.name} members={members} />
            {m.name}
          </button>
        ))}
        {members.length === 0 && <span className="text-[11px] text-slate-400">No team yet. Add people under Team in the sidebar.</span>}
      </div>
      {extras.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {extras.map((n) => (
            <span key={n} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-800">
              {n}
              <button type="button" onClick={() => toggle(n)} className="text-slate-400 hover:text-slate-700" aria-label={`Remove ${n}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {allowOther && (
        <input
          value={other}
          onChange={(e) => setOther(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              addOther()
            }
          }}
          onBlur={addOther}
          placeholder="Someone not on the team"
          className="w-full rounded border border-slate-200 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      )}
    </div>
  )
}

function MemberRow({ m, members, onChanged, onError }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(m.name)
  const [title, setTitle] = useState(m.title || '')
  const [color, setColor] = useState(m.color || 'slate')
  const [confirm, setConfirm] = useState(false)

  const save = async () => {
    try {
      if (name.trim() && name.trim() !== m.name) await renameMember(m.id, name)
      const patch = {}
      if ((title.trim() || null) !== (m.title || null)) patch.title = title.trim() || null
      if (color !== m.color) patch.color = color
      if (Object.keys(patch).length) await updateMember(m.id, patch)
      setEditing(false)
      onChanged()
    } catch (err) {
      onError(err.message)
    }
  }

  const remove = async () => {
    try {
      await removeMember(m.id)
      onChanged()
    } catch (err) {
      onError(err.message)
    }
  }

  if (editing) {
    return (
      <li className="space-y-1.5 rounded-lg border border-slate-200 p-2">
        <div className="grid gap-1.5 md:grid-cols-[1fr_1fr_8rem]">
          <Input size="sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <Input size="sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What they do" />
          <Select size="sm" value={color} onChange={(e) => setColor(e.target.value)}>
            {LIST_COLORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="dark" size="sm" onClick={save} disabled={!name.trim()}>
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
        {name.trim() !== m.name && (
          <p className="text-[11px] text-slate-500">Renaming moves every task assigned to {m.name} to the new name.</p>
        )}
      </li>
    )
  }

  return (
    <li className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
      <MemberBadge name={m.name} members={members} size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{m.name}</p>
        {m.title && <p className="text-[11px] text-slate-500">{m.title}</p>}
      </div>
      {confirm ? (
        <>
          <Button variant="danger" size="sm" onClick={remove}>
            Remove
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
            Keep
          </Button>
        </>
      ) : (
        <>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirm(true)} className="text-red-600">
            Remove
          </Button>
        </>
      )}
    </li>
  )
}

export default function TeamPanel({ members, onChanged, onClose }) {
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async (e) => {
    e?.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError('')
    try {
      await createMember({ name, title, color: LIST_COLORS[members.length % LIST_COLORS.length] })
      setName('')
      setTitle('')
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Team">
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          Who tasks can be assigned to. This is the task board&apos;s roster, separate from CRM logins. Removing
          someone takes them off the pickers; the tasks they had keep their name.
        </p>

        <form onSubmit={add} className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Add a team member</p>
          <div className="grid gap-1.5 md:grid-cols-2">
            <Input size="sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus />
            <Input size="sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What they do (optional)" />
          </div>
          <Button type="submit" variant="dark" size="sm" disabled={busy || !name.trim()}>
            {busy ? 'Adding…' : 'Add to team'}
          </Button>
        </form>

        {error && <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}

        <ul className="divide-y divide-slate-100">
          {members.map((m) => (
            <MemberRow key={m.id} m={m} members={members} onChanged={onChanged} onError={setError} />
          ))}
          {members.length === 0 && <li className="py-2 text-xs text-slate-400">Nobody yet.</li>}
        </ul>
      </div>
    </Modal>
  )
}
