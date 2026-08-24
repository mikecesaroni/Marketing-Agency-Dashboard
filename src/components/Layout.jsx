import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: '📊', end: true },
  { to: '/clients', label: 'Clients', short: 'Clients', icon: '👥' },
  { to: '/deliverables', label: 'Deliverables', short: 'Work', icon: '📦' },
  { to: '/payments', label: 'Payments', short: 'Money', icon: '💰' },
  { to: '/reports', label: 'Reports', short: 'Reports', icon: '📈' },
  { to: '/sops', label: 'SOPs', short: 'SOPs', icon: '📖' },
]

export default function Layout({ title, subtitle, actions, children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-56 bg-slate-900 text-white">
        <div className="px-5 py-6 border-b border-slate-800">
          <p className="text-lg font-bold leading-tight">Agency CRM</p>
          <p className="text-xs text-slate-400 mt-1">Meta Ads + Google LSA</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* MAIN */}
      <div className="md:pl-56">
        <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 md:py-5">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 truncate">{title}</h1>
              {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
            {/* Shrinkable on a phone so a long actions row scrolls inside itself
                instead of widening the document; fixed from md up where
                there is room for it. */}
            {actions && <div className="flex gap-2 min-w-0 md:flex-shrink-0">{actions}</div>}
          </div>
        </header>

        <main className="px-4 md:px-8 py-5 md:py-8 pb-28 md:pb-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>

      {/* MOBILE BOTTOM TABS */}
      {/* The inset keeps the tabs above the iPhone home indicator when this is
          launched from the home screen; it resolves to 0 in a normal browser. */}
      <nav
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 flex z-40"
      >
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition ${
                isActive ? 'text-blue-600' : 'text-slate-500'
              }`
            }
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.short}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
