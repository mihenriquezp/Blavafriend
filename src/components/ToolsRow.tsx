import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { Tool } from '../lib/types'

/** "Useful tools" on the home page: same look as the event cards, a row you can swipe. */
export function ToolsRow() {
  const [tools, setTools] = useState<Tool[]>([])

  useEffect(() => {
    let live = true
    api.listTools().then(
      (t) => live && setTools(t),
      () => {},
    )
    return () => {
      live = false
    }
  }, [])

  if (!tools.length) return null

  return (
    <section aria-label="Useful tools">
      <h2 className="mb-2 font-semibold text-oxford-900">🧰 Useful tools</h2>
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
    </section>
  )
}
