import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ago } from '../lib/contentHub'
import { personName } from '../lib/videoLaunch'
import { isStaticFile, publishStaticHref, validateStatic } from '../lib/staticDrops'
import { dismissStatics, uploadStatics } from '../lib/staticDropStore'
import { downloadUrl, setDropNote } from '../lib/adVideoStore'
import { publicUrl } from '../lib/savedAds'
import { readMe, saveMe } from '../lib/tasksData'

/**
 * Dropped statics: the box the editor drops finished images into, and the
 * list of what is waiting to publish.
 *
 * The clip board's twin ("make a separate box to drop in static images that
 * our editor is making for clients, make it so we can publish with a click
 * like the video ones"). Pick the client, drop the .png or .jpg files, and
 * the client's row appears below: "New static dropped in · tuneup · 2h ago
 * by Kyle · Click to publish". That click opens Publish with the static
 * already ticked and its words on the way. Files of one ad in three sizes
 * (tuneup-square, tuneup-feed, tuneup-story) land as one set, which
 * publishes as one ad with each size on its placements.
 *
 * Rows come from src/lib/staticDrops.js: only clients with a static
 * waiting; there is no weekly promise on statics, so nobody is "behind".
 */

const SIZE_LABEL = { square: '1:1', feed: '4:5', story: '9:16' }

function Thumb({ file }) {
  return (
    <a
      href={downloadUrl(file.path, file.name)}
      download={file.name}
      title={`Download ${file.name}`}
      className="group/thumb relative block h-12 w-12 flex-shrink-0 overflow-hidden rounded-md border border-violet-200 bg-white"
      data-download-static={file.path}
    >
      <img src={publicUrl(file.path)} alt={file.name} className="h-full w-full object-cover" loading="lazy" />
      <span className="absolute bottom-0 right-0 rounded-tl bg-black/60 px-1 text-[9px] font-semibold text-white">{SIZE_LABEL[file.key] || file.key}</span>
    </a>
  )
}

function Row({ row, onDismiss, onNote }) {
  const first = row.waiting[0]
  const names = row.waiting.map((w) => w.name).join(', ')
  const notes = row.waiting.filter((w) => w.note)
  const noteLine = notes.map((w) => (row.waiting.length > 1 ? `${w.name}: ${w.note}` : w.note)).join(' · ')
  const href = publishStaticHref(row.id, row.waiting.map((w) => w.stamp))
  const line = `${row.waiting.length > 1 ? `${row.waiting.length} new statics: ` : ''}${names} · dropped ${ago(first.at)}${first.by ? ` by ${first.by}` : ''}`
  return (
    <li data-static-drop className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl bg-violet-50/70 px-3 py-2 ring-1 ring-violet-100 transition hover:bg-violet-50">
      <span className="inline-flex whitespace-nowrap rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-800 ring-1 ring-violet-200">
        New static dropped in
      </span>
      <Link to={href} className="min-w-0">
        <span className="block truncate text-sm font-semibold text-slate-900">
          {row.name}
          {row.internal && <span className="ml-1.5 text-[11px] font-normal text-slate-400">internal</span>}
          {!row.hasMeta && <span className="ml-1.5 text-[11px] font-normal text-amber-700">no Meta account yet</span>}
        </span>
        <span className="block truncate text-[11px] text-slate-500" title={names}>
          {line}
        </span>
        {noteLine && (
          <span className="block text-[11px] font-medium text-violet-800" title={noteLine} data-drop-note>
            📝 {noteLine}
          </span>
        )}
      </Link>
      <span className="flex flex-wrap items-center justify-end gap-2 text-[11px]">
        {/* The pictures themselves, one per size, each a download. */}
        {row.waiting.flatMap((w) => w.files.map((f) => <Thumb key={f.path} file={f} />))}
        {onNote && (
          <button
            type="button"
            title={noteLine ? 'Change the editor’s note' : 'Add a note for whoever publishes this'}
            onClick={() => onNote(row)}
            className="rounded-md px-1.5 py-0.5 text-violet-700 hover:bg-white hover:text-violet-900"
            data-edit-note
          >
            ✎ note
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            title="Take this off the board without publishing it here (it went up by hand, or it is not going out). The files stay with the client's saved ads."
            onClick={() => onDismiss(row)}
            className="rounded-md px-1.5 py-0.5 text-slate-400 hover:bg-white hover:text-slate-700"
            data-published-manually
          >
            Clear
          </button>
        )}
        <Link to={href} className="rounded-lg bg-violet-700 px-2.5 py-1 font-semibold text-white shadow-sm transition hover:bg-violet-800">
          Click to publish →
        </Link>
      </span>
    </li>
  )
}

/** Where the editor drops finished images. Pick the client, drop the files. */
function DropIn({ clients, onDropped }) {
  const [clientId, setClientId] = useState('')
  const [note, setNote] = useState('')
  const [me, setMe] = useState(() => {
    const raw = readMe()
    const fixed = personName(raw)
    if (fixed && fixed !== raw) saveMe(fixed)
    return fixed || raw
  })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const [dragging, setDragging] = useState(false)
  const input = useRef(null)
  const choices = (clients || []).filter((c) => !c.archived)
  const chosen = choices.find((c) => c.id === clientId)

  // The same "You" name the clip box and the Tasks page keep, asked once.
  const askMe = () => {
    const current = readMe() || me
    const hint = current && !personName(current) ? `"${current}" looks like a file, not a person. ` : ''
    const name = String(window.prompt(`${hint}Your name (the person dropping it in, not the client), so the board can say who it came from:`, personName(current)) || '').trim()
    if (name) {
      saveMe(name)
      setMe(name)
    }
    return name || current
  }

  const ingest = async (incoming) => {
    const files = [...(incoming || [])].filter((f) => isStaticFile(f.name))
    setError('')
    setDone(null)
    if (!chosen) {
      setError('Pick the client first, then drop the images.')
      return
    }
    if (files.length === 0) {
      setError('That was not an image. Drop .png or .jpg files.')
      return
    }
    const bad = files.map(validateStatic).find(Boolean)
    if (bad) {
      setError(bad)
      return
    }
    let who = readMe() || me
    if (who && who !== me) setMe(who)
    if (!personName(who)) who = askMe()
    try {
      setBusy(files.length > 1 ? `Uploading ${files.length} images…` : `Uploading ${files[0].name}…`)
      const sets = await uploadStatics({ clientId: chosen.id, files, uploadedBy: personName(who) || who, note })
      setDone({ client: chosen, sets, note: note.trim() })
      setNote('')
      onDropped?.()
    } catch (err) {
      setError(err.message)
      onDropped?.()
    } finally {
      setBusy('')
    }
  }

  return (
    <div
      className={`rounded-2xl border-2 border-dashed p-3 transition ${dragging ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-slate-50'}`}
      data-static-drop-zone
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
          🖼️
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Drop a finished static</p>
          <p className="text-[11px] text-slate-500">
            For editors: pick the client, drop the .png or .jpg. It lands with the client’s saved ads and shows up below, ready to publish with one click. Drop the 1:1, 4:5 and 9:16 of one ad together (same name, the size in the file name) and they go out as one ad.{' '}
            <span data-drop-as>
              {!me ? (
                'It will ask your name once.'
              ) : personName(me) ? (
                <>
                  Signed as <span className="font-semibold text-slate-700">{me}</span>.
                </>
              ) : (
                <span className="font-semibold text-amber-700">Signed as “{me}”, which looks like a file, not a person.</span>
              )}{' '}
              <button type="button" onClick={askMe} className="text-blue-700 hover:underline">
                {!me ? 'Set it now' : personName(me) ? 'Not you?' : 'Fix it'}
              </button>
            </span>
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
            title="Which client this static is for"
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
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="Note for whoever publishes (optional)"
            title="Goes with the static to the board and the publish screen"
            className="w-56 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
            data-drop-note-input
          />
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
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
            className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:opacity-50"
          >
            {busy || 'Choose images'}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      {done && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-violet-900">
          <span>
            ✓ {done.sets.length === 1 ? done.sets[0].name : `${done.sets.length} statics`} dropped in for {done.client.name}
            {personName(me) ? ` by ${me}` : ''}
            {done.sets.some((s) => s.files.length > 1) ? ` (${done.sets.map((s) => `${s.files.length} size${s.files.length === 1 ? '' : 's'}`).join(', ')})` : ''}.
            {done.note ? ` Note: “${done.note}”.` : ''}
          </span>
          {done.client.meta_ad_account_id ? (
            <Link to={publishStaticHref(done.client.id, done.sets.map((s) => s.stamp))} className="font-semibold text-violet-800 underline hover:text-violet-950">
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

export default function StaticDropBoard({ rows, clients, onDropped, className = '' }) {
  const [error, setError] = useState('')
  const dismiss = async (row) => {
    setError('')
    try {
      await dismissStatics({ clientId: row.id, storagePaths: row.waiting.flatMap((w) => w.files.map((f) => f.path)) })
      onDropped?.()
    } catch (err) {
      setError(err.message)
    }
  }
  // The note sits on every file of the set, so the board reads it whichever file comes first.
  const editNote = async (row) => {
    setError('')
    let changed = false
    try {
      for (const w of row.waiting) {
        const typed = window.prompt(`Note for whoever publishes ${w.name} (blank to clear):`, w.note || '')
        if (typed === null) continue
        for (const f of w.files) await setDropNote({ clientId: row.id, storagePath: f.path, note: typed })
        changed = true
      }
      if (changed) onDropped?.()
    } catch (err) {
      setError(err.message)
    }
  }
  const waiting = (rows || []).reduce((n, r) => n + r.waiting.length, 0)

  return (
    <section className={`rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5 ${className}`} data-static-board>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Dropped statics</h2>
          <p className="text-xs text-slate-500">Finished images from the editor, waiting to go out. Click a client to publish.</p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className={`rounded-lg px-2.5 py-1 font-semibold ${waiting ? 'bg-violet-100 text-violet-800' : 'bg-slate-100 text-slate-500'}`} data-static-waiting>
            {waiting} new static{waiting === 1 ? '' : 's'} to publish
          </span>
        </div>
      </div>

      <div className="mt-3">
        <DropIn clients={clients} onDropped={onDropped} />
      </div>

      {rows === null ? null : rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Nothing waiting. Drop a finished image above and it shows here.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {rows.map((r) => (
            <Row key={r.id} row={r} onDismiss={dismiss} onNote={editNote} />
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </section>
  )
}
