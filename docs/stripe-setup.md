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
