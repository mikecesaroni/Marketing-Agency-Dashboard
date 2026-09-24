import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ago } from '../lib/contentHub'
import { DROP_STATES, dropStats } from '../lib/videoLaunch'

/**
 * This week's video drops: one row per client, most behind first.
 *
 * The agency's promise is a fresh video ad per client per week, and the
 * only way to keep a promise like that across fifteen clients is a board
 * that says who has had theirs. Every row is a link into that client's
 * publish screen, which is where the clip goes in.
 *
 * Rows come from src/lib/videoDrops(): a video ad published in the last
 * seven days is done; ten days is due; more than two weeks is overdue.
 */

const TONES = {
  red: 'bg-red-100 text-red-800 ring-red-200',
  amber: 'bg-amber-100 text-amber-800 ring-amber-200',
  blue: 'bg-blue-50 text-blue-800 ring-blue-200',
  green: 'bg-green-100 text-green-800 ring-green-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
}

function StatePill({ state }) {
  const s = DROP_STATES[state] || DROP_STATES.due
  return (
    <span className={`inline-flex whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${TONES[s.tone]}`}>
      {s.label}
    </span>
  )
}

function Row({ row }) {
  const last = row.lastVideoAt ? `last video ${ago(row.lastVideoAt)}` : 'no video ad yet'
  return (
    <li>
      <Link
        to={`/client/${row.id}?open=publish`}
        data-drop={row.state}
        className="group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-slate-50"
      >
        <StatePill state={row.state} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900">
            {row.name}
            {row.internal && <span className="ml-1.5 text-[11px] font-normal text-slate-400">internal</span>}
          </span>
          <span className="block truncate text-[11px] text-slate-500" title={row.lastAdName}>
            {last}
            {row.lastAdName ? ` · ${row.lastAdName}` : ''}
            {row.thisWeek > 1 ? ` · ${row.thisWeek} this week` : ''}
          </span>
        </span>
        <span className="flex items-center gap-2 text-[11px]">
          {row.readyClips > 0 && row.state !== 'done' && (
            <span className="hidden rounded-md bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-800 sm:inline">
              {row.readyClips} clip{row.readyClips === 1 ? '' : 's'} ready
            </span>
          )}
          <span className="font-medium text-blue-700 opacity-0 transition group-hover:opacity-100">
            {row.state === 'done' ? 'Publish another →' : 'Publish a video →'}
          </span>
        </span>
      </Link>
    </li>
  )
}

export default function VideoDropBoard({ rows, compact = false }) {
  const [showAll, setShowAll] = useState(false)
  if (!rows) return null
  const stats = dropStats(rows)
  const withMeta = rows.filter((r) => r.state !== 'no-meta')
  const noMeta = rows.filter((r) => r.state === 'no-meta')
  const shown = compact && !showAll ? withMeta.filter((r) => r.state !== 'done').slice(0, 6) : withMeta
  const hidden = withMeta.length - shown.length

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">This week&rsquo;s video drops</h2>
          <p className="text-xs text-slate-500">
            One video ad per client per week. Most behind at the top; click a client to publish theirs.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-lg bg-green-50 px-2.5 py-1 font-semibold text-green-800">{stats.done} done</span>
          <span className={`rounded-lg px-2.5 py-1 font-semibold ${stats.due ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>
            {stats.due} to do
          </span>
          {stats.overdue > 0 && (
            <span className="rounded-lg bg-red-50 px-2.5 py-1 font-semibold text-red-800">{stats.overdue} overdue</span>
          )}
        </div>
      </div>

      {withMeta.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No client has a Meta ad account connected yet.</p>
      ) : shown.length === 0 ? (
        <p className="mt-4 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800">
          Every client has had a video this week. 🎉
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {shown.map((r) => (
            <Row key={r.id} row={r} />
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        {hidden > 0 && (
          <button type="button" onClick={() => setShowAll(true)} className="text-blue-700 hover:underline">
            show all {withMeta.length} clients
          </button>
        )}
        {compact && showAll && withMeta.length > 6 && (
          <button type="button" onClick={() => setShowAll(false)} className="text-blue-700 hover:underline">
            just the ones to do
          </button>
        )}
        {noMeta.length > 0 && (
          <span title={noMeta.map((r) => r.name).join(', ')}>
            {noMeta.length} client{noMeta.length === 1 ? ' has' : 's have'} no Meta ad account connected
          </span>
        )}
      </div>
    </section>
  )
}
