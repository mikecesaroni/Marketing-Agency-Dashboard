import { Link } from 'react-router-dom'
import { PORTAL_TABS, portalPath } from '../lib/clientPortal'

/**
 * The tab bar on every client page, on a phone or a tablet: the same
 * private link, the client's numbers and their video scripts (and whatever
 * comes next) as tabs. Big, full width and stuck to the top of the screen,
 * so the way across is always in view: one tap, no hunting. Each tab is a
 * real link to its own address. `dark` matches the dashboard's surface;
 * the default matches the light pages. The current tab is orange on both.
 *
 * On a computer (lg and up) this bar hides and PortalSidebar takes over,
 * the way the CRM has its pages down the left.
 */

export const PORTAL_ICONS = {
  numbers: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
  scripts: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10l5-3v10l-5-3M7 10h5M7 14h3" />
    </svg>
  ),
}

export default function PortalTabs({ token, active, dark = false }) {
  const bar = dark ? 'bg-[#070b14]/90 supports-[backdrop-filter]:bg-[#070b14]/75' : 'bg-[#FBFBF8]/95 supports-[backdrop-filter]:bg-[#FBFBF8]/80'
  const shell = dark ? 'border-white/15 bg-white/[0.06]' : 'border-slate-200 bg-white shadow-sm'
  const on = 'bg-orange-500 text-white shadow-lg shadow-orange-900/30'
  const off = dark ? 'text-slate-200 hover:bg-white/10 hover:text-white' : 'text-slate-800 hover:bg-slate-100'
  const hintOn = 'text-orange-100'
  const hintOff = dark ? 'text-slate-400' : 'text-slate-500'
  return (
    <nav aria-label="Your pages" className={`sticky top-0 z-30 -mx-4 px-4 py-2 backdrop-blur md:-mx-8 md:px-8 lg:hidden ${bar}`} data-portal-tabs>
      <div className={`grid grid-cols-2 gap-1.5 rounded-2xl border p-1.5 ${shell}`}>
        {PORTAL_TABS.map((t) => {
          const current = t.key === active
          return (
            <Link
              key={t.key}
              to={portalPath(t.key, token)}
              aria-current={current ? 'page' : undefined}
              className={`flex min-h-[56px] items-center justify-center gap-2 rounded-xl px-2 py-2.5 transition sm:gap-3 sm:px-3 ${current ? on : off}`}
              data-portal-tab={t.key}
            >
              <span className="flex-shrink-0">{PORTAL_ICONS[t.key] || null}</span>
              <span className="min-w-0 text-left">
                <span className="block whitespace-nowrap text-[14px] font-bold leading-tight min-[400px]:text-[15px] sm:text-[17px]">{t.label}</span>
                <span className={`hidden text-[12px] font-medium leading-tight sm:block ${current ? hintOn : hintOff}`}>{current ? 'You are here' : t.hint}</span>
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
