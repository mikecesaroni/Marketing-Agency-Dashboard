# Logins

The CRM asks for a sign-in. The client pages do not.

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
- `supabase/logins-on.sql` is the database half of the switch: it drops
  every policy written for the anonymous key, turns row-level security on
  for every table with a policy for signed-in people, keeps the
  `client-files` bucket public to read by URL but makes listing,
  uploading, changing and deleting need a sign-in, and makes the first
  admin. `supabase/logins-off.sql` reverses it. Run the matching file with
  the matching value of `LOGIN_REQUIRED`; one without the other is either
  a CRM nobody can open or a CRM that asks for a password and then shows
  every table empty.
- The `stock-images` function (real equipment photos) checks its own door
  and accepts a signed-in person's session as well as the project's keys.

## The first sign-in

The owner's login existed already (it was used in September when Payments
was briefly behind a sign-in); `logins-on.sql` made it the admin. Sign in
with that email and password at `/login`. Forgot it? "Forgot your
password?" on the login page sends a link from Supabase; the link comes
back to `/login` with a "set a new password" form.

For that email to arrive at the right place, once, in the Supabase
dashboard under Authentication, URL Configuration: set the Site URL to the
CRM's address (the Netlify site), and add `https://<that host>/login` and
`https://<that host>/**` to the Redirect URLs. Supabase's built-in sender
allows a few emails an hour, which is plenty for this; the message can
land in spam.

Still locked out? In the Supabase dashboard under Authentication, Users,
open the login and send a password recovery from there, or add a new user
with a password you choose, then give it a role with one line in the SQL
editor:

```sql
insert into public.profiles (user_id, email, name, role)
select id, email, 'Name', 'admin' from auth.users where email = 'the@email'
on conflict (user_id) do update set role = 'admin';
```

## Adding people

The Team page (admins only): an email, a name, a role, and a password the
page makes up, which the admin hands over by text or a call. The person
changes it from the menu under their initials, top right, on their first
visit. Nobody can remove or demote themself, and the last admin cannot be
removed or demoted, so the agency cannot lock itself out from the page.

## Turning it off again

Set `LOGIN_REQUIRED` to `false`, deploy, and run `supabase/logins-off.sql`.
The logins and roles stay stored, so turning it back on later is the
reverse of the same two steps.

## Checks

`scripts/check-access.mjs` holds the switch's expected value and the role
rules; `scripts/check-public-site.mjs` keeps every client page free of any
link into the CRM.
