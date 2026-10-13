# Ad Studio looks and AI concepts

Written 2026-10-13. Until now every static the Studio made was one composition: headline up top, offer block down the bottom, photo behind. A set of ads for one client looked like one template with the words swapped. This adds five more ways to paint the same words, and a route to whole ads made by AI from the brief.

## The looks

Pick one on the Design tab (the "Look" row), or press "Next look" to cycle through them with the words as they are. Every look respects the same 9:16 safe margins, measures before it draws, and shrinks type rather than let it run off the frame. None of them paints a call-to-action button: Meta draws the real one under the creative.

| Look | What it is | When it wins |
| --- | --- | --- |
| Classic | The original: badge, headline, subhead up top; offer block and proof at the bottom; photo behind with scrims | Any photo; the safe default |
| Headline stack | One giant accent word in the brand colour over the photo, the rest of the headline under it, a white offer card hanging below, logo bottom-left | A strong photo of the owner and a one-word shout: FREE, $89, SAVE |
| Bottom plate | Photo on top, the words on a brand-colour plate below with rounded corners, offer as a pill, logo on the plate | A photo that does not want text over it; dark plates read well in feed |
| Split panel | A brand-colour panel beside the photo (above it on the Story) with the words; big offer amount in the accent colour | Busy photos; a long headline that needs room |
| Photo on a colour | Flat background, the photo placed where you drag it | Product shots, logos, a photo whose edges are not worth showing |
| AI concept | A finished ad made by AI, used whole; on the square and the Story it sits on a blurred copy of itself | When a concept batch has a winner |

The giant word on the headline stack is the first word of the hook when it is short (FREE, $89, SAVE, NEW), or any word wrapped in asterisks (`*Free* second opinion on any quote`). A long first word stays in the sentence.

Dragging the artboard still moves the photo's focal point on the photo looks, and the other two sizes follow the same spot. Saved ads remember their look (`saved_ads.layout`), so Edit and the owner's revision notes re-render in the same look.

## AI concepts

The "AI concepts" box under the Look row sends the brief on the screen (headline, offer, subhead, proof, badge, brand colours, the client's name, trade and market) plus the logo and the chosen photo to Higgsfield's Ads Studio, which renders four finished ads, each a different scene and arrangement. The brief quotes every line so the words come back exact, forbids anything else on the image (no invented phone numbers or websites), spells the business name, and tells the model the reference photos are the real owner and van. Direction can be typed in ("owner at the front door, the van in shot, snow on the ground").

A batch takes about a minute and costs roughly 35 cents at list prices. The images are copied into the bucket under `concepts/<client>/` and the batch stays on the client, so last week's winner is still there. Click a concept and it becomes the AI concept look; Save all 3 sizes then works as for any other ad, so the approval link and the publish list take it from there.

Review every concept before saving: generated text can still misspell or add a word, and a likeness is never guaranteed. Never use a concept that shows a made-up customer or a testimonial.

Secrets: `HIGGSFIELD_API_KEY_ID` and `HIGGSFIELD_API_KEY_SECRET` (the same pair the AI video B-roll uses), from console.higgsfield.ai. Until they are set, the button says so.

## Where the code is

- `src/lib/adLooks.js`: the stack, plate, split and AI looks. `src/lib/adText.js`: the shared type helpers. `src/lib/adLayout.js`: the pure placement math (`plateRects`, `splitRects`, `containRect`, `accentWord`), tested by `scripts/check-ad-layout.mjs`.
- `src/lib/adCanvas.js`: the classic look and the card, and the hand-off to `adLooks.js`.
- `supabase/functions/ad-concepts` (`index.ts` plus the pure `brief.js`, tested by `scripts/check-ad-concepts.mjs`); `src/lib/adConceptsStore.js`; the `ConceptsPanel` in `src/components/AdStudioPanel.jsx`.
- `supabase/ad-concepts.sql`: the `ad_concepts` table and the wider `saved_ads.layout` check. Applied live.
