import { useCallback, useEffect, useRef, useState } from 'react'
import Button from './ui/Button'
import { registerAdVideo, adVideoStatus } from '../lib/metaPublish'
import { suggestVideoCopy } from '../lib/adCopy'
import { anglesAvailable, nthPerField } from '../lib/adCopyOptions'
import {
  MAX_VIDEO_BYTES,
  isPublishable,
  megabytes,
  statusLabel,
  validateVideo,
} from '../lib/adVideos'
import { deleteVideo, fetchClientVideos, saveVideoAbout, uploadVideo } from '../lib/adVideoStore'

/**
 * Upload a video, wait for Meta to transcode it, tick it, publish it.
 *
 * The waiting is why this owns the whole flow instead of just being a list.
 * Meta transcodes asynchronously and a phone clip can take a minute or more,
 * so the upload is sent to Meta the moment it lands in the bucket — while the
 * user is still writing copy — rather than at publish time, where it would be
 * the slowest and least predictable step of the thing they are watching.
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
  // What each video is about, keyed by storage path. Held here while it is
  // being typed and written back to the row on blur, so the textarea stays
  // responsive and the note survives a reload.
  const [about, setAbout] = useState({})
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

  const add = async (event) => {
    const files = [...(event.target.files || [])]
    event.target.value = ''
    if (files.length === 0) return

    const rejected = files.map(validateVideo).filter(Boolean)
    if (rejected.length > 0) {
      setError(rejected[0])
      return
    }

    setBusy('upload')
    setError('')
    try {
      for (const file of files) {
        const saved = await uploadVideo({ clientId: client.id, file })
        // Straight to Meta: the transcode should be running before they have
        // finished typing the primary text.
        await registerAdVideo({
          clientId: client.id,
          storagePath: saved.storage_path,
          fileName: saved.file_name,
        })
      }
      await load()
    } catch (err) {
      setError(err.message)
      await load()
    } finally {
      setBusy('')
    }
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

  const toggle = (video) => {
    const on = picked.includes(video.storage_path)
    onPicked(
      on ? picked.filter((p) => p !== video.storage_path) : [...picked, video.storage_path]
    )
    // The parent publishes from the copy record, so the ids it needs travel
    // with the copy rather than making it hold a second copy of this list.
    // Re-stamped on every tick because a re-poll can have filled in a
    // thumbnail since the list was first loaded.
    if (!on) {
      onCopy(video.storage_path, {
        meta_video_id: video.meta_video_id,
        thumb_url: video.thumb_url,
      })
    }
    setOpen(video.storage_path)
  }

  return (
    <div className="space-y-2">
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

      {videos === null ? (
        <p className="text-xs text-slate-500">Loading videos…</p>
      ) : videos.length === 0 ? (
        <p className="text-xs text-slate-500">
          No videos for {client.name} yet. Upload one below — .mp4 or .mov, up to{' '}
          {megabytes(MAX_VIDEO_BYTES)}MB.
        </p>
      ) : (
        <ul className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
          {videos.map((v) => {
            const ready = isPublishable(v)
            const checked = picked.includes(v.storage_path)
            const copy = copies[v.storage_path] || {}
            return (
              <li key={v.storage_path} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="flex items-start gap-2.5 p-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!ready}
                    onChange={() => toggle(v)}
                    className="mt-1 flex-shrink-0"
                    title={ready ? '' : 'Meta has to finish processing this first'}
                  />
                  {/* Muted and preload=metadata: a list of autoplaying,
                      audible clips is unusable, and preloading four full
                      videos to show four thumbnails is wasteful. */}
                  <video
                    src={v.url}
                    poster={v.thumb_url || undefined}
                    controls
                    muted
                    preload="metadata"
                    className="w-28 max-h-24 flex-shrink-0 rounded bg-slate-900 object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{v.file_name}</p>
                    <p className="text-[11px] text-slate-500 mb-1">
                      {megabytes(v.file_size)}MB
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
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy === v.storage_path}
                        onClick={() => remove(v)}
                        className="text-slate-400"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>

                {checked && (
                  <div className="border-t border-slate-100 bg-slate-50 p-2 space-y-1.5">
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
                      placeholder="Ad name — what you will see in Ads Manager (optional)"
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={writing === v.storage_path}
                        onClick={() => write(v)}
                      >
                        {writing === v.storage_path
                          ? 'Writing…'
                          : !copy.primary_text?.trim()
                            ? '✨ Write the copy'
                            : angles[v.storage_path]?.total > 1
                              ? `✨ Another angle (${angles[v.storage_path].index + 1}/${angles[v.storage_path].total})`
                              : '✨ Another angle'}
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

      <input
        ref={fileInput}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm"
        multiple
        onChange={add}
        className="hidden"
      />
      <Button
        variant="outline"
        size="md"
        disabled={busy === 'upload'}
        onClick={() => fileInput.current?.click()}
      >
        {busy === 'upload' ? 'Uploading and sending to Meta…' : '+ Upload video'}
      </Button>
    </div>
  )
}
