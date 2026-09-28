import { useEffect, useRef, useState } from 'react'
import { CHANNELS, DARK } from '../../lib/channels'

const PAD = { top: 14, right: 14, bottom: 26, left: 54 }
const STACK = ['meta', 'google']

function niceTicks(max, count = 4) {
  if (max <= 0) return [0, 1]
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag
  const top = Math.ceil(max / step) * step
  const out = []
  for (let v = 0; v <= top + 1e-9; v += step) out.push(v)
  return out
}

function labelFor(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Rounded on the data end only, square on whatever it sits on.
function topRounded(x, y, w, h, r = 4) {
  if (h <= 0) return ''
  const rad = Math.min(r, w / 2, h)
  return `M${x},${y + h}L${x},${y + rad}Q${x},${y} ${x + rad},${y}L${x + w - rad},${y}Q${x + w},${y} ${x + w},${y + rad}L${x + w},${y + h}Z`
}

/**
 * Meta and Google by day, stacked, one axis.
 *
 * The point of the chart is the split: which channel carried which day. So
 * the channels stack (part of the day's whole) rather than sit side by side,
 * separated by a 2px surface gap, with the top segment rounded. A legend is
 * always shown; the tooltip gives both values and the total. LSA is not here
 * because it is logged weekly, not daily.
 */
export default function ChannelDailyChart({ series, format, axis, height = 260 }) {
  const [active, setActive] = useState(null)
  const [width, setWidth] = useState(760)
  const wrapRef = useRef(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const set = () => setWidth(Math.max(320, el.clientWidth))
    set()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (!series.length) return <p className="text-sm text-slate-500">No daily data in this range yet.</p>

  const plotW = width - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const band = plotW / series.length
  const barW = Math.min(22, Math.max(2, band - 3))
  const ticks = niceTicks(Math.max(...series.map((r) => r.total), 0))
  const top = ticks[ticks.length - 1] || 1
  const yOf = (v) => PAD.top + plotH - (v / top) * plotH
  const xOf = (i) => PAD.left + i * band + (band - barW) / 2
  const GAP = 2

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * width - PAD.left
    const i = Math.floor(x / band)
    setActive(i >= 0 && i < series.length ? i : null)
  }
  const onKey = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const step = e.key === 'ArrowLeft' ? -1 : 1
    setActive((a) => Math.min(series.length - 1, Math.max(0, a == null ? series.length - 1 : a + step)))
  }

  const row = active != null ? series[active] : null
  const tipLeft = active != null ? Math.min(Math.max(xOf(active) + barW / 2, 100), width - 100) : 0

  return (
    <div className="relative" ref={wrapRef}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label="Spend by day, Meta and Google stacked"
        tabIndex={0}
        onKeyDown={onKey}
        onPointerMove={onMove}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        className="rounded outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={yOf(t)} y2={yOf(t)} stroke={DARK.grid} strokeWidth="1" />
            <text x={PAD.left - 8} y={yOf(t) + 4} textAnchor="end" fontSize="11" fill={DARK.axis} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {axis(t)}
            </text>
          </g>
        ))}

        {active != null && <rect x={PAD.left + active * band} y={PAD.top} width={band} height={plotH} fill="#ffffff" opacity="0.04" />}

        {series.map((r, i) => {
          let base = 0
          const visible = STACK.filter((k) => r[k] > 0)
          return (
            <g key={r.date}>
              {STACK.map((k) => {
                const v = r[k]
                if (v <= 0) return null
                const y1 = yOf(base + v)
                const y0 = yOf(base)
                base += v
                const isTop = visible[visible.length - 1] === k
                // The gap is taken off the upper segment, so the stack
                // total still reads true against the axis.
                const h = Math.max(0, y0 - y1 - (visible[0] === k ? 0 : GAP))
                const y = y1
                return isTop ? (
                  <path key={k} d={topRounded(xOf(i), y, barW, h)} fill={CHANNELS[k].color} />
                ) : (
                  <rect key={k} x={xOf(i)} y={y} width={barW} height={h} fill={CHANNELS[k].color} />
                )
              })}
            </g>
          )
        })}

        {[0, Math.floor(series.length / 2), series.length - 1]
          .filter((i, idx, arr) => arr.indexOf(i) === idx && series[i])
          .map((i) => (
            <text key={i} x={Math.min(Math.max(PAD.left + i * band + band / 2, PAD.left + 16), width - PAD.right - 16)} y={height - 8} textAnchor="middle" fontSize="11" fill={DARK.axis}>
              {labelFor(series[i].date)}
            </text>
          ))}
      </svg>

      {row && (
        <div className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-white/10 bg-[#0b1220]/95 px-3 py-2 shadow-xl backdrop-blur" style={{ left: tipLeft, top: 4 }}>
          <p className="text-[11px] font-medium text-slate-400">{labelFor(row.date)}</p>
          <div className="mt-1 space-y-0.5 text-xs">
            {STACK.map((k) => (
              <p key={k} className="flex items-center gap-2 tabular-nums">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: CHANNELS[k].color }} />
                <span className="text-slate-400">{CHANNELS[k].label}</span>
                <span className="ml-auto font-semibold text-white">{format(row[k])}</span>
              </p>
            ))}
            <p className="flex items-center gap-2 border-t border-white/10 pt-0.5 tabular-nums">
              <span className="text-slate-400">Total</span>
              <span className="ml-auto font-semibold text-white">{format(row.total)}</span>
            </p>
          </div>
        </div>
      )}

      <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-400">
        {STACK.map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CHANNELS[k].color }} />
            {CHANNELS[k].long}
          </span>
        ))}
        <span className="ml-auto hidden text-slate-500 sm:inline">Hover, or focus and use ← →</span>
      </div>
    </div>
  )
}
