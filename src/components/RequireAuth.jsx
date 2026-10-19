// The gate in front of every CRM page.
//
// Not signed in: to /login, remembering where they were headed. Signed in but
// the role does not allow this path (a VA typing /payments): to the dashboard.
// Signed in with no profile row at all: a plain message and a sign-out button,
// because the only way that happens is an admin removing them, and a blank
// page would look like a bug.
//
// The path rule is canOpen() from src/lib/access.js, the same function the
// sidebar uses to decide what to show, so a link you can see is a page you can
// open and a page you cannot open is not in the sidebar.

import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LOGIN_REQUIRED, canOpen, canOpenWithoutLogin } from '../lib/access'

export default function RequireAuth({ children }) {
  const { loading, session, profile, profileError, role, signOut, recovering } = useAuth()
  const location = useLocation()

  // Login switched off: straight through, minus the Team page.
  if (!LOGIN_REQUIRED) {
    if (!canOpenWithoutLogin(location.pathname)) return <Navigate to="/" replace />
    return children ?? <Outlet />
  }

  // Here from the reset email: the link signed them in, but the new password
  // comes first. The login page has the form.
  if (recovering) return <Navigate to="/login" replace />

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-400">
        Loading…
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm w-full bg-white rounded-xl border border-slate-200 p-6 text-center space-y-3">
          <p className="text-sm text-slate-800">
            <span className="font-medium">{session.user.email}</span> is signed in but is not on the
            team. An admin has to add this email on the Team page; then sign in again. Signed in with
            the wrong Google account? Sign out and pick the other one.
          </p>
          {profileError && <p className="text-xs text-red-600">{profileError}</p>}
          <button
            onClick={() => signOut()}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  if (!canOpen(role, location.pathname)) return <Navigate to="/" replace />

  return children ?? <Outlet />
}
