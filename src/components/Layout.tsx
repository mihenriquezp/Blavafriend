import { NavLink, Outlet } from 'react-router-dom'
import { api } from '../lib/api'
import { useStore } from '../lib/store'
import { Avatar } from './ui'

const NAV = [
  { to: '/', label: 'Stats', icon: '📊', end: true },
  { to: '/people', label: 'People', icon: '👥' },
  { to: '/wishlist', label: 'Want to meet', icon: '★' },
  { to: '/me', label: 'Profile', icon: '🙂' },
]

export function Layout() {
  const { me, isAdmin, notice } = useStore()
  return (
    <div className="min-h-dvh pb-20 sm:pb-0">
      <header className="sticky top-0 z-20 border-b border-oxford-700 bg-oxford-900 text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2">
            <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
            <span className="font-display text-xl font-bold tracking-tight">Blavafriend</span>
          </NavLink>
          <nav className="ml-4 hidden gap-1 sm:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-white/15' : 'text-white/80 hover:text-white'}`
                }
              >
                {n.label}
              </NavLink>
            ))}
            {isAdmin && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-white/15' : 'text-white/80 hover:text-white'}`
                }
              >
                Admin
              </NavLink>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {api.mode === 'demo' && (
              <span className="rounded-full bg-gold px-2 py-0.5 text-xs font-semibold text-oxford-900">Demo</span>
            )}
            {me && (
              <NavLink to="/me" className="hidden sm:block" title="My profile">
                <Avatar name={me.full_name} url={me.photo_url} size={32} />
              </NavLink>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-5xl px-4 pt-4 pb-8 text-center text-xs text-gray-500">
        Made by MPP students, for MPP students · Not an official University of Oxford app ·{' '}
        <NavLink to="/about" className="underline">
          How it works & privacy
        </NavLink>
        {isAdmin && (
          <>
            {' · '}
            <NavLink to="/admin" className="underline sm:hidden">
              Admin
            </NavLink>
          </>
        )}
      </footer>

      {notice && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-20 z-30 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-xl bg-oxford-900 px-4 py-2.5 text-sm text-white shadow-lg sm:bottom-6"
        >
          {notice}
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        <div className="grid grid-cols-4">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                  isActive ? 'text-oxford-900' : 'text-gray-400'
                }`
              }
            >
              <span className="text-lg leading-none" aria-hidden>
                {n.icon}
              </span>
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
