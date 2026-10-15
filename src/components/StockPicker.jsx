import { useEffect, useRef, useState } from 'react'
import { deleteStock, listStock, stockKey, stockPath, uploadStock } from '../lib/stockLibrary'

/**
 * The stock library, opened from a template's Cutout row: the agency's
 * equipment photos (shared by every client), with upload and remove.
 * Picking one sets the cutout to `stock:<path>`.
 */
export default function StockPicker({ value, onChange, onClose }) {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const current = stockPath(value)

  const load = () => {
    setError('')
    listStock()
      .then(setItems)
      .catch((err) => {
        setItems([])
        setError(err.message)
      })
  }
  useEffect(load, [])

  const upload = async (file) => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const path = await uploadStock(file)
      onChange(stockKey(path))
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const remove = async (path) => {
    if (!window.confirm('Remove this image from the stock library? Ads already saved with it keep their pixels; reopening one to edit will have no cutout.')) return
    setBusy(true)
    try {
      await deleteStock(path)
      if (current === path) onChange('')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2" data-stock-picker>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-800">Stock library</p>
          <p className="text-[11px] text-slate-500">
            Equipment photos shared by every client: a condenser, a furnace, a boiler, a water heater, the van. A PNG with a
            transparent background sits in the ad like a cutout; a JPEG is painted as is, white box and all.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${busy ? 'opacity-50' : ''} bg-slate-900 text-white hover:bg-slate-800`}>
            {busy ? 'Working…' : 'Upload image'}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} data-stock-upload />
          </label>
          <button type="button" onClick={onClose} className="text-[11px] text-slate-500 hover:text-slate-800">
            Close
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {items === null ? (
        <p className="text-xs text-slate-400">Loading the library…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-slate-500">Nothing in the library yet. Upload a cutout of an AC unit or a furnace and it is here for every client.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {items.map((it) => (
            <div key={it.path} className="relative">
              <button
                type="button"
                onClick={() => onChange(stockKey(it.path))}
                title={it.name}
                data-stock-item={it.path}
                className={`block w-full rounded-lg border-2 bg-[linear-gradient(45deg,#f1f5f9_25%,transparent_25%,transparent_75%,#f1f5f9_75%),linear-gradient(45deg,#f1f5f9_25%,#fff_25%,#fff_75%,#f1f5f9_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px] p-1 ${
                  current === it.path ? 'border-slate-900' : 'border-slate-200 hover:border-slate-400'
                }`}
              >
                <img src={it.url} alt={it.name} className="h-20 w-full object-contain" loading="lazy" />
                <span className="mt-1 block truncate text-[10px] text-slate-600">{it.name}</span>
              </button>
              <button
                type="button"
                onClick={() => remove(it.path)}
                title="Remove from the library"
                className="absolute right-1 top-1 rounded bg-white/90 px-1 text-[10px] text-slate-500 hover:text-red-600"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
