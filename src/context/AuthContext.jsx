// Who is logged in, and as what.
//
// Two things are tracked and they arrive at different times: the Supabase
// session (from local storage, near-instantly) and the profile row that
// carries the role (one query after the session is known). Until both are in,
// `loading` is true and RequireAuth shows nothing rather than flashing the
// login page at someone who is signed in, or the dashboard at someone who is
// not.
//
// A session with no profile row is possible -- an admin removed the person
// while they were logged in -- and is reported as `profile: null` with
// `loading: false`, so the guard can say so instead of spinning forever.

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { LOGIN_REQUIRED } from '../lib/access'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // undefined until Supabase has answered; null when nobody is signed in.
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [profileError, setProfileError] = useState('')

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setSession(data.session ?? null)
    })
    // Only state is set in here. Supabase warns against calling back into the
    // client from inside this callback; the profile query lives in the effect
    // below, keyed on the user id.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s ?? null))
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user?.id || null
  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setProfileLoaded(false)
      setProfileError('')
      return
    }
    let cancelled = false
    setProfileLoaded(false)
    supabase
      .from('profiles')
      .select('user_id, email, name, role')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        setProfile(data || null)
        setProfileError(error?.message || '')
        setProfileLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const signIn = useCallback(
    (email, password) => supabase.auth.signInWithPassword({ email: String(email).trim(), password }),
    []
  )
  const signOut = useCallback(() => supabase.auth.signOut(), [])
  const changePassword = useCallback((password) => supabase.auth.updateUser({ password }), [])

  const value = {
    session: session || null,
    user: session?.user || null,
    profile,
    // With login switched off nobody has a profile, and every page that asks
    // "is this an admin" (the client page's payment tracker) must say yes.
    role: LOGIN_REQUIRED ? profile?.role || null : 'admin',
    loading: session === undefined || (Boolean(userId) && !profileLoaded),
    profileError,
    signIn,
    signOut,
    changePassword,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth needs an AuthProvider above it.')
  return ctx
}
