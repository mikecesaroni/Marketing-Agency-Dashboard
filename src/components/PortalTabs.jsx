import { Link } from 'react-router-dom'
import { PORTAL_TABS, portalPath } from '../lib/clientPortal'

/**
 * The tab bar on every client page: the same private link, the client's
 * numbers and their video scripts (and whatever comes next) as tabs. Each
 * tab is a real link to its own address. `dark` matches the dashboard's
 * surface; the default matches the light pages.
 */
export default function PortalTabs({ token, active, dark = false }) {
  const shell = dark ? 'border-white/15 bg-white/[0.06]' : 'border-slate-200 bg-white shadow-sm'
  const on = dark ? 'bg-white text-slate-900 shadow' : 'bg-slate-900 text-white shadow'
  const off = dark ? 'text-slate-300 hover:bg-white/10 hover:text-white' : 'text-slate-700 hover:bg-slate-100'
  return (
    <nav aria-label="Your pages" className={`inline-flex rounded-xl border p-1 ${shell}`} data-portal-tabs>
      {PORTAL_TABS.map((t) => {
        const current = t.key === active
        return (
          <Link
            key={t.key}
            to={portalPath(t.key, token)}
            aria-current={current ? 'page' : undefined}
            title={t.hint}
            className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition ${current ? on : off}`}
            data-portal-tab={t.key}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
