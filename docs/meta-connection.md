# Connecting the CRM chat to the Meta ad accounts

The per-client chat can already write copy and emit creative sets. It cannot
touch an ad account until `META_MCP_URL` is set, because the Edge Function only
attaches Meta tools when that secret exists. Without it the chat is not being
cautious, it simply has no tools to call.

Everything below produces one credential: a **System User access token**. Both
possible routes need it, so this is worth doing regardless of which one ends up
being used.

---

## Part 1 — Get the token (Meta Business Manager)

### 1. Make sure a Meta App exists and belongs to the business

This is the step people miss, and without it the Generate Token dialog has
nothing to offer.

- Go to <https://developers.facebook.com/apps> and create an app if there is
  none. Type: **Business**. Add the **Marketing API** product to it.
- In **Business Settings → Accounts → Apps**, click **Add** and connect that
  app to the business that owns the ad accounts.

### 2. Create the system user

**Business Settings → Users → System Users → Add**

- Name it something obvious: `CRM Automation`
- Role: **Admin**

A system user is a non-human account. Its token is meant for server-to-server
work and does not expire the way a personal login token does, which is the
whole point: nobody has to re-authorise this every 60 days.

### 3. Give it the ad accounts

Select the system user → **Assign Assets** → **Ad Accounts** → tick every client
account the CRM manages → enable **Manage campaigns** (full control).

A token can only reach accounts assigned here. Adding a client later means
coming back and assigning their account too, or the CRM will report that account
as unreachable.

### 4. Generate the token

Select the system user → **Generate new token**

- App: the one from step 1
- Permissions: **`ads_management`**, **`ads_read`**, **`business_management`**
- Expiry: leave it as **never expires** (do not tick the 60-day option)

The token is shown **once**. Copy it immediately. If the dialog closes, revoke
it and generate another.

**Treat this like a password.** It can create and edit ads, and therefore spend
money, across every account assigned in step 3. It must never be committed to
the repository, pasted into a chat, or emailed. It belongs only in the Supabase
secrets box.

---

## Part 2 — Wire it up (Supabase)

**Project Settings → Edge Functions → Secrets**, add both:

| Name | Value |
| --- | --- |
| `META_MCP_URL` | `https://mcp.facebook.com/ads` |
| `META_MCP_TOKEN` | the `EAAG...` token from part 1 |

No redeploy needed; the function reads them on the next invocation.

---

## Part 3 — Test before trusting it

Open any client's chat and send:

> List the campaigns in this client's ad account.

- **It answers with real campaign names** — connected. The reply's `meta_tools`
  flag is true and the chat can now create campaigns, ad sets, creatives and ads.
- **It says it has no connection** — the secrets are missing or misspelled.
- **It reports an authorisation error from Meta** — the token was rejected. See
  below; this is the outcome to plan for.

---

## If Meta rejects the token

`mcp.facebook.com/ads` is built around an interactive OAuth browser login. An
Edge Function cannot do a browser flow, so it sends the System User token as a
bearer token instead. That may or may not be accepted, and it could not be
tested from the build environment because outbound access to facebook.com is
blocked there.

If it is rejected, nothing is wasted: the same token drives the fallback, which
is a small function that calls the Graph API directly and is put behind a
**Publish to Meta** button in the Ad Studio. That route is arguably the better
one anyway:

- The Graph API is stable and documented, with no dependency on how a hosted
  MCP server handles auth.
- Publishing becomes a deliberate button press on a specific creative, rather
  than something a conversation might decide to do.
- Everything is created **PAUSED**, so the last step stays a human clicking
  "make it live" in Ads Manager.

That matches the sanctioned design anyway. Meta's own guidance for automated
tooling is a human approval gate on writes, and rapid unattended ad creation is
one of the patterns that gets accounts flagged.
