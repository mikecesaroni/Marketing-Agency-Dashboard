# Pasting a client's ZIP list into Meta targeting

Asked 2026-11-02: "what's the easiest way to add all this when a client sends ZIPs to target on Meta; can we make it so I paste this all in and it creates all the targeting on the ad set."

## How it works

On the publish page, under the location search, "Paste a list of ZIPs" opens a box. Paste whatever the client sent: an email, a spreadsheet column, "Raleigh NC 27601, 27603, 27605-1234". Press Add. Every five-digit ZIP in the text (once each, in order, ZIP+4 trimmed to the five, leading zeros kept, phone numbers ignored) is checked with Meta in one call per hundred, and each one Meta knows is added to the ad set's targeting as its own ZIP area, labelled with its town and state ("27601, Raleigh, North Carolina"). The line under the button says what happened: "Added 40 ZIPs · 1 already there · 1 not known to Meta: 00000." Nothing is targeted that Meta did not confirm, so a typo cannot slip in as a silent gap.

The ad set then goes to Meta exactly as a hand-picked ZIP would have: `geo_locations.zips` with Meta's own keys (`US:27601`), no radius, because a ZIP is the area it is. ZIPs, cities and states mix freely in one ad set. "Same place as last time" remembers the pasted list with everything else.

## Where the code is

- `src/lib/zipList.js`: the pure part. `zipsFromText`, `zipKey`, `zipLocation`, `pasteSummary`. Tested by `scripts/check-zip-list.mjs`.
- `supabase/functions/meta-geo/index.ts`: the bulk lookup (`lookup_zips`), Meta's `search?type=adgeolocationmeta&zips=[...]`, a hundred keys a call, with a per-ZIP fallback for a chunk Meta refuses. Its own small function rather than another action on the two-thousand-line `meta-publish`; same `META_ACCESS_TOKEN`.
- `src/lib/metaPublish.js`: `lookupZips`. `src/components/LocationPicker.jsx`: the box and the button.

## Limits

Up to a thousand ZIPs per paste. US only for now (the key prefix); a Canadian list would need the country passed through. Meta caps how many locations one ad set may carry; a client who sends several hundred ZIPs is usually better served by their cities with a radius, which the intake already suggests.
