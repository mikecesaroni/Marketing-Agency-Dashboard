-- What was said in each ad video, as text, next to the note a person typed.
--
-- `about` stays what it was: the one line a person types about the clip.
-- `transcript` is the machine's: Deepgram's speech-to-text of the audio,
-- written by the transcribe-video function the first time a video is opened
-- in the publish screen, and sent alongside `about` when copy is written.
-- `transcript_error` holds the last reason it could not be made (no audio,
-- the key not set, Deepgram down) so the screen can say so instead of
-- silently having nothing.

alter table ad_videos add column if not exists transcript text;
alter table ad_videos add column if not exists transcribed_at timestamptz;
alter table ad_videos add column if not exists transcript_error text;
