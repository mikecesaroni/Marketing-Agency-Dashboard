# Make 3 ads

Written 2026-10-14. The Ad Studio door on the Content tab used to open an empty Studio: pick a photo, type a headline, pick a look, save, three times over. Now it opens the Studio already making three ads for the client, written from their brief and laid out in three looks, so the work is reviewing and saving rather than starting from nothing.

## What happens

1. Content tab, Ad Studio door, click the client. The card says "Make 3 ads". ("Open empty" in the corner of the card is the old way in.)
2. The client page opens with the Studio up and a strip above the artboards: "Making 3 ads for <client>". It takes about half a minute.
3. The chat for that client is asked for three static ads on three angles: the current offer, the time of year, and proof or trust. It gets the same brief the chat always has (the intake, the website fact sheet, the saved ads, what has worked across the agency, the landing pages), so the words are the client's. The turn is one-off, so it does not fill the client's chat history with the photos it was shown.
4. The chat writes to the season playbook (src/lib/seasonPlaybook.js: the phase of the year for this trade in this market, its tactics and offer shapes), and each set gets the template its words call for at this time of year: a $0 down offer lands on Financing, a same-day call on Same day, a tune-up on the Tune-up poster, several prices on the Price grid, the time-of-year ad on the phase's own poster (leaves in the fall, sun in July), and the proof ad on the Headline stack over the owner's photo; never the same template twice. The chat also writes a sticker (two or three words for the starburst) and up to two price tiles from the brief; the kicker, the unit in the corner and the painted background come from the playbook, all editable on the form. The chat is shown the client's newest photos, uploads and Drive folder alike (up to eight), and names one for each ad: the owner's face for trust, the van or the work for the offer, the one that shows the season. A different photo per ad while there are enough; with no photos, you pick one. The logo is the remembered one, and the colours come from it (or the intake's stated brand colours), never from the chat's guess.
5. The first ad is on the artboards. The chips on the strip switch between the three. Every field, the look and the photo can be changed, and the change stays with that ad when you switch away.
6. "Save all 3 ads" saves every one in three sizes, exactly as "Save all 3 sizes" does for one: same bucket paths, same file rows, same recipes. The Saved ads tab lists them, Send for approval and Publish take them from there.

"Done" drops the strip and keeps whatever is on the artboards. If the chat comes back without the three (no JSON, the chat not deployed, the key missing), the strip says so with "Try again" and "Design by hand instead", which prefills from the intake like an empty Studio.

Review the three before saving. The chat is good at the words but it does not see the photo; a headline that fights the picture wants a different look or a different photo, and both are one click.

## Where the code is

- `src/lib/adBatch.js`: the pure half (the prompt, the looks per set, which photo to start from, the chip titles, the round trip of edits), tested by `scripts/check-ad-batch.mjs`.
- `src/lib/adBatchStore.js`: `makeAdBatch`, which gathers the brief, asks the chat, parses the creative sets and attaches a look and a photo to each.
- `src/components/AdStudioPanel.jsx`: the `make` and `ads` props, the `BatchStrip`, `saveBatch` (paints the sets that are not on the artboards off-screen).
- `src/pages/ContentPage.jsx` (the door and the card's two links) and `src/pages/ClientDetailPage.jsx` (`?open=studio&make=3`).
