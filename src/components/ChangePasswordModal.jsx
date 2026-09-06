import { useState } from 'react'
import Modal from './Modal'
import Button from './ui/Button'
import { useAuth } from '../context/AuthContext'
import { passwordProblem } from '../lib/access'

export default function ChangePasswordModal({ isOpen, onClose }) {
  const { changePassword } = useAuth()
  const [pw, setPw] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const close = () => {
    setPw('')
    setAgain('')
    setError('')
    setDone(false)
    onClose()
  }

  const submit = async (e) => {
    e.preventDefault()
    const problem = passwordProblem(pw)
    if (problem) return setError(problem)
    if (pw !== again) return setError('The two passwords do not match.')
    setBusy(true)
    setError('')
    const { error: err } = await changePassword(pw)
    setBusy(false)
    if (err) return setError(err.message)
    setDone(true)
  }

  return (
    <Modal isOpen={isOpen} onClose={close} title="Change password">
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3">
            Password changed. It takes effect on your next sign-in.
          </p>
          <Button onClick={close}>Done</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">New password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type it again</label>
            <input
              type="password"
              autoComplete="new-password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              required
            />
          </div>
          <p className="text-[11px] text-slate-500">At least 10 characters, with letters and a number.</p>
          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Change password'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
