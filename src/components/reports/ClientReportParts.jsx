import { useMemo, useState } from 'react'
import { DTable, DTd, DTh, DTr, Panel } from './kit'
import { CHANNELS } from '../../lib/channels'
import { sortRows } from '../../lib/clientReportKit'

// The pieces the per-client Google Ads and Meta pages share.

/** A scorecard you click to chart, the way Google Ads and Ads Manager do. */
export function Scorecard({ label, value, delta, lowerIsBetter, on, onClick, channel = 'google' }) {
  const has = delta != null && Number.isFinite(delta)
  const flat = has && Math.abs(delta) < 0.5
  const good = !has || flat ? null : lowerIsBetter ? delta < 0 : delta > 0
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`relative overflow-hidden rounded-2xl border p-3.5 text-left transition ${
        on ? 'border-transparent bg-white/[0.07] ring-1' : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05]'
      }`}
      style={on ? { '--tw-ring-color': CHANNELS[channel].ring } : undefined}
    >
      {on && <span className="absolute inset-x-0 top-0 h-1" style={{ background: CHANNELS[channel].color }} />}
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-white tabular-nums">{value}</p>
      <p className="mt-1 text-xs">
        {has ? (
          <span className={good === null ? 'text-slate-400' : good ? 'text-emerald-300' : 'text-rose-300'}>
            {flat ? '±0%' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(0)}%`}
          </span>
        ) : (
          <span className="text-slate-600">no earlier period</span>
        )}
      </p>
    </button>
  )
}

/** A table whose headers sort, biggest first for numbers and A to Z for text. */
export function SortTable({ columns, rows, initial, empty, rowKey }) {
  const [sort, setSort] = useState(initial)
  const sorted = useMemo(() => sortRows(rows, sort.key, sort.dir), [rows, sort])
  if (!rows.length) return <Panel className="p-8 text-center text-sm text-slate-500">{empty}</Panel>
  const click = (c) =>
    setSort((s) => (s.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: c.numeric ? 'desc' : 'asc' }))
  return (
    <DTable>
      <thead>
        <tr>
          {columns.map((c) => (
            <DTh key={c.key} numeric={c.numeric}>
              <button type="button" onClick={() => click(c)} className="inline-flex items-center gap-1 uppercase hover:text-white">
                {c.label}
                {sort.key === c.key && <span aria-hidden="true">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
              </button>
            </DTh>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <DTr key={rowKey ? rowKey(r) : i}>
            {columns.map((c) => (
              <DTd key={c.key} numeric={c.numeric} muted={c.muted} className={c.className}>
                {c.render ? c.render(r) : r[c.key]}
              </DTd>
            ))}
          </DTr>
        ))}
      </tbody>
    </DTable>
  )
}
