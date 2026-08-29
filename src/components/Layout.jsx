import { NavLink } from 'react-router-dom'
import {
  IconDashboard,
  IconClients,
  IconDeliverables,
  IconPayments,
  IconReports,
  IconSops,
  IconAiSearch,
} from './ui'

// Grouped, because seven flat items give no clue which are the daily ones and
// which are looked at once a week. The daily work is the client roster; money
// and reporting are their own trip; the reference material is the tail.
const NAV_GROUPS = [
  {
    label: null,
    items: [
      { to: '/', label: 'Dashboard', short: 'Home', Icon: IconDashboard, end: true },
      { to: '/clients', label: 'Clients', short: 'Clients', Icon: IconClients },
      { to: '/deliverables', label: 'Deliverables', short: 'Work', Icon: IconDeliverables },
    ],
  },
  {
    label: 'Money',
    items: [
      { to: '/payments', label: 'Payments', short: 'Money', Icon: IconPayments },
      { to: '/reports', label: 'Reports', short: 'Reports', Icon: IconReports },
    ],
  },
  {
    label: 'Reference',
    items: [
      { to: '/sops', label: 'SOPs', short: 'SOPs', Icon: IconSops },
      { to: '/ai-search', label: 'AI Search', short: 'AI', Icon: IconAiSearch },
    ],
  },
]

const MOBILE_ITEMS = NAV_GROUPS.flatMap((g) => g.items)

export default function Layout({ title, subtitle, actions, children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-60 bg-slate-950 text-white">
        <div className="px-5 py-5">
          <div className="flex items-start gap-2.5">
            {/* A mark rather than a word. It is the one spot of brand colour in
                the chrome, which is what makes the rest read as calm. */}
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold">
              R
            </span>
            <p className="min-w-0 text-sm font-semibold leading-snug tracking-tight text-balance">
              Roundtable Marketing Agency CRM
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
          {NAV_GROUPS.map((group, i) => (
            <div key={group.label || i} className="space-y-0.5">
              {group.label && (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                  {group.label}
                </p>
              )}
              {group.items.map(({ to, label, Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    // The active row gets a rail down its left edge as well as
                    // a lighter background. Background alone, on a dark
                    // sidebar, is a difference you have to look for.
                    `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                      isActive
                        ? 'bg-white/10 font-medium text-white'
                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-blue-500 transition-opacity ${
                          isActive ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                      <Icon />
                      {label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-white/5 px-5 py-3">
          <p className="text-[11px] text-slate-500">Roundtable Marketing</p>
        </div>
      </aside>

      {/* MAIN */}
      <div className="md:pl-60">
        {/* Sticky, so the page title and its actions stay reachable down a long
            client page. Translucent rather than solid so content scrolling
            under it reads as depth instead of a seam. */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/85 px-4 py-4 backdrop-blur md:px-8 md:py-5">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">
                {title}
              </h1>
              {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
            </div>
            {/* Shrinkable on a phone so a long actions row scrolls inside itself
                instead of widening the document; fixed from md up where
                there is room for it. */}
            {actions && <div className="flex min-w-0 gap-2 md:flex-shrink-0">{actions}</div>}
          </div>
        </header>

        <main className="px-4 py-5 pb-28 md:px-8 md:py-8 md:pb-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>

      {/* MOBILE BOTTOM TABS */}
      {/* The inset keeps the tabs above the iPhone home indicator when this is
          launched from the home screen; it resolves to 0 in a normal browser. */}
      <nav
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white/95 backdrop-blur md:hidden"
      >
        {MOBILE_ITEMS.map(({ to, short, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition ${
                isActive ? 'text-blue-600' : 'text-slate-500'
              }`
            }
          >
            <Icon className="h-5 w-5" />
            {short}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
