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
