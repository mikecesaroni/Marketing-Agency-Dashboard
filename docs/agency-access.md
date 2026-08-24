# Agency access: the same mistake, three times

Meta, Google Ads/LSA and Google Business Profile each have an agency-level
container. Each also lets a client share access with an individual by email,
which is the obvious-looking path, works immediately, and is a dead end.

Access granted to a person cannot be automated. It cannot be handed to a
teammate. It disappears if that person's login is lost or restricted. Every
integration in this CRM eventually needs the container instead.

| Platform | The container | What the client sends it to | Our ID |
| --- | --- | --- | --- |
| Meta | Business Portfolio | Partner sharing | `1191797372977574` |
| Google Ads / LSA | Manager account (MCC) | Account link request | not created yet |
| Google Business Profile | Organization account | Location group | not created yet |

## Why the individual route always fails

- **Meta.** A system user lives inside a business portfolio and can only be
  assigned assets that portfolio holds. Assets shared to a person are invisible
  to it.
- **Google Ads / LSA.** A developer token is only issued inside a manager
  account. Without one there is no API access at all, whatever permissions the
  individual has.
- **GBP.** Google states plainly that partners must have an organization
  account to access the APIs.

## The GBP trap worth knowing before you start

A user account can only be added to an organization's user group **if it does
not already directly own or manage any locations or location groups.**

Our current setup is exactly that: clients shared their profiles directly with
our email, so that account directly manages locations. It therefore cannot be
added to a user group. The access we already have actively blocks the access we
need.

The way through is to move locations to a location group first, or to run the
organization from a clean Google account that has never had a location shared
with it directly. Decide which before creating anything, because unpicking it
afterwards means asking every client to re-share.

## Order of operations

1. Create the container: Meta portfolio (done), Google Ads manager account,
   GBP organization account.
2. Apply for whatever gate sits behind it. Google Ads needs a developer token
   at Basic access, 5-14 business days. GBP needs the Basic API Access
   application; new Cloud projects sit at zero quota until it is granted, and
   the fix is that application, not a quota increase request.
3. Ask clients to grant to the container, not to a person. The CRM's setup
   messages do this, and each carries the relevant ID from `app_settings`.
4. Only then build the sync.

## Keeping the individual access

Do not remove it. Dashboard access by email is still how an account gets worked
by hand: budgets, lead disputes, a profile edit while something is broken. The
container is for automation and for continuity. Both are wanted, except in the
GBP case above, where the direct access has to move before a user group will
accept the account.
