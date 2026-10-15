# Ad Studio looks, templates and AI concepts

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
| AI concept | A finished ad made by AI, used whole; on the square and the Story it sits on a blurred copy of itself | When a concept batch has a winner |

The giant word on the headline stack is the first word of the hook when it is short (FREE, $89, SAVE, NEW), or any word wrapped in asterisks (`*Free* second opinion on any quote`). A long first word stays in the sentence. The white haze behind the stack reaches under the last line of the subhead, whatever the photo, and the "Panel" choice puts a white card behind the whole stack ("Behind hook + subhead") or a smaller one behind the subhead alone ("Behind subhead only") for a photo too busy for a haze. The same choice is on the Classic look, as a dark plate; on the plate, split and AI looks the words already sit on a panel, and the row says so. Saved with the ad (`saved_ads.hook_plate`, `saved_ads.subhead_plate`).

Dragging the artboard still moves the photo's focal point on the photo looks, and the other two sizes follow the same spot. Saved ads remember their look (`saved_ads.layout`), so Edit and the owner's revision notes re-render in the same look.

## The templates

Added 2026-10-15. The photo looks above compose the client's photo with the words. The templates are posters: a painted background for the season (snow, falling leaves, summer sun, spring green, a warm glow with flames, night, holiday red and green, white paper, or the brand colour), condensed capitals that shout, SALE and the price where the thumb lands, offers in a starburst, a seal, a ribbon or a grid of tiles, Google stars, and a piece of equipment standing in the corner. The kind of ad a home-services company runs in the fall and the winter.

They sit in a gallery under the Look row, every one painted small with the words and the colours on the form, so choosing is choosing by eye. Click one and it is the look; "Next look" cycles through the photo looks and the templates together.

| Template | What it is |
| --- | --- |
| Winter shout | Snow, the logo up top, a giant outlined offer, the unit standing in the drift |
| Massive deal | A warm glow with flames, the kicker in two tones, a price that fills the frame, a seal and a SALE star |
| Stay warm | The photo under a diagonal in the accent colour, a headline stack beside it, a band of offers along the bottom |
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

The badge, hook, offer, subhead and proof go on every template (the proof paints as five gold stars). A template reads five more fields, in the orange box that appears under the gallery:

- **Kicker**: the shout above the headline. Empty paints the season's: Fall Special, Winter Sale, Summer Sale, Spring Sale, Holiday Deals, or Massive Deals when the season is year-round. The season is the label next to Save (Auto reads it off the words and the date).
- **Sticker**: the words in the starburst, the seal or the ribbon (EASY FINANCING, 24/7, SALE). Empty means no sticker, except Same day (24/7) and Financing (Monthly payments available).
- **Offer tiles**: up to four prices with a line each ($0 / Down, 0% for 18 months; $89 / Furnace tune-up). Empty uses the main offer as the one tile. Stay warm, Price grid, Fall special, Financing and Photo sale lay them out; the others use the main offer.
- **Background**: Auto (the template's own, else the season's) or any of the nine themes.
- **Equipment**: None, one of six built-in drawings (AC unit, furnace, boiler, water heater, mini split, thermostat), or a photo from the **stock library**: real cutouts of equipment shared by every client, uploaded once under `stock/` in the bucket (a PNG with a transparent background looks right; a JPEG is painted as is). Nothing is drawn where the frame has no room for it, such as a Reels-safe Story.

Dragging the artboard moves the photo on the photo templates (Stay warm, Photo sale, the two before-and-afters); the others paint their own background and keep the photo picker for when the look is switched back. The Panel row says "built into this look". Saved with the ad (`saved_ads.kicker`, `sticker`, `offers` as JSON, `cutout`, `theme`, and `background_path_2` for the second photo), so Edit and the owner's revision notes re-render the same template.

**The logo on a template sits on the theme with no box.** A logo that arrives on a white rectangle (most of them) has the white knocked out: a flood from the edges removes every pixel near the edge colour, with a soft rim so the anti-aliasing leaves no halo (`src/lib/logoCutout.js`). Only a light, near-neutral edge is knocked out; a logo that fills its box with colour is a box on purpose and stays whole. A dark mark on a dark surface (a navy logo on the night theme or a brand-colour plate) is reversed to white, the way a reversed logo reads on a van; a very light mark on a light surface goes slate. The photo looks keep the original logo and the white pill over a photo, except the bottom plate and the stacked split panel, where the logo now sits on the solid panel the same way.

**The logo can never cut off the words.** Every template measures its footer (the logo in one corner, the stars in the other, or the logo centred over the stars) before it draws anything, and every block of words, every sticker and the unit stop above it. A logo is fitted to at most 90 to 120px tall, so the footer is never more than a strip.

**"Make 3 ads" uses the templates.** The batch's looks now go: the offer on Massive deal, the time of year on Season sale (snow, leaves, sun or green by the season label), proof on the owner's photo with the Headline stack; a batch of six continues with Photo sale, Price grid and Bottom plate. The chat is asked for a sticker (two or three words for a starburst) and up to two price tiles from the brief, and the unit in the corner follows the trade and the month (a furnace through the heating months and a condenser through the cooling ones for an HVAC company, a water heater for a plumber). The before-and-after templates are not in the batch: a before-and-after pair has to be a real pair, picked by hand.

The display faces are Anton (the condensed capitals) and Pacifico (the script word), loaded from Google Fonts next to Inter and waited for before the first paint, so a template never measures with a fallback and wraps wrong.

## AI concepts

The "AI concepts" box under the Look row sends the brief on the screen (headline, offer, subhead, proof, badge, brand colours, the client's name, trade and market) plus the logo and the chosen photo to Higgsfield's Ads Studio, which renders four finished ads, each a different scene and arrangement. The brief quotes every line so the words come back exact, forbids anything else on the image (no invented phone numbers or websites), spells the business name, and tells the model the reference photos are the real owner and van. Direction can be typed in ("owner at the front door, the van in shot, snow on the ground").

A batch takes about a minute and costs roughly 35 cents at list prices. The images are copied into the bucket under `concepts/<client>/` and the batch stays on the client, so last week's winner is still there. Click a concept and it becomes the AI concept look; Save all 3 sizes then works as for any other ad, so the approval link and the publish list take it from there.

Review every concept before saving: generated text can still misspell or add a word, and a likeness is never guaranteed. Never use a concept that shows a made-up customer or a testimonial.

Secrets: `HIGGSFIELD_API_KEY_ID` and `HIGGSFIELD_API_KEY_SECRET` (the same pair the AI video B-roll uses), from console.higgsfield.ai. Until they are set, the button says so.

## Where the code is

- `src/lib/adLooks.js`: the stack, plate, split and AI looks. `src/lib/adText.js`: the shared type helpers. `src/lib/adLayout.js`: the pure placement math (`plateRects`, `splitRects`, `containRect`, `accentWord`), tested by `scripts/check-ad-layout.mjs`.
- `src/lib/adTemplates.js`: the fourteen templates, the themes, the elements (shout, script, starburst, seal, ribbon, tiles, stars) and the equipment drawings. `src/lib/adTemplateMeta.js`: their names, the themes and cutouts, and the pure helpers (`themeFor`, `seasonKicker`, `offersFor`), tested by `scripts/check-ad-templates.mjs`. `src/components/TemplateGallery.jsx`: the thumbnails. `src/lib/stockLibrary.js` and `src/components/StockPicker.jsx`: the stock library.
- `src/lib/adCanvas.js`: the classic look and the card, and the hand-off to `adLooks.js`.
- `supabase/functions/ad-concepts` (`index.ts` plus the pure `brief.js`, tested by `scripts/check-ad-concepts.mjs`); `src/lib/adConceptsStore.js`; the `ConceptsPanel` in `src/components/AdStudioPanel.jsx`.
- `supabase/ad-concepts.sql`: the `ad_concepts` table and the wider `saved_ads.layout` check. Applied live.
