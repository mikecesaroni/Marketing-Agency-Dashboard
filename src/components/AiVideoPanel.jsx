import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Card } from './ui'
import DriveThumbImage from './DriveThumb'
import { copyText } from '../lib/intakeSummary'
import { fetchClientVideos, uploadVideo } from '../lib/adVideoStore'
import { driveObjectUrl, listDriveImages } from '../lib/driveAssets'
import { imagesOnly } from '../lib/driveFileKind'
import { isDrivePath } from '../lib/driveLabels'
import { megabytes } from '../lib/adVideos'
import { SECRETS, baseClipLabel, clock, isActive, jobLabel, jobStages, setupLabel, setupProblems, setupReady } from '../lib/aiVideo'
import {
  createAiVideo,
  deleteAiVideo,
  fetchAiSetup,
  fetchAiVideos,
  pollAiVideos,
  publicUrl,
  refreshAiSetup,
  retryAiVideo,
  saveRefPhotos,
  sendAiVideoForApproval,
  startAiSetup,
} from '../lib/aiVideoStore'

/**
 * AI videos for one client: the owner's voice and base clip, set up once, and
 * every video made from a script since.
 *
 * The setup is the part a person has to get right, so it is a form with the
 * consent written into it rather than a toggle: the owner's name goes on the
 * row with the date, and nothing is made until it is there. The jobs below
 * it are read-only progress until they finish, then a player and the two
 * things to do with a finished ad: send it for approval, or bin it.
 */

const POLL_MS = 6000
const MAX_REFS = 3

// The chat's "Make AI video" button tells this panel a job was added.
export const AI_VIDEO_EVENT = 'ai-video-changed'

const DOT = {
  done: 'bg-green-500',
  busy: 'bg-amber-400 animate-pulse',
  bad: 'bg-red-500',
  skip: 'bg-slate-300',
  todo: 'bg-slate-200',
}

function Stages({ job }) {
  return (
    <span className="inline-flex items-center gap-2" title="Voice · lip-sync · B-roll · cut">
      {jobStages(job).map((s) => (
        <span key={s.label} className="inline-flex items-center gap-1 text-[10px] text-slate-500">
          <span className={`inline-block h-2 w-2 rounded-full ${DOT[s.state]}`} />
          {s.label}
        </span>
      ))}
    </span>
  )
}

function StatusPill({ job }) {
  const tone =
    job.status === 'done'
      ? 'bg-green-50 text-green-800 border-green-200'
      : job.status === 'failed'
        ? 'bg-red-50 text-red-700 border-red-200'
        : 'bg-amber-50 text-amber-800 border-amber-200'
  return (
    <span className={`inline-block max-w-full truncate rounded border px-1.5 py-0.5 text-[10px] font-medium ${tone}`} title={jobLabel(job)}>
      {jobLabel(job)}
    </span>
  )
}

export default function AiVideoPanel({ client }) {
  const [setup, setSetup] = useState(undefined) // undefined: loading; null: none yet
  const [jobs, setJobs] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [editing, setEditing] = useState(false)
  const [videos, setVideos] = useState(null)
  const [drive, setDrive] = useState([])
  const [form, setForm] = useState({ basePath: '', baseName: '', consentName: '', consentNote: '', agreed: false })
  // Reference photos: Drive picks (copied on save) and paths already in the bucket.
  const [pickedDrive, setPickedDrive] = useState([])
  const [refPaths, setRefPaths] = useState([])
  const [openScript, setOpenScript] = useState('')
  const fileInput = useRef(null)

  const load = useCallback(async () => {
    try {
      const [s, j] = await Promise.all([fetchAiSetup(client.id), fetchAiVideos(client.id)])
      setSetup(s)
      setJobs(j)
      if (s) {
        setForm((f) => ({
          ...f,
          basePath: f.basePath || s.base_video_path || '',
          baseName: f.baseName || s.base_video_name || '',
          consentName: f.consentName || s.consent_name || '',
          consentNote: f.consentNote || s.consent_note || '',
          agreed: f.agreed || Boolean(s.consent_name),
        }))
        setRefPaths((r) => (r.length ? r : s.ref_paths || []))
      }
    } catch (err) {
      setError(err.message)
    }
  }, [client.id])

  useEffect(() => {
    load()
  }, [load])

  // The chat made one: show it here without a reload.
  useEffect(() => {
    const onChange = () => load()
    window.addEventListener(AI_VIDEO_EVENT, onChange)
    return () => window.removeEventListener(AI_VIDEO_EVENT, onChange)
  }, [load])

  // The clip list and the Drive photos are only needed while setting up:
  // before the first setup, or when Change was pressed.
  const settingUp = editing || setup === null || (setup !== undefined && !setupReady(setup))
  useEffect(() => {
    if (!settingUp) return
    if (videos === null) {
      fetchClientVideos(client.id, client.meta_ad_account_id || '')
        .then(setVideos)
        .catch((err) => setError(err.message))
    }
    listDriveImages(client.id)
      .then((files) => setDrive(imagesOnly(files).slice(0, 60)))
      .catch(() => setDrive([]))
  }, [settingUp, client.id, client.meta_ad_account_id, videos])

  // Jobs in flight: nudge each one along and re-read, every few seconds.
  useEffect(() => {
    const active = (jobs || []).filter(isActive)
    if (active.length === 0) return undefined
    let live = true
    const timer = setTimeout(async () => {
      try {
        const next = await pollAiVideos(client.id, active)
        if (live) setJobs(next)
      } catch {
        /* the cron tick keeps them moving regardless */
      }
    }, POLL_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [jobs, client.id])

  // A voice being prepared: ask until it is ready or has failed.
  useEffect(() => {
    if (setup?.status !== 'preparing') return undefined
    let live = true
    const timer = setTimeout(async () => {
      try {
        const next = await refreshAiSetup(client.id)
        if (live) setSetup(next)
      } catch (err) {
        if (live) setError(err.message)
      }
    }, 5000)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [setup, client.id])

  const ready = setupReady(setup)
  const showSetup = editing || !ready

  const say = (text) => {
    setNotice(text)
    setTimeout(() => setNotice(''), 5000)
  }

  const uploadClip = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy('upload')
    setError('')
    try {
      const saved = await uploadVideo({ clientId: client.id, file, uploadedBy: 'AI video setup' })
      setVideos(null) // re-list, so it shows with the rest
      setForm((f) => ({ ...f, basePath: saved.storage_path, baseName: saved.file_name }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const toggleDrive = (file) => {
    setPickedDrive((prev) => {
      if (prev.some((f) => f.id === file.id)) return prev.filter((f) => f.id !== file.id)
      if (prev.length + refPaths.length >= MAX_REFS) return prev
      return [...prev, file]
    })
  }

  const prepare = async () => {
    if (!form.basePath) return setError('Pick the owner’s base clip first.')
    if (!form.consentName.trim()) return setError('Put the owner’s name against the consent.')
    if (!form.agreed) return setError('Tick the consent line once the owner has agreed in writing.')
    setBusy('prepare')
    setError('')
    try {
      // Drive photos are copied into the bucket so the B-roll vendor can fetch them.
      let paths = refPaths
      if (pickedDrive.length > 0) {
        const blobs = []
        for (const f of pickedDrive) {
          const url = await driveObjectUrl(client.id, f.id)
          blobs.push(await fetch(url).then((r) => r.blob()))
        }
        paths = [...refPaths, ...(await saveRefPhotos({ clientId: client.id, blobs }))].slice(0, MAX_REFS)
        setRefPaths(paths)
        setPickedDrive([])
      }
      const next = await startAiSetup({
        clientId: client.id,
        basePath: form.basePath,
        baseName: form.baseName,
        refPaths: paths,
        consentName: form.consentName,
        consentNote: form.consentNote,
      })
      setSetup(next)
      setEditing(false)
      say('Preparing the voice. A minute or two, then every script card can make a video.')
    } catch (err) {
      setError(err.notConfigured ? `${err.message} Keys needed: ${SECRETS.map((s) => s.name).join(', ')}.` : err.message)
    } finally {
      setBusy('')
    }
  }

  const retry = async (job) => {
    setBusy(job.id)
    setError('')
    try {
      await retryAiVideo(job.id)
      setJobs(await fetchAiVideos(client.id))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const remove = async (job) => {
    if (!confirm(`Delete "${job.title || 'this video'}"? The finished file, if there is one, stays in Files.`)) return
    setBusy(job.id)
    try {
      await deleteAiVideo(job)
      setJobs((prev) => (prev || []).filter((j) => j.id !== job.id))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const sendLink = async (job) => {
    setBusy(job.id)
    setError('')
    try {
      const link = await sendAiVideoForApproval({ clientId: client.id, job, note: `New video ad: ${job.title || 'AI video'}` })
      await copyText(link.url)
      say('Approval link copied. Paste it to the owner.')
      setJobs(await fetchAiVideos(client.id))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const makeAgain = async (job) => {
    setBusy(job.id)
    setError('')
    try {
      await createAiVideo({ clientId: client.id, title: job.title, script: job.script })
      setJobs(await fetchAiVideos(client.id))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const problems = setupProblems(setup)

  return (
    <Card id="ai-videos" padding="none" className="p-4 md:p-6" data-ai-videos>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900 md:text-xl">
          AI videos
          <span
            data-ai-setup-status
            className={`ml-2 align-middle rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              ready ? 'border-green-200 bg-green-50 text-green-800' : setup?.status === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-600'
            }`}
          >
            {setupLabel(setup)}
          </span>
        </h2>
        <p className="text-xs text-slate-500">
          One real recording a month; the CRM makes the weekly ads. Each script card in the chat has a Make AI video button.
        </p>
      </div>

      {error && <p className="mb-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      {notice && <p className="mb-2 rounded border border-green-200 bg-green-50 p-2 text-xs text-green-800">{notice}</p>}

      {setup === undefined ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          {/* THE SETUP, once. Collapsed to one line once the voice is ready. */}
          {!showSetup ? (
            <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700" data-ai-setup-summary>
              <span>
                <span className="font-semibold">Base clip:</span> {baseClipLabel(setup)}
              </span>
              <span>
                <span className="font-semibold">Voice:</span> cloned{setup.prepared_at ? ` ${new Date(setup.prepared_at).toLocaleDateString()}` : ''}
              </span>
              <span>
                <span className="font-semibold">Agreed by:</span> {setup.consent_name}
                {setup.consent_at ? ` on ${new Date(setup.consent_at).toLocaleDateString()}` : ''}
              </span>
              {setup.ref_paths?.length > 0 && <span>{setup.ref_paths.length} reference photo{setup.ref_paths.length === 1 ? '' : 's'}</span>}
              <button type="button" onClick={() => setEditing(true)} className="ml-auto text-blue-700 hover:underline">
                Change
              </button>
            </div>
          ) : (
            <div className="mb-4 space-y-3 rounded-lg border border-slate-200 p-3" data-ai-setup-form>
              <div>
                <p className="text-sm font-semibold text-slate-900">Set up the owner&rsquo;s voice</p>
                <p className="text-xs text-slate-500">
                  One clip of the owner talking to camera for at least 45 seconds, mouth visible, head fairly still, starting
                  to talk straight away. The CRM clones the voice from it and lip-syncs it to each new script.
                </p>
                {problems.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-xs text-amber-800">
                    {problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* THE BASE CLIP: one of the client's videos, uploaded or in Drive. */}
              <div>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Base clip</p>
                  <input ref={fileInput} type="file" accept="video/mp4,video/quicktime,.mp4,.mov,.m4v" onChange={uploadClip} className="hidden" />
                  <Button variant="outline" size="sm" disabled={busy === 'upload'} onClick={() => fileInput.current?.click()}>
                    {busy === 'upload' ? 'Uploading…' : '+ Upload a clip'}
                  </Button>
                  <span className="text-[11px] text-slate-500">or pick one below (Drive clips have no size limit)</span>
                </div>
                {videos === null ? (
                  <p className="text-xs text-slate-500">Loading clips…</p>
                ) : videos.length === 0 && !form.basePath ? (
                  <p className="text-xs text-slate-500">No clips for {client.name} yet. Upload one, or drop it in their Drive folder.</p>
                ) : (
                  <ul className="max-h-48 space-y-1 overflow-y-auto pr-1">
                    {videos.map((v) => (
                      <li key={v.storage_path}>
                        <label className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1 text-xs ${form.basePath === v.storage_path ? 'border-orange-300 bg-orange-50/40' : 'border-slate-200'}`}>
                          <input
                            type="radio"
                            name="ai-base-clip"
                            checked={form.basePath === v.storage_path}
                            onChange={() => setForm((f) => ({ ...f, basePath: v.storage_path, baseName: v.file_name }))}
                          />
                          <span className="truncate font-medium text-slate-800">{v.file_name}</span>
                          <span className="text-slate-500">
                            {megabytes(v.file_size)}MB{isDrivePath(v.storage_path) ? ' · Google Drive' : ''}
                            {v.duration_seconds ? ` · ${clock(v.duration_seconds)}` : ''}
                          </span>
                        </label>
                      </li>
                    ))}
                    {form.basePath && !videos.some((v) => v.storage_path === form.basePath) && (
                      <li className="text-xs text-slate-600">Chosen: {form.baseName || form.basePath}</li>
                    )}
                  </ul>
                )}
              </div>

              {/* REFERENCE PHOTOS: the trucks, the crew, the jobs. Optional. */}
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Reference photos for B-roll <span className="font-normal normal-case text-slate-400">(optional, up to {MAX_REFS}: trucks, crew, jobs; no faces)</span>
                </p>
                {refPaths.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {refPaths.map((p) => (
                      <span key={p} className="relative h-16 w-16 overflow-hidden rounded border border-slate-300">
                        <img src={publicUrl(p)} alt="" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setRefPaths((r) => r.filter((x) => x !== p))}
                          className="absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-black/60 text-[10px] leading-4 text-white"
                          aria-label="Remove photo"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {drive.length === 0 ? (
                  <p className="text-[11px] text-slate-500">No photos in the Drive folder yet. Without any, the B-roll is filmed from the trade.</p>
                ) : (
                  <div className="grid max-h-40 grid-cols-6 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-8 md:grid-cols-10">
                    {drive.map((file) => {
                      const on = pickedDrive.some((f) => f.id === file.id)
                      return (
                        <button
                          key={file.id}
                          type="button"
                          onClick={() => toggleDrive(file)}
                          title={file.name}
                          className={`relative aspect-square overflow-hidden rounded border transition ${on ? 'border-blue-600 ring-2 ring-blue-200' : 'border-slate-300 hover:border-slate-400'}`}
                        >
                          <DriveThumbImage clientId={client.id} file={file} />
                          {on && <span className="absolute right-1 top-1 h-4 w-4 rounded-full bg-blue-600 text-center text-[10px] leading-4 text-white">✓</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* CONSENT. The owner's voice is theirs; this is the record that they said yes. */}
              <div className="rounded border border-amber-200 bg-amber-50/60 p-2.5">
                <p className="mb-1.5 text-xs font-semibold text-amber-900">Consent, in writing</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    value={form.consentName}
                    onChange={(e) => setForm((f) => ({ ...f, consentName: e.target.value }))}
                    placeholder="Owner's name (who agreed)"
                    className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
                    data-consent-name
                  />
                  <input
                    value={form.consentNote}
                    onChange={(e) => setForm((f) => ({ ...f, consentNote: e.target.value }))}
                    placeholder="Where it is written (email, text, signed note)"
                    className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
                  />
                </div>
                <label className="mt-2 flex items-start gap-2 text-xs text-slate-800">
                  <input type="checkbox" checked={form.agreed} onChange={(e) => setForm((f) => ({ ...f, agreed: e.target.checked }))} className="mt-0.5" data-consent-agreed />
                  <span>
                    The owner has agreed in writing that we may clone their voice and re-voice their own footage for their own
                    ads, and can withdraw that any time. Never a customer, never a testimonial.
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="dark" size="sm" disabled={busy === 'prepare'} onClick={prepare} data-prepare-voice>
                  {busy === 'prepare' ? 'Starting…' : setup?.voice_id ? 'Replace the voice' : 'Prepare the voice'}
                </Button>
                {ready && (
                  <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                )}
                <span className="text-[11px] text-slate-500">
                  Pulls the audio off the clip and clones it. Keys: {SECRETS.map((s) => s.vendor).join(', ')} in Supabase.
                </span>
              </div>
            </div>
          )}

          {/* THE VIDEOS. */}
          {jobs === null ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-slate-500" data-ai-empty>
              No AI videos yet. Open &ldquo;Ask about {client.name}&rdquo;, ask for scripts, and press Make AI video on one.
            </p>
          ) : (
            <ul className="space-y-2" data-ai-jobs>
              {jobs.map((job) => (
                <li key={job.id} className="rounded-lg border border-slate-200 p-2.5" data-ai-job data-status={job.status}>
                  <div className="flex items-start gap-3">
                    {job.status === 'done' && job.video_path ? (
                      <video
                        src={publicUrl(job.video_path)}
                        poster={job.poster_path ? publicUrl(job.poster_path) : undefined}
                        controls
                        playsInline
                        preload="metadata"
                        className="h-40 w-24 flex-shrink-0 rounded bg-slate-900 object-contain"
                      />
                    ) : (
                      <div className="flex h-40 w-24 flex-shrink-0 items-center justify-center rounded bg-slate-100 text-2xl">
                        {job.status === 'failed' ? '⚠️' : '🎬'}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{job.title || 'AI video'}</p>
                      <p className="mb-1 text-[11px] text-slate-500">
                        {new Date(job.created_at).toLocaleString()}
                        {job.duration_seconds ? ` · ${clock(job.duration_seconds)}` : ''}
                        <span className="ml-2">
                          <Stages job={job} />
                        </span>
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusPill job={job} />
                        {job.note && <span className="text-[11px] text-slate-500">{job.note}</span>}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {job.status === 'done' && (
                          <>
                            <Button variant="dark" size="sm" disabled={busy === job.id} onClick={() => sendLink(job)} data-send-approval>
                              {job.approval_token ? 'New approval link' : 'Send for approval'}
                            </Button>
                            <a href={publicUrl(job.video_path)} download className="text-xs text-blue-700 hover:underline">
                              Download
                            </a>
                            <span className="text-[11px] text-slate-500">In Files and the publish list as {job.video_path.split('/').pop()}</span>
                          </>
                        )}
                        {job.status === 'failed' && (
                          <>
                            <Button variant="outline" size="sm" disabled={busy === job.id} onClick={() => retry(job)} data-retry>
                              Retry
                            </Button>
                            <Button variant="ghost" size="sm" disabled={busy === job.id} onClick={() => makeAgain(job)}>
                              Start over
                            </Button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => setOpenScript(openScript === job.id ? '' : job.id)}
                          className="text-xs text-slate-500 hover:underline"
                        >
                          {openScript === job.id ? 'hide script' : 'script'}
                        </button>
                        {!isActive(job) && (
                          <Button variant="ghost" size="sm" disabled={busy === job.id} onClick={() => remove(job)} className="text-slate-400">
                            Delete
                          </Button>
                        )}
                      </div>
                      {openScript === job.id && (
                        <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-[11px] text-slate-700">{job.spoken}</pre>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  )
}
