import { useEffect, useRef, useState } from 'react'
import { LAYOUTS, SIZES, ensureFonts, renderAd } from '../lib/adCanvas'
import { BATCH_MAX, BATCH_SIZE, planLabel, templatesFor } from '../lib/adBatch'

// The feed size, which is what the thumbnails show (as the template gallery does).
const THUMB_SIZE = SIZES.find((s) => s.key === 'feed') || SIZES[0]
const THUMB_W = 150

/**
 * Sample words for the tiles where there is no ad on a form yet (the
 * Content tab's door): a fall tune-up with a price, so every template has
 * something to paint.
 */
export const SAMPLE_CONTENT = {
  badge: 'Your town',
  hook: 'Furnace tune-up before the first freeze',
  offerAmount: '$89',
  offerDetail: 'Furnace tune-up',
  subhead: 'Book this week and the service call is on us',
  proof: '★ 4.9 on Google · 212 reviews',
  kicker: '',
  sticker: 'This week',
  offers: [
    { amount: '$89', detail: 'Tune-up' },
    { amount: '$0', detail: 'Down' },
  ],
  cutout: 'furnace',
  season: 'fall',
}

/**
 * The template picker for a batch: every look painted small, tick the ones
 * the ads should go on. One ticked and a count makes that many on it; a
 * few ticked make one each (or N each); nothing ticked leaves the choice
 * to the Studio. The tiles carry a number in the order they were ticked,
 * which is the order the ads come back in. `onMake`, when given, puts the
 * button on the picker itself.
 */
export default function LookPicker({ content = SAMPLE_CONTENT, assets = null, safeMode = 'reels', picked = [], onPicked, count = BATCH_SIZE, onCount, onMake, making = false }) {
  const refs = useRef({})
  const [stamp, setStamp] = useState(0)

  // Debounced like the gallery: twenty-nine paints per keystroke would make a form sticky.
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
      for (const l of LAYOUTS) {
        const dst = refs.current[l.key]
        if (!dst) continue
        try {
          renderAd(off, THUMB_SIZE, { ...c, layout: l.key }, a, { safeMode: m, guides: false })
          dst.width = THUMB_W
          dst.height = Math.round((THUMB_W * THUMB_SIZE.h) / THUMB_SIZE.w)
          dst.getContext('2d').drawImage(off, 0, 0, dst.width, dst.height)
        } catch (err) {
          console.warn(`Look ${l.key} did not paint:`, err.message)
        }
      }
    })
    return () => {
      cancelled = true
    }
  }, [stamp])

  // Six ads at most: with several ticked, the count is how many on each,
  // and the numbers past what fits are greyed out.
  const maxEach = picked.length <= 1 ? BATCH_MAX : Math.max(1, Math.floor(BATCH_MAX / Math.min(picked.length, BATCH_MAX)))
  const n = Math.max(1, Math.min(count, maxEach))
  const plan = templatesFor(picked, n)
  const label = planLabel(picked, n)
  const toggle = (key) => onPicked?.(picked.includes(key) ? picked.filter((k) => k !== key) : picked.length < BATCH_MAX ? [...picked, key] : picked)
  const photoLooks = LAYOUTS.filter((l) => l.group !== 'template')
  const templates = LAYOUTS.filter((l) => l.group === 'template')

  const tile = (l) => {
    const at = picked.indexOf(l.key)
    return (
      <button
        key={l.key}
        type="button"
        onClick={() => toggle(l.key)}
        title={l.hint}
        data-pick-look={l.key}
        aria-pressed={at >= 0}
        className={`relative min-w-0 rounded-lg border-2 p-1 text-left transition ${at >= 0 ? 'border-orange-600 bg-white' : 'border-transparent hover:border-slate-400'}`}
      >
        <canvas ref={(el) => (refs.current[l.key] = el)} className="block w-full rounded bg-slate-200" style={{ aspectRatio: `${THUMB_SIZE.w} / ${THUMB_SIZE.h}` }} />
        {at >= 0 && (
          <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white shadow" data-pick-order={at + 1}>
            {at + 1}
          </span>
        )}
        <span className={`mt-1 block truncate text-[11px] font-medium ${at >= 0 ? 'text-slate-900' : 'text-slate-600'}`}>{l.label}</span>
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-orange-200 bg-white p-3" data-look-picker>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-slate-700">Tick the templates the ads should go on</span>
        <span className="text-[11px] text-slate-500">One template and a number: that many ads on it. A few templates: one ad on each. Nothing ticked: the Studio picks.</span>
      </div>
      <p className="mt-2 text-[11px] font-medium text-slate-500">Photo looks: the client’s photo with the words on it</p>
      <div className="mt-1 grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2" data-pick-photo-looks>
        {photoLooks.map(tile)}
      </div>
      <p className="mt-3 text-[11px] font-medium text-slate-500">Templates: painted posters with the price, a sticker and the unit</p>
      <div className="mt-1 grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2" data-pick-templates>
        {templates.map(tile)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3">
        <span className="text-xs text-slate-600">{picked.length === 0 ? 'How many' : picked.length === 1 ? 'How many on it' : 'How many on each'}</span>
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5" data-pick-count>
          {Array.from({ length: BATCH_MAX }, (_, i) => i + 1).map((k) => (
            <button
              key={k}
              type="button"
              disabled={k > maxEach}
              onClick={() => onCount?.(k)}
              aria-pressed={n === k}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${n === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white'} disabled:cursor-not-allowed disabled:opacity-30`}
            >
              {k}
            </button>
          ))}
        </div>
        <span className="text-xs font-semibold text-orange-900" data-pick-plan>
          {label}
          {plan.length ? '' : ': the Studio picks the templates from the words and the season'}
        </span>
        {picked.length > 0 && (
          <button type="button" onClick={() => onPicked?.([])} className="text-[11px] text-slate-400 hover:text-slate-700 hover:underline">
            Clear
          </button>
        )}
        {onMake && (
          <button
            type="button"
            onClick={() => onMake(plan, plan.length || n)}
            disabled={making}
            data-pick-make
            className="ml-auto rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {making ? 'Writing…' : `✨ ${label}`}
          </button>
        )}
      </div>
    </div>
  )
}
