import { useEffect, useRef, useState } from 'react'
import { DARK } from '../../lib/channels'

/**
 * One metric over time, as a line: the chart under Google Ads' scorecards.
 *
 * One series and one axis per chart. When two metrics are picked the page
 * stacks two of these rather than putting two scales on one chart, so a
 * line going up always means the number went up. Hovering anywhere shows
 * the day and its value on a crosshair.
 */
export default function MetricLineChart({ points, label, format, color, height = 190 }) {
  const wrap = useRef(null)
  const [width, setWidth] = useState(720)
  const [hover, setHover] = useState(null)

  useEffect(() => {
    const el = wrap.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pad = { top: 12, right: 12, bottom: 26, left: 52 }
  const w = width - pad.left - pad.right
  const h = height - pad.top - pad.bottom
  const values = points.map((p) => Number(p.value || 0))
  const max = niceMax(Math.max(0, ...values))
  const n = points.length
  const x = (i) => pad.left + (n <= 1 ? w / 2 : (i / (n - 1)) * w)
  const y = (v) => pad.top + h - (max > 0 ? (v / max) * h : 0)

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(Number(p.value || 0)).toFixed(1)}`).join('')
  const area = n ? `${line}L${x(n - 1).toFixed(1)},${pad.top + h}L${x(0).toFixed(1)},${pad.top + h}Z` : ''
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f)
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 90))))

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * width
    const i = Math.round(((px - pad.left) / Math.max(1, w)) * (n - 1))
    setHover(Math.min(n - 1, Math.max(0, i)))
  }

  const hp = hover != null ? points[hover] : null
  const tipLeft = hover != null ? Math.min(Math.max(x(hover), 70), width - 70) : 0
  const gradId = `mlc-${label.replace(/\W/g, '')}`

  return (
    <div ref={wrap} className="relative w-full select-none">
      <svg width={width} height={height} role="img" aria-label={`${label} by day`} className="block">
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={DARK.grid} strokeWidth="1" />
            <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={DARK.axis}>
              {format(t, true)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % every === 0 || i === n - 1 ? (
            <text key={p.date} x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="11" fill={DARK.axis}>
              {shortDate(p.date)}
            </text>
          ) : null
        )}
        {n > 0 && <path d={area} fill={`url(#${gradId})`} />}
        {n > 0 && <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {hp && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + h} stroke={DARK.trend} strokeOpacity="0.35" strokeWidth="1" />
            <circle cx={x(hover)} cy={y(Number(hp.value || 0))} r="4.5" fill={color} stroke={DARK.panel} strokeWidth="2" />
          </g>
        )}
        <rect
          x={pad.left}
          y={pad.top}
          width={Math.max(1, w)}
          height={h}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          onTouchStart={(e) => onMove(e.touches[0] ? { clientX: e.touches[0].clientX, currentTarget: e.currentTarget } : e)}
        />
      </svg>
      {hp && (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg border border-white/10 bg-slate-950/95 px-3 py-2 text-xs shadow-xl"
          style={{ left: tipLeft }}
        >
          <p className="text-slate-400">{longDate(hp.date)}</p>
          <p className="mt-0.5 flex items-center gap-1.5 font-semibold text-white">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            {label}: {format(Number(hp.value || 0))}
          </p>
        </div>
      )}
    </div>
  )
}

/** A round top for the axis: 1, 2, 2.5 or 5 times a power of ten. */
function niceMax(v) {
  if (!(v > 0)) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p
  return 10 * p
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function shortDate(iso) {
  const [, m, d] = String(iso).split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}
function longDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}
