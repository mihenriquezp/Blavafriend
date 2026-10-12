import { Link } from 'react-router-dom'
import { fmtDay, londonToday } from '../lib/coffee'
import { useNewsletters } from '../pages/Newsletter'

/** Home: this week's newsletter as a checklist summary. */
export function NewsletterCard() {
  const { newsletters, checks } = useNewsletters()
  const nl = newsletters?.[0]
  if (!nl) return null
  const done = nl.items.filter((i) => checks.has(`${nl.id}/${i.id}`)).length
  const total = nl.items.length
  const today = londonToday()
  const soon = nl.items
    .filter((i) => i.due && i.due >= today && !checks.has(`${nl.id}/${i.id}`))
    .sort((a, b) => a.due!.localeCompare(b.due!))[0]

  return (
    <Link
      to="/newsletter"
      className="block rounded-2xl bg-gradient-to-br from-oxford-900 to-oxford-700 p-4 text-white shadow-sm transition hover:opacity-95"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-wide uppercase opacity-70">
            📰 Newsletter · week of {fmtDay(nl.week_of, { day: 'numeric', month: 'short' })}
          </div>
          <div className="mt-0.5 text-lg font-bold">
            {done === total ? 'All done 🎉' : `${total - done} thing${total - done === 1 ? '' : 's'} to check`}
          </div>
        </div>
        <span className="shrink-0 text-sm font-semibold opacity-90">Open →</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20">
        <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${(done / total) * 100}%` }} />
      </div>
      {soon && (
        <div className="mt-2 truncate text-sm opacity-90">
          Next deadline: <b>{soon.title}</b> · {fmtDay(soon.due!)}
        </div>
      )}
    </Link>
  )
}
