# Ad Studio looks and templates

Written 2026-10-13. Until now every static the Studio made was one composition: headline up top, offer block down the bottom, photo behind. A set of ads for one client looked like one template with the words swapped. This adds more ways to paint the same words, and a route to whole ads made by AI from the brief. (2026-10-14: the "Photo on a colour" look was taken off the row; ads saved with it still open and re-render.)

## The looks

Pick one on the Design tab (the "Look" row), or press "Next look" to cycle through them with the words as they are. Every look respects the same 9:16 safe margins, measures before it draws, and shrinks type rather than let it run off the frame. None of them paints a call-to-action button: Meta draws the real one under the creative.

| Look | What it is | When it wins |
| --- | --- | --- |
| Classic | The original: badge, headline, subhead up top; offer block and proof at the bottom; photo behind with scrims | Any photo; the safe default |
| Headline stack | One giant accent word in the brand colour over the photo, the rest of the headline under it, a white offer card hanging below, logo bottom-left | A strong photo of the owner and a one-word shout: FREE, $89, SAVE |
| Bottom plate | Photo on top, the words on a brand-colour plate below with rounded corners, offer as a pill, logo on the plate | A photo that does not want text over it; dark plates read well in feed |
| Split panel | A brand-colour panel beside the photo (above it on the Story) with the words; big offer amount in the accent colour | Busy photos; a long headline that needs room |
| Before and after | Two photos, Before and After labelled, side by side (one above the other on the Story) with a seam in the accent colour, the words on a brand-colour plate below. A second picker, "After photo", appears; the first becomes "Before photo" | A job with a clear transformation: a rusted unit and the new one, a flooded crawlspace and the dry one |

The giant word on the headline stack is the first word of the hook when it is short (FREE, $89, SAVE, NEW), or any word wrapped in asterisks (`*Free* second opinion on any quote`). A long first word stays in the sentence. The white haze behind the stack reaches under the last line of the subhead, whatever the photo, and the "Panel" choice puts a white card behind the whole stack ("Behind hook + subhead") or a smaller one behind the subhead alone ("Behind subhead only") for a photo too busy for a haze. The same choice is on the Classic look, as a dark plate; on the plate, split and AI looks the words already sit on a panel, and the row says so. Saved with the ad (`saved_ads.hook_plate`, `saved_ads.subhead_plate`).

Dragging the artboard still moves the photo's focal point on the photo looks, and the other two sizes follow the same spot. Saved ads remember their look (`saved_ads.layout`), so Edit and the owner's revision notes re-render in the same look.

## The templates

Added 2026-10-15. The photo looks above compose the client's photo with the words. The templates are posters: a painted background for the season (snow, falling leaves, summer sun, spring green, a warm glow with flames, night, holiday red and green, white paper, or the brand colour), condensed capitals that shout, SALE and the price where the thumb lands, offers in a starburst, a seal, a ribbon or a grid of tiles, Google stars, and a piece of equipment standing in the corner. The kind of ad a home-services company runs in the fall and the winter.

They sit in a gallery under the Look row, every one painted small with the words and the colours on the form, so choosing is choosing by eye. The tiles wrap into a grid that fills the column, so all sixteen are on screen at once (they used to sit in one sideways-scrolling strip, which on a laptop showed four or five and no scrollbar to say there were more). Click one and it is the look; "Next look" cycles through the photo looks and the templates together.

| Template | What it is |
| --- | --- |
| Winter shout | Snow, the logo up top, a giant outlined offer, the unit standing in the drift |
| Massive deal | A warm glow with flames, the kicker in two tones, a price that fills the frame, a seal and a SALE star |
| Price grid | A script season word, a big headline, a grid of up to four prices beside the unit on white |
| Fall special | Leaves, a script "Fall", two offers stacked with OR between, a seal, the unit |
| Season sale | The season painted behind a huge SALE, the offer, the unit, a starburst sticker. Follows the season label: snow in winter, sun in summer, leaves in the fall, green in spring |
| Holiday deals | Red and green with snow, HOLIDAY DEALS, the offer and a sticker |
| Tune-up | Fresh green, the service price in a starburst, the detail in gold |
| White poster | White, condensed capitals stacked in the brand colours, logo and Google stars, the unit bottom-left |
| Same day | Dark and urgent, a 24/7 seal, the headline huge, the offer on a pill |
| Financing | $0 down huge, monthly payments in a seal, the other offers as tiles |
| Coupon | A dashed coupon with the offer inside, the headline under it |
| Big number | The amount fills the width and that is the ad |
| Photo sale | The photo full-bleed with a SALE ribbon in the corner, the offers on a band below |
| Before and after sale | The two photos side by side (one above the other on the Story), Before and After tagged on a white print border, the kicker, the headline and the offer tiles on the season below. The After picker appears, as on the before-and-after look |
| Before inset | The After photo whole, the Before as a small framed inset bottom-left, the words on a brand-colour plate. The After picker appears |
| Maintenance plan | A membership card: the plan name (the kicker) on a brand-colour band, the price a month on the right, and what is included as a green checklist on the left, read from the subhead split on commas ("Two tune-ups a year, priority service, 15% off repairs") |

The badge, hook, offer, subhead and proof go on every template (the proof paints as five gold stars). A template reads five more fields, in the orange box that appears under the gallery:

- **Kicker**: the shout above the headline. Empty paints the season's: Fall Special, Winter Sale, Summer Sale, Spring Sale, Holiday Deals, or Massive Deals when the season is year-round. The season is the label next to Save (Auto reads it off the words and the date).
- **Sticker**: the words in the starburst, the seal or the ribbon (EASY FINANCING, 24/7, SALE). Empty means no sticker, except Same day (24/7) and Financing (Monthly payments available).
- **Offer tiles**: up to four prices with a line each ($0 / Down, 0% for 18 months; $89 / Furnace tune-up). Empty uses the main offer as the one tile. Price grid, Fall special, Financing, Photo sale and the before-and-after sale lay them out; the others use the main offer.
- **Background**: Auto (the template's own, else the season's) or any of the nine themes.
- **Equipment**: None, one of six built-in drawings (AC unit, furnace, boiler, water heater, mini split, thermostat), or a photo from the **stock library**: real photos of equipment shared by every client, uploaded once under `stock/` in the bucket (a PNG with a transparent background looks right; a JPEG is painted as is). The library's "From client photos" section lists every client's own uploads with equipment first (condensers, furnaces, mini splits, water heaters by file name; `src/lib/stockPick.js`, pinned by `scripts/check-stock.mjs`): "Use" paints one straight from the client's files, "+ Library" copies it under `stock/` for everyone. Nothing is drawn where the frame has no room for it, such as a Reels-safe Story.

Dragging the artboard moves the photo on the photo templates (Photo sale, the two before-and-afters); the others paint their own background and keep the photo picker for when the look is switched back. The Panel row says "built into this look". Saved with the ad (`saved_ads.kicker`, `sticker`, `offers` as JSON, `cutout`, `theme`, and `background_path_2` for the second photo), so Edit and the owner's revision notes re-render the same template.

**The logo on a template sits on the theme with no box.** A logo that arrives on a white rectangle (most of them) has the white knocked out: a flood from the edges removes every pixel near the edge colour, with a soft rim so the anti-aliasing leaves no halo (`src/lib/logoCutout.js`). Only a light, near-neutral edge is knocked out; a logo that fills its box with colour is a box on purpose and stays whole. A dark mark on a dark surface (a navy logo on the night theme or a brand-colour plate) is reversed to white, the way a reversed logo reads on a van; a very light mark on a light surface goes slate. The photo looks keep the original logo and the white pill over a photo, except the bottom plate and the stacked split panel, where the logo now sits on the solid panel the same way.

**The logo can never cut off the words.** Every template measures its footer (the logo in one corner, the stars in the other, or the logo centred over the stars) before it draws anything, and every block of words, every sticker and the unit stop above it. A logo is fitted to at most 90 to 120px tall, so the footer is never more than a strip.

## The season playbook

Added 2026-10-15. A trade's year is not four seasons; it is peaks and shoulders. An HVAC company has two peaks (the heat wave, the cold snap) when the phone rings by itself and the ad's job is to be the one they call, and two shoulders (spring, fall) when nothing is broken and the ad's job is to get into the house cheaply (a tune-up, a plan) and book the replacements while the install crews have room. A plumber's peaks are the freeze and the week after Thanksgiving. `src/lib/seasonPlaybook.js` knows these by trade and by climate (a Fort Myers HVAC company has no heating peak, a long cooling season and a break in October) and turns them into a phase: a label, a summary, the tactics, what to leave out, offer shapes, hooks, the kicker, the unit in the corner, the painted background, the saved-ad season, the moments coming up, and a ranked list of templates with a reason each. Tested by `scripts/check-season-playbook.mjs`.

Where it shows up:

- **The Design tab** has a "Season playbook" card above the templates: the phase for this client ("Fall shoulder season (heating prep) · heating and cooling in Manchester, NH, October"), the tactics, the offer shapes, what to leave out, what is coming up, and "Best templates now" as chips (one click applies the template and, where nothing is typed, the phase's kicker and equipment). "Pick the template for these words" scores every template against the words on the form, the phase and the photos picked (financing words go to the financing template, a same-day call to the emergency template, a tune-up to the tune-up poster, a plan to the maintenance plan card, several prices to the grid, a pair of photos to a before-and-after), applies the best one and says why.
- **The chat brief** carries a SEASON PLAYBOOK section, so every answer about ads, scripts and plans is written to it, and the chat knows which templates say it best right now.
- **"Make 3 ads"** writes to the playbook and chooses each ad's template by its words: the offer ad lands on the template its offer calls for (financing, a big number, the deal poster), the time-of-year ad on the phase's own (the tune-up poster in the fall, the sun poster in July), the proof ad on the owner's photo with the Headline stack; never the same template twice. The kicker, the unit and the background come from the phase, all editable.
- **The help chat** sees the playbook and the live pick in the Studio's state, and `studio_make_ads` takes `about` ("the $89 furnace tune-up") and `template` so "write me a plan ad" lands on the plan card with the words shaped for it.
- **The chat picks a template for every ad it writes.** The brief carries an AD STUDIO TEMPLATES menu (each template: when it wins, what it needs in words) and asks for a `template` and a `template_reason` on every creative set, plus `sticker` and `offers`, with the words written to the template's shape (a plan card gets a comma-separated list of what is included, a price grid gets tiles, a big number gets one number). The set card in the chat shows "Template: Maintenance plan · the words sell a plan" and "Open in Ad Studio" lands on it with the sticker and the tiles filled. In "Make 3 ads" the chat's pick wins when it is a real key, fits the photos there are and is not already used in the batch; the scorer is the safety net.
- **The card's live line** says which template the words on the form call for as you type ("For these words: Financing · the words are a financing offer"), "Use it" applies it, "Next best" walks down the ranking. "✨ Write one ad for right now" has the chat write a single ad to the playbook and land it on the artboards on the template it picked; with a template on the artboards, "✍️ Write an ad for <template>" writes one shaped for it.

## Finding real before-and-after pairs

"Find before and after pairs" under the photo pickers (and the help chat's `studio_find_before_after`, so "make me a before and after ad" works) looks through the client's uploads and Drive photos for two shots of the same job, one before the work and one after. File names first: "furnace-before.jpg" with "furnace-after.jpg" is a pair and needs no model. Then the model is shown the newest sixteen photos, numbered, and asked for pairs of the same place or the same kind of equipment, as JSON; it is told a wrong pair ends up in an ad, so when in doubt it is not a pair. Each pair found is a chip with both thumbnails and what the job was; click it and the two photos go on the Before and after sale template. `src/lib/beforeAfter.js` (pure, tested by `scripts/check-before-after.mjs`) and `src/lib/beforeAfterStore.js`.

Next to the finder: "Open the Drive folder in a new window" (the client's Google Drive folder) and "Drive photos in the CRM" (the Content tab's Drive page), both in their own tab, for when the picker is not enough.

**"Make 3 ads" uses the templates.** Each ad's template is chosen by the season playbook from its words (see above); without a playbook the batch falls back to Massive deal, Season sale, Headline stack, Photo sale, Price grid, Bottom plate in turn. The chat is asked for a sticker (two or three words for a starburst) and up to two price tiles from the brief. The before-and-after templates are not in the batch: a before-and-after pair has to be a real pair, found by the finder or picked by hand.

The display faces are Anton (the condensed capitals) and Pacifico (the script word), loaded from Google Fonts next to Inter and waited for before the first paint, so a template never measures with a fallback and wraps wrong.

## AI concepts (retired 2026-10-15)

The "AI concepts" box (four finished ads from Higgsfield) and the AI concept look are off the Studio. An ad saved with the AI concept look still opens and re-renders (`adLooks.js` keeps the painter); the `ad_concepts` table and the deployed function were left in place. The photo looks and the templates are the whole studio now.

## Nothing gets cut off: the overlap audit

Added 2026-10-15. Every template records the box of everything it paints (each block of words, the badge, a sticker, the logo, the stars, the unit, every offer tile) in an audit (`src/lib/adAudit.js`, pinned by `scripts/check-ad-audit.mjs`). When the paint is done the audit lists every pair of solid boxes that overlap by more than a few pixels and every box that runs past the frame; photos and panels are surfaces words sit on by design and are never flagged. `renderAd` hands the list back as `problems`.

- **The Studio** shows the list under the artboards ("Story: the location badge and the kicker overlap. Shorten the words, pick another template, or ask the chat to rewrite.") and the Save button becomes "Fix the overlap to save" until the words, the template or the photos change; a tick box, "I have looked and it is fine; let me save anyway", is the escape hatch. The help chat sees the same lines in the Studio's state.
- **The template gallery** marks any template where the words on the form would overlap with a small warning on the tile.
- **The badge** shrinks its words to fit its room instead of running out of the pill.
- **The tests**: the scratch Playwright run paints every template on every size with three sets of words (short, long, and very long with four tiles, a long badge and a long sticker), with and without the unit, and reports every problem; the templates were tuned until it reports none.

The photo looks (Classic, Headline stack, Bottom plate, Split panel, Before and after) measure their footer and their logo room the same way but are not in the audit yet.

## Where the code is

- `src/lib/adLooks.js`: the stack, plate, split and AI looks. `src/lib/adText.js`: the shared type helpers. `src/lib/adLayout.js`: the pure placement math (`plateRects`, `splitRects`, `containRect`, `accentWord`), tested by `scripts/check-ad-layout.mjs`.
- `src/lib/adTemplates.js`: the sixteen templates, the themes, the elements (shout, script, starburst, seal, ribbon, tiles, stars) and the equipment drawings. `src/lib/adTemplateMeta.js`: their names, the themes and cutouts, and the pure helpers (`themeFor`, `seasonKicker`, `offersFor`), tested by `scripts/check-ad-templates.mjs`. `src/components/TemplateGallery.jsx`: the thumbnails. `src/lib/stockLibrary.js` and `src/components/StockPicker.jsx`: the stock library.
- `src/lib/adCanvas.js`: the classic look and the card, and the hand-off to `adLooks.js`.
- `supabase/ad-concepts.sql`: the `ad_concepts` table (retired) and the wider `saved_ads.layout` check. Applied live.
