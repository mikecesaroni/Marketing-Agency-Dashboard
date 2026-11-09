# The client's billing page

Added 2026-11-09: "make a branded payments page from the client portal
where clients can pay the setup fee and subscribe to the Stripe payment".
The client's one private link grew a fourth tab, **Billing** (`/pay/<token>`,
the same dashboard token as their Live KPIs, Video scripts and Your videos
tabs), on the same dark surface with the Working Class mark: their plan and
what it includes, whether the setup fee is paid, whether the subscription
has started, and one button each to pay or to subscribe. The button opens
Stripe's own checkout (a Payment Link) with the client's id stamped on it,
so the webhook books the money to them the moment Stripe reports it, the
way the per-client links the Payments card copies always have
(`docs/stripe-setup.md`).

## What a client sees

- **Setup fee**: the amount, One time, and Paid (with the date) or Due or
  Past due with **Pay the $2,500 setup fee**. A split fee shows what is
  still owed. No card when the client has no setup fee and never paid one.
- **Your plan**: the package by name (The Whole Chain Marketing, CRM /
  Marketing Maintenance, Runs Without You Marketing; a fee that matches no
  package is a plain Monthly plan), the price a month, what it includes in
  the client's words (`CLIENT_INCLUDES` in `src/lib/clientBilling.js`), and
  the state: **Active** (payments made, since when, the last one, the next
  month when it is still ahead; "Stripe charges the card on file each
  month. Nothing to do."), **Payment problem** (the last charge bounced:
  the amount, Stripe's retry date or that it has stopped retrying, and
  **Update your card**, which opens Stripe's hosted invoice for that
  charge), **Paused** (nothing is charged), or **Not started** with
  **Start your $1,500 a month plan**.
- **Payments**: every paid row, newest first, as the date, Setup fee or
  Monthly plan, and the amount.
- **Just paid?** It can take a minute to show; **Check again** reloads.
- The footer: payments are processed by Stripe, questions go to the Monday
  email. The page never promises a cancellation and never shows a card
  number; the card goes to Stripe and never to us.

The words are fixed text, short sentences, no em dashes. The page is
checked at phone widths like the other tabs (the tab bar fits four tabs at
360px: the icon over a 12px label, one column each).

## Which link the button opens, and the one rule

`billingPlan` in `src/lib/clientBilling.js` (pinned by
`scripts/check-client-billing.mjs`) decides what the page says and which
link it offers, from the client row, their payments (the CRM's ledger,
which the Stripe webhook keeps), the Stripe settings and the client's
contact email (prefilled on the checkout). The rule: **the page never
offers a link that charges a different amount than the client owes.**

- The standard setup link (Payments page, 💳 Stripe) is offered only to a
  client who owes exactly what it charges, which the box now records
  (**What the setup fee link charges**, `app_settings.stripe_setup_link_amount`,
  2500 to start, since every setup fee on the books is $2,500).
- The standard subscription link is by exact price: $998, $1,500, $2,500
  and (new) $3,500 each have a slot in the Stripe box. A $1,750 plan
  matches none.
- A client whose fee matches no standard link gets a **custom link**: on
  the client page's Payments card, "Client billing page" shows the state
  the tab reports ("Says: setup fee due, not subscribed yet"), warns in
  amber when no link charges what they owe, and "Custom Stripe links for
  this client" takes a Payment Link for the setup fee and one for the
  monthly plan (`clients.pay_setup_link`, `pay_monthly_link`). A custom
  link wins over the standard one when both exist.
- Until a client has a link, the tab says "Your payment link is on its
  way" instead of offering a wrong charge.

Whichever link it is, `payLink` stamps `client_reference_id` (the client's
id) and `prefilled_email` on it and passes only https addresses through.

## Where the link lives

- The client page's Payments card: **Client billing page**, Open and Copy
  link, beside the Copy Setup fee link and Copy Subscription link buttons.
- The Payments page's "Setup fee not paid" and "Not subscribed yet" lists:
  **Copy billing link** on every row, because that is where the chasing
  happens.
- The client's own portal: the Billing tab in the bar and the sidebar, so
  a client already on their dashboard finds it without a new link.
- The address follows "Links go out on" like every client link
  (`publicLink`).

## How it is wired

`supabase/client-billing.sql` (applied live 2026-11-09): the two custom
link columns, the setup amount setting, and `client_billing_load(p_token)`,
a security definer function the anon key can call and nothing else. It
returns the client's plan fields and id, their payments (type, amount,
dates, status, the failure count, Stripe's retry date and hosted invoice
url; never the notes), their contact email and the six Stripe settings the
page reads. `client_link_name` learned the `pay` kind, so a pasted billing
link previews as "Billing for <business>" with `public/og-billing.png`
(`netlify/lib/preview.js`, `netlify/edge-functions/client-preview.ts`).
`netlify.toml` serves `/pay/*` from `client.html` like the other tabs;
`src/lib/homeScreen.js` names a saved icon "Billing"; the help chat hides
on it; `PUBLIC_PREFIXES` in `src/lib/publicSite.js` and `PORTAL_TABS` in
`src/lib/clientPortal.js` carry it.

The page is `src/pages/ClientBillingPage.jsx`; the read and the agency's
save are `src/lib/clientBillingStore.js`; the agency-side row is
`BillingPageRow` in `src/components/PaymentTracker.jsx`. Pinned by
`scripts/check-client-billing.mjs`, with the portal, public-site,
home-screen and link-preview checks updated for the fourth tab.

## What Stripe has to have

Nothing new for the money to book itself: the webhook and the Payment
Links from `docs/stripe-setup.md` are the whole mechanism. Two things make
the page complete: a **$2,500 a month** and a **$3,500 a month** Payment
Link pasted into the Stripe box (neither exists yet, so those clients see
"on its way" until they do), and the setup fee link's amount checked
against what it charges in Stripe.
