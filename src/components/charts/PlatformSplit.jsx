import { useState } from 'react'
import { money } from '../../lib/queries'

/**
 * Where the money went, as one bar.
 *
 * A stacked bar rather than a pie or a donut: this is part-to-whole across
 * three categories, and a bar keeps the segments on a common baseline so
 * "Instagram is about a fifth of Facebook" is readable rather than a judgement
 * about angles.
 *
 * Colours are categorical slots 1-3 of the validated palette, in order and
 * never cycled. Checked with the palette validator against this white surface:
 * lightness band, chroma floor, CVD separation (worst adjacent dE 9.2, target
 * 8) and normal-vision separation (27.6, floor 15) all pass. The aqua comes
 * back below 3:1 contrast, which obliges relief -- so every segment carries a
 * visible label and the table underneath is always available. Identity is never
 * colour alone here.
 */
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a']
// Anything that is not one of the named platforms is a remainder, and a
// remainder is grey rather than a fourth identity.
const OTHER = '#94a3b8'

function colourFor(entry, i) {
  return entry.key === 'other' ? OTHER : SERIES[i] || OTHER
}

const FORMATTERS = {
  spend: (v) => money(v),
  impressions: (v) => v.toLocaleString(),
  clicks: (v) => v.toLocaleString(),
  leads: (v) => String(v),
}

export default function PlatformSplit({ data, metric = 'spend', height = 44 }) {
  const [hover, setHover] = useState(null)
  const format = FORMATTERS[metric] || String
  const total = data.reduce((t, d) => t + d.value, 0)

  if (total <= 0) {
    return (
      <p className="text-sm text-slate-400">
        Nothing delivered in this range, so there is no split to show.
      </p>
    )
  }

  // Segments narrower than this cannot hold a label, so they get one in the
  // legend instead of a cramped one inside the bar.
  const LABEL_FLOOR = 0.12

  return (
    <div className="space-y-3">
      <div
        className="relative flex w-full overflow-hidden rounded-lg"
        style={{ height }}
        role="img"
        aria-label={data.map((d) => `${d.label} ${(d.share * 100).toFixed(0)}%`).join(', ')}
      >
        {data.map((d, i) => (
          <div
            key={d.key}
            onMouseEnter={() => setHover(d.key)}
            onMouseLeave={() => setHover(null)}
            className="relative flex items-center justify-center transition-opacity"
            style={{
              width: `${Math.max(d.share * 100, 1.5)}%`,
              background: colourFor(d, i),
              // The 2px surface gap the mark spec asks for between adjacent
              // fills, so two segments never read as one.
              marginRight: i < data.length - 1 ? 2 : 0,
              opacity: hover && hover !== d.key ? 0.55 : 1,
            }}
            title={`${d.label} — ${format(d.value)} (${(d.share * 100).toFixed(1)}%)`}
          >
            {d.share >= LABEL_FLOOR && (
              <span className="px-2 text-[11px] font-semibold tabular-nums text-white drop-shadow-sm">
                {(d.share * 100).toFixed(0)}%
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Always present, because with three series identity must not be
          colour alone -- and because two of these segments are usually too
          narrow to label inside the bar. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {data.map((d, i) => (
          <li
            key={d.key}
            className="flex items-center gap-1.5 text-xs"
            onMouseEnter={() => setHover(d.key)}
            onMouseLeave={() => setHover(null)}
          >
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
              style={{ background: colourFor(d, i) }}
              aria-hidden="true"
            />
            <span className="text-slate-700">{d.label}</span>
            <span className="tabular-nums text-slate-500">
              {format(d.value)} · {(d.share * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The same numbers as a table.
 *
 * Not an afterthought: the palette check flags one of these hues as under 3:1
 * on white, and the documented relief for that is visible labels or a table
 * view. It is also simply the better way to compare cost per lead across
 * platforms, which is the number that actually decides anything.
 */
export function PlatformTable({ data }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            {['Platform', 'Spend', 'Impressions', 'Clicks', 'Leads', 'Cost/lead'].map((h, i) => (
              <th
                key={h}
                className={`py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 ${
                  i === 0 ? 'text-left' : 'text-right'
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key} className="border-b border-slate-100 last:border-b-0">
              <td className="py-2 text-slate-700">{d.label}</td>
              <td className="py-2 text-right tabular-nums text-slate-900">{money(d.spend)}</td>
              <td className="py-2 text-right tabular-nums text-slate-600">
                {d.impressions.toLocaleString()}
              </td>
              <td className="py-2 text-right tabular-nums text-slate-600">
                {d.clicks.toLocaleString()}
              </td>
              <td className="py-2 text-right tabular-nums text-slate-900">{d.leads}</td>
              <td className="py-2 text-right tabular-nums font-medium text-slate-900">
                {d.costPerLead > 0 ? `$${d.costPerLead.toFixed(2)}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
