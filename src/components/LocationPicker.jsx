import { useEffect, useRef, useState } from 'react'
import { DEFAULT_RADIUS_MILES, MAX_RADIUS_MILES, searchLocations } from '../lib/metaPublish'

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

  const add = (loc) => {
    if (picked.some((p) => p.key === loc.key)) return
    onChange([...picked, { ...loc, radius: loc.type === 'city' ? DEFAULT_RADIUS_MILES : undefined }])
    setQuery('')
    setResults([])
  }

  const remove = (key) => onChange(picked.filter((p) => p.key !== key))

  const setRadius = (key, radius) =>
    onChange(picked.map((p) => (p.key === key ? { ...p, radius } : p)))

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
                    min={1}
                    max={MAX_RADIUS_MILES}
                    value={loc.radius ?? DEFAULT_RADIUS_MILES}
                    onChange={(e) => setRadius(loc.key, Number(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-[11px] text-slate-500 w-12 tabular-nums">
                    {loc.radius ?? DEFAULT_RADIUS_MILES} mi
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
