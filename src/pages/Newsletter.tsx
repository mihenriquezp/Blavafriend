import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Spinner } from '../components/ui'
import { api } from '../lib/api'
import { fmtDay, londonToday } from '../lib/coffee'
import type { Newsletter, NewsletterItem } from '../lib/types'

/** Only web and email links are shown as links. */
const safeUrl = (u: string) => (/^(https?:|mailto:)/i.test(u) ? u : null)

export function useNewsletters() {
  const [newsletters, setNewsletters] = useState<Newsletter[] | null>(null)
  const [checks, setChecks] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  // Latest ticks, read when toggling (state updates apply later); every change goes through here.
  const current = useRef<Set<string>>(new Set())

  useEffect(() => {
    let live = true
    Promise.all([api.listNewsletters(), api.listNewsletterChecks()]).then(
      ([n, c]) => {
        if (!live) return
        setNewsletters(n)
        current.current = new Set(c.map((x) => `${x.newsletter_id}/${x.item_id}`))
        setChecks(current.current)
      },
      (e) => live && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      live = false
    }
  }, [])

  const toggle = useCallback(async (newsletterId: string, itemId: string) => {
    const key = `${newsletterId}/${itemId}`
    const checked = !current.current.has(key)
    const apply = (on: boolean) => {
      const next = new Set(current.current)
      if (on) next.add(key)
      else next.delete(key)
      current.current = next
      setChecks(next)
    }
    apply(checked)
    try {
      await api.setNewsletterCheck(newsletterId, itemId, checked)
    } catch (e) {
      apply(!checked) // put it back and say so
      setError(`Couldn’t save that: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [])

  return { newsletters, checks, toggle, error }
}

const dueLabel = (due: string) => {
  const today = londonToday()
  if (due < today) return { text: `Was due ${fmtDay(due)}`, cls: 'bg-gray-100 text-gray-500' }
  const days = Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000)
  if (days === 0) return { text: 'Due today', cls: 'bg-red-100 text-red-800' }
  if (days <= 2) return { text: `Due ${fmtDay(due)}`, cls: 'bg-amber-100 text-amber-900' }
  return { text: `Due ${fmtDay(due)}`, cls: 'bg-oxford-50 text-oxford-900' }
}

export default function NewsletterPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { newsletters, checks, toggle, error } = useNewsletters()
  const [open, setOpen] = useState<NewsletterItem | null>(null)
  const [showIntro, setShowIntro] = useState(false)
  const [hideDone, setHideDone] = useState(false)

  const nl = useMemo(() => (id ? newsletters?.find((n) => n.id === id) : newsletters?.[0]) ?? null, [id, newsletters])
  const groups = useMemo(() => {
    const out: [string, NewsletterItem[]][] = []
    for (const item of nl?.items ?? []) {
      const g = out.find(([c]) => c === item.category)
      if (g) g[1].push(item)
      else out.push([item.category, [item]])
    }
    return out
  }, [nl])

  if (!newsletters) return error ? <p className="text-red-700">{error}</p> : <Spinner />
  if (!nl)
    return (
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-bold text-oxford-900">Newsletter</h1>
        <p className="text-gray-600">No newsletter yet. It appears here every Friday.</p>
      </div>
    )

  const isDone = (item: NewsletterItem) => checks.has(`${nl.id}/${item.id}`)
  const today = londonToday()
  // Deadlines still ahead and not ticked, soonest first.
  const upcoming = nl.items
    .filter((i) => i.due && i.due >= today && !isDone(i))
    .sort((a, b) => a.due!.localeCompare(b.due!))
    .slice(0, 6)
  const done = nl.items.filter(isDone).length
  const total = nl.items.length

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl leading-tight font-bold text-oxford-900">📰 {nl.title}</h1>
          <p className="text-sm text-gray-500">
            Week of {fmtDay(nl.week_of, { day: 'numeric', month: 'long' })} · your ticks are private
          </p>
        </div>
        {newsletters.length > 1 && (
          <select
            value={nl.id}
            onChange={(e) => navigate(`/newsletter/${e.target.value}`)}
            className="shrink-0 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm"
            aria-label="Choose a week"
          >
            {newsletters.map((n) => (
              <option key={n.id} value={n.id}>
                {fmtDay(n.week_of, { day: 'numeric', month: 'short' })}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="rounded-2xl bg-white p-4 ring-1 ring-gray-200">
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="font-semibold text-oxford-900">
            {done === total ? 'All done 🎉' : `${done} of ${total} done`}
          </span>
          <button className="text-xs text-oxford-500 underline" onClick={() => setHideDone((v) => !v)}>
            {hideDone ? 'Show done' : 'Hide done'}
          </button>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
        {nl.intro && (
          <div className="mt-3">
            <button className="text-sm font-semibold text-oxford-500" onClick={() => setShowIntro((v) => !v)}>
              {showIntro ? '▾' : '▸'} This week in short
            </button>
            {showIntro && <Paragraphs text={nl.intro} className="mt-2 text-sm text-gray-700" />}
          </div>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {upcoming.length > 0 && (
        <section className="rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
          <h2 className="mb-1.5 text-xs font-bold tracking-wide text-amber-900 uppercase">⏰ Coming up</h2>
          <ul>
            {upcoming.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setOpen(item)}
                  className="flex w-full items-baseline gap-2 rounded-lg px-1 py-1 text-left text-sm hover:bg-amber-100"
                >
                  <span className="w-16 shrink-0 text-xs font-semibold text-amber-900">
                    {fmtDay(item.due!, { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-oxford-900">{item.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {groups.map(([category, items]) => {
        const shown = hideDone ? items.filter((i) => !isDone(i)) : items
        if (!shown.length) return null
        return (
          <section key={category}>
            <h2 className="mb-2 text-xs font-bold tracking-wide text-gray-500 uppercase">
              {category}{' '}
              <span className="font-normal">
                · {items.filter(isDone).length}/{items.length}
              </span>
            </h2>
            <ul className="space-y-2">
              {shown.map((item) => {
                const checked = isDone(item)
                return (
                  <li
                    key={item.id}
                    className="flex items-stretch overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200"
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      aria-label={`Done: ${item.title}`}
                      onClick={() => toggle(nl.id, item.id)}
                      className="grid w-14 shrink-0 place-items-center hover:bg-gray-50"
                    >
                      <span
                        className={`grid h-6 w-6 place-items-center rounded-md border-2 text-sm font-bold ${
                          checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-300 bg-white'
                        }`}
                      >
                        {checked ? '✓' : ''}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpen(item)}
                      className="min-w-0 flex-1 py-3 pr-3 text-left hover:bg-gray-50"
                    >
                      <div className={`font-semibold ${checked ? 'text-gray-400 line-through' : 'text-oxford-900'}`}>
                        {item.title}
                      </div>
                      <div className={`mt-0.5 text-sm ${checked ? 'text-gray-400' : 'text-gray-600'}`}>
                        {item.summary}
                      </div>
                      <WhenChip item={item} checked={checked} className="mt-1.5" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      <p className="pt-2 text-center text-xs text-gray-400">
        A summary of the programme newsletter. If in doubt, the original email is the reference.{' '}
        <Link to="/" className="underline">
          Home
        </Link>
      </p>

      {open && (
        <ItemDialog
          item={open}
          checked={isDone(open)}
          onToggle={() => toggle(nl.id, open.id)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

/** One tag with the time or deadline; coloured by how close the deadline is. */
function WhenChip({ item, checked, className }: { item: NewsletterItem; checked: boolean; className: string }) {
  if (!item.due && !item.when) return null
  const due = item.due ? dueLabel(item.due) : null
  const late = !!item.due && item.due < londonToday()
  const text = item.when ? (late && !checked ? `Was due · ${item.when}` : item.when) : due!.text
  const cls = due && !checked ? `font-semibold ${due.cls}` : 'bg-gray-100 text-gray-600'
  return (
    <div className={`flex text-xs ${className}`}>
      <span className={`rounded-full px-2 py-0.5 ${cls}`}>
        {due ? '⏰' : '🕒'} {text}
      </span>
    </div>
  )
}

function Paragraphs({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  )
}

function ItemDialog({
  item,
  checked,
  onToggle,
  onClose,
}: {
  item: NewsletterItem
  checked: boolean
  onToggle: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const links = (item.links ?? []).filter((l) => safeUrl(l.url))

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-oxford-900/60 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nl-item-title"
        className="max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs font-bold tracking-wide text-gray-500 uppercase">{item.category}</span>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <h2 id="nl-item-title" className="font-display text-xl leading-snug font-bold text-oxford-900">
          {item.title}
        </h2>
        <WhenChip item={item} checked={false} className="mt-2" />
        <Paragraphs text={item.detail || item.summary} className="mt-3 text-sm leading-relaxed text-gray-700" />
        {links.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {links.map((l) => (
              <a
                key={l.url + l.label}
                href={safeUrl(l.url)!}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-full bg-oxford-50 px-3 py-1.5 text-sm font-semibold text-oxford-900 hover:bg-oxford-100"
              >
                🔗 {l.label}
              </a>
            ))}
          </div>
        )}
        <button
          onClick={onToggle}
          className={`mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-semibold ${
            checked
              ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
              : 'bg-oxford-900 text-white hover:bg-oxford-700'
          }`}
        >
          {checked ? '✓ Done (tap to undo)' : 'Mark as done'}
        </button>
      </div>
    </div>
  )
}
