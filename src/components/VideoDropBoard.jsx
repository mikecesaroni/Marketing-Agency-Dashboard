import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ago } from '../lib/contentHub'
import { DROP_STATES, dropStats } from '../lib/videoLaunch'
import { isVideoFile, validateVideo } from '../lib/adVideos'
import { dismissClips, uploadVideo } from '../lib/adVideoStore'
import { registerAdVideo } from '../lib/metaPublish'
import { readMe, saveMe } from '../lib/tasksData'

/**
 * This week's video drops: one row per client, most behind first, and the
 * drop zone the editor puts finished clips into.
 *
 * The agency's promise is a fresh video ad per client per week, and the
 * only way to keep a promise like that across fifteen clients is a board
 * that says who has had theirs. Every row is a link into that client's
 * publish screen, which is where the clip goes in.
 *
 * THE HANDOFF. An editor finishes a clip and drops it here against the
 * client. It goes to the bucket and on to Meta to transcode, and the
 * client's row turns purple: "New clip dropped in · tuneup.mp4 · 2h ago by
 * Sam · Click to publish". That click opens Publish with the clip already
 * ticked, its transcript and three versions of copy on the way. The editor
 * never needs to know what an ad set is; the publisher never needs to go
 * looking for the file.
 *
 * Rows come from src/lib/videoDrops(): a client with no new ad of any
 * kind for ten days or more is stale; one with an ad in the last ten days
 * is fresh; a clip waiting to be published is ready, and ready sorts first.
 */

const TONES = {
  purple: 'bg-violet-100 text-violet-800 ring-violet-200',
  red: 'bg-red-100 text-red-800 ring-red-200',
  amber: 'bg-amber-100 text-amber-800 ring-amber-200',
  blue: 'bg-blue-50 text-blue-800 ring-blue-200',
  green: 'bg-green-100 text-green-800 ring-green-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
}

function StatePill({ state }) {
  const s = DROP_STATES[state] || DROP_STATES.due
  return (
    <span className={`inline-flex whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${TONES[s.tone]}`}>
      {s.label}
    </span>
  )
}

const publishHref = (row, clip) => `/publish/${row.id}${clip ? `?video=${encodeURIComponent(clip.path)}` : ''}`

function Row({ row, onDismiss }) {
  const clip = row.state === 'ready' ? row.waiting[0] : null
  const last = row.lastAdAt
    ? `last ad ${row.daysSince === 0 ? 'today' : row.daysSince === 1 ? 'yesterday' : `${row.daysSince} days ago`}`
    : 'no ad yet'
  const line = clip
    ? `${clip.name} · dropped ${ago(clip.at)}${clip.by ? ` by ${clip.by}` : ''}${row.waiting.length > 1 ? ` · ${row.waiting.length - 1} more waiting` : ''}`
    : `${last}${row.lastAdName ? ` · ${row.lastAdName}` : ''}${row.thisWeek > 1 ? ` · ${row.thisWeek} this week` : ''}`
  return (
    <li>
      <Link
        to={publishHref(row, clip)}
        data-drop={row.state}
        className={`group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl px-3 py-2 transition ${
          clip ? 'bg-violet-50/70 ring-1 ring-violet-100 hover:bg-violet-50' : 'hover:bg-slate-50'
        }`}
      >
        <StatePill state={row.state} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900">
            {row.name}
            {row.internal && <span className="ml-1.5 text-[11px] font-normal text-slate-400">internal</span>}
          </span>
          <span className="block truncate text-[11px] text-slate-500" title={clip ? clip.name : row.lastAdName}>
            {line}
          </span>
        </span>
        <span className="flex items-center gap-2 text-[11px]">
          {!clip && row.readyClips > 0 && row.state !== 'done' && (
            <span className="hidden rounded-md bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-800 sm:inline">
              {row.readyClips} clip{row.readyClips === 1 ? '' : 's'} ready
            </span>
          )}
          {clip ? (
            <>
              {onDismiss && (
                <button
                  type="button"
                  title="Not new: take this clip off the board without publishing it"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onDismiss(row)
                  }}
                  className="rounded-md px-1.5 py-0.5 text-slate-400 hover:bg-white hover:text-slate-700"
                >
                  not new ×
                </button>
              )}
              <span className="rounded-lg bg-violet-700 px-2.5 py-1 font-semibold text-white shadow-sm transition group-hover:bg-violet-800">
                Click to publish →
              </span>
            </>
          ) : (
            <span className="font-medium text-blue-700 opacity-0 transition group-hover:opacity-100">
              {row.state === 'done' ? 'Publish another →' : 'Publish a video →'}
            </span>
          )}
        </span>
      </Link>
    </li>
  )
}

/**
 * Where the editor drops a finished clip. Pick the client, drop the file.
 *
 * The upload is the same one the publish screen does (bucket, then Meta),
 * so by the time somebody clicks through, the transcode is usually done.
 * The name comes from the "You:" the CRM already keeps for tasks and is
 * asked for once.
 */
function DropIn({ clients, onDropped }) {
  const [clientId, setClientId] = useState('')
  const [me, setMe] = useState(() => readMe())
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const [dragging, setDragging] = useState(false)
  const input = useRef(null)
  const choices = (clients || []).filter((c) => !c.archived)
  const chosen = choices.find((c) => c.id === clientId)

  const ingest = async (incoming) => {
    const files = [...(incoming || [])].filter((f) => isVideoFile(f.name))
    setError('')
    setDone(null)
    if (!chosen) {
      setError('Pick the client first, then drop the clip.')
      return
    }
    if (files.length === 0) {
      setError('That was not a video. Drop .mp4 or .mov files.')
      return
    }
    const bad = files.map(validateVideo).find(Boolean)
    if (bad) {
      setError(bad)
      return
    }
    // Read fresh: the name may have been set on another tab since this mounted.
    let who = readMe() || me
    if (who && who !== me) setMe(who)
    if (!who) {
      who = String(window.prompt('Your name, so the board can say who dropped it in:') || '').trim()
      if (who) {
        saveMe(who)
        setMe(who)
      }
    }
    const dropped = []
    try {
      for (const [i, file] of files.entries()) {
        setBusy(files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : `Uploading ${file.name}…`)
        const saved = await uploadVideo({ clientId: chosen.id, file, uploadedBy: who })
        dropped.push(saved)
        if (chosen.meta_ad_account_id) {
          // Straight to Meta, best effort: a transcode that fails to start
          // here starts again from the publish screen.
          await registerAdVideo({ clientId: chosen.id, storagePath: saved.storage_path, fileName: saved.file_name }).catch(() => {})
        }
      }
      setDone({ client: chosen, clips: dropped })
      onDropped?.()
    } catch (err) {
      setError(err.message)
      if (dropped.length > 0) onDropped?.()
    } finally {
      setBusy('')
    }
  }

  return (
    <div
      className={`rounded-2xl border-2 border-dashed p-3 transition ${dragging ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-slate-50'}`}
      onDragOver={(e) => {
        e.preventDefault()
        if (!dragging) setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        ingest(e.dataTransfer?.files)
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg" aria-hidden>
          🎬
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Drop a finished clip</p>
          <p className="text-[11px] text-slate-500">
            For editors: pick the client, drop the .mp4 or .mov. It goes to Meta and shows up below as ready to publish.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
            title="Which client this clip is for"
          >
            <option value="">Which client?</option>
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.meta_ad_account_id ? '' : ' (no Meta account)'}
              </option>
            ))}
          </select>
          <input
            ref={input}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = [...(e.target.files || [])]
              e.target.value = ''
              if (files.length > 0) ingest(files)
            }}
          />
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => input.current?.click()}
            className="rounded-lg bg-violet-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-800 disabled:opacity-50"
          >
            {busy || 'Choose clip'}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      {done && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-violet-900">
          <span>
            ✓ {done.clips.length === 1 ? done.clips[0].file_name : `${done.clips.length} clips`} dropped in for {done.client.name}
            {me ? ` by ${me}` : ''}.
          </span>
          {done.client.meta_ad_account_id ? (
            <Link
              to={publishHref({ id: done.client.id }, { path: done.clips[0].storage_path })}
              className="font-semibold text-violet-800 underline hover:text-violet-950"
            >
              Publish it now →
            </Link>
          ) : (
            <span className="text-slate-500">Connect their Meta ad account before it can publish.</span>
          )}
        </p>
      )}
    </div>
  )
}

export default function VideoDropBoard({ rows, clients, onDropped, onReset, compact = false }) {
  const [showAll, setShowAll] = useState(false)
  const [dismissError, setDismissError] = useState('')
  // Every waiting clip on the row, not just the one shown: "not new" means
  // this client has nothing new, and the next clip down would only take
  // the flag's place.
  const dismiss = async (row) => {
    setDismissError('')
    try {
      await dismissClips({ clientId: row.id, storagePaths: row.waiting.map((w) => w.path) })
      onDropped?.()
    } catch (err) {
      setDismissError(err.message)
    }
  }
  if (!rows) return null
  const stats = dropStats(rows)
  const withMeta = rows.filter((r) => r.state !== 'no-meta')
  const noMeta = rows.filter((r) => r.state === 'no-meta')
  const shown = compact && !showAll ? withMeta.filter((r) => r.state !== 'done').slice(0, 6) : withMeta
  const hidden = withMeta.length - shown.length

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">This week&rsquo;s video drops</h2>
          <p className="text-xs text-slate-500">
            A client with no new ad for 10 days or more is flagged. Most behind at the top; click a client to publish.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          {stats.ready > 0 && (
            <span className="rounded-lg bg-violet-100 px-2.5 py-1 font-semibold text-violet-800">
              {stats.ready} new clip{stats.ready === 1 ? '' : 's'} to publish
            </span>
          )}
          <span className={`rounded-lg px-2.5 py-1 font-semibold ${stats.stale ? 'bg-red-50 text-red-800' : 'bg-slate-100 text-slate-500'}`}>
            {stats.stale} at 10+ days
          </span>
          {stats.never > 0 && (
            <span className="rounded-lg bg-blue-50 px-2.5 py-1 font-semibold text-blue-800">{stats.never} no ad yet</span>
          )}
          <span className="rounded-lg bg-green-50 px-2.5 py-1 font-semibold text-green-800">{stats.done} fresh</span>
        </div>
      </div>

      <div className="mt-3">
        <DropIn clients={clients} onDropped={onDropped} />
      </div>

      {withMeta.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No client has a Meta ad account connected yet.</p>
      ) : shown.length === 0 ? (
        <p className="mt-4 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800">
          Every client has had a new ad in the last 10 days. 🎉
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {shown.map((r) => (
            <Row key={r.id} row={r} onDismiss={dismiss} />
          ))}
        </ul>
      )}

      {dismissError && <p className="mt-2 text-xs text-red-700">{dismissError}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        {hidden > 0 && (
          <button type="button" onClick={() => setShowAll(true)} className="text-blue-700 hover:underline">
            show all {withMeta.length} clients
          </button>
        )}
        {compact && showAll && withMeta.length > 6 && (
          <button type="button" onClick={() => setShowAll(false)} className="text-blue-700 hover:underline">
            just the ones behind
          </button>
        )}
        {noMeta.length > 0 && (
          <span title={noMeta.map((r) => r.name).join(', ')}>
            {noMeta.length} client{noMeta.length === 1 ? ' has' : 's have'} no Meta ad account connected
          </span>
        )}
        {stats.ready > 0 && onReset && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Clear every "new clip dropped in" flag? The clips stay; they just stop showing as new. Only clips dropped from now on will show.')) onReset()
            }}
            className="ml-auto text-slate-400 hover:text-slate-700 hover:underline"
            title="Start fresh: nothing already in the CRM counts as new"
          >
            clear new-clip flags
          </button>
        )}
      </div>
    </section>
  )
}
