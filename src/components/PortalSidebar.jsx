import { Link } from 'react-router-dom'
import { PORTAL_TABS, portalPath } from '../lib/clientPortal'
import { PORTAL_ICONS } from './PortalTabs'

const AGENCY = 'The Working Class Marketing'

/**
 * The client's pages down the left on a computer, the way the CRM has its
 * own: the mark, the client's name, one entry per tab (icon, label, a
 * one-line hint) with the current one orange, and a line on how to reach
 * us. Fixed to the left edge from lg up; below that it hides and the
 * sticky PortalTabs bar at the top does the job. The page that renders it
 * adds lg:pl-64 to its root so its content clears the sidebar.
 */
export default function PortalSidebar({ token, active, name = '' }) {
  return (
    <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-64 lg:flex-col bg-slate-950 text-white" data-portal-sidebar>
      <div className="flex items-center gap-2.5 px-5 pt-5">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#f8f7f5]">
          <img src="/brand/wc-mark.jpg" alt="The Working Class" className="h-10 w-10 object-contain" />
        </span>
        <span className="text-sm font-semibold tracking-tight text-slate-100">The Working Class</span>
      </div>
      <div className="px-5 pb-4 pt-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Your page</p>
        {name && <p className="mt-1 truncate text-[15px] font-semibold text-white">{name}</p>}
      </div>
      <nav className="flex-1 space-y-1 px-3" aria-label="Your pages">
        {PORTAL_TABS.map((t) => {
          const current = t.key === active
          return (
            <Link
              key={t.key}
              to={portalPath(t.key, token)}
              aria-current={current ? 'page' : undefined}
              className={`flex items-start gap-3 rounded-xl px-3 py-3 transition ${current ? 'bg-orange-500 text-white shadow-lg shadow-orange-900/30' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
              data-portal-side={t.key}
            >
              <span className="mt-0.5 flex-shrink-0">{PORTAL_ICONS[t.key] || null}</span>
              <span className="min-w-0">
                <span className="block text-[15px] font-bold leading-tight">{t.label}</span>
                <span className={`mt-0.5 block text-[12px] leading-snug ${current ? 'text-orange-100' : 'text-slate-500'}`}>{current ? 'You are here' : t.hint}</span>
              </span>
            </Link>
          )
        })}
      </nav>
      <div className="px-5 py-5 text-[12px] leading-relaxed text-slate-500">
        Questions? Reply to your Monday email and a real person answers.
        <span className="mt-1 block text-slate-600">{AGENCY}</span>
      </div>
    </aside>
  )
}
