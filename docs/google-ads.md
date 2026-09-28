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

## 4. Explorer access

On the project's **Google Ads API** page: **Access levels → Manage → Apply for
access**.

A new project starts at **Test**, which reaches test accounts only — it would
return nothing for a real client. **Explorer** is the tier this needs. It
reaches production accounts and takes no formal application: you click, and
you have it.

**Do not start with Basic.** Basic means brand verification, a privacy policy
on the agency domain, and a review queue, and it buys nothing this integration
uses.

| | Test | Explorer | Basic |
| --- | --- | --- | --- |
| Production accounts | no | **yes** | yes |
| Operations/day | 15,000 (test only) | **2,880** | 15,000 |
| Application | — | **none** | brand verification + review |

The sync makes **three requests per client per night** — the keyword report,
the search-term report and the campaign totals. Fifteen clients is 45 a night
against a ceiling of 2,880. Explorer is not a stopgap here; it is roughly
sixty times the headroom needed.

What Explorer does not allow: creating Google Ads accounts through the API,
the keyword planning services, user management and billing. None of it is used
— this integration only ever reads, which is also why the CRM sends you to the
Google Ads UI to pause a keyword rather than doing it for you.

Move to Basic only if the daily operations ever become a real ceiling, and
budget for brand verification when you do.

## 5. OAuth credentials, and the refresh token

This is the fiddly part. You are creating a login that the server can use
without a human present.

**a. Consent screen.** APIs & Services → OAuth consent screen. Fill in the
app name and support email.

Pick **Internal** if the agency address is on Google Workspace (it is:
workingclassgroup.com). Internal has no Testing mode, so the token never
expires for that reason, and only accounts on the agency domain can sign in,
which is exactly who should. This is what the live setup uses.

If Internal is not offered, pick External and then **publish it**. Do not
leave it in **Testing**: a refresh token issued by an app in Testing mode
**expires after 7 days**, and the sync will die a week after you set it up, at
night, silently. Publishing may want a home page and privacy policy link on
the Branding page first.

**b. Credentials.** APIs & Services → Credentials → Create credentials → OAuth
client ID → **Web application**, and add
`https://developers.google.com/oauthplayground` under authorised redirect
URIs (a Desktop client has no redirect field, and the playground in step c
needs one). You get a client ID and a client secret. **Copy the secret from
the dialog that appears; Google shows it once.**

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

## 6. Per client: access, then the customer ID

**The route we ask for (since 2026-09-28): the client adds our email as a
user, then sends us their customer ID.** It is one screen they can find,
needs nothing from us first, and the sync then reads their account
directly (it asks the account as itself when the manager route is refused).

1. Send the message. Two copy buttons, in Quick copy on the dashboard, on
   the client page's Google Search panel, on the Google Search report and in
   the client's setup messages. **Google Ads access request** is the short
   ask. **Google Ads access, step by step** is the long version: the direct
   link to the Users page (`https://ads.google.com/aw/accountaccess/users`),
   Admin access for `marketing@workingclassgroup.com`, where the customer ID
   is, and what to do when it looks different (no + button, allowed domains,
   cannot find it, no account yet).
2. Accept the invitation in the `marketing@workingclassgroup.com` inbox.
3. Put the ID in. **Client page → Google Search**, or **Reports → Google
   Search**, where every client still to do has the box beside their name.
   Paste it however Google shows it (123-456-7890) and press **Save & sync**:
   it saves, syncs that client for 30 days on the spot and says whether it
   worked (the spend and leads it found, or that Google refused us and what
   the client still has to do).

How the last sync went is kept on the client row (`google_ads_synced_at`,
`google_ads_sync_error`), so the report can tell **No access yet** (an ID
Google refuses: the client has not added us, or we have not accepted) from
**Connected, no spend** (Google let us in, nothing ran).

A client with no Google Ads account yet: both messages tell them not to
create one (Google walks a new account straight into a campaign and a card)
and to reply with the Google email and the business name. We create it from
the manager account, linked from birth, with that email invited as owner.

**Also still works, with nothing to type:** a client account linked under
the manager (`270-103-8317`), or one that added us as a user before we had
the ID. The nightly run lists both, matches each to a client by name and
saves the id itself; on the client page, "Look through the accounts we can
already see" lists them with a **Use this** button. Saved on its own only
when sure: equal or containing names, unique both ways, because a wrong id
syncs one client's spend onto another's report.

The manager id is a constant in `src/lib/googleAdsAccessMessage.js`. It has
to be the same account as the `GOOGLE_ADS_LOGIN_CUSTOMER_ID` secret.

---

## Checking it worked

**Before any client has a customer ID**, prove the login itself:

```
POST /functions/v1/google-daily-sync
{ "check": true }
```

It exchanges the refresh token, lists the Google Ads accounts that login can
see (each with its name, so a bare id reads as whose account it is), and
lists the accounts linked under the manager. `token: ok` plus
`manager_visible: true` means steps 1 to 5 are right; an empty
`linked_accounts` just means step 6 has not happened yet. A failure names the
step: `refresh token` (step 5) or `list accessible customers` (step 4, the
project is still on Test).

First run against the live secrets, 2026-09-28: `token: ok`, `v22`, the
manager visible, and nothing linked yet. It also caught a request-shape bug:
the search request no longer accepts `pageSize` (removed in v17), and v22
answers "Request contains an invalid argument". Removed; pages are a fixed
10,000 rows now.

Then, to see what is linked and how it pairs with clients, without saving:

```
POST /functions/v1/google-daily-sync
{ "discover": true, "dry_run": true }
```

It answers with `linked` (every account under the manager, with name and
status), `pending` (link requests the client has not accepted), `matches`
(what a real run would save), `candidates` per client (closest names,
scored), `unclaimed` (linked accounts on no client) and `without_id` (clients
still not connected). Without `dry_run` it saves the matches; the nightly run
does exactly that first, and reports it under `discovered`.

Then, once a client has an ID, call the sync by hand rather than waiting for
the cron:

```
POST /functions/v1/google-daily-sync
{ "client_id": "<the client uuid>", "days": 30 }
```

It answers with a per-client line: how many keyword rows, how many search
terms, how many weeks of roll-up, and the spend and leads it wrote. If
something is wrong it says which client and why, and carries on with the rest —
one broken link never stops the run.

The errors are written to be actionable:

- **"No client has google_ads_customer_id set"** — no client account is linked
  under the manager yet (step 6), or the linked names were not close enough
  to save: open the client's page and pick from Find their account.
- **"Google refused the refresh token"** — step 5. Usually the consent screen
  is still in Testing (see the warning above), or the secret was truncated
  when pasted.
- **"not found under the manager account, or API version … retired"** — either
  the client account is not linked to the MCC (step 1), or Google has retired
  the API version (set `GOOGLE_ADS_API_VERSION`).
- **"credentials reached Google but were refused"** — the login works but is
  not allowed on that account. Check the link to the manager account, and
  check the Cloud project is on **Explorer** rather than Test. A project still
  on Test reaches test accounts only, and every real client will be refused
  this way.

## What lands where

| Table | Grain | What it answers |
| --- | --- | --- |
| `weekly_kpis` (`channel = 'Google Search'`) | client × week | What the client sees in Reports, next to Meta |
| `google_campaign_daily` | campaign × day | The true totals, every campaign type, with clicks, impressions and value. What the Google Search report adds up |
| `google_keyword_daily` | keyword × day | What we bid on, what it cost, what it booked |
| `google_search_term_daily` | search term × day | What people actually typed |

## The report page

**Reports → Google Search** (`/reports/google-search`) is Google across every
client on one page: who is connected and who is still waiting on a link,
eight KPI tiles against the previous range (spend, leads, cost per lead,
conversion value, clicks, impressions, CTR, CPC), a daily chart, wasted and
blockable dollars, spend by campaign type, a table of every client with
their status and numbers, the searches to block and keywords to act on
across clients, and every campaign. `src/lib/googleSearchReport.js` holds
the arithmetic, pinned by `scripts/check-google-search-report.mjs`.

Totals on that page come from `google_campaign_daily`. The keyword and
search-term lists come from their own tables and are shown beside the
totals, never added to them or to each other (see below for why).

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
