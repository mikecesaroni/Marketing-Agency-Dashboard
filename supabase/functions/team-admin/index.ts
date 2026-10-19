// Manages who can log in to the CRM, and as what.
//
// Everything here needs the service role: creating an auth user, setting a
// password, deleting a user, and writing public.profiles (which has no write
// policy for anyone through the API, on purpose). So it lives in a function
// rather than in the browser, and the function checks that the person calling
// it is an admin before doing any of it.
//
// WHY PASSWORDS ARE SET BY THE ADMIN rather than sent by email: an invite
// email needs the project's Site URL and redirect list configured and a
// working mail sender, and the built-in one is capped at a few messages an
// hour. Handing a VA a temporary password over a call or a text, and letting
// them change it on their first login, needs none of that and cannot end up
// in a spam folder.
//
// BOOTSTRAP. While profiles is empty there is no admin to authorise the first
// admin, so exactly one path is open: "create" with role admin, from any valid
// JWT (the anon key is one). It closes the moment the first profile exists.
// The gap between deploying this and calling it once is the window, and it
// was seconds.
//
// Actions (POST, JSON body with "action"):
//   list                              -> { members: [...] }
//   create   { email, name, role, password }
//   set_role { user_id, role }
//   set_password { user_id, password }
//   remove   { user_id }
//
// Secrets: none beyond SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, which every
// function has.

import { createClient } from 'npm:@supabase/supabase-js@2'

const ROLES = ['admin', 'va']
const MIN_PASSWORD = 10

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function passwordProblem(pw: unknown): string {
  const s = String(pw || '')
  if (s.length < MIN_PASSWORD) return `Password needs at least ${MIN_PASSWORD} characters.`
  if (!/[a-z]/i.test(s) || !/\d/.test(s)) return 'Password needs letters and at least one number.'
  return ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }
  const action = String(body.action || '')

  // Who is calling. The gateway already checked the JWT is valid; this works
  // out whether it belongs to a person, and what their role is.
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const { data: who } = await admin.auth.getUser(token)
  const callerId = who?.user?.id || null
  let callerRole: string | null = null
  if (callerId) {
    const { data: prof } = await admin.from('profiles').select('role').eq('user_id', callerId).maybeSingle()
    callerRole = prof?.role || null
  }

  const { count: profileCount } = await admin.from('profiles').select('*', { count: 'exact', head: true })
  const bootstrapping = (profileCount || 0) === 0

  if (callerRole !== 'admin' && !(bootstrapping && action === 'create')) {
    return json({ error: 'Only an admin can manage the team.' }, 403)
  }

  try {
    if (action === 'list') {
      const [{ data: profiles, error }, users] = await Promise.all([
        admin.from('profiles').select('user_id, email, name, role, created_at').order('created_at'),
        admin.auth.admin.listUsers({ perPage: 200 }),
      ])
      if (error) throw error
      const lastSeen = new Map((users.data?.users || []).map((u) => [u.id, u.last_sign_in_at || null]))
      return json({
        members: (profiles || []).map((p) => ({ ...p, last_sign_in_at: lastSeen.get(p.user_id) || null })),
      })
    }

    if (action === 'create') {
      const email = String(body.email || '').trim().toLowerCase()
      const name = String(body.name || '').trim()
      // The first account is an admin whatever was asked for: a CRM whose only
      // login is a VA has nobody who can add the admin.
      const role = bootstrapping ? 'admin' : String(body.role || 'va')
      const password = String(body.password || '')
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'That is not an email address.' }, 400)
      if (!ROLES.includes(role)) return json({ error: 'Role must be admin or va.' }, 400)
      const pwProblem = passwordProblem(password)
      if (pwProblem) return json({ error: pwProblem }, 400)

      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
        app_metadata: { role },
      })
      if (error) {
        const msg = /already|registered|exists/i.test(error.message)
          ? 'Someone with that email already has a login.'
          : error.message
        return json({ error: msg }, 400)
      }
      const { error: profErr } = await admin
        .from('profiles')
        .insert({ user_id: created.user.id, email, name: name || null, role })
      if (profErr) {
        // Do not leave an auth user with no profile: they could log in and
        // the app would have no role for them.
        await admin.auth.admin.deleteUser(created.user.id)
        throw profErr
      }
      return json({ member: { user_id: created.user.id, email, name, role } })
    }

    // Everything below is about an existing member.
    const targetId = String(body.user_id || '')
    if (!targetId) return json({ error: 'user_id is required.' }, 400)
    const { data: members } = await admin.from('profiles').select('user_id, role')
    const target = (members || []).find((m) => m.user_id === targetId)
    if (!target) return json({ error: 'That person is not on the team.' }, 404)
    const adminCount = (members || []).filter((m) => m.role === 'admin').length
    const lastAdmin = target.role === 'admin' && adminCount <= 1

    if (action === 'set_role') {
      const role = String(body.role || '')
      if (!ROLES.includes(role)) return json({ error: 'Role must be admin or va.' }, 400)
      if (role !== 'admin') {
        if (targetId === callerId) return json({ error: 'You cannot demote yourself.' }, 400)
        if (lastAdmin) return json({ error: 'That is the only admin. Make someone else an admin first.' }, 400)
      }
      const { error } = await admin.from('profiles').update({ role }).eq('user_id', targetId)
      if (error) throw error
      await admin.auth.admin.updateUserById(targetId, { app_metadata: { role } })
      return json({ ok: true })
    }

    if (action === 'set_password') {
      const password = String(body.password || '')
      const pwProblem = passwordProblem(password)
      if (pwProblem) return json({ error: pwProblem }, 400)
      const { error } = await admin.auth.admin.updateUserById(targetId, { password })
      if (error) throw error
      return json({ ok: true })
    }

    if (action === 'remove') {
      if (targetId === callerId) return json({ error: 'You cannot remove yourself.' }, 400)
      if (lastAdmin) return json({ error: 'That is the only admin. Make someone else an admin first.' }, 400)
      // profiles cascades from auth.users, so deleting the user is enough.
      const { error } = await admin.auth.admin.deleteUser(targetId)
      if (error) throw error
      return json({ ok: true })
    }

    return json({ error: `Unknown action "${action}".` }, 400)
  } catch (err) {
    return json({ error: String(err instanceof Error ? err.message : err) }, 500)
  }
})
