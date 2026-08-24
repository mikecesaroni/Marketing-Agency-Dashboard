import { useEffect, useMemo, useRef, useState } from 'react'
import { money } from '../lib/queries'
import { rollingAverage } from '../lib/dailySeries'

// Validated against the palette checker for this white surface: normal-vision
// dE 33.6, worst CVD dE 24.7, both clear of the floors, and each clears 3:1
// against the surface. Blue carries the daily value, orange the trend.
const DAILY = '#2A78D6'
const TREND = '#EB6834'
const GRID = '#E2E8F0'
const AXIS_TEXT = '#64748B'

const PAD = { top: 14, right: 14, bottom: 26, left: 54 }
const AVG_WINDOW = 7

// Axis ticks land on numbers a person would actually say out loud.
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

// A column with its data-end rounded and its baseline square, so the bar reads
// as growing out of the axis rather than floating.
function columnPath(x, y, w, h, r = 4) {
  const rad = Math.min(r, w / 2, h)
  if (h <= 0) return ''
  return (
    `M${x},${y + h}` +
    `L${x},${y + rad}` +
    `Q${x},${y} ${x + rad},${y}` +
    `L${x + w - rad},${y}` +
    `Q${x + w},${y} ${x + w},${y + rad}` +
    `L${x + w},${y + h}Z`
  )
}

function labelFor(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * Daily columns with a trailing average over the top.
 *
 * Two marks of the same measure rather than two measures: daily lead counts are
 * small integers that jump between 0 and 5, so the columns alone show noise and
 * the average alone hides the days that actually happened. One axis, always —
 * a second scale for the average would let it be drawn anywhere.
 */
export default function DailyChart({ series, metric, height = 240 }) {
  // Callers that only have one formatter get to reuse it for the axis.
  const axisFmt = metric.axis || metric.format
  const [active, setActive] = useState(null)
  const [width, setWidth] = useState(760)
  const wrapRef = useRef(null)

  // Measured rather than assumed: the card is fluid, and a fixed viewBox would
  // scale the type along with the plot instead of keeping it at 11px.
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

  const avg = useMemo(() => rollingAverage(series, metric.key, AVG_WINDOW), [series, metric.key])

  const plotW = width - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const n = series.length || 1
  const band = plotW / n

  const maxValue = Math.max(
    ...series.map((r) => r[metric.key]),
    ...avg.map((a) => a.value ?? 0),
    0
  )
  const ticks = niceTicks(maxValue)
  const top = ticks[ticks.length - 1] || 1
  const yOf = (v) => PAD.top + plotH - (v / top) * plotH
  const xOf = (i) => PAD.left + i * band

  // 2px surface gap between neighbours, capped so a short range does not draw
  // slabs. Below ~5px a column stops reading as a bar and the chart turns into
  // a barcode, so past that density the same data is drawn as an area instead.
  const barW = Math.min(24, Math.max(2, band - 2))
  const asArea = barW < 5

  const dailyPoints = series.map((r, i) => `${xOf(i) + band / 2},${yOf(r[metric.key])}`).join(' ')
  const areaPath = `M${PAD.left + band / 2},${PAD.top + plotH} L${dailyPoints.split(' ').join(' L')} L${
    xOf(series.length - 1) + band / 2
  },${PAD.top + plotH}Z`

  const linePoints = avg
    .map((a, i) => (a.value == null ? null : `${xOf(i) + band / 2},${yOf(a.value)}`))
    .filter(Boolean)
    .join(' ')

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
    const start = active == null ? series.length - 1 : active + step
    setActive(Math.min(series.length - 1, Math.max(0, start)))
  }

  if (series.length === 0) {
    return <p className="text-sm text-slate-500">No daily data in this range yet.</p>
  }

  const row = active != null ? series[active] : null
  const rowAvg = active != null ? avg[active]?.value : null
  // Keep the tooltip inside the card rather than letting it run off the edge.
  const tipLeft = active != null ? Math.min(Math.max(xOf(active) + band / 2, 90), width - 90) : 0

  return (
    <div className="relative" ref={wrapRef}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`${metric.label} by day, with a ${AVG_WINDOW} day average`}
        tabIndex={0}
        onKeyDown={onKey}
        onPointerMove={onMove}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        className="outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={yOf(t)}
              y2={yOf(t)}
              stroke={GRID}
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={yOf(t) + 4}
              textAnchor="end"
              fontSize="11"
              fill={AXIS_TEXT}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {axisFmt(t)}
            </text>
          </g>
        ))}

        {/* A wash behind the hovered day rather than dimming the other 89.
            Muting the whole chart to point at one column costs more than it
            gives. */}
        {active != null && (
          <>
            <rect
              x={xOf(active)}
              y={PAD.top}
              width={band}
              height={plotH}
              fill={DAILY}
              opacity="0.09"
            />
            <line
              x1={xOf(active) + band / 2}
              x2={xOf(active) + band / 2}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke={AXIS_TEXT}
              strokeWidth="1"
              strokeOpacity="0.35"
            />
          </>
        )}

        {asArea ? (
          <>
            <path d={areaPath} fill={DAILY} opacity="0.12" />
            <polyline
              points={dailyPoints}
              fill="none"
              stroke={DAILY}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        ) : (
          series.map((r, i) => {
            const y = yOf(r[metric.key])
            const h = PAD.top + plotH - y
            // A zero day draws nothing. A minimum-height stub would put ink
            // where there is no value, which is the reading people take from it.
            return (
              <path
                key={r.date}
                d={columnPath(xOf(i) + (band - barW) / 2, y, barW, h)}
                fill={DAILY}
              />
            )
          })
        )}

        {linePoints && (
          <polyline
            points={linePoints}
            fill="none"
            stroke={TREND}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {active != null && asArea && (
          <circle
            cx={xOf(active) + band / 2}
            cy={yOf(series[active][metric.key])}
            r="4"
            fill={DAILY}
            stroke="#FFFFFF"
            strokeWidth="2"
          />
        )}

        {active != null && rowAvg != null && (
          <circle
            cx={xOf(active) + band / 2}
            cy={yOf(rowAvg)}
            r="4"
            fill={TREND}
            stroke="#FFFFFF"
            strokeWidth="2"
          />
        )}

        {/* Only the ends and the middle get a date, so labels never collide. */}
        {[0, Math.floor(series.length / 2), series.length - 1]
          .filter((i, idx, arr) => arr.indexOf(i) === idx && series[i])
          .map((i) => (
            <text
              key={i}
              x={Math.min(Math.max(xOf(i) + band / 2, PAD.left + 16), width - PAD.right - 16)}
              y={height - 8}
              textAnchor="middle"
              fontSize="11"
              fill={AXIS_TEXT}
            >
              {labelFor(series[i].date)}
            </text>
          ))}
      </svg>

      {row && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg"
          style={{ left: tipLeft, top: 4 }}
        >
          <p className="text-[11px] font-medium text-slate-500">{labelFor(row.date)}</p>
          <div className="mt-1 space-y-0.5 text-xs">
            <p className="font-semibold text-slate-900 tabular-nums">
              {money(row.spend)} <span className="font-normal text-slate-500">spend</span>
            </p>
            <p className="font-semibold text-slate-900 tabular-nums">
              {row.leads} <span className="font-normal text-slate-500">
                {row.leads === 1 ? 'lead' : 'leads'}
              </span>
            </p>
            <p className="font-semibold text-slate-900 tabular-nums">
              {row.cpl > 0 ? `$${row.cpl.toFixed(2)}` : '—'}{' '}
              <span className="font-normal text-slate-500">cost/lead</span>
            </p>
            {rowAvg != null && (
              <p className="flex items-center gap-1.5 pt-0.5 text-slate-500">
                <span className="inline-block h-0.5 w-3 rounded" style={{ background: TREND }} />
                {AVG_WINDOW}-day avg {metric.format(rowAvg)}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span
            className={asArea ? 'inline-block h-0.5 w-4 rounded' : 'inline-block h-2.5 w-2.5 rounded-sm'}
            style={{ background: DAILY }}
          />
          {metric.label} per day
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: TREND }} />
          {AVG_WINDOW}-day average
        </span>
        <span className="ml-auto hidden sm:inline">Hover, or focus and use ← →</span>
      </div>
    </div>
  )
}
