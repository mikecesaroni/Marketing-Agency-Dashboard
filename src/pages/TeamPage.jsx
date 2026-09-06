// Who can log in, and as what. Admins only.
//
// Everything on this page goes through the team-admin function, because
// creating a login, setting someone's password and deleting a user all need
// the service key, which the browser must never hold. The page itself only
// decides what to ask for and what to show.
//
// Passwords are set here and handed over by the admin (a text, a call), not
// emailed. See the note at the top of supabase/functions/team-admin/index.ts.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Layout from '../components/Layout'
import { Button, Card } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { ROLES, ROLE_LABELS, memberChangeProblem, passwordProblem } from '../lib/access'

async function team(body) {
  const { data, error } = await supabase.functions.invoke('team-admin', { body })
  if (error) {
    // A non-2xx reply carries the real message in its body, not in error.message.
    let msg = error.message
    try {
      const j = await error.context?.json()
      if (j?.error) msg = j.error
    } catch {
      /* keep the generic message */
    }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

// Fourteen characters from an alphabet with no look-alikes (no 0/O, 1/l/I),
// because this gets read out over the phone.
export function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(14)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += alphabet[b % alphabet.length]
  // Guarantee the number the rule asks for even on an unlucky draw.
  return /\d/.test(out) ? out : `${out.slice(0, 13)}7`
}

function when(iso) {
  if (!iso) return 'never'
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function PasswordReveal({ email, password, onDismiss }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`CRM login\nEmail: ${email}\nTemporary password: ${password}`)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900 space-y-2">
      <p>
        Temporary password for <span className="font-medium">{email}</span>. Send it to them now; it is
        not shown again. They can change it from the menu in the top right after they sign in.
      </p>
      <p className="font-mono text-base tracking-wide select-all">{password}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? 'Copied' : 'Copy login details'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  )
}

export default function TeamPage() {
  const { user } = useAuth()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reveal, setReveal] = useState(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('va')
  const [password, setPassword] = useState(generatePassword)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      const { members: rows } = await team({ action: 'list' })
      setMembers(rows || [])
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

  const add = async (e) => {
    e.preventDefault()
    const problem = passwordProblem(password)
    if (problem) return setError(problem)
    setAdding(true)
    setError('')
    setNotice('')
    try {
      await team({ action: 'create', email, name, role, password })
      setReveal({ email: email.trim().toLowerCase(), password })
      setName('')
      setEmail('')
      setRole('va')
      setPassword(generatePassword())
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setAdding(false)
    }
  }

  const setMemberRole = async (m, next) => {
    const action = next === 'admin' ? 'promote' : 'demote'
    const problem = memberChangeProblem({ members, actorId: user?.id, targetId: m.user_id, action })
    if (problem) return setError(problem)
    setError('')
    try {
      await team({ action: 'set_role', user_id: m.user_id, role: next })
      setNotice(`${m.name || m.email} is now ${ROLE_LABELS[next]}.`)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const resetPassword = async (m) => {
    if (!window.confirm(`Set a new temporary password for ${m.email}? Their current one stops working.`)) return
    const pw = generatePassword()
    setError('')
    try {
      await team({ action: 'set_password', user_id: m.user_id, password: pw })
      setReveal({ email: m.email, password: pw })
      setNotice('')
    } catch (err) {
      setError(err.message)
    }
  }

  const remove = async (m) => {
    const problem = memberChangeProblem({ members, actorId: user?.id, targetId: m.user_id, action: 'remove' })
    if (problem) return setError(problem)
    if (!window.confirm(`Remove ${m.name || m.email} from the CRM? They will be signed out and cannot log in again.`)) return
    setError('')
    try {
      await team({ action: 'remove', user_id: m.user_id })
      setNotice(`${m.name || m.email} removed.`)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Layout title="Team" subtitle="Who can sign in, and what they can see">
      <div className="space-y-4 max-w-4xl">
        {error && (
          <Card tone="danger" className="text-sm text-red-700">
            {error}
          </Card>
        )}
        {notice && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">{notice}</div>
        )}
        {reveal && (
          <PasswordReveal email={reveal.email} password={reveal.password} onDismiss={() => setReveal(null)} />
        )}

        <Card>
          <h2 className="text-base font-semibold text-slate-900 mb-1">Members</h2>
          <p className="text-xs text-slate-500 mb-3">
            <span className="font-medium text-slate-700">Admin</span> sees everything.{' '}
            <span className="font-medium text-slate-700">VA</span> sees everything except Payments and
            this page, and cannot read any payment, expense or Stripe data even by URL.
          </p>
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-slate-500">Nobody yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Email</th>
                    <th className="py-2 pr-3 font-medium">Role</th>
                    <th className="py-2 pr-3 font-medium">Last sign-in</th>
                    <th className="py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const me = m.user_id === user?.id
                    return (
                      <tr key={m.user_id} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 pr-3 text-slate-900">
                          {m.name || <span className="text-slate-400">—</span>}
                          {me && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-blue-600">you</span>}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">{m.email}</td>
                        <td className="py-2 pr-3">
                          <select
                            value={m.role}
                            onChange={(e) => setMemberRole(m, e.target.value)}
                            className="border border-slate-300 rounded px-2 py-1 text-sm bg-white"
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{when(m.last_sign_in_at)}</td>
                        <td className="py-2 text-right whitespace-nowrap">
                          <button
                            onClick={() => resetPassword(m)}
                            className="text-xs text-blue-600 hover:text-blue-800 mr-3"
                          >
                            Reset password
                          </button>
                          {!me && (
                            <button onClick={() => remove(m)} className="text-xs text-red-600 hover:text-red-800">
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-slate-900 mb-3">Add someone</h2>
          <form onSubmit={add} className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                placeholder="First name is fine"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Temporary password</label>
              <div className="flex gap-2">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                  required
                />
                <Button type="button" variant="outline" size="sm" onClick={() => setPassword(generatePassword())}>
                  New
                </Button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Shown once after you add them. They change it on their first sign-in.
              </p>
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={adding}>
                {adding ? 'Adding…' : 'Add to the CRM'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </Layout>
  )
}
