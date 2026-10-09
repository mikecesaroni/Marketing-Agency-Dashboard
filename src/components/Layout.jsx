import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { cleanTitle, previousOf, readTrail, stepTrail, trailLabel, writeTrail } from '../lib/trail'
import { useAuth } from '../context/AuthContext'
import { LOGIN_REQUIRED, ROLE_LABELS, navWithoutLogin, visibleNav } from '../lib/access'
import ChangePasswordModal from './ChangePasswordModal'
import { NAV_GROUPS } from '../lib/nav'
function initials(profile) {
  const src = profile?.name || profile?.email || '?'
  return src
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

// The signed-in person: who, as what, and the two things they can do about it.
// One control for every screen size, in the header, so a phone has it too.
function UserMenu() {
  const { profile, role, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [changing, setChanging] = useState(false)
  if (!LOGIN_REQUIRED || !profile) return null
  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={profile.email}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white hover:bg-slate-700"
      >
        {initials(profile)}
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-30 cursor-default" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 z-40 mt-2 w-60 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg"
          >
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-medium text-slate-900">{profile.name || profile.email}</p>
              <p className="truncate text-xs text-slate-500">{profile.email}</p>
              <p className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                {ROLE_LABELS[role] || role}
              </p>
            </div>
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false)
                setChanging(true)
              }}
              className="block w-full rounded px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              Change password
            </button>
            <button
              role="menuitem"
              onClick={() => signOut()}
              className="block w-full rounded px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </>
      )}
      <ChangePasswordModal isOpen={changing} onClose={() => setChanging(false)} />
    </div>
  )
}

// Names for pages whose title is not a good button label.
const PATH_NAMES = {
  ...Object.fromEntries(NAV_GROUPS.flatMap((g) => g.items).map((i) => [i.to, i.label])),
  '/dashboard': 'Dashboard',
  '/content/drive': 'Drive photos',
  '/reports': 'KPI Reports',
  '/reports/google-search': 'Google Ads',
  '/reports/meta': 'Meta Ads',
}

/**
 * "← <the page you came from>", on every page.
 *
 * Browser back underneath, so it returns to the exact place, filters and
 * all. It shows only when there is an earlier page in this tab, and is
 * named after that page, so from a client opened off the Google Search
 * report it reads "← Google Ads".
 */
/**
 * A key for this history entry that is unique and survives a reload.
 *
 * React Router gives every in-app navigation its own key, but every full
 * page load (a pasted link, a link from an email, opening a bookmark) comes
 * in as "default", so two different pages would share one. Those entries get
 * an id of our own, stored on the history entry itself, where a reload finds
 * it again.
 */
function entryKey(routerKey) {
  if (routerKey && routerKey !== 'default') return routerKey
  try {
    const state = window.history.state || {}
    if (state.crmKey) return state.crmKey
    const crmKey = `load-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    window.history.replaceState({ ...state, crmKey }, '')
    return crmKey
  } catch {
    return 'default'
  }
}

function useBackTo(title) {
  const location = useLocation()
  const navType = useNavigationType()
  const [prev, setPrev] = useState(null)
  const path = location.pathname + location.search
  const clean = cleanTitle(title)
  useEffect(() => {
    const key = entryKey(location.key)
    // A full load is always a step of its own, whatever React Router calls it.
    const type = location.key === 'default' ? 'PUSH' : navType
    const next = stepTrail(readTrail(), { key, path, title: clean }, type)
    writeTrail(next)
    setPrev(previousOf(next, key))
  }, [location.key, path, clean, navType])
  return prev
}

function BackButton({ entry, dark }) {
  const navigate = useNavigate()
  if (!entry) return null
  const label = trailLabel(entry, PATH_NAMES)
  return (
    <button
      type="button"
      onClick={() => navigate(-1)}
      title={`Back to ${label}`}
      className={`mb-1 inline-flex max-w-full items-center gap-1 truncate rounded-md text-xs font-medium transition ${
        dark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
      }`}
    >
      <span aria-hidden="true">←</span>
      <span className="truncate">{label}</span>
    </button>
  )
}

export default function Layout({ title, subtitle, actions, children, tone = 'light' }) {
  const backTo = useBackTo(typeof title === 'string' ? title : '')
  // The report pages run dark: the page, the sticky header and the title.
  // Everything else in the app keeps the light frame.
  const dark = tone === 'dark'
  // The body is the scroll container (index.css), so an overscroll bounce
  // shows its colour. Match it on dark pages, put it back on the way out.
  useEffect(() => {
    if (!dark) return
    const prev = document.body.style.backgroundColor
    document.body.style.backgroundColor = '#070b14'
    return () => {
      document.body.style.backgroundColor = prev
    }
  }, [dark])
  const { role } = useAuth()
  // Only the pages this role may open. A VA gets no Money > Payments row and
  // no Admin group at all, and RequireAuth turns them away from the URL too.
  // With login switched off there is no role: everyone sees everything except
  // the Team page.
  const groups = LOGIN_REQUIRED ? visibleNav(NAV_GROUPS, role) : navWithoutLogin(NAV_GROUPS)
  const mobileItems = groups.flatMap((g) => g.items).filter((i) => i.mobile !== false)
  return (
    <div className={`min-h-screen ${dark ? 'bg-[#070b14]' : 'bg-slate-50'}`}>
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-60 bg-slate-950 text-white">
        <div className="px-5 py-5">
          {/* The WC mark at icon size, with the name as text beside it. The
              mark is dark on off-white by design, so it keeps its own small
              plate against the dark sidebar. Clicking it goes home. */}
          <NavLink to="/" className="flex items-center gap-2.5 transition hover:opacity-90" aria-label="The Working Class, home">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#f8f7f5]">
              <img src="/brand/wc-mark.jpg" alt="" className="h-10 w-10 object-contain" data-brand-logo />
            </span>
            <span className="min-w-0 text-sm font-semibold leading-snug tracking-tight">The Working Class</span>
          </NavLink>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
          {groups.map((group, i) => (
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
          <p className="text-[11px] text-slate-500">The Working Class Marketing</p>
        </div>
      </aside>

      {/* MAIN */}
      <div className="md:pl-60">
        {/* Sticky, so the page title and its actions stay reachable down a long
            client page. Translucent rather than solid so content scrolling
            under it reads as depth instead of a seam. */}
        <header className={`sticky top-0 z-30 border-b px-4 py-4 backdrop-blur md:px-8 md:py-5 ${dark ? 'border-white/[0.06] bg-[#070b14]/80' : 'border-slate-200 bg-slate-50/85'}`}>
          <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <BackButton entry={backTo} dark={dark} />
              <h1 className={`truncate text-xl font-semibold tracking-tight md:text-2xl ${dark ? 'text-white' : 'text-slate-900'}`}>
                {title}
              </h1>
              {subtitle && <p className={`mt-0.5 text-sm ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{subtitle}</p>}
            </div>
            {/* Shrinkable on a phone so a long actions row scrolls inside itself
                instead of widening the document; fixed from md up where
                there is room for it. */}
            <div className="flex min-w-0 items-center gap-2 md:flex-shrink-0">
              {actions && <div className="flex min-w-0 gap-2">{actions}</div>}
              <UserMenu />
            </div>
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
        {mobileItems.map(({ to, short, Icon, end }) => (
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
