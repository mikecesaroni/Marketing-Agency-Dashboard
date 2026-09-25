import { useCallback, useEffect, useRef, useState } from 'react'
import Button from './ui/Button'
import { registerAdVideo, adVideoStatus } from '../lib/metaPublish'
import { suggestVideoCopy, suggestVideoVariations } from '../lib/adCopy'
import { anglesAvailable, nthPerField } from '../lib/adCopyOptions'
import {
  MAX_VIDEO_BYTES,
  isPublishable,
  isVideoFile,
  megabytes,
  statusLabel,
  validateVideo,
} from '../lib/adVideos'
import { clipChecks, clipVerdict, videoAdName } from '../lib/videoLaunch'
import { driveFileId, isDrivePath } from '../lib/driveLabels'
import {
  deleteVideo,
  fetchClientVideos,
  saveVideoAbout,
  saveVideoMeasure,
  transcribeVideo,
  uploadVideo,
} from '../lib/adVideoStore'

/**
 * Drop a clip, tick it, publish it.
 *
 * The waiting is why this owns the whole flow instead of just being a list.
 * Meta transcodes asynchronously and a phone clip can take a minute or more,
 * so the upload is sent to Meta the moment it lands in the bucket — while the
 * user is still writing copy — rather than at publish time, where it would be
 * the slowest and least predictable step of the thing they are watching.
 *
 * THE PIPELINE, per clip, with nobody clicking anything after the drop:
 *
 *   dropped → in the bucket → sent to Meta (transcoding) → transcribed →
 *   three versions of the copy written → one picked → named → publishable
 *
 * Each arrow used to be a button. The team's week is a clip per client, so
 * the buttons went: a ticked clip is transcribed on its own, a transcript
 * with no copy yet gets its three versions on its own, and picking a version
 * names the ad. What is left to a person is the two judgements a person is
 * for: which version, and whether the clip is any good.
 */

const POLL_MS = 6000

function Pill({ video }) {
  const tone =
    video.status === 'ready'
      ? 'bg-green-50 text-green-800 border-green-200'
      : video.status === 'error'
        ? 'bg-red-50 text-red-700 border-red-200'
        : video.status === 'processing'
          ? 'bg-amber-50 text-amber-800 border-amber-200'
          : 'bg-slate-100 text-slate-600 border-slate-200'
  return (
    <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${tone}`}>
      {statusLabel(video)}
    </span>
  )
}

/**
 * Where one clip is along the pipeline: three dots that fill in on their own.
 * The point is that a glance at the list says what is still cooking without
 * reading four status lines.
 */
function Pipeline({ video, transcribing, hasCopy, writing }) {
  const steps = [
    {
      label: 'Meta',
      state: video.status === 'ready' && video.thumb_url ? 'done' : video.status === 'error' ? 'bad' : video.status === 'new' ? 'todo' : 'busy',
    },
    {
      label: 'Transcript',
      state: video.transcript ? 'done' : transcribing ? 'busy' : video.transcript_error ? 'skip' : 'todo',
    },
    { label: 'Copy', state: hasCopy ? 'done' : writing ? 'busy' : 'todo' },
  ]
  const dot = {
    done: 'bg-green-500',
    busy: 'bg-amber-400 animate-pulse',
    bad: 'bg-red-500',
    skip: 'bg-slate-300',
    todo: 'bg-slate-200',
  }
  return (
    <span className="inline-flex items-center gap-2" title="Sent to Meta · transcribed · copy written">
      {steps.map((s) => (
        <span key={s.label} className="inline-flex items-center gap-1 text-[10px] text-slate-500">
          <span className={`inline-block h-2 w-2 rounded-full ${dot[s.state]}`} />
          {s.label}
        </span>
      ))}
    </span>
  )
}

function Checks({ checks }) {
  if (checks.length === 0) return null
  const verdict = clipVerdict(checks)
  return (
    <details className="text-[11px]">
      <summary
        className={`cursor-pointer select-none ${verdict === 'good' ? 'text-green-700' : 'text-amber-700'}`}
      >
        {verdict === 'good' ? '✓ Clip checks out' : `${checks.filter((c) => c.level === 'warn').length} clip note${checks.filter((c) => c.level === 'warn').length === 1 ? '' : 's'}`}
      </summary>
      <ul className="mt-1 space-y-0.5 pl-1">
        {checks.map((c) => (
          <li key={c.text} className={c.level === 'warn' ? 'text-amber-800' : 'text-slate-600'}>
            {c.level === 'warn' ? '△' : '✓'} {c.text}
          </li>
        ))}
      </ul>
    </details>
  )
}

export default function VideoAdPicker({ client, intake, picked, onPicked, copies, onCopy }) {
  // Which video's copy is being written, what the model said it did, and the
  // options it returned so "another angle" can walk them without paying for a
  // second request.
  const [writing, setWriting] = useState('')
  const [note, setNote] = useState({})
  const [angles, setAngles] = useState({})
  const [videos, setVideos] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState('')
  const [dragging, setDragging] = useState(false)
  // What each video is about, keyed by storage path. Held here while it is
  // being typed and written back to the row on blur, so the textarea stays
  // responsive and the note survives a reload.
  const [about, setAbout] = useState({})
  // TRANSCRIPTION AND THE THREE VERSIONS.
  //
  // A ticked video with no transcript is sent for one automatically, once.
  // The result lands on the row (transcribe-video writes it), so a reload
  // reads it back for free. `versions` holds the three sets the copy
  // assistant wrote for a clip, until one is picked or they are rewritten.
  const [transcribing, setTranscribing] = useState({})
  const [transcriptNote, setTranscriptNote] = useState({})
  const [showTranscript, setShowTranscript] = useState({})
  const [versions, setVersions] = useState({})
  const [writingVersions, setWritingVersions] = useState('')
  const [chosen, setChosen] = useState({})
  // Seconds, width and height off the preview element, keyed by path. The
  // row carries them too once saved; this is for the clip that was dropped a
  // moment ago and has no row yet.
  const [measured, setMeasured] = useState({})
  const attempted = useRef(new Set())
  const autoWrote = useRef(new Set())
  const fileInput = useRef(null)

  const account = client.meta_ad_account_id || ''

  const load = useCallback(async () => {
    try {
      setVideos(await fetchClientVideos(client.id, account))
    } catch (err) {
      setError(err.message)
    }
  }, [client.id, account])

  useEffect(() => {
    load()
  }, [load])

  // Only while something is actually transcoding, and it stops on its own.
  // A poll that runs forever on a settled list is a request every six seconds
  // for as long as the tab is open.
  useEffect(() => {
    const waiting = (videos || []).filter((v) => v.status === 'processing')
    if (waiting.length === 0) return undefined

    let live = true
    const timer = setTimeout(async () => {
      for (const v of waiting) {
        if (!live) return
        try {
          await adVideoStatus({
            clientId: client.id,
            storagePath: v.storage_path,
            metaVideoId: v.meta_video_id,
          })
        } catch {
          /* a failed poll is not worth a red banner; the next one may work */
        }
      }
      if (live) load()
    }, POLL_MS)

    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [videos, client.id, load])

  const transcribe = useCallback(
    async (video, force = false) => {
      const path = video.storage_path
      setTranscribing((prev) => ({ ...prev, [path]: true }))
      setTranscriptNote((prev) => ({ ...prev, [path]: '' }))
      try {
        const out = await transcribeVideo({ clientId: client.id, storagePath: path, force })
        if (out.empty) setTranscriptNote((prev) => ({ ...prev, [path]: 'No speech found in the audio.' }))
        await load()
      } catch (err) {
        setTranscriptNote((prev) => ({
          ...prev,
          [path]: err.notConfigured
            ? 'Transcription is not switched on yet: add DEEPGRAM_API_KEY to the Supabase secrets.'
            : err.message,
        }))
      } finally {
        setTranscribing((prev) => ({ ...prev, [path]: false }))
      }
    },
    [client.id, load]
  )

  // Once per clip, the first time it is ticked: what is said in it. Only for
  // clips Meta already has (a registered row is what the function writes to),
  // and never for one that already failed, so a missing key does not turn
  // into a request per render.
  useEffect(() => {
    for (const v of videos || []) {
      if (!picked.includes(v.storage_path)) continue
      if (v.transcript || v.transcript_error || v.status === 'new') continue
      if (attempted.current.has(v.storage_path)) continue
      attempted.current.add(v.storage_path)
      transcribe(v)
    }
  }, [videos, picked, transcribe])

  const writeVersions = async (video) => {
    const path = video.storage_path
    setWritingVersions(path)
    setError('')
    try {
      const copy = copies[path] || {}
      const out = await suggestVideoVariations({
        client,
        intake,
        about: about[path] ?? video.about,
        transcript: video.transcript,
        current: {
          primaryText: copy.primary_text || '',
          headline: copy.headline || '',
          description: copy.description || '',
        },
      })
      if (out.variations.length === 0) {
        setError(out.note || 'The copy assistant did not return any versions. Try again.')
      }
      setVersions((prev) => ({ ...prev, [path]: out }))
      setChosen((prev) => ({ ...prev, [path]: null }))
    } catch (err) {
      setError(err.message)
    } finally {
      setWritingVersions('')
    }
  }

  // THE THREE VERSIONS, UNASKED. A ticked clip whose transcript has landed
  // and whose copy is still blank gets its three versions written without a
  // click, once. The transcript is the reason this is safe to do on its own:
  // before it, the assistant only had the onboarding answers and every clip
  // read the same. Nothing is applied; the three cards wait to be picked.
  useEffect(() => {
    if (writingVersions) return
    for (const v of videos || []) {
      const path = v.storage_path
      if (!picked.includes(path) || !v.transcript) continue
      if (copies[path]?.primary_text?.trim() || versions[path]) continue
      if (autoWrote.current.has(path)) continue
      autoWrote.current.add(path)
      writeVersions(v)
      return
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos, picked, copies, versions, writingVersions])

  // A clip ticked from outside (the board's "click to publish") was picked
  // before this list existed, so its copy record has no Meta ids and no
  // name. Stamped here the moment the clip is publishable, once. Also
  // covers a clip that finished transcoding after it was ticked.
  useEffect(() => {
    for (const v of videos || []) {
      if (!picked.includes(v.storage_path) || !isPublishable(v)) continue
      const c = copies[v.storage_path]
      if (c?.meta_video_id === v.meta_video_id && c?.thumb_url === v.thumb_url) continue
      onCopy(v.storage_path, {
        meta_video_id: v.meta_video_id,
        thumb_url: v.thumb_url,
        ...(c?.ad_name?.trim() ? {} : { ad_name: videoAdName({ clientName: client.name, fileName: v.file_name }) }),
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos, picked])

  const nameFor = (video, angle) =>
    videoAdName({ clientName: client.name, angle, fileName: video?.file_name })

  const pickVersion = (path, index) => {
    const v = versions[path]?.variations?.[index]
    if (!v) return
    const video = (videos || []).find((x) => x.storage_path === path)
    const patch = {
      primary_text: v.primaryText || '',
      headline: v.headline || '',
      description: v.description || '',
    }
    // Named after the angle so two clips on the same day read differently in
    // Ads Manager. Only when nobody typed a name.
    if (!copies[path]?.ad_name?.trim() || copies[path]?.ad_name === nameFor(video)) {
      patch.ad_name = nameFor(video, v.angle)
    }
    onCopy(path, patch)
    setChosen((prev) => ({ ...prev, [path]: index }))
  }

  const send = async (video) => {
    setBusy(video.storage_path)
    setError('')
    try {
      await registerAdVideo({
        clientId: client.id,
        storagePath: video.storage_path,
        fileName: video.file_name,
      })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  /**
   * Files in, from the button or a drop. Each one goes to the bucket and
   * straight on to Meta, so the transcode is running before the copy is.
   * The list reloads after each file rather than at the end, so a drop of
   * five shows five rows appearing rather than a long pause and five rows.
   */
  const ingest = async (incoming) => {
    const files = [...(incoming || [])].filter((f) => isVideoFile(f.name))
    if (files.length === 0) {
      setError('That was not a video. Drop .mp4 or .mov files.')
      return
    }
    const rejected = files.map(validateVideo).filter(Boolean)
    if (rejected.length > 0) {
      setError(rejected[0])
      return
    }

    setBusy('upload')
    setError('')
    try {
      for (const [i, file] of files.entries()) {
        setBusy(files.length > 1 ? `upload ${i + 1}/${files.length}` : 'upload')
        const saved = await uploadVideo({ clientId: client.id, file })
        // Straight to Meta: the transcode should be running before they have
        // finished typing the primary text.
        await registerAdVideo({
          clientId: client.id,
          storagePath: saved.storage_path,
          fileName: saved.file_name,
        })
        await load()
      }
    } catch (err) {
      setError(err.message)
      await load()
    } finally {
      setBusy('')
    }
  }

  const add = async (event) => {
    const files = [...(event.target.files || [])]
    event.target.value = ''
    if (files.length > 0) await ingest(files)
  }

  const onDrop = async (event) => {
    event.preventDefault()
    setDragging(false)
    await ingest(event.dataTransfer?.files)
  }

  const remove = async (video) => {
    if (!confirm(`Delete ${video.file_name}? It goes from this client's files too.`)) return
    setBusy(video.storage_path)
    try {
      await deleteVideo(video)
      onPicked(picked.filter((p) => p !== video.storage_path))
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  /**
   * Fills primary text, headline and description from the client's own
   * onboarding answers.
   *
   * Applied straight into the fields rather than offered as chips, which is
   * the opposite of what the Design tab does — and right here, because the
   * fields are empty and editable text boxes. Nothing is hidden: what it
   * wrote is sitting in the inputs to be changed.
   *
   * "Another angle" steps through the options already in hand before asking
   * for more. The model returns three per field and this used to keep one, so
   * every re-roll was a fresh Opus request for something already paid for.
   */
  const apply = (path, options, index, said) => {
    const best = nthPerField(options, index)
    const patch = {}
    if (best.primaryText) patch.primary_text = best.primaryText
    if (best.headline) patch.headline = best.headline
    if (best.description) patch.description = best.description
    if (Object.keys(patch).length === 0) return false

    onCopy(path, patch)
    setAngles((prev) => ({ ...prev, [path]: { options, index, total: anglesAvailable(options) } }))
    if (said !== undefined) setNote((prev) => ({ ...prev, [path]: said || '' }))
    return true
  }

  /**
   * Writes the note back to the video, once, when they click away.
   *
   * On blur rather than on every keystroke: this is a sentence somebody types,
   * and a write per character would be a hundred round trips for one line.
   * Skipped when nothing changed so tabbing through the fields is silent.
   *
   * A failed save is not shown. The note is already in local state and is
   * already being sent with the copy request, so the thing they asked for
   * still works -- the only loss is that they retype it after a reload, which
   * is not worth a red banner over a live ad they are in the middle of
   * building.
   */
  const keepAbout = async (video) => {
    const path = video.storage_path
    const typed = about[path]
    if (typed === undefined || typed.trim() === String(video.about || '').trim()) return
    try {
      await saveVideoAbout({ clientId: client.id, storagePath: path, about: typed })
      load()
    } catch {
      /* kept in local state, and already good enough to write copy from */
    }
  }

  // The preview element knows the clip's shape and length the moment its
  // metadata loads. Kept here for the checks and written to the row once, so
  // the next visitor does not wait for a preview to find out.
  const measure = (video, el) => {
    if (!el || !el.videoWidth) return
    const m = { durationSeconds: el.duration || 0, width: el.videoWidth, height: el.videoHeight }
    setMeasured((prev) => (prev[video.storage_path] ? prev : { ...prev, [video.storage_path]: m }))
    if (video.status !== 'new' && !(video.width && video.height && video.duration_seconds)) {
      saveVideoMeasure({ clientId: client.id, storagePath: video.storage_path, ...m }).catch(() => {})
    }
  }

  const checksFor = (v) => {
    const m = measured[v.storage_path] || {}
    return clipChecks({
      durationSeconds: m.durationSeconds || v.duration_seconds,
      width: m.width || v.width,
      height: m.height || v.height,
      transcript: v.transcript,
      transcribedAt: v.transcribed_at,
      transcriptError: v.transcript_error,
    })
  }

  const write = async (video) => {
    const path = video.storage_path
    const held = angles[path]

    // Still have an unseen angle from the last reply: no request needed.
    if (held && held.index + 1 < held.total) {
      apply(path, held.options, held.index + 1)
      return
    }

    setWriting(path)
    setError('')
    try {
      const copy = copies[path] || {}
      const { note: said, options } = await suggestVideoCopy({
        client,
        intake,
        about: about[path] ?? video.about,
        transcript: video.transcript,
        current: {
          primaryText: copy.primary_text || '',
          headline: copy.headline || '',
          description: copy.description || '',
        },
        instruction: copy.primary_text?.trim()
          ? 'Give me a different angle on the primary text, headline and description for this video ad.'
          : 'Write the primary text, headline and description for this video ad.',
      })

      if (!apply(path, options, 0, said)) {
        setError(said || 'The copy assistant did not return anything usable. Try again.')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setWriting('')
    }
  }

  const tick = (video) => {
    // The parent publishes from the copy record, so the ids it needs travel
    // with the copy rather than making it hold a second copy of this list.
    // Re-stamped on every tick because a re-poll can have filled in a
    // thumbnail since the list was first loaded. The name is filled in here
    // too, so a clip published without a version picked is still named
    // WC_client · day · file rather than whatever the function invents.
    const patch = { meta_video_id: video.meta_video_id, thumb_url: video.thumb_url }
    if (!copies[video.storage_path]?.ad_name?.trim()) patch.ad_name = nameFor(video)
    onCopy(video.storage_path, patch)
  }

  const toggle = (video) => {
    const on = picked.includes(video.storage_path)
    onPicked(
      on ? picked.filter((p) => p !== video.storage_path) : [...picked, video.storage_path]
    )
    if (!on) tick(video)
    setOpen(video.storage_path)
  }

  const ready = (videos || []).filter(isPublishable)
  const pickAllReady = () => {
    const paths = ready.map((v) => v.storage_path)
    for (const v of ready) if (!picked.includes(v.storage_path)) tick(v)
    onPicked([...new Set([...picked, ...paths])])
  }

  const uploading = busy.startsWith('upload')

  return (
    <div
      className={`relative space-y-2 rounded-xl transition ${dragging ? 'ring-2 ring-orange-400 ring-offset-2' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        if (!dragging) setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false)
      }}
      onDrop={onDrop}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-orange-50/90">
          <p className="text-sm font-semibold text-orange-800">Drop the clips to upload and send to Meta</p>
        </div>
      )}

      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {error}
        </div>
      )}

      {!account && (
        <p className="text-xs text-slate-500">
          {client.name} has no Meta ad account connected, so a video has nowhere to go yet.
        </p>
      )}

      {/* THE TOP LINE: what is here, what is ready, and the two ways in. */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm"
          multiple
          onChange={add}
          className="hidden"
        />
        <Button variant="dark" size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
          {uploading ? `Uploading${busy.includes('/') ? ` ${busy.slice(7)}` : ''}…` : '+ Upload clips'}
        </Button>
        <span className="text-[11px] text-slate-500">or drag them anywhere on this list</span>
        {videos && videos.length > 0 && (
          <span className="ml-auto flex items-center gap-2 text-[11px] text-slate-500">
            {videos.length} clip{videos.length === 1 ? '' : 's'} · {ready.length} ready
            {ready.length > 1 && ready.some((v) => !picked.includes(v.storage_path)) && (
              <button type="button" onClick={pickAllReady} className="text-blue-700 hover:underline">
                tick all ready
              </button>
            )}
          </span>
        )}
      </div>

      {videos === null ? (
        <p className="text-xs text-slate-500">Loading videos…</p>
      ) : videos.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-slate-700">No clips for {client.name} yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Drag .mp4 or .mov files here (up to {megabytes(MAX_VIDEO_BYTES)}MB each), or drop them in
            their Google Drive folder, where there is no size limit because Meta downloads from Drive
            directly.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5 max-h-[32rem] overflow-y-auto pr-1">
          {videos.map((v) => {
            const publishable = isPublishable(v)
            const checked = picked.includes(v.storage_path)
            const copy = copies[v.storage_path] || {}
            const checks = checksFor(v)
            return (
              <li
                key={v.storage_path}
                className={`rounded-lg border overflow-hidden ${checked ? 'border-orange-300 bg-orange-50/30' : 'border-slate-200'}`}
              >
                <div className="flex items-start gap-2.5 p-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!publishable}
                    onChange={() => toggle(v)}
                    className="mt-1 flex-shrink-0"
                    title={publishable ? '' : 'Meta has to finish processing this first'}
                  />
                  {/* A Drive clip has no bucket object to play from, and
                      streaming tens of megabytes through the edge function
                      just to fill a 112px box would be absurd. It gets Meta's
                      poster frame once registered, and plays in Drive. */}
                  {isDrivePath(v.storage_path) ? (
                    <a
                      href={`https://drive.google.com/file/d/${driveFileId(v.storage_path)}/view`}
                      target="_blank"
                      rel="noreferrer"
                      title={`Play ${v.file_name} in Google Drive`}
                      className="relative w-28 h-24 flex-shrink-0 rounded bg-slate-900 overflow-hidden flex items-center justify-center"
                    >
                      {v.thumb_url ? (
                        <img src={v.thumb_url} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-white/70 text-[10px] px-1 text-center">
                          In Google Drive
                        </span>
                      )}
                      <span className="absolute inset-0 flex items-center justify-center text-white/90 text-xl">
                        ▶
                      </span>
                    </a>
                  ) : (
                    /* Muted and preload=metadata: a list of autoplaying,
                       audible clips is unusable, and preloading four full
                       videos to show four thumbnails is wasteful. Metadata
                       is enough to measure the clip for the checks. */
                    <video
                      src={v.url}
                      poster={v.thumb_url || undefined}
                      controls
                      muted
                      preload="metadata"
                      onLoadedMetadata={(e) => measure(v, e.currentTarget)}
                      className="w-28 max-h-24 flex-shrink-0 rounded bg-slate-900 object-contain"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{v.file_name}</p>
                    <p className="text-[11px] text-slate-500 mb-1">
                      {megabytes(v.file_size)}MB
                      {isDrivePath(v.storage_path) && (
                        // Worth saying: it explains why there is no Delete
                        // here, and why a clip far over the upload limit is
                        // publishable at all.
                        <span className="ml-1.5 text-slate-400">· Google Drive</span>
                      )}
                      <span className="ml-2">
                        <Pipeline
                          video={v}
                          transcribing={transcribing[v.storage_path]}
                          hasCopy={Boolean(copy.primary_text?.trim())}
                          writing={writingVersions === v.storage_path || writing === v.storage_path}
                        />
                      </span>
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill video={v} />
                      {/* 'ready with no cover frame' needs this too: the
                          re-check re-reads Meta's thumbnails, and without one
                          the video cannot publish at all. */}
                      {(v.status === 'new' ||
                        v.status === 'error' ||
                        (v.status === 'ready' && !v.thumb_url)) && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!account || busy === v.storage_path}
                          onClick={() => send(v)}
                        >
                          {busy === v.storage_path
                            ? 'Checking…'
                            : v.status === 'new'
                              ? 'Send to Meta'
                              : 'Re-check'}
                        </Button>
                      )}
                      {/* No Delete on a Drive clip: the service account holds
                          read-only scope, so it could only ever fail, and the
                          file is the client's. They remove it in Drive. */}
                      {!isDrivePath(v.storage_path) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy === v.storage_path}
                          onClick={() => remove(v)}
                          className="text-slate-400"
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                    <div className="mt-1">
                      <Checks checks={checks} />
                    </div>
                  </div>
                </div>

                {checked && (
                  <div className="border-t border-orange-100 bg-white p-2 space-y-1.5">
                    {/* THE INPUT, above the outputs. Everything the copy
                        assistant otherwise knows comes off the onboarding form
                        and is identical for every one of this client's videos,
                        so without a line here three clips get three versions
                        of the same ad. Saved on the video itself, so it is
                        typed once rather than on every re-roll. */}
                    <textarea
                      value={about[v.storage_path] ?? v.about ?? ''}
                      onChange={(e) =>
                        setAbout((prev) => ({ ...prev, [v.storage_path]: e.target.value }))
                      }
                      onBlur={() => keepAbout(v)}
                      rows={2}
                      placeholder="What happens in this video? e.g. Dale walks through a furnace tune-up and mentions the $79 special"
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
                    />
                    {/* WHAT IS SAID IN IT. Made once per clip, kept on the
                        row, read by the copy assistant with the note above. */}
                    <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-700">Transcript</span>
                        {transcribing[v.storage_path] ? (
                          <span className="text-slate-500">Listening to the clip…</span>
                        ) : v.transcript ? (
                          <>
                            <span className="text-green-700">{v.transcript.split(/\s+/).length} words</span>
                            <button
                              type="button"
                              onClick={() => setShowTranscript((prev) => ({ ...prev, [v.storage_path]: !prev[v.storage_path] }))}
                              className="text-blue-700 hover:underline"
                            >
                              {showTranscript[v.storage_path] ? 'hide' : 'show'}
                            </button>
                            <button type="button" onClick={() => transcribe(v, true)} className="text-slate-500 hover:underline">
                              redo
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="text-slate-500">{transcriptNote[v.storage_path] || v.transcript_error || (v.status === 'new' ? 'Send it to Meta first.' : 'Not transcribed yet.')}</span>
                            {v.status !== 'new' && (
                              <button type="button" onClick={() => transcribe(v, true)} className="text-blue-700 hover:underline">
                                {transcriptNote[v.storage_path] || v.transcript_error ? 'try again' : 'transcribe'}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      {v.transcript && showTranscript[v.storage_path] && (
                        <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-slate-700">{v.transcript}</p>
                      )}
                    </div>

                    {writingVersions === v.storage_path && !versions[v.storage_path] && (
                      <p className="text-[11px] text-slate-600">
                        ✨ Writing three versions from the transcript…
                      </p>
                    )}

                    {/* THREE VERSIONS, side by side. Written as sets from the
                        transcript and the note; one click fills the fields
                        below, and they stay editable. */}
                    {versions[v.storage_path]?.variations?.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-slate-600">
                          {chosen[v.storage_path] == null ? 'Pick the version that fits the clip. ' : ''}
                          {versions[v.storage_path].note}
                        </p>
                        <div className="grid gap-2 md:grid-cols-3">
                          {versions[v.storage_path].variations.map((opt, i) => {
                            const on = chosen[v.storage_path] === i
                            return (
                              <div
                                key={i}
                                className={`flex flex-col rounded-lg border bg-white p-2 text-[11px] ${on ? 'border-green-500 ring-2 ring-green-200' : 'border-slate-200'}`}
                              >
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                  {String.fromCharCode(65 + i)} · {opt.angle}
                                </p>
                                <p className="whitespace-pre-wrap text-slate-800">{opt.primaryText}</p>
                                <p className="mt-1.5 font-semibold text-slate-900">{opt.headline}</p>
                                <p className="text-slate-600">{opt.description}</p>
                                <button
                                  type="button"
                                  onClick={() => pickVersion(v.storage_path, i)}
                                  className={`mt-2 rounded px-2 py-1 text-[11px] font-semibold ${on ? 'bg-green-600 text-white' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                                >
                                  {on ? '✓ Using this one' : 'Use this version'}
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <textarea
                      value={copy.primary_text || ''}
                      onChange={(e) => onCopy(v.storage_path, { primary_text: e.target.value })}
                      rows={2}
                      placeholder="Primary text — the words above the video. Required."
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs"
                    />
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      <input
                        value={copy.headline || ''}
                        onChange={(e) => onCopy(v.storage_path, { headline: e.target.value })}
                        placeholder="Headline (optional)"
                        className="px-2 py-1.5 border border-slate-300 rounded text-xs"
                      />
                      {/* Meta calls this link_description on a video creative
                          rather than description. It was supported by the
                          publish function from the start and simply never
                          asked for here, so video ads silently shipped
                          without it while image ads had it. */}
                      <input
                        value={copy.description || ''}
                        onChange={(e) => onCopy(v.storage_path, { description: e.target.value })}
                        placeholder="Description (optional)"
                        className="px-2 py-1.5 border border-slate-300 rounded text-xs"
                      />
                    </div>
                    <input
                      value={copy.ad_name || ''}
                      onChange={(e) => onCopy(v.storage_path, { ad_name: e.target.value })}
                      placeholder="Ad name — what you will see in Ads Manager"
                      title="Filled in as WC_client · day · angle; type over it if you like"
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="dark"
                        size="sm"
                        disabled={writingVersions === v.storage_path || transcribing[v.storage_path]}
                        onClick={() => writeVersions(v)}
                        title={v.transcript ? 'Three versions written from the transcript and your note' : 'Three versions written from your note and the client’s facts'}
                      >
                        {writingVersions === v.storage_path
                          ? 'Writing three versions…'
                          : versions[v.storage_path]
                            ? '✨ Three more versions'
                            : '✨ Write three versions'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={writing === v.storage_path}
                        onClick={() => write(v)}
                      >
                        {writing === v.storage_path
                          ? 'Writing…'
                          : !copy.primary_text?.trim()
                            ? 'Quick draft'
                            : angles[v.storage_path]?.total > 1
                              ? `Another angle (${angles[v.storage_path].index + 1}/${angles[v.storage_path].total})`
                              : 'Another angle'}
                      </Button>
                      {note[v.storage_path] && (
                        <p className="text-[11px] text-slate-600 flex-1 min-w-0">
                          {note[v.storage_path]}
                        </p>
                      )}
                    </div>
                    {open === v.storage_path && !copy.primary_text?.trim() && (
                      <p className="text-[11px] text-amber-700">
                        Primary text is required before this video can publish.
                      </p>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
