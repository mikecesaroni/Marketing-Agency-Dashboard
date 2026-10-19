# Logins

The CRM asks for an email and a password. The client pages do not ask for
anything. That is the whole design, on purpose: nothing about signing in
depends on Google Cloud, a mail sender, a verified consent screen or a
redirect list, so there is nothing outside this project to set up, verify
or keep alive.

## What asks for a sign-in and what does not

- **The CRM** (every page under the agency nav: clients, content, publish,
  tasks, payments, reports, the team): an email and a password, made for
  the person on the Team page. Two roles: an **admin** sees everything; a
  **VA** sees everything except Payments, the Team page and the per-client
  payment tracker, and the database refuses a VA any payment, expense or
  Stripe row whatever the screen asks for.
- **The client pages** (`/dashboard/<token>`, `/scripts/<token>`,
  `/videos/<token>`, `/report/<token>`, `/approve/<token>`,
  `/onboarding/<token>`): no sign-in, ever. The token in the link is the
  credential. They read through security-definer database functions and
  Edge Functions that hold the service key, never the tables, so closing
  the tables to the anonymous key (below) does not touch them. The
  client-facing site (`VITE_PUBLIC_ONLY`) has no login page at all.

## Staying signed in

Sign in once on a device and it stays signed in. Supabase keeps the
session in the browser and refreshes it on its own; nothing ends it but
"Sign out" from the menu under their initials (top right), clearing the
browser's site data, or an admin removing them. The login form uses the
standard email and password fields, so the browser's own password manager
offers to save the password too. Supabase can be told to time-box
sessions (Authentication, Sessions); leave that off.

## Why not Google, or a sign-in email

"Continue with Google" needs an OAuth client in Google Cloud with a
published consent screen, and Google's branding verification kept
failing. A sign-in or reset email needs a mail sender (Supabase's
built-in one is capped at a few messages an hour) and the project's
redirect list. Both were built and then taken out again so that the
sign-in has no outside dependency at all. If either is wanted later, the
code for both is in the history (commits 47a528a and 632496d on this
branch).

## How it is built

- `LOGIN_REQUIRED` in `src/lib/access.js` is the switch. With it on,
  `RequireAuth` sends anyone without a session to `/login`, the sidebar
  shows the person and their role, and the Team page exists. The client
  routes sit outside `RequireAuth` in `src/App.jsx`.
- Supabase Auth holds the logins (email and password). `public.profiles`
  holds one row per login with its role; `is_admin()` reads it from inside
  the money tables' policies. Nothing writes profiles through the API: the
  `team-admin` Edge Function does, with the service key, after checking
  the caller is an admin.
- `supabase/logins-on.sql` is the database half of the switch: it closes
  every policy written for the anonymous key (nothing is dropped; each
  policy is altered to admit nothing, so the off file opens the very same
  ones), turns row-level security on for every table with a policy for
  signed-in people, keeps the `client-files` bucket public to read by URL
  but makes listing, uploading, changing and deleting need a sign-in, and
  makes the first admin. `supabase/logins-off.sql` reverses it. Run the
  matching file with the matching value of `LOGIN_REQUIRED`; one without
  the other is either a CRM nobody can open or a CRM that asks for a
  password and then shows every table empty.
- The `stock-images` function (real equipment photos) checks its own door
  and accepts a signed-in person's session as well as the project's keys.

## The first sign-in

The owner's login existed already (it was used in September when Payments
was briefly behind a sign-in); `logins-on.sql` made it the admin. Sign in
at `/login` with that email and password.

Forgot it, with no other admin to reset it? Two ways, both in the Supabase
dashboard, no email involved:

- Authentication, Users: open the login and use "Send password recovery"
  if the project's mail is set up; or
- Authentication, Users, "Add user", "Create new user": a new email, a
  password you choose, auto-confirm on. Then give it a role with one line
  in the SQL editor:

```sql
insert into public.profiles (user_id, email, name, role)
select id, email, 'Name', 'admin' from auth.users where email = 'the@email'
on conflict (user_id) do update set role = 'admin';
```

## Adding people

The Team page (admins only): a name, an email, a role, and a password the
page makes up, which the admin hands over by text or a call. The person
changes it from the menu under their initials, top right, on their first
visit, and the browser keeps them signed in after that. "Reset password"
on a member makes a new temporary one, shown once. Nobody can remove or
demote themself, and the last admin cannot be removed or demoted, so the
agency cannot lock itself out from the page.

## Turning it off again

Set `LOGIN_REQUIRED` to `false`, deploy, and run `supabase/logins-off.sql`.
The logins and roles stay stored, so turning it back on later is the
reverse of the same two steps.

## Checks

`scripts/check-access.mjs` holds the switch's expected value, the role
rules, and that the login page has no outside provider or sign-in email;
`scripts/check-public-site.mjs` keeps every client page free of any link
into the CRM.
