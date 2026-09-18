import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LOGIN_REQUIRED, isAdmin, needsOwner } from '../lib/access'

// Supabase's own wording is "Invalid login credentials", which reads like a
// server log. The person typing already knows what they typed.
function friendly(message) {
  if (/invalid login credentials/i.test(message)) return 'That email and password do not match.'
  if (/email not confirmed/i.test(message)) return 'This login has not been activated yet. Ask an admin.'
  if (/rate limit|too many/i.test(message)) return 'Too many tries. Wait a minute and try again.'
  return message
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { session, loading, role, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from && location.state.from !== '/login' ? location.state.from : '/'

  // Login switched off: the form exists only for the owner reaching a money
  // or admin page. Anyone else, or an owner already signed in, goes straight
  // through. Nobody should see a login form they do not need.
  if (!LOGIN_REQUIRED && !needsOwner(from)) return <Navigate to={from} replace />
  if (!loading && session && (LOGIN_REQUIRED || isAdmin(role))) return <Navigate to={from} replace />
  const ownerGate = !LOGIN_REQUIRED

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error: err } = await signIn(email, password)
    if (err) {
      setError(friendly(err.message))
      setBusy(false)
      return
    }
    navigate(from, { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="max-w-sm w-full">
        <div className="flex items-center gap-2.5 mb-6 justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-base font-bold text-white">
            W
          </span>
          <p className="text-sm font-semibold text-white tracking-tight">The Working Class Marketing CRM</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-xl shadow-lg p-7 space-y-4">
          <h1 className="text-lg font-semibold text-slate-900">{ownerGate ? 'Owner sign in' : 'Sign in'}</h1>
          {ownerGate && (
            <p className="text-xs text-slate-600">
              Payments and Team are for the account owner. Sign in once in this browser and they stay
              open. Everything else in the CRM needs no login.
              {session && !isAdmin(role) && (
                <span className="mt-1 block text-amber-700">
                  You are signed in as {session.user.email}, which is not an owner login.
                </span>
              )}
            </p>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="text-[11px] text-slate-500 text-center">
            Logins are made by an admin on the Team page. Forgot your password? Ask an admin to reset it.
          </p>
        </form>
      </div>
    </div>
  )
}
