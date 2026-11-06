# Make 3 ads

Written 2026-10-14. The Ad Studio door on the Content tab used to open an empty Studio: pick a photo, type a headline, pick a look, save, three times over. Now it opens the Studio already making three ads for the client, written from their brief and laid out in three looks, so the work is reviewing and saving rather than starting from nothing.

## What happens

1. Content tab, Ad Studio door, click the client. The card says "Make 3 ads". ("Open empty" in the corner of the card is the old way in.)
2. The client page opens with the Studio up and a strip above the artboards: "Making 3 ads for <client>". It takes about half a minute.
3. The chat for that client is asked for three static ads on three angles: the current offer, the time of year, and proof or trust. It gets the same brief the chat always has (the intake, the website fact sheet, the saved ads, what has worked across the agency, the landing pages), so the words are the client's. The turn is one-off, so it does not fill the client's chat history with the photos it was shown.
4. The chat writes to the season playbook (src/lib/seasonPlaybook.js: the phase of the year for this trade in this market, its tactics and offer shapes), and each set gets the template its words call for at this time of year: a $0 down offer lands on Financing, a same-day call on Same day, a tune-up on the Tune-up poster, several prices on the Price grid, the time-of-year ad on the phase's own poster (leaves in the fall, sun in July), and the proof ad on the Headline stack over the owner's photo; never the same template twice. The chat names a template for each ad itself (the brief carries the menu with when each wins and what it needs), and its pick wins when it is a real key, fits the photos and is not already used; the scorer is the safety net. The chat also writes a sticker (two or three words for the starburst) and up to two price tiles from the brief; the kicker, the unit in the corner and the painted background come from the playbook, all editable on the form. The chat is shown the client's newest photos, uploads and Drive folder alike (up to eight), and names one for each ad: the owner's face for trust, the van or the work for the offer, the one that shows the season. A different photo per ad while there are enough; with no photos, you pick one. The logo is the remembered one, and the colours come from it (or the intake's stated brand colours), never from the chat's guess.
5. The first ad is on the artboards. The chips on the strip switch between the three. Every field, the look and the photo can be changed, and the change stays with that ad when you switch away.
6. "Save all 3 ads" saves every one in three sizes, exactly as "Save all 3 sizes" does for one: same bucket paths, same file rows, same recipes. The Saved ads tab lists them, Send for approval and Publish take them from there.

"Done" drops the strip and keeps whatever is on the artboards. If the chat comes back without the three (no JSON, the chat not deployed, the key missing), the strip says so with "Try again" and "Design by hand instead", which prefills from the intake like an empty Studio.

Review the three before saving. The chat is good at the words but it does not see the photo; a headline that fights the picture wants a different look or a different photo, and both are one click.

## Pick the templates (2026-11-06)

"When we click on Make Static Ads, can we also pick a template and have the
Studio make N ads using that template, or click 3 templates and get 3 ads.
Super intuitive."

Above the client cards on the Content tab's Make Static Ads door, one line
says what clicking a client will make: "Make 3 ads for the client you
click", the Studio picking the templates as before. **Choose templates**
opens the picker: every photo look and template painted small with sample
words (the client's own words and photo are not known yet; inside the
Studio the tiles paint with the ad on the form). Tick tiles:

- **One template** and a number, 1 to 6: that many ads on it, each on its
  own hook and angle ("Make 4 ads on Price grid").
- **A few templates**: one ad on each, in the order ticked (the tiles are
  numbered); the number becomes "how many on each", so three templates at
  2 each is six ads. Six is the most one ask writes, so with four ticked
  the numbers past 1 are greyed out.
- **Nothing ticked**: the Studio picks, 3 ads unless the number says
  otherwise.

The line and every card read the plan ("Make 3 ads: Price grid, Coupon,
Brand wash →"), the link carries it (`?open=studio&make=N&templates=a,b,c`),
and the client page opens with the Studio writing exactly those. The chat is
told the look of each ad in order and writes each ad's words to that look's
shape (`lookShape` / `templateAsk` in `src/lib/adBatch.js` describe the
photo looks the way `TEMPLATE_SHAPES` describes the templates); with one
template repeated it is asked for N different hooks on it, so they read as N
ads and not one ad N times. The looks come back as asked (`layout` is set
from the plan, never from the chat's pick), and the photo picks, the
sticker, the tiles, the kicker and the unit work as before.

The same picker sits inside the Studio: while no batch is up, a line above
the artboards, "✨ Write ads from the brief", carries "Choose templates" and
the button ("✨ Make 3 ads", "✨ Make 4 ads on Price grid"). There the tiles
paint with the words, the colours, the logo and the photo on the form. The
help chat's `make_ads`, `client_make_ads` and `studio_make_ads` take a
`templates` list (the look key for each ad, in order) for "make me four
coupon ads for Belk".

`templatesFor(picked, count)` and `planLabel(picked, count)` in
`src/lib/adBatch.js` are the rules (pinned by `scripts/check-ad-batch.mjs`,
with the prompt's per-ad plan); `src/components/LookPicker.jsx` is the
picker.

## Where the code is

- `src/lib/adBatch.js`: the pure half (the prompt, the looks per set, which photo to start from, the chip titles, the round trip of edits), tested by `scripts/check-ad-batch.mjs`.
- `src/lib/adBatchStore.js`: `makeAdBatch`, which gathers the brief, asks the chat, parses the creative sets and attaches a look and a photo to each.
- `src/components/AdStudioPanel.jsx`: the `make` and `ads` props, the `BatchStrip`, `saveBatch` (paints the sets that are not on the artboards off-screen).
- `src/pages/ContentPage.jsx` (the door and the card's two links) and `src/pages/ClientDetailPage.jsx` (`?open=studio&make=3`).

## The batch waits for you

Added 2026-10-16. The three used to live only in the open Studio: close it without saving and they were gone. Now the last batch made for a client is kept (`ad_batches`, one row per client, `supabase/ad-batches.sql`) with every edit made on its sets, and the Studio opens with it on the strip whether that is a minute or a week later: "3 ads for Prime · from Tue, Oct 14, not saved yet". The set that was up lands on the artboards again, unless an ad was opened on purpose (a saved ad from the Saved tab, a set from the chat), in which case that ad has the boards and the chips switch to the batch. Every edit is written a beat after the last keystroke, so hopping in and out while editing loses nothing. A new batch replaces the kept one. "Save all 3 ads" drops the kept copy (they are on the Saved ads tab now); "Forget these" on the strip drops it on purpose. The kept copy is per client, not per browser, so it is there from any computer.
