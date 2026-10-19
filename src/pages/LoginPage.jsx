import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LOGIN_REQUIRED, passwordProblem } from '../lib/access'

/**
 * The CRM's sign-in, and the two things next to it: "Forgot your password?"
 * (a reset email from Supabase, whose link comes back here) and the "set a
 * new password" form that link opens. The client pages (a dashboard, a
 * weekly report, an approval, an onboarding form, video scripts, videos)
 * never come here: the token in their link is their credential.
 */

// Supabase's own wording is "Invalid login credentials", which reads like a
// server log. The person typing already knows what they typed.
function friendly(message) {
  if (/invalid login credentials/i.test(message)) return 'That email and password do not match.'
  if (/email not confirmed/i.test(message)) return 'This login has not been activated yet. Ask an admin.'
  if (/rate limit|too many|security purposes/i.test(message)) return 'Too many tries. Wait a minute and try again.'
  return message
}

const FIELD = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const PRIMARY = 'w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition'
const LINK = 'text-xs text-blue-700 underline hover:text-blue-900'

function Shell({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="max-w-sm w-full">
        <div className="flex items-center gap-2.5 mb-6 justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-base font-bold text-white">
            W
          </span>
          <p className="text-sm font-semibold text-white tracking-tight">The Working Class Marketing CRM</p>
        </div>
        {children}
      </div>
    </div>
  )
}

function Problem({ error }) {
  if (!error) return null
  return <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
}

/** After the reset email's link: a new password, typed twice, then into the CRM. */
function NewPassword() {
  const { changePassword, finishRecovery, user } = useAuth()
  const navigate = useNavigate()
  const [pw, setPw] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const problem = passwordProblem(pw)
    if (problem) return setError(problem)
    if (pw !== again) return setError('The two passwords do not match.')
    setBusy(true)
    setError('')
    const { error: err } = await changePassword(pw)
    setBusy(false)
    if (err) return setError(friendly(err.message))
    finishRecovery()
    navigate('/', { replace: true })
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-xl shadow-lg p-7 space-y-4" data-new-password>
      <h1 className="text-lg font-semibold text-slate-900">Set a new password</h1>
      {user?.email && <p className="text-xs text-slate-500">For {user.email}.</p>}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="new-password">
          New password
        </label>
        <input id="new-password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={FIELD} required autoFocus />
        <p className="mt-1 text-[11px] text-slate-500">At least 10 characters, with letters and at least one number.</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="new-password-again">
          The same again
        </label>
        <input id="new-password-again" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className={FIELD} required />
      </div>
      <Problem error={error} />
      <button type="submit" disabled={busy} className={PRIMARY}>
        {busy ? 'Saving…' : 'Save and open the CRM'}
      </button>
    </form>
  )
}

/** "Forgot your password?": the email, then a line saying the link is on its way. */
function Forgot({ email, setEmail, onBack }) {
  const { resetPassword } = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error: err } = await resetPassword(email)
    setBusy(false)
    if (err) return setError(friendly(err.message))
    setSent(true)
  }

  if (sent) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-7 space-y-4" data-reset-sent>
        <h1 className="text-lg font-semibold text-slate-900">Check your email</h1>
        <p className="text-sm text-slate-700">
          If <span className="font-medium">{email.trim()}</span> has a login, a link to set a new password is on its way. Give it a minute, and look in spam. The link opens this page.
        </p>
        <button type="button" onClick={onBack} className={LINK}>
          Back to sign in
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-xl shadow-lg p-7 space-y-4" data-forgot>
      <h1 className="text-lg font-semibold text-slate-900">Forgot your password?</h1>
      <p className="text-sm text-slate-600">Type the email you sign in with and we will send a link to set a new one.</p>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="forgot-email">
          Email
        </label>
        <input id="forgot-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} required autoFocus />
      </div>
      <Problem error={error} />
      <button type="submit" disabled={busy} className={PRIMARY}>
        {busy ? 'Sending…' : 'Send the link'}
      </button>
      <button type="button" onClick={onBack} className={LINK}>
        Back to sign in
      </button>
    </form>
  )
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const { session, loading, signIn, recovering } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from && location.state.from !== '/login' ? location.state.from : '/'

  // Login switched off: nothing asks for one.
  if (!LOGIN_REQUIRED) return <Navigate to={from} replace />
  // Here from the reset email: the link signed them in, but the new password
  // comes first, so this check sits above the "already in" one.
  if (recovering) {
    return (
      <Shell>
        <NewPassword />
      </Shell>
    )
  }
  // Already in: straight through. Nobody should see a login form they do not need.
  if (!loading && session) return <Navigate to={from} replace />

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
    <Shell>
      {forgot ? (
        <Forgot email={email} setEmail={setEmail} onBack={() => setForgot(false)} />
      ) : (
        <form onSubmit={submit} className="bg-white rounded-xl shadow-lg p-7 space-y-4" data-sign-in>
          <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="login-email">
              Email
            </label>
            <input id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} required autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="login-password">
              Password
            </label>
            <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={FIELD} required />
          </div>
          <Problem error={error} />
          <button type="submit" disabled={busy} className={PRIMARY}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => setForgot(true)} className={LINK} data-forgot-link>
              Forgot your password?
            </button>
            <p className="text-[11px] text-slate-500 text-right">Logins are made by an admin on the Team page.</p>
          </div>
        </form>
      )}
    </Shell>
  )
}
