import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ago } from '../lib/contentHub'
import { personName } from '../lib/videoLaunch'
import { SLOTS, assignSlots, isStaticFile, publishStaticHref, slotFit, slotsMissing, staticAdName, staticSizeGap, validateStatic } from '../lib/staticDrops'
import { addStaticSize, dismissStatics, measureImage, uploadStaticAd } from '../lib/staticDropStore'
import { writeCopyAhead } from '../lib/copyAhead'
import { downloadUrl, setDropNote } from '../lib/adVideoStore'
import { publicUrl } from '../lib/savedAds'
import { readMe, saveMe } from '../lib/tasksData'

/**
 * Dropped statics: the two boxes the editor drops a finished ad into, one
 * per size, and the list of what is waiting to publish.
 *
 * The clip board's twin ("make a separate box to drop in static images that
 * our editor is making for clients, make it so we can publish with a click
 * like the video ones"), then two boxes ("our editor is making these two
 * sizes for each static ad, 1080x1350 and 1080x1920 ... have 2 boxes labeled
 * with the size ... when I click publish it allocates the correct sizes to
 * the correct places on fb and ig"). Pick the client, put the 1080 × 1350
 * in the left box and the 1080 × 1920 in the right, Drop in: the two files
 * land as ONE ad, and the client's row appears below: "New static dropped in
 * · tuneup · 2h ago by Kyle · Click to publish". That click opens Publish
 * with the static already ticked and its words on the way, and the ad goes
 * out with the 4:5 on the feeds and the 9:16 on Stories and Reels
 * (meta-publish's placement rules, text options riding on both).
 *
 * Rows come from src/lib/staticDrops.js: only clients with a static
 * waiting; there is no weekly promise on statics, so nobody is "behind".
 */

const SIZE_LABEL = { square: '1:1', feed: '4:5', story: '9:16' }
const SIZE_WHERE = { square: '1:1, right column, Marketplace and search', feed: '4:5, the feeds', story: '9:16, Stories and Reels' }
const ACCEPT = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp'

function Thumb({ file }) {
  return (
    <a
      href={downloadUrl(file.path, file.name)}
      download={file.name}
      title={`${SIZE_WHERE[file.key] || file.key} · download ${file.name}`}
      className="group/thumb relative block h-12 w-12 flex-shrink-0 overflow-hidden rounded-md border border-violet-200 bg-white"
      data-download-static={file.path}
    >
      <img src={publicUrl(file.path)} alt={file.name} className="h-full w-full object-cover" loading="lazy" />
      <span className="absolute bottom-0 right-0 rounded-tl bg-black/60 px-1 text-[9px] font-semibold text-white">{SIZE_LABEL[file.key] || file.key}</span>
    </a>
  )
}

/**
 * The size a drop is missing, and the way to add it: a chip naming the
 * size, with a file picker that puts the file under the same stamp. The
 * pixels are checked, so the 4:5 cannot be added as the 9:16.
 */
function MissingSize({ clientId, set, onAdded, onError }) {
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const gap = staticSizeGap(set.files.map((f) => f.key))
  if (!gap) return null
  const add = async (file) => {
    if (!file) return
    setBusy(true)
    onError('')
    try {
      const px = await measureImage(file)
      const fit = slotFit(px.width, px.height, gap.missingKey)
      if (fit.key !== gap.missingKey) throw new Error(`${file.name} is ${px.width} × ${px.height}, a ${fit.key === 'feed' ? '4:5' : '9:16'}. ${set.name} needs the ${gap.label} (${gap.ratio}).`)
      await addStaticSize({ clientId, stamp: set.stamp, key: gap.missingKey, file, uploadedBy: readMe(), note: set.note })
      onAdded()
    } catch (err) {
      onError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200" data-missing-size={gap.missingKey}>
      ⚠ {set.name}: {gap.have} only, no {gap.ratio}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          add(file)
        }}
      />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="underline hover:text-amber-950 disabled:opacity-50" title={`Add the ${gap.label} to this ad; it goes out on ${gap.where}`}>
        {busy ? 'adding…' : `add the ${gap.label}`}
      </button>
    </span>
  )
}

function Row({ row, onDismiss, onNote, onAdded, onError }) {
  const first = row.waiting[0]
  const names = row.waiting.map((w) => w.name).join(', ')
  const notes = row.waiting.filter((w) => w.note)
  const noteLine = notes.map((w) => (row.waiting.length > 1 ? `${w.name}: ${w.note}` : w.note)).join(' · ')
  const href = publishStaticHref(row.id, row.waiting.map((w) => w.stamp))
  const line = `${row.waiting.length > 1 ? `${row.waiting.length} new statics: ` : ''}${names} · dropped ${ago(first.at)}${first.by ? ` by ${first.by}` : ''}`
  // The client's name and the drop line first, on their own line; the
  // pictures and the buttons underneath, so a half-width board (the two
  // drop boxes sit side by side) still says whose static it is.
  return (
    <li data-static-drop className="rounded-xl bg-violet-50/70 px-3 py-2 ring-1 ring-violet-100 transition hover:bg-violet-50">
      <div className="flex items-center gap-3">
        <span className="inline-flex whitespace-nowrap rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-800 ring-1 ring-violet-200">
          New static dropped in
        </span>
        <Link to={href} className="min-w-0 flex-1">
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
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-[11px]">
        {/* The pictures themselves, one per size, each a download; a set
            with one of its two sizes missing says so, with the way to add it. */}
        {row.waiting.flatMap((w) => w.files.map((f) => <Thumb key={f.path} file={f} />))}
        {row.waiting.map((w) => (
          <MissingSize key={`gap-${w.stamp}`} clientId={row.id} set={w} onAdded={onAdded} onError={onError} />
        ))}
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
      </div>
    </li>
  )
}

/**
 * One box: the size on it, where that size serves, and the image in it with
 * its pixels checked. Dropping on the box aims the file at this size; the
 * pixels can still send it to the other box (src/lib/staticDrops.js slotFit).
 */
function SlotBox({ slot, item, busy, onFiles, onClear }) {
  const input = useRef(null)
  const [over, setOver] = useState(false)
  const fit = item?.fit
  const sure = fit && !fit.warn && item.width > 0
  return (
    <div
      data-static-slot={slot.key}
      className={`relative flex min-h-[9.5rem] flex-col rounded-xl border-2 border-dashed p-2.5 transition ${
        over ? 'border-orange-400 bg-orange-50' : item ? 'border-violet-300 bg-white' : 'border-slate-300 bg-white/70'
      }`}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!over) setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(false)
        onFiles(e.dataTransfer?.files, slot.key)
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-slate-900">
          {slot.label} <span className="font-medium text-slate-500">({slot.ratio})</span>
        </p>
        {item && (
          <button type="button" onClick={onClear} className="text-xs text-slate-400 hover:text-slate-700" title="Take this image out of the box" data-slot-clear>
            ×
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-500">→ {slot.where}</p>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files || [])]
          e.target.value = ''
          if (files.length > 0) onFiles(files, slot.key)
        }}
      />
      {item ? (
        <div className="mt-2 flex items-center gap-2.5">
          <img
            src={item.url}
            alt=""
            className={`${slot.key === 'story' ? 'h-20 w-[2.8rem]' : 'h-20 w-16'} flex-shrink-0 rounded-md border border-slate-200 bg-slate-900 object-cover`}
          />
          <div className="min-w-0 text-[11px]">
            <p className="truncate font-medium text-slate-800" title={item.file.name}>
              {item.file.name}
            </p>
            <p className={sure ? 'text-emerald-700' : 'text-amber-700'} data-slot-fit>
              {sure ? '✓ ' : '⚠ '}
              {fit.note || `${item.width} × ${item.height}`}
            </p>
            <button type="button" disabled={busy} onClick={() => input.current?.click()} className="text-violet-700 hover:underline disabled:opacity-50">
              Swap
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="mt-2 flex flex-1 items-center justify-center rounded-lg bg-slate-50 px-2 py-4 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
          data-slot-choose
        >
          Drop the {slot.ratio} here, or choose it
        </button>
      )}
    </div>
  )
}

/** Where the editor drops one finished ad: the client, the two boxes, Drop in. */
function DropIn({ clients, onDropped }) {
  const [clientId, setClientId] = useState('')
  const [note, setNote] = useState('')
  const [about, setAbout] = useState('')
  const [name, setName] = useState('')
  const nameTouched = useRef(false)
  const [me, setMe] = useState(() => {
    const raw = readMe()
    const fixed = personName(raw)
    if (fixed && fixed !== raw) saveMe(fixed)
    return fixed || raw
  })
  // key -> { file, url, width, height, fit }. The ref is the truth between
  // renders, so two quick drops do not read a stale box.
  const [slots, setSlots] = useState({})
  const slotsRef = useRef({})
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [done, setDone] = useState(null)
  const [dragging, setDragging] = useState(false)
  const choices = (clients || []).filter((c) => !c.archived)
  const chosen = choices.find((c) => c.id === clientId)
  const slotFiles = Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, v.file]))
  const filled = SLOTS.filter((s) => slots[s.key])
  const missing = filled.length > 0 ? slotsMissing(slotFiles) : ''

  // The previews are object URLs; let them go when the board unmounts.
  useEffect(() => () => {
    for (const v of Object.values(slotsRef.current)) URL.revokeObjectURL(v.url)
  }, [])

  const setBoxes = (next) => {
    slotsRef.current = next
    setSlots(next)
  }

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

  // Files into the boxes: aimed at one box, or at the area around them.
  const place = async (incoming, target = '') => {
    const files = [...(incoming || [])]
    setError('')
    setInfo('')
    setDone(null)
    if (files.length === 0) return
    const notImage = files.find((f) => !isStaticFile(f.name))
    if (notImage) {
      setError(`${notImage.name} is not an image. Drop .png or .jpg files.`)
      return
    }
    const bad = files.map(validateStatic).find(Boolean)
    if (bad) {
      setError(bad)
      return
    }
    const measured = await Promise.all(files.map(async (file) => ({ file, name: file.name, ...(await measureImage(file)) })))
    const { placed, refused } = assignSlots(measured, target)
    const notes = []
    const next = { ...slotsRef.current }
    for (const [key, { file: m, fit }] of Object.entries(placed)) {
      if (next[key]) URL.revokeObjectURL(next[key].url)
      if (fit.moved) notes.push(fit.note)
      // The fit as seen from the box it ended up in, so the line under the
      // picture reads "✓ 1080 × 1920" and not "moved".
      next[key] = { file: m.file, url: URL.createObjectURL(m.file), width: m.width, height: m.height, fit: slotFit(m.width, m.height, key) }
    }
    setBoxes(next)
    if (!nameTouched.current) setName(staticAdName('', Object.fromEntries(Object.entries(next).map(([k, v]) => [k, v.file]))))
    if (refused.length) setError(refused.map((r) => r.why).join(' '))
    if (notes.length) setInfo(notes.join(' '))
  }

  const clearSlot = (key) => {
    const next = { ...slotsRef.current }
    if (next[key]) URL.revokeObjectURL(next[key].url)
    delete next[key]
    setBoxes(next)
    setError('')
    setInfo('')
  }

  const reset = () => {
    for (const v of Object.values(slotsRef.current)) URL.revokeObjectURL(v.url)
    setBoxes({})
    setName('')
    nameTouched.current = false
  }

  const dropIn = async () => {
    setError('')
    setInfo('')
    if (!chosen) {
      setError('Pick the client first.')
      return
    }
    if (filled.length === 0) {
      setError('Put the 1080 × 1350 and the 1080 × 1920 in their boxes first.')
      return
    }
    let who = readMe() || me
    if (who && who !== me) setMe(who)
    if (!personName(who)) who = askMe()
    try {
      setBusy(filled.length === 1 ? 'Dropping in one size…' : 'Dropping in both sizes…')
      const set = await uploadStaticAd({ clientId: chosen.id, name, files: slotFiles, uploadedBy: personName(who) || who, note, about })
      setDone({ client: chosen, set, note: note.trim(), sizes: filled.map((s) => s.ratio) })
      setNote('')
      setAbout('')
      reset()
      onDropped?.()
      // The words, started now: three of each written by copy-ahead before
      // anyone opens the publish page (src/lib/copyAhead.js).
      writeCopyAhead(chosen.id)
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
        place(e.dataTransfer?.files, '')
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg" aria-hidden>
          🖼️
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Drop a finished static</p>
          <p className="text-[11px] text-slate-500">
            For editors: pick the client, put the 1080 × 1350 in the left box and the 1080 × 1920 in the right (or drop both at once anywhere here and they sort themselves), then Drop in. They go out as one ad: the 4:5 on the feeds, the 9:16 on Stories and Reels.{' '}
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
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
          title="Which client this static is for"
          data-static-client
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
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
          data-drop-note-input
        />
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {SLOTS.map((slot) => (
          <SlotBox key={slot.key} slot={slot} item={slots[slot.key]} busy={Boolean(busy)} onFiles={place} onClear={() => clearSlot(slot.key)} />
        ))}
      </div>
      {filled.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-[11px] font-medium text-slate-600" htmlFor="static-ad-name">
            Ad name
          </label>
          <input
            id="static-ad-name"
            type="text"
            value={name}
            onChange={(e) => {
              nameTouched.current = true
              setName(e.target.value)
            }}
            maxLength={80}
            placeholder="tuneup"
            title="How the ad is listed on the board, the publish page and the gallery"
            className="w-44 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
            data-static-name
          />
          {/* What the ad is for, for the copy assistant, which also reads the
              picture itself. The note above is for whoever publishes. */}
          <input
            type="text"
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            maxLength={600}
            placeholder="What the ad is for, for the copy (optional): the offer, who it is aimed at, when it ends"
            title="The copy assistant reads this beside the picture when it writes the three text options"
            className="min-w-[16rem] flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
            data-static-about
          />
          {missing && (
            <span className="text-[11px] text-amber-700" data-slot-missing>
              {missing}
            </span>
          )}
          <button
            type="button"
            disabled={Boolean(busy) || !chosen}
            onClick={dropIn}
            title={chosen ? `Put this ad with ${chosen.name}'s saved ads, ready to publish` : 'Pick the client first'}
            className="ml-auto rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:opacity-50"
            data-static-drop-in
          >
            {busy || (chosen ? `Drop in for ${chosen.name} →` : 'Pick the client first')}
          </button>
        </div>
      )}
      {info && (
        <p className="mt-2 text-xs text-violet-800" data-slot-info>
          {info}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      {done && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-violet-900" data-static-done>
          <span>
            ✓ {done.set.name} dropped in for {done.client.name}
            {personName(me) ? ` by ${me}` : ''}, {done.sizes.join(' and ')}.{done.note ? ` Note: “${done.note}”.` : ''}
          </span>
          {done.client.meta_ad_account_id ? (
            <Link to={publishStaticHref(done.client.id, [done.set.stamp])} className="font-semibold text-violet-800 underline hover:text-violet-950">
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
          <p className="text-xs text-slate-500">Finished images from the editor, one box per size, waiting to go out. Click a client to publish.</p>
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
        <p className="mt-3 text-sm text-slate-500">Nothing waiting. Drop a finished ad above and it shows here.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {rows.map((r) => (
            <Row key={r.id} row={r} onDismiss={dismiss} onNote={editNote} onAdded={() => onDropped?.()} onError={setError} />
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </section>
  )
}
