import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LOGIN_REQUIRED, passwordProblem } from '../lib/access'
import { enabledProviders } from '../lib/authProviders'

/**
 * The CRM's sign-in: "Continue with Google" (one tap, and the browser keeps
 * them signed in from then on) or an email and password, with "Forgot your
 * password?" (a reset email from Supabase, whose link comes back here) and
 * the "set a new password" form that link opens. The client pages (a
 * dashboard, a weekly report, an approval, an onboarding form, video
 * scripts, videos) never come here: the token in their link is their
 * credential. Who may sign in is decided on the Team page, whichever way
 * they sign in: a Google account whose email is not on the team gets the
 * "not on the team" page from RequireAuth, not the CRM.
 */

// Supabase's own wording is "Invalid login credentials", which reads like a
// server log. The person typing already knows what they typed.
function friendly(message) {
  if (/invalid login credentials/i.test(message)) return 'That email and password do not match.'
  if (/email not confirmed/i.test(message)) return 'This login has not been activated yet. Ask an admin.'
  if (/rate limit|too many|security purposes/i.test(message)) return 'Too many tries. Wait a minute and try again.'
  if (/provider is not enabled|unsupported provider/i.test(message)) return 'Google sign-in is not switched on in Supabase yet. See docs/logins.md.'
  return message
}

const FIELD = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const PRIMARY = 'w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition'
const LINK = 'text-xs text-blue-700 underline hover:text-blue-900'

/** Where to go once signed in: the page that was asked for, kept across a trip to Google. */
function readFrom(location) {
  const state = location.state?.from
  if (state && state !== '/login') return state
  try {
    const kept = sessionStorage.getItem('login_from')
    if (kept && kept !== '/login') return kept
  } catch {
    // private mode: the dashboard
  }
  return '/'
}
function forgetFrom() {
  try {
    sessionStorage.removeItem('login_from')
  } catch {
    // nothing to forget
  }
}

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

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.3 0-5.9-2.7-5.9-6s2.6-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  )
}

/** "Continue with Google", shown once the project is known to have Google switched on. */
function GoogleButton({ from, onError }) {
  const { signInWithGoogle } = useAuth()
  const [on, setOn] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let alive = true
    enabledProviders().then((p) => {
      if (alive) setOn(Boolean(p.google))
    })
    return () => {
      alive = false
    }
  }, [])
  if (on === null) return null
  if (!on) {
    return (
      <p className="text-[11px] text-slate-500" data-google-off>
        Google sign-in is not switched on yet. An admin switches it on in Supabase; the steps are in docs/logins.md.
      </p>
    )
  }
  const go = async () => {
    setBusy(true)
    const { error } = await signInWithGoogle(from)
    if (error) {
      setBusy(false)
      onError(friendly(error.message))
    }
    // On success the browser is on its way to Google.
  }
  return (
    <>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        data-google-sign-in
      >
        <GoogleMark />
        {busy ? 'Opening Google…' : 'Continue with Google'}
      </button>
      <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        or with a password
        <span className="h-px flex-1 bg-slate-200" />
      </div>
    </>
  )
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
      <p className="text-sm text-slate-600">Type the email you sign in with and we will send a link to set a new one. Signed up with Google? Just press Continue with Google instead.</p>
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
  const from = readFrom(location)

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
  // Already in (a kept session, or just back from Google): straight through.
  // Nobody should see a login form they do not need.
  if (!loading && session) {
    forgetFrom()
    return <Navigate to={from} replace />
  }

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
    forgetFrom()
    navigate(from, { replace: true })
  }

  return (
    <Shell>
      {forgot ? (
        <Forgot email={email} setEmail={setEmail} onBack={() => setForgot(false)} />
      ) : (
        <form onSubmit={submit} className="bg-white rounded-xl shadow-lg p-7 space-y-4" data-sign-in>
          <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
          <GoogleButton from={from} onError={setError} />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="login-email">
              Email
            </label>
            <input id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} required />
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
            <p className="text-[11px] text-slate-500 text-right">An admin adds people on the Team page.</p>
          </div>
        </form>
      )}
    </Shell>
  )
}
