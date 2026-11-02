import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_RADIUS_MILES,
  MAX_RADIUS_MILES,
  MIN_RADIUS_MILES,
  clampRadius,
  lookupZips,
  searchLocations,
} from '../lib/metaPublish'
import { pasteSummary, zipKey, zipsFromText } from '../lib/zipList'

const TYPE_LABEL = { city: 'City', region: 'State', zip: 'ZIP', country: 'Country' }

/**
 * Picks the geo targeting for an ad set.
 *
 * Deliberately not a text box. Meta targets keys it issued itself, so a typed
 * "Rochester" is not targeting — every location here comes back from Meta's own
 * geo search and carries the key the API will accept.
 *
 * Only cities take a radius. A state or a postcode is the area it is, and
 * sending a radius alongside one is rejected.
 *
 * The radius slider stops at ten miles because Meta stops there. Tighter than
 * that and it rejects the ad set outright, so the slider is the place to hold
 * the line rather than letting a 7 through and surfacing it as a publish error.
 */
export default function LocationPicker({ picked, onChange }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  // Guards against a slow early request landing after a later one and
  // overwriting good results with stale ones.
  const seq = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }

    // Typing "Rochester" is nine keystrokes and nine round trips to Meta
    // without this.
    const mine = ++seq.current
    const timer = setTimeout(() => {
      setSearching(true)
      setError('')
      searchLocations(q)
        .then((found) => {
          if (seq.current === mine) setResults(found)
        })
        .catch((err) => {
          if (seq.current === mine) setError(err.message)
        })
        .finally(() => {
          if (seq.current === mine) setSearching(false)
        })
    }, 350)

    return () => clearTimeout(timer)
  }, [query])

  // A location picked before the floor existed -- or prefilled from an intake
  // that asked for five miles -- is still carrying its old number in the
  // parent's state, and that number is what gets sent. Showing 10 on the slider
  // while 7 goes to Meta would be the same failure with a nicer face on it, so
  // correct the value itself, once, as soon as it is seen.
  useEffect(() => {
    const fixed = picked.map((p) =>
      p.type === 'city' && p.radius !== clampRadius(p.radius) ? { ...p, radius: clampRadius(p.radius) } : p
    )
    if (fixed.some((p, i) => p !== picked[i])) onChange(fixed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked])

  const add = (loc) => {
    if (picked.some((p) => p.key === loc.key)) return
    onChange([...picked, { ...loc, radius: loc.type === 'city' ? DEFAULT_RADIUS_MILES : undefined }])
    setQuery('')
    setResults([])
  }

  const remove = (key) => onChange(picked.filter((p) => p.key !== key))

  const setRadius = (key, radius) =>
    onChange(picked.map((p) => (p.key === key ? { ...p, radius } : p)))

  // A pasted list of ZIPs, the way a client sends their service area. Every
  // five-digit ZIP in the text is checked with Meta in one call and the ones
  // Meta knows go on as ZIP targeting; the rest are named so nobody assumes
  // they went in.
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasting, setPasting] = useState(false)
  const [pasteNote, setPasteNote] = useState('')

  const addPasted = async () => {
    const zips = zipsFromText(pasteText)
    if (!zips.length) {
      setPasteNote(pasteSummary({}))
      return
    }
    const have = new Set(picked.map((p) => p.key))
    const fresh = zips.filter((z) => !have.has(zipKey(z)))
    const already = zips.length - fresh.length
    if (!fresh.length) {
      setPasteNote(pasteSummary({ already }))
      return
    }
    setPasting(true)
    setError('')
    setPasteNote(`Checking ${fresh.length} ZIP${fresh.length === 1 ? '' : 's'} with Meta…`)
    try {
      const { locations, missing } = await lookupZips(fresh)
      if (locations.length) onChange([...picked, ...locations.map((loc) => ({ ...loc, radius: undefined }))])
      setPasteNote(pasteSummary({ added: locations.length, already, missing }))
      if (locations.length) setPasteText('')
    } catch (err) {
      setPasteNote('')
      setError(err.message)
    } finally {
      setPasting(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a city, state or ZIP…"
          className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
        />
        {searching && (
          <span className="absolute right-3 top-2.5 text-[11px] text-slate-400">searching…</span>
        )}

        {results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-300 rounded-lg shadow-lg">
            {results.map((loc) => {
              const already = picked.some((p) => p.key === loc.key)
              return (
                <li key={`${loc.type}-${loc.key}`}>
                  <button
                    onClick={() => add(loc)}
                    disabled={already}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{loc.label}</span>
                    <span className="text-[11px] text-slate-400 flex-shrink-0">
                      {already ? 'added' : TYPE_LABEL[loc.type] || loc.type}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div>
        <button
          type="button"
          onClick={() => setPasteOpen((v) => !v)}
          className="text-[11px] text-blue-700 hover:underline"
          data-paste-zips
        >
          {pasteOpen ? 'Hide the ZIP list' : 'Paste a list of ZIPs'}
        </button>
        {pasteOpen && (
          <div className="mt-1.5 space-y-1.5">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={4}
              placeholder={'Paste what the client sent: 27601, 27603 27605\n27609 ... Words around the numbers are fine.'}
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm font-mono"
              disabled={pasting}
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={addPasted}
                disabled={pasting || !pasteText.trim()}
                className="px-3 py-1.5 bg-slate-900 text-white rounded text-xs font-semibold disabled:opacity-50"
              >
                {pasting ? 'Checking with Meta…' : `Add ${zipsFromText(pasteText).length || ''} ZIP${zipsFromText(pasteText).length === 1 ? '' : 's'}`.replace('  ', ' ')}
              </button>
              {pasteNote && <span className="text-[11px] text-slate-600">{pasteNote}</span>}
            </div>
            <p className="text-[11px] text-slate-400">
              Each ZIP is checked with Meta and goes on as its own area, no radius. Up to a thousand at a time.
            </p>
          </div>
        )}
      </div>

      {picked.length === 0 ? (
        <p className="text-[11px] text-slate-400">
          Nothing targeted yet. An ad set needs at least one location.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {picked.map((loc) => (
            <li
              key={loc.key}
              className="flex items-center gap-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-800 truncate">{loc.label}</p>
                <p className="text-[11px] text-slate-400">{TYPE_LABEL[loc.type] || loc.type}</p>
              </div>

              {loc.type === 'city' && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <input
                    type="range"
                    min={MIN_RADIUS_MILES}
                    max={MAX_RADIUS_MILES}
                    value={clampRadius(loc.radius ?? DEFAULT_RADIUS_MILES)}
                    onChange={(e) => setRadius(loc.key, clampRadius(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-[11px] text-slate-500 w-12 tabular-nums">
                    {clampRadius(loc.radius ?? DEFAULT_RADIUS_MILES)} mi
                  </span>
                </div>
              )}

              <button
                onClick={() => remove(loc.key)}
                className="text-[11px] text-slate-400 hover:text-red-600 flex-shrink-0"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
