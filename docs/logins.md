# Logins

The CRM asks for a sign-in: "Continue with Google" for most people, or an
email and password. The browser keeps them signed in after that. The
client pages do not ask for anything.

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
- `supabase/logins-on.sql` is the database half of the switch: it closes
  every policy written for the anonymous key (nothing is dropped; each
  policy is altered to admit nothing, so the off file opens the very same
  ones), turns row-level security on for every table with a policy for
  signed-in people, keeps the `client-files` bucket public to read by URL
  but makes listing, uploading, changing and deleting need a sign-in, and
  makes the first admin. `supabase/logins-off.sql` reverses it. Run the matching file with
  the matching value of `LOGIN_REQUIRED`; one without the other is either
  a CRM nobody can open or a CRM that asks for a password and then shows
  every table empty.
- The `stock-images` function (real equipment photos) checks its own door
  and accepts a signed-in person's session as well as the project's keys.

## Signing in with Google

The login page has "Continue with Google". One tap, the Google account
picker, and they are in; from then on the browser keeps the session
(Supabase stores it and refreshes it quietly), so the next visit opens
the CRM straight away, on that device, until they sign out. The button
only shows once Google is switched on for the project; until then the
page says so in small print.

Who gets in is still the Team page's decision. An admin adds the person's
email and role with "How they sign in: With Google (no password)", and
the first "Continue with Google" with that email is their login
(Supabase links the Google account to the login with the same email on
its own). A Google account whose email is not on the team lands on a
"not on the team" page, not in the CRM. The members list shows a Google
tag once the account is linked.

Switching it on, once, by an admin:

1. In Google Cloud Console (any Google account the agency keeps), APIs &
   Services, Credentials: Create credentials, OAuth client ID, type Web
   application. Under Authorised redirect URIs add
   `https://zjtwqpaaejrkurtuakdz.supabase.co/auth/v1/callback`. If it asks
   for an OAuth consent screen first: External, the app name "The Working
   Class Marketing CRM", your email as support and developer contact,
   no scopes to add (email and profile are the defaults), then Publish
   the app so anyone on the team can use it, not only test users. Copy
   the Client ID and Client secret.
2. In Supabase, Authentication, Sign In / Providers, Google: switch it on
   and paste the Client ID and Client secret.
3. In Supabase, Authentication, URL Configuration: Site URL is the CRM's
   address, and the Redirect URLs include `https://<that host>/login`.
   (The same two settings the reset email needs.)

Nothing in the code changes; the login page notices the provider is on.

## Staying signed in

Sessions live in the browser and refresh themselves; nothing signs a
person out but "Sign out" from the menu under their initials, clearing
the browser's site data, or an admin removing them. Supabase can be told
to time-box sessions (Authentication, Sessions); leave that off.

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

The Team page (admins only): a name, an email, a role, and how they sign
in. "With Google" is the default and needs nothing else: they press
Continue with Google with that email. "With a temporary password" shows a
password the page makes up, which the admin hands over by text or a
call; the person changes it from the menu under their initials, top
right, on their first visit. "Set a password" on a Google member gives
them the password way too. Nobody can remove or demote themself, and the
last admin cannot be removed or demoted, so the agency cannot lock itself
out from the page.

## Turning it off again

Set `LOGIN_REQUIRED` to `false`, deploy, and run `supabase/logins-off.sql`.
The logins and roles stay stored, so turning it back on later is the
reverse of the same two steps.

## Checks

`scripts/check-access.mjs` holds the switch's expected value and the role
rules; `scripts/check-public-site.mjs` keeps every client page free of any
link into the CRM.
