# Stripe → CRM payment tracking: one-time setup

Two parts. The Stripe account owner does part 1, the CRM owner does part 2.
Nothing works until both are done, and part 2 needs the secret from part 1.

---

## PART 1 — for whoever owns the Stripe account

Copy-paste message:

---

Hey — I've built payment tracking into our CRM so we stop marking off who paid
by hand. It reads payments straight from Stripe and ticks them off against each
client automatically.

I need four things from you. None of them give the CRM any ability to charge
anyone or move money — it can only listen for "this got paid" notifications.
There's no API key involved.

**1. Add the notification endpoint**

In the Stripe dashboard, go to **Developers → Webhooks**. Newer dashboards call
this **Event destinations** — same thing. Click **Add endpoint** (or **Add
destination** / **Create an event destination**).

Paste this as the endpoint URL:

```
https://zjtwqpaaejrkurtuakdz.supabase.co/functions/v1/stripe-webhook
```

**2. Select exactly these four events, and nothing else**

```
checkout.session.completed
invoice.paid
invoice.payment_failed
customer.subscription.deleted
```

**3. Send me the signing secret**

Once the endpoint is created, Stripe shows a **signing secret** starting with
`whsec_`. You may have to click "reveal".

Send it to me somewhere private — text or a password manager, not email or
Slack. Treat it like a password: anyone with it could post fake "paid" notices
into our books. It can't be used to charge cards or touch money.

**4. Send me both Payment Link URLs**

The setup fee one and the monthly subscription one, exactly as they are
(`https://buy.stripe.com/...`).

**One optional thing that makes this more reliable:** on the setup fee payment
link, if there's a setting for creating a customer record, set it to always
create one. Subscriptions do this already. It helps payments find the right
client when someone pays from an unexpected email address.

**Also optional:** if you add me to the Stripe account as a team member I can
check payments myself instead of asking you.

That's it. Once I have the secret and the two links I'll do the rest and send
you a test to confirm it's working.

---

## PART 2 — for the CRM owner, after part 1 is done

1. **Store the signing secret.**
   Supabase → your project → **Project Settings → Edge Functions → Secrets**.
   Add a secret named exactly `STRIPE_WEBHOOK_SECRET`, value = the `whsec_...`
   string. Save. No redeploy needed.

2. **Store the two payment links.**
   CRM → **Payments** → **💳 Stripe** → paste both URLs → **Save links**.

3. **Test it before trusting it.**
   Ask your partner to open the endpoint in Stripe and click **Send test
   webhook** (pick `invoice.paid`). You should get a **200** back with a note
   saying what it did. A **400** means the secret is wrong or was not saved.

4. **Connect the clients who are already paying.**
   Existing subscriptions were created before any of this, so they carry no
   client reference. Their next monthly payment will land in the **unmatched**
   list on the Payments page. Assign it to the right client once from the
   dropdown — that writes the Stripe customer ID onto the client and every
   month after matches on its own.

   Faster alternative: have your partner export the Customers list from Stripe
   (customer ID + email) and map them all in one go instead of waiting for a
   payment to arrive.

5. **Make sure each client has a billing schedule.**
   The webhook ticks off the oldest outstanding row in the schedule. A client
   with no schedule still gets their payment recorded, just flagged as
   unscheduled. Client page → **Billing Setup** creates the schedule.

6. **From now on, send the per-client links.**
   Each client's Payments card has **Copy Setup fee link** and **Copy
   Subscription link**. Those carry that client's ID, which is what makes the
   match automatic. The raw links still work — those payments just may need one
   manual assign.

---

## How the matching works, in one paragraph

A payment link is a single generic URL, so Stripe has no idea who is paying.
The per-client copy buttons append `?client_reference_id=<client id>`, which
Stripe passes through on the first payment. The webhook reads it, finds the
client, and records Stripe's **customer ID** against them. Later monthly
invoices carry the customer ID but *not* the client reference, so that first
recording is what keeps months two through twelve attached. If both are
missing, it falls back to matching the payer's email against `contact_email` on
the intake form. If all three miss, the payment is parked in the unmatched list
rather than dropped.

Whichever way a payment lands, the email on the Stripe customer is kept on the
row (`payments.payer_email`) and shown on the Payments page after the date and
method, so "who actually paid this" (the bookkeeper, a spouse, a second
business) is answered without opening Stripe. Rows from before 2026-10-23 were
filled in from the stored Stripe events; a handful imported from a CSV before
the webhook existed, and the ones marked paid by hand, have none.

## Declined cards

A failure is unresolved when the money has not arrived, and nothing else
(`src/lib/paymentFailures.js`). A decline marks the client's oldest open month
overdue with the failure columns filled and the invoice stamped on the row, so
Stripe's retry lands on that same row and marks it paid: the "Card failing"
flag and the failed-payments card on the Payments page clear themselves. Most
declines go through on a retry within two weeks; the card leads with Stripe's
retry date, and a decline Stripe has given up on is the one that reads as
urgent.

Three rules keep "when a payment declines but then is successful, it goes away"
true whichever row the money lands on (2026-10-29):

- **A decline from a customer nobody has linked is parked as a decline**, not
  as money. The unmatched queue shows "Card declined" with Stripe's retry date;
  assigning it to a client records the decline on their oldest open month and
  links the customer, and marks nothing paid. It turns into a parked payment
  only when the money for that customer and amount arrives. Before this,
  assigning a parked decline marked a month paid: Classic Home Services'
  October 2026 invoice was declined before their customer was linked, the
  decline was assigned as a payment, October read as paid for ten days while
  Stripe kept retrying, and the later declines landed on November. The October
  row was put back to overdue with the real failure (six attempts, retrying
  2026-10-30) and November back to pending.
- **A decline for an invoice the books already show paid is ignored**, so an
  out-of-order or stale decline never marks the next month.
- **The money for an invoice clears that invoice's decline from any other open
  month** still carrying it (back to pending, failure columns off), and the
  failed-payments card drops a decline whose invoice is paid on any row.
