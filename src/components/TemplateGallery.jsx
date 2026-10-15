import { useEffect, useRef, useState } from 'react'
import { SIZES, TEMPLATE_LAYOUTS, ensureFonts, renderAd } from '../lib/adCanvas'

// The feed size, which is what the thumbnails show: the shape most of the
// reference posters were, and the middle of the three.
const THUMB_SIZE = SIZES.find((s) => s.key === 'feed') || SIZES[0]
const THUMB_W = 150

/**
 * The template gallery: every template painted small with the words and the
 * colours on the form, so choosing one is choosing by eye and not by name.
 * Repainted a beat after the last edit rather than on every keystroke.
 */
export default function TemplateGallery({ content, assets, safeMode, layout, onPick }) {
  const refs = useRef({})
  const [stamp, setStamp] = useState(0)
  // Templates where these words overlap or run past the edge (adAudit.js), flagged on the tile.
  const [flags, setFlags] = useState({})

  // Debounce: fourteen full paints per keystroke would make the form sticky.
  const latest = useRef({ content, assets, safeMode })
  latest.current = { content, assets, safeMode }
  useEffect(() => {
    const t = setTimeout(() => setStamp((n) => n + 1), 250)
    return () => clearTimeout(t)
  }, [content, assets, safeMode])

  useEffect(() => {
    let cancelled = false
    ensureFonts().then(() => {
      if (cancelled) return
      const { content: c, assets: a, safeMode: m } = latest.current
      const off = document.createElement('canvas')
      const next = {}
      for (const t of TEMPLATE_LAYOUTS) {
        const dst = refs.current[t.key]
        if (!dst) continue
        try {
          const out = renderAd(off, THUMB_SIZE, { ...c, layout: t.key }, a, { safeMode: m, guides: false })
          next[t.key] = (out?.problems || []).length
          dst.width = THUMB_W
          dst.height = Math.round((THUMB_W * THUMB_SIZE.h) / THUMB_SIZE.w)
          const ctx = dst.getContext('2d')
          ctx.drawImage(off, 0, 0, dst.width, dst.height)
        } catch (err) {
          console.warn(`Template ${t.key} did not paint:`, err.message)
        }
      }
      setFlags(next)
    })
    return () => {
      cancelled = true
    }
  }, [stamp])

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-template-gallery>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">Templates</span>
        <span className="text-[11px] text-slate-500">
          Painted posters for the season: SALE, prices, stickers, a furnace or a condenser in the corner. Click one to use it;
          the words on the form go on it.
        </span>
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {TEMPLATE_LAYOUTS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onPick(t.key)}
            title={flags[t.key] ? `${t.hint}. With these words something overlaps on this template.` : t.hint}
            data-look={t.key}
            data-template={t.key}
            data-tile-problems={flags[t.key] || 0}
            aria-pressed={layout === t.key}
            className={`relative flex-shrink-0 rounded-lg border-2 p-1 text-left transition ${
              layout === t.key ? 'border-slate-900 bg-white' : 'border-transparent hover:border-slate-400'
            }`}
          >
            <canvas ref={(el) => (refs.current[t.key] = el)} className="block rounded bg-slate-200" style={{ width: THUMB_W }} />
            {flags[t.key] > 0 && <span className="absolute right-2 top-2 rounded bg-amber-400 px-1 text-[10px] font-bold text-slate-900" title="Something overlaps with these words">⚠</span>}
            <span className={`mt-1 block text-[11px] font-medium ${layout === t.key ? 'text-slate-900' : 'text-slate-600'}`}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
