import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { londonToday } from '../lib/coffee'
import type { Tool } from '../lib/types'

/** Shown on the home page: not hidden and not past its date (admins get every tool from the API). */
export const toolShown = (t: Tool) => !t.hidden && (!t.remove_on || t.remove_on > londonToday())

// Shortcuts to the Coffee + sections, shown above the uploaded tools.
const SHORTCUTS = [
  { tab: 'coffee', icon: '☕', label: 'Coffee' },
  { tab: 'formals', icon: '🎓', label: 'Formals' },
  { tab: 'study', icon: '📚', label: 'Study' },
  { tab: 'events', icon: '📅', label: 'Events' },
]

/** "Useful tools" on the home page: shortcuts to Coffee +, then the uploaded tools in a row you can swipe. */
export function ToolsRow() {
  const [tools, setTools] = useState<Tool[]>([])

  useEffect(() => {
    let live = true
    api.listTools().then(
      (t) => live && setTools(t.filter(toolShown)),
      () => {},
    )
    return () => {
      live = false
    }
  }, [])

  return (
    <section aria-label="Useful tools">
      <h2 className="mb-2 font-semibold text-oxford-900">🧰 Useful tools</h2>
      <nav aria-label="Coffee + sections" className="mb-3 grid grid-cols-4 gap-2">
        {SHORTCUTS.map((s) => (
          <Link
            key={s.tab}
            to={`/resources?tab=${s.tab}`}
            className="flex flex-col items-center gap-1 rounded-2xl bg-white px-1 py-2.5 shadow-sm ring-1 ring-gray-200 transition hover:ring-oxford-300"
          >
            <span className="text-2xl leading-none" aria-hidden>
              {s.icon}
            </span>
            <span className="text-xs font-semibold text-oxford-900">{s.label}</span>
          </Link>
        ))}
      </nav>
      {tools.length > 0 && (
        <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:scroll-px-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          {tools.map((t) => (
            <Link
              key={t.id}
              to={`/tools/${t.id}`}
              className="flex w-[80%] max-w-[300px] shrink-0 snap-start items-center gap-3 rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-gray-200 transition hover:ring-oxford-300 sm:w-[300px]"
            >
              <span
                className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-oxford-50 to-amber-50 text-3xl"
                aria-hidden
              >
                {t.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-[15px] leading-5 font-bold text-oxford-900">{t.title}</div>
                {t.description && <div className="mt-0.5 line-clamp-2 text-xs text-gray-500">{t.description}</div>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
