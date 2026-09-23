# Connecting Google Ads

What this gets you: every night, for every client with a Google Ads customer ID
on file, the CRM pulls what each keyword cost and what people actually typed to
get there, and rolls the spend and conversions into the weekly report next to
Meta.

This is the setup, in the order it has to happen. Steps 1–5 are done once for
the whole agency. Step 6 is once per client.

**Read this first:** Google changed how API access works on **9 September
2026**. Developer tokens were sunset. Any guide written before that date — and
most of what you will find by searching — tells you to apply for a token in the
Google Ads API Center and wait weeks. That page no longer decides anything. The
access level now attaches to a Google Cloud project, and approval is automated.
If a guide mentions a developer token, it is out of date.

---

## 1. A manager account (MCC)

The manager account is not what grants API access any more, but it is still
what lets **one** credential read **every** client account. Without it you
would need a separate OAuth consent per client, forever.

Manager accounts are free and have no billing of their own — the spend stays
on the sub-accounts.

### If you do not have one yet

**Which Google account you create it under matters, and cannot be undone.**
An email that already *directly manages* a regular Google Ads account cannot
be used to create a manager account. Use the agency address
(`marketing@workingclassgroup.com`), not a personal Gmail — the agency's Google
assets have already drifted across three personal addresses once.

To check whether that address is free: sign in to Google as it, then go
straight to <https://ads.google.com/home/tools/manager-accounts/>.

> **Do not go to ads.google.com and let it walk you into creating a campaign.**
> That flow creates a *regular* Ads account on the address and burns it for
> this purpose. Use the manager-accounts link above.

Click **Create a manager account**, then:

- **Name** — the agency name. Clients see this when you request access.
- **How will you use it** — *Manage other people's accounts*.
- **Country, time zone and currency** — **these cannot be changed later.**
  Pick the agency's own. Sub-accounts keep their own currency regardless, so
  this only affects the manager's own reporting.

Your manager ID is then top-right, as `123-456-7890`. Digits only when it goes
in a secret.

### Linking client accounts

Client accounts must be **linked** to the manager for the sync to see them.

From the manager account: **Accounts icon → Sub-account settings → + →
Link existing account**, paste the client's 10-digit customer ID (one per line
for several), **Preview**, **Send request**.

The other side has to accept, in the client account: **Admin → Access and
security → Managers tab → Accept** on the link request. If you already hold
admin on that account you can accept it yourself.

> **For every client from here on: create their Google Ads account *from* the
> manager account** (Sub-account settings → + → Create new account). It is
> linked from birth — no request, no waiting on the client, and nothing to
> chase.

For an account the client owns and built themselves, the link has to be asked
for. That was STEP 3 of the LSA setup message, which we removed; ask for it
directly.

> `app_settings.google_ads_manager_id` in the database is a **dead row** — the
> last code that read it was removed when STEP 3 came out of the LSA message.
> The manager ID the sync uses is the `GOOGLE_ADS_LOGIN_CUSTOMER_ID` secret in
> step 5. Putting it in the database does nothing.

## 2. Create a Google Cloud project

Go to <https://console.cloud.google.com/> and create a project. Name it
something you will recognise in two years — `working-class-crm` rather than
`My First Project`.

This project is now the thing that carries your API access, so it matters which
one you use. Use one project for the agency and do not delete it.

## 3. Enable the Google Ads API on it

In that project: **APIs & Services → Library → Google Ads API → Enable**.

## 4. Brand verification, then Basic access

Still in Cloud Console, on the project's **Google Ads API** page.

1. Complete **brand verification**. This is Google confirming the project
   belongs to a real business — you will give it your company name, website
   and support contact. Use the agency's real domain.
2. Then request **Basic access**.

Basic is 15,000 operations a day. The sync uses three per client per night, so
even at a hundred clients you are nowhere near it.

Reviews for Basic are automated once brand verification is done and generally
land within minutes rather than the weeks the old token process took. If you
had a Basic application queued before 9 September 2026 it was closed in the
transition — reapply here, it does not carry over.

## 5. OAuth credentials, and the refresh token

This is the fiddly part. You are creating a login that the server can use
without a human present.

**a. Consent screen.** APIs & Services → OAuth consent screen. External. Fill
in the app name and support email.

> **Publish it.** Do not leave it in **Testing**. A refresh token issued by an
> app in Testing mode **expires after 7 days**, and the sync will die a week
> after you set it up, at night, silently. This is the single most common way
> this integration breaks.

**b. Credentials.** APIs & Services → Credentials → Create credentials → OAuth
client ID → **Desktop app**. You get a client ID and a client secret.

**c. Refresh token.** Go to <https://developers.google.com/oauthplayground/>.

- Click the gear (top right), tick **Use your own OAuth credentials**, paste
  the client ID and secret.
- In the scope box on the left, type: `https://www.googleapis.com/auth/adwords`
- Authorise it **as the Google account that can see your manager account**.
  Whichever account you click through with is the account the CRM will be
  acting as, so use the agency login, not a personal one.
- Click **Exchange authorization code for tokens**.
- Copy the **refresh token**.

> For the playground to be allowed to hand back a token, add
> `https://developers.google.com/oauthplayground` as an authorised redirect URI
> on the OAuth client. If you get `redirect_uri_mismatch`, that is what is
> missing.

**d. Put them in Supabase.** Project Settings → Edge Functions → Secrets:

| Secret | What it is |
| --- | --- |
| `GOOGLE_ADS_CLIENT_ID` | from step 5b |
| `GOOGLE_ADS_CLIENT_SECRET` | from step 5b |
| `GOOGLE_ADS_REFRESH_TOKEN` | from step 5c |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | the manager ID from step 1, digits only |

Two optional ones, neither needed today:

| Secret | When you would set it |
| --- | --- |
| `GOOGLE_ADS_API_VERSION` | Google retires API versions on a schedule. If the sync starts returning 404s naming the version, set this to the current one — no deploy needed. |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Only if you have a legacy token and want it sent. Google ignores it now and will reject it in a future version. Leave it unset. |

## 6. Per client: the customer ID

On the client's page in the CRM, in the **Google Search** panel, paste their
Google Ads customer ID. Dashes are fine — the field strips them, because Google
shows the ID with dashes everywhere and the API refuses it that way.

That is the whole per-client step. The next nightly run picks them up.

---

## Checking it worked

Call the function by hand rather than waiting for the cron:

```
POST /functions/v1/google-daily-sync
{ "client_id": "<the client uuid>", "days": 30 }
```

It answers with a per-client line: how many keyword rows, how many search
terms, how many weeks of roll-up, and the spend and leads it wrote. If
something is wrong it says which client and why, and carries on with the rest —
one broken link never stops the run.

The errors are written to be actionable:

- **"No client has google_ads_customer_id set"** — step 6 has not been done.
- **"Google refused the refresh token"** — step 5. Usually the consent screen
  is still in Testing (see the warning above), or the secret was truncated
  when pasted.
- **"not found under the manager account, or API version … retired"** — either
  the client account is not linked to the MCC (step 1), or Google has retired
  the API version (set `GOOGLE_ADS_API_VERSION`).
- **"credentials reached Google but were refused"** — the login works but is
  not allowed on that account. Check the link, and check Basic access on the
  Cloud project.

## What lands where

| Table | Grain | What it answers |
| --- | --- | --- |
| `weekly_kpis` (`channel = 'Google Search'`) | client × week | What the client sees in Reports, next to Meta |
| `google_keyword_daily` | keyword × day | What we bid on, what it cost, what it booked |
| `google_search_term_daily` | search term × day | What people actually typed |

The roll-up is read from **campaign** grain, not keyword grain, on purpose:
campaign totals include every campaign type, so adding a Performance Max
campaign later cannot silently under-report the client's spend.

**Keyword and search-term totals will never match, and that is not a bug.**
Google withholds the search term on a large share of impressions and clicks, so
search-term cost is always lower than keyword cost for the same day. The two
live in separate tables so nothing can add them together and produce a number
you cannot defend to a client.

## The rules

`src/lib/googleSearchRules.js` decides what counts as waste. The thresholds are
in `RULES` at the top of that file and are asserted in
`scripts/check-google-search-rules.mjs` — if you change one, that check fails
until you change it there too, which is deliberate: a threshold that moves
without anyone noticing is how a keyword quietly stops being flagged.

The two lists it produces:

- **Keywords** — `waste` (spending, converting nothing), `expensive`
  (converting, but each one costs too much), `winner`, `ok`, `young` (not
  enough spend to judge).
- **Searches to block** — terms with no conversions that nobody has decided
  about yet. Ones matching an obvious non-customer pattern (job hunting, DIY,
  training, buying parts) are marked **certain** and flagged at a much lower
  spend, because a negative keyword is cheap to add and saves that spend across
  every campaign at once.

Nothing here writes to Google. Pausing a keyword and adding a negative are each
one click in the Google Ads UI, and doing them through the API would mean
holding write access to every client account to save that click.
