# Connecting the CRM to the Meta ad accounts

Everything below produces one credential: a **System User access token**. It is
what the weekly KPI sync reads, and what the Ad Studio's Publish button uses to
create ads.

> **Where this landed.** The original plan was to give the chat write access via
> Meta's hosted MCP server. That did not work — see Part 4 — so writes happen
> through a **Publish** button in the Ad Studio instead, calling the Graph API
> directly. The chat still writes copy and emits creative sets; it just has no
> tools that touch an ad account. Parts 1 and 2 are still needed either way.

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

Then do the same for **Pages**: tick each client's Facebook Page and enable
**Manage Page**. Skipping this is fine for syncing KPIs, but an ad creative is
a Page post and an instant form is a Page resource, so publishing needs it.

A token can only reach assets assigned here. Adding a client later means coming
back and assigning both their ad account and their Page, or the CRM will report
that account as unreachable.

### 4. Generate the token

Select the system user → **Generate new token**

- App: the one from step 1
- Expiry: leave it as **never expires** (do not tick the 60-day option)
- Permissions:

| Scope | Why |
| --- | --- |
| `ads_management` | create campaigns, ad sets and ads |
| `ads_read` | the weekly KPI sync |
| `business_management` | see the business's assets at all |
| `pages_show_list` | find the Page an ad posts as |
| `pages_manage_ads` | create instant forms, which live on the Page |

The two `pages_*` scopes are easy to miss because ad-account access does not
imply Page access. Without them, instant form creation fails even when the
Page is correctly assigned to the system user — the scopes and the asset
assignment are two separate gates, and you need both.

`leads_retrieval` is deliberately **not** in that list. It is only needed to
pull submitted leads back into the CRM, which nothing here does: leads land in
Meta's Lead Center on the Page, where they can be emailed out or exported. Add
it only if the CRM ever grows a lead inbox of its own.

The token is shown **once**. Copy it immediately. If the dialog closes, revoke
it and generate another.

**Treat this like a password.** It can create and edit ads, and therefore spend
money, across every account assigned in step 3. It must never be committed to
the repository, pasted into a chat, or emailed. It belongs only in the Supabase
secrets box.

---

## Part 2 — Wire it up (Supabase)

**Project Settings → Edge Functions → Secrets**, add:

| Name | Value | Used by |
| --- | --- | --- |
| `META_ACCESS_TOKEN` | the `EAAG...` token from part 1 | `sync-meta-kpis`, `meta-publish` |

No redeploy needed; the functions read it on the next invocation.

The two MCP secrets below were for the chat-tools route, which did not work out
(Part 4). Setting them does no harm, but nothing depends on them:

| Name | Value |
| --- | --- |
| `META_MCP_URL` | `https://mcp.facebook.com/ads` |
| `META_MCP_TOKEN` | the same token |

---

## Part 3 — Test before trusting it

Easiest check: open any client and hit **Sync Now** on the Meta Ads Sync card.

- **It reports spend and leads** — the token works and the account is assigned.
- **It reports that account failed** — the system user was never assigned that
  ad account (Part 1, step 3), or the token was mistyped.

Once that passes, the token is good for publishing too. Publishing additionally
needs **Manage campaigns** on the account, not just read access.

---

## Why the chat has no ad tools

`mcp.facebook.com/ads` is built around an interactive OAuth browser login. An
Edge Function cannot do a browser flow, so it sent the System User token as a
bearer token instead, and Meta would not accept it.

Nothing was wasted: the same token drives the fallback, which is now built. See
**Part 4**.

---

## Part 4 — Publishing (the route that is actually built)

`mcp.facebook.com/ads` expects an interactive OAuth browser login. An Edge
Function cannot do a browser flow, so it sent the System User token as a bearer
token instead, and Meta would not take it. The chat therefore has no write
tools.

What exists instead is the **Publish** tab in the Ad Studio, backed by the
`meta-publish` Edge Function, which calls the Graph API directly. That route is
arguably the better one anyway:

- The Graph API is stable and documented, with no dependency on how a hosted
  MCP server handles auth. It is the same engine Ads Manager itself drives.
- Publishing is a deliberate button press on one specific creative, rather than
  something a conversation might decide to do on its own.
- Everything is created **PAUSED**, so the last step stays a human clicking
  "make it live" in Ads Manager.

That matches the sanctioned design. Meta's own guidance for automated tooling is
a human approval gate on writes, and rapid unattended ad creation is one of the
patterns that gets accounts flagged.

### The secret it reads

`meta-publish` uses **`META_ACCESS_TOKEN`**, the same secret the KPI sync reads
— not `META_MCP_TOKEN`. Both hold the same System User token from Part 1; the
MCP pair above is only used by the chat function, and can be left unset now that
the MCP route is a dead end.

| Name | Value |
| --- | --- |
| `META_ACCESS_TOKEN` | the `EAAG...` token from Part 1 |

### Setting it up

1. Run `supabase/meta-publish.sql` in the SQL Editor. It adds `meta_page_id`,
   `meta_pixel_id` and `website_url` to `clients`, three copy columns to
   `saved_ads`, and the `published_ads` table that records what was created.
2. Deploy the `meta-publish` Edge Function.
3. On each client's **Meta Ads Sync** card, hit Change and fill in:
   - **Facebook Page ID** — required. An ad creative is a Page post, so Meta
     rejects a creative without one. It is under the Page's About → Page
     transparency, and it is *not* the ad account ID.
   - **Landing page URL** — required. Where the ad's button sends people.
   - **Pixel ID** — only needed to optimise for leads rather than traffic.

The system user also needs **Manage campaigns** on the ad account (Part 1, step
3). Read-only access is enough to sync KPIs but not to create anything.

### Publishing an ad

Ad Studio → **Publish**. It publishes from a *saved* ad, not the live artboards,
because Meta fetches the image bytes over HTTP and the public bucket URL only
exists once the ad has been saved.

The form walks through the image, the feed copy, the objective, the campaign and
the ad set (budget, age, locations). Then one button creates, in order:

    campaign  ->  ad set  ->  creative  ->  ad          all PAUSED

Locations are searched against Meta's own geo endpoint rather than typed —
Meta only targets keys it issued itself, so "Rochester" means nothing to the API
and the key it returns for Rochester does. Cities carry a radius; states and
postcodes do not.

On success the panel links straight to the new ad set in Ads Manager, which is
where the human approval step happens. Nothing spends until somebody switches it
on there.

### When it fails partway

The chain is four API calls. If, say, the creative is rejected after the
campaign and ad set were created, those two are left in place and named in the
error. Nothing is rolled back on purpose: deleting objects is itself a
destructive write on a failure path, and a paused half-campaign costs nothing.
Delete it in Ads Manager, or pick that campaign under "Add to an existing one"
on the next attempt.

### What is not built yet

- **Lead forms (Instant Forms).** These live on the Facebook Page rather than
  the ad account, need a privacy policy URL and a defined question set, and are
  their own build.
- **Call ads.** Objective, destination and creative all differ from a website
  ad, and call ads have their own eligibility rules.
- **Editing what already exists.** This creates; it never modifies. Changing an
  existing ad set's locations or budget is a separate, and more dangerous,
  feature — it can alter something that is live and spending.
