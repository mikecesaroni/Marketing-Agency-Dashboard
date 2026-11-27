# Signup links

Added 2026-11-27: "make a way so I can have the option to do this: get a
link where the client can pay the setup and monthly subscription based on
the tier I click, then when that is paid they fill out the onboarding form,
then they show up as a new client in the CRM."

One link per new client, `/join/<token>`. They pay through it, then fill in
the onboarding form, and they are in the CRM without anybody adding them.
The add form (Clients, New Client) is still there for everything else.

## Making one

Clients page, **Signup link** (beside New Client):

- **Business name** (required: it names the link and the client it makes)
  and their email (optional: typed into Stripe's checkout for them).
- **Plan**: $1,500 plan, Meta and Google, $3,500 plan. The plan is the
  monthly price.
- **Setup fee**: the amount the saved setup link charges ($2,500 today), or
  **No setup fee**.
- **Get the link**, then Copy link or Copy message.

Under it, **Links out**: every link and where it stands: Not opened yet,
Opened not paid yet, one payment in, Paid waiting on their form, Signed up.
Copy the link again, or Cancel one nobody has paid on (it then opens as "not
valid").

A link can only be made for what Stripe can charge. It uses the same saved
Payment Links as the client Billing tab (Payments, Stripe): the setup fee
link and one subscription link per price. A plan with no subscription link
saved gets an amber line saying so instead of a link; today that is the
$3,500 plan. Odd deals (a $1,750 plan, a split setup fee) still go through
New Client and the custom links on the client's Payments card.

## What the client sees

Dark, with the Working Class mark, like their other pages:

1. **Your plan**: the package, the price a month, the setup fee, what it
   includes.
2. Numbered steps: **Pay the setup fee** (not shown when waived), **Start
   your monthly plan**, **Tell us about your business**.
3. Each pay button opens Stripe's checkout in a new tab. The page asks again
   every five seconds while it is the tab in front (and the moment they come
   back to it), so a step ticks itself once the payment lands. "Check again"
   does it by hand.
4. The form step is locked until the payments are in, then it is one button
   to their onboarding form (`/onboarding/<token>`, the same form as always).
5. With the form in: "You are all set."

It never offers a button that charges a different amount than the signup
owes; without a matching link it says the payment link is on its way.

## How a signup becomes a client

**Nobody is a client until money arrives.** A signup is a row in
`client_signups`, not in `clients`, so nothing shows on the Clients list,
the tiers, the brief or the books for a link nobody paid.

1. The page's Stripe buttons carry the **signup's** id as
   `client_reference_id` (`payLink`).
2. Stripe tells the webhook (`supabase/functions/stripe-webhook`). It finds
   no client with that id and asks `client_signup_claim(id)`.
3. The claim makes the client: name, plan, monthly fee, setup fee, an
   onboarding form link, and the billing schedule (the setup fee when there
   is one, and twelve months from today, the rows Billing Setup writes). It
   locks the signup first, so two payments arriving together make one
   client. Every later payment on the link gets the same client back.
4. The webhook books the payment to them exactly as it does for any client
   (the Stripe customer is linked, the scheduled row is ticked) and tells
   the Slack channel "New client added to the agency" through team-digest.
5. The next time anybody has the CRM open, `finishSignups`
   (`src/lib/clientSignupStore.js`, run from `Layout`) makes Ken's
   onboarding tasks for them and tells the channel if the webhook could not.
   Each signup is claimed first with a write only one browser can win, so
   two people online make one set of tasks.

So the client is on the Clients list the moment the first payment lands,
with the form still to come (the list and the brief show "form not in" the
way they do for any new client). If the claim cannot be reached, the
payment is parked in the unmatched queue on the Payments page like any
payment the CRM cannot place: visible, never lost.

A subscription's first invoice can reach the webhook before its checkout
does. It is parked for a moment and booked to the new client when the
checkout lands (the same rescue an ordinary client's first month gets).

## The pieces

| Piece | Where |
|---|---|
| Table, the token read, the claim, the list, the link preview name | `supabase/client-signups.sql` (applied live 2026-11-27) |
| What a link charges, what the page says, where a link stands | `src/lib/clientSignup.js` |
| Reads, writes, finishing a signup | `src/lib/clientSignupStore.js` |
| The client's page | `src/pages/ClientJoinPage.jsx` |
| The maker and the list | `src/components/SignupLinkPanel.jsx`, on `src/pages/ClientsPage.jsx` |
| The webhook's signup path | `claimSignup` in `supabase/functions/stripe-webhook/index.ts` (v31) |
| Link preview | `netlify/lib/preview.js` (`join`), `public/og-get-started.png` |

`client_signup_load(token)` is the only thing the anon key can call: it
returns the plan, what is paid, the Stripe links and, once both payments are
in, the onboarding form's token. `client_signup_claim` is the service key's
alone. The table is the team's (RLS).

Pinned by `scripts/check-client-signup.mjs`, the signup section of
`scripts/check-payments.mjs` (the webhook against a stand-in database), and
the public-site, link-preview and home-screen checks.

## To make it complete in Stripe

- A **$3,500 a month** Payment Link pasted into Payments, Stripe, so the
  $3,500 plan can get a signup link.
- Nothing else. No redirect needs setting on the Payment Links: the
  client's own tab updates by itself when they come back to it.
