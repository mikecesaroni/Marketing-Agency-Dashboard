import { Link } from 'react-router-dom'
import { NAV_GROUPS } from '../lib/nav'
import { useAuth } from '../context/AuthContext'
import { LOGIN_REQUIRED, navWithoutLogin, visibleNav } from '../lib/access'
import { IconLaunch } from './ui'

/**
 * The home screen: every part of the CRM as a tile.
 *
 * The sidebar covers this on a desk. On a phone the app was a strip of six
 * icons along the bottom, with the rest of the CRM behind a menu nobody
 * opened. Tiles are what a phone is for: one thumb, one tap, and the whole
 * app visible at once. Built from the same NAV_GROUPS as the sidebar and
 * the bar, filtered by the same role rules, so a page cannot be reachable
 * from one and not the other.
 *
 * `counts` is a map of path to a short live figure ("14 live", "3 open"),
 * from whatever the dashboard already loaded; a tile without one just shows
 * its blurb.
 */

// What each page is for, in the words the team uses. Gradients per tile so
// the grid reads as places rather than a list of links.
const TILES = {
  '/clients': { blurb: 'Every client, where they stand, and their page.', tone: 'from-blue-600 to-sky-400' },
  '/content': { blurb: 'Ad Studio, Google Drive folders, and the weekly video board.', tone: 'from-orange-500 to-amber-400' },
  '/deliverables': { blurb: 'Who is set up, who is waiting on what.', tone: 'from-violet-600 to-fuchsia-400' },
  '/tasks': { blurb: 'The team’s tasks, by person and by client.', tone: 'from-slate-800 to-slate-600' },
  '/payments': { blurb: 'Invoices, Stripe, what is paid and what is late.', tone: 'from-emerald-600 to-teal-400' },
  '/reports': { blurb: 'Weekly numbers per client and across the book.', tone: 'from-cyan-600 to-blue-400' },
  '/sops': { blurb: 'How we do things, written down.', tone: 'from-rose-500 to-pink-400' },
  '/ai-search': { blurb: 'Ask the CRM anything about any client.', tone: 'from-indigo-600 to-violet-400' },
  '/guide': { blurb: 'What every page does, for new people and agents.', tone: 'from-stone-600 to-stone-400' },
  '/team': { blurb: 'Who has access and what they can see.', tone: 'from-zinc-700 to-zinc-500' },
}

// One extra tile that is not a nav item: the week's job, straight in.
const PUBLISH_TILE = {
  to: '/content?tab=publish&kind=video',
  label: 'Publish a video',
  blurb: 'Drop the clip, pick the words, send it into the funnel.',
  tone: 'from-emerald-600 to-teal-400',
  Icon: IconLaunch,
}

function Tile({ to, label, blurb, tone, Icon, count }) {
  return (
    <Link
      to={to}
      className={`group relative flex min-h-[7.5rem] flex-col overflow-hidden rounded-2xl bg-gradient-to-br ${tone} p-4 text-white shadow-md ring-4 ring-transparent transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-white/40 md:min-h-[8.5rem]`}
    >
      <div className="flex items-start justify-between">
        <span className="rounded-xl bg-white/20 p-2 backdrop-blur">
          <Icon className="h-5 w-5" />
        </span>
        {count && <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[11px] font-semibold backdrop-blur">{count}</span>}
      </div>
      <p className="mt-auto pt-3 text-base font-bold leading-tight tracking-tight">{label}</p>
      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/85">{blurb}</p>
    </Link>
  )
}

export default function HomeTiles({ counts = {} }) {
  const { role } = useAuth()
  const groups = LOGIN_REQUIRED ? visibleNav(NAV_GROUPS, role) : navWithoutLogin(NAV_GROUPS)
  const items = groups
    .flatMap((g) => g.items)
    .filter((i) => i.to !== '/' && TILES[i.to])
    .map((i) => ({ ...i, ...TILES[i.to], count: counts[i.to] }))
  // The publish tile sits right after Content, where the week's work is.
  const at = items.findIndex((i) => i.to === '/content')
  const tiles = [...items.slice(0, at + 1), PUBLISH_TILE, ...items.slice(at + 1)]

  return (
    <section className="mb-6 md:mb-8" aria-label="Home">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {tiles.map((t) => (
          <Tile key={t.to} {...t} />
        ))}
      </div>
    </section>
  )
}
