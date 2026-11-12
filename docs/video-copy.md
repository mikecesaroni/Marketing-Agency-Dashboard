# Video ads: transcription and the three versions

In the publish screen, when a video is ticked, the CRM now listens to it and
writes the ad copy from what is said.

## What happens

1. **Transcript.** The first time a video that Meta already has is ticked,
   `transcribe-video` sends its audio to Deepgram and stores the text on the
   video (`ad_videos.transcript`). It runs once; a reload reads it back.
   "Transcript · 142 words · show" appears under the note box. "redo" runs it
   again; a clip with music and no speech says so.
2. **Three versions.** "Write three versions" sends the client's facts, the
   note typed on the clip, and the transcript to the copy assistant
   (`ad-copy`, mode `variations`). It returns three complete sets of primary
   text, headline and description, written together so each reads as one ad,
   from three angles: the offer, trust, and the problem the clip shows. Each
   angle is named on its card.
3. **Pick one.** "Use this version" fills the three fields below. They stay
   editable. "Three more versions" asks again; "Quick draft" and "Another
   angle" are the older per-field assistant, which now also reads the
   transcript.

The transcript never replaces the note. The note is what a person says the
clip is about; the transcript is what is said in it. Both go to the assistant.

## It is kept (2026-11-02)

"If I click publish videos and the AI takes the time to transcribe videos and
make ad copies, make it so it saves that; if I click away and come back it
doesn't have to do all that over again and spend money." The transcript was
always on the row. Now the three versions are too (`ad_videos.versions`, with
`versions_at`), and so is the copy picked or typed for the clip
(`ad_videos.copy`: primary text, headline, description, ad name), written a
moment after it changes (`supabase/video-copy-memory.sql`; the pure part is
`src/lib/videoCopyMemory.js`, tested by `scripts/check-video-copy-memory.mjs`).
Coming back to the publish page reads them off the row: the versions are on
their cards, the words are in the fields, nothing is asked for again. The
saved copy never lands over words somebody is typing. A static's feed copy,
written on the page or typed there, is kept the same way on its saved ad
(`saved_ads.primary_text`, `headline`, `description`). A clip that has not
been sent to Meta yet has no row and keeps nothing until it has.

The first build of this still rewrote on a reload ("when I refresh the
publish page it remade all the ad copies it already made before"): the ticks
come back before the saved words are read into the page, and the "write the
versions, unasked" check ran in that gap, saw an empty page and paid again.
Both checks now read the row itself (the clip's saved versions and copy, the
saved ad's primary text) and a tick whose copy record is not loaded yet is
left alone (`nextToWrite` in `src/lib/publishCopy.js`).

## The copy says what the clip says (2026-11-05)

"Make sure the ad copy matches what is actually said in the transcript."
Until now the transcript was background: the writer was told to use its
phrases and facts, and where it disagreed with the offer on file, the offer
on file won. For a video ad that is backwards: the viewer reads the copy
beside the clip and hears the owner at the same time, and copy that names
a different deal loses them. Now (`ad-copy` v19):

- The offer in the copy is the offer the owner states in the clip, in the
  owner's numbers and words. A clip that states no offer gets copy led by
  the owner's main point, never a deal the viewer will not hear.
- Every claim, number, timeframe, guarantee and town is one the owner says,
  or a business fact the clip does not contradict (a rating the owner never
  mentions can still stand as proof).
- Where the transcript and the offer on file differ, the transcript wins
  for that ad and the note says they differ, so a person can check which is
  current.
- A word the machine misheard (a mangled town, a number that makes no
  sense) is corrected from the business facts, not invented.
- Each version carries the short exact phrase from the transcript it is
  built on, shown under its card as "In the clip: ...", so the match is
  there to see. It is kept with the versions on the row.

The three angles are the same, read off the clip: the offer the owner
states, trust as the owner says it, the problem the owner describes. The
"Quick draft" and "Another angle" buttons share the rules, so a single
field written from a transcript follows them too. A clip with no
transcript (music only, or Deepgram not set up) is written from the note
and the facts as before.

## Three of each: Meta's text options (2026-11-10)

"Look at Don Air copy with the emojis and how it has 3 variants for each
part of ad copy. I wanna have those variants." Don Air's hand-built ads
(Video1 to Video8 in Ads Manager) carry Meta's multiple text options: three
primary texts, three headlines and three descriptions, and Meta shows each
viewer one of each in whatever combination it expects to work. Each primary
text opens with one emoji and a line in capitals naming who and where, then
a ✅ checklist of proof points. The CRM wrote one of each.

Now, under the three fields on the publish page (a video's and a static's
alike), a Text options box holds up to four more of each. "✨ Write 3 of
each" asks the copy assistant (`ad-copy`, mode `text_options`) for the three
lists in that house style, from the same facts, note and transcript as the
versions; the first of each lands in the fields and the other two in the
box, all editable; "+ another primary text" adds a blank one and × removes
one. The three lists are written to stand alone, because Meta pairs any
primary text with any headline: a version is a set, a text option is a list.
The box says what Meta gets ("3 primary texts · 3 headlines · 3
descriptions").

They are kept with the rest: a video's inside `ad_videos.copy`
(`more_primary_texts`, `more_headlines`, `more_descriptions`), a static's on
its saved ad (`saved_ads.more_copy`, `supabase/text-options.sql`). The pure
half is `src/lib/textOptions.js`, tested by `scripts/check-text-options.mjs`.

Publishing sends the full lists (`primary_texts`, `headlines`,
`descriptions`) and `meta-publish` builds the creative Meta mixes from: an
`asset_feed_spec` holding the lists with `optimization_type:
DEGREES_OF_FREEDOM` for a video and for an image with one size. An image
with two or three sizes keeps its crop per placement AND the text options
(since 2026-11-12; before that it went out as its 4:5 alone): the placement
shape (`optimization_type: PLACEMENT`, one rule per size) carries the lists,
every body labelled `body`, every title `title`, every description `desc`,
so each rule's one label picks the whole list and Meta mixes them on every
placement. That is the shape Ads Manager itself builds, read off Horizon
HVAC's hand-built ads with `ad_copy raw:true`: six bodies and three titles
each carrying the labels of every rule. The publish result says
`per_placement` and `text_options` both true. The chat can read the words on
any live ad (`meta-manage`, action `ad_copy`), which is how Don Air's were
read in the first place.

The emoji policy (docs/emojis-in-ad-copy.md) stands for everything else:
the house style is what this button writes, and it runs against the plain
copy on cost per lead like any other test.

## Switching it on

Transcription needs one secret: `DEEPGRAM_API_KEY`, under Project Settings >
Edge Functions > Secrets in Supabase. A free Deepgram account comes with
credit, and a one-minute clip costs well under a cent. Until the key is set,
the transcript line says so and everything else still works from the note.

## Why Deepgram, again

An earlier version used Deepgram and was retired to avoid a second vendor,
on the theory that a person could type what the clip says in ten seconds.
They typed whole transcripts by hand instead. Deepgram takes a URL and
streams the file itself, so the 250MB phone .mov files in the bucket and in
Drive work; Whisper's upload cap does not fit them. The file URL it fetches
is the same one Meta downloads from: the public bucket for uploads, a
short-lived grant on the drive-video function for Drive clips.

## Three of each, unasked (2026-11-12)

"Make so it auto makes the 3 ad copy variations instead of me having to
click, for statics and videos." The publish page no longer waits for the
"✨ Write 3 of each" button. A ticked static or clip with one of each (or
nothing) gets Meta's text options written on its own, once: three primary
texts, three headlines, three descriptions. With no words yet, the first of
each lands in the fields and the rest in the editor under them; with words
already there (a Studio-made static's feed copy, a clip's picked version,
anything typed), those stay as option one and two more of each are added
(`patchAddingOptions` in `src/lib/textOptions.js`), so nothing anyone wrote
is replaced. For clips this is the write that used to make the three
VERSIONS and apply version A; the versions are still a button on the card.
The copy memory keeps the options with the rest (`ad_videos.copy`,
`saved_ads.more_copy`), so a reload reads them back instead of paying
again, and a creative that already carries options is never written for
twice. The button remains for a rewrite, which replaces what is there.
`scripts/check-text-options.mjs` pins the merge and the two call sites.
