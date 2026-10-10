import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { CalEvent, Rsvp } from '../lib/types'

const AUTO_MS = 4500 // time on each event
const PAUSE_MS = 8000 // pause after someone touches the carousel

// Each event gets a stable colour from its id (events have no picture).
const THEMES = [
  'from-oxford-900 to-oxford-700',
  'from-[#1c5cab] to-[#3987e5]',
  'from-[#0d366b] to-[#1c5cab]',
  'from-[#8a6d12] to-[#c9a227]',
  'from-[#0d366b] to-[#3987e5]',
]
const themeOf = (id: string) => THEMES[[...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % THEMES.length]

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString('en-GB', opts)

/** Upcoming events as a self-scrolling row of cards; tapping one opens it in Coffee + → Events. */
export function EventsCarousel() {
  const [events, setEvents] = useState<CalEvent[] | null>(null)
  const [rsvps, setRsvps] = useState<Rsvp[]>([])
  const [active, setActive] = useState(0)
  const track = useRef<HTMLDivElement>(null)
  const pausedUntil = useRef(0)

  useEffect(() => {
    let live = true
    Promise.all([api.listCalEvents(), api.listRsvps()]).then(
      ([e, r]) => {
        if (!live) return
        const now = Date.now()
        setEvents(
          e
            .filter((x) => new Date(x.ends_at ?? x.starts_at).getTime() >= now)
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
            .slice(0, 10),
        )
        setRsvps(r)
      },
      () => live && setEvents([]),
    )
    return () => {
      live = false
    }
  }, [])

  const cards = () => [...(track.current?.children ?? [])] as HTMLElement[]
  // Scroll position at which card i sits at the start (measured from the first card, so padding doesn't matter).
  const leftOf = (c: HTMLElement) => c.offsetLeft - (cards().at(0)?.offsetLeft ?? 0)
  const goTo = (i: number) => {
    const card = cards().at(i)
    if (card) track.current?.scrollTo({ left: leftOf(card), behavior: 'smooth' })
  }

  // Which card is in view (for the dots).
  const onScroll = () => {
    const el = track.current
    if (!el) return
    const dist = cards().map((c) => Math.abs(leftOf(c) - el.scrollLeft))
    setActive(dist.indexOf(Math.min(...dist)))
  }

  // Move on by itself, unless someone is touching it or prefers less motion.
  useEffect(() => {
    if (!events || events.length < 2) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setInterval(() => {
      if (Date.now() < pausedUntil.current || document.hidden) return
      const el = track.current
      if (!el) return
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4
      goTo(atEnd ? 0 : active + 1)
    }, AUTO_MS)
    return () => window.clearInterval(t)
  }, [events, active])

  if (!events?.length) return null
  const pause = () => (pausedUntil.current = Date.now() + PAUSE_MS)

  return (
    <section aria-label="Upcoming events">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-semibold text-oxford-900">📅 Upcoming events</h2>
        <Link to="/resources?tab=events" className="text-sm font-semibold text-oxford-500 hover:underline">
          See all →
        </Link>
      </div>
      <div
        ref={track}
        onScroll={onScroll}
        onPointerDown={pause}
        onMouseEnter={pause}
        onWheel={pause}
        onFocus={pause}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto scroll-smooth px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:scroll-px-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {events.map((e) => {
          const going = rsvps.filter((r) => r.event_id === e.id && r.status === 'going').length
          return (
            <Link
              key={e.id}
              to={`/resources?tab=events&event=${e.id}`}
              className="flex w-[80%] max-w-[300px] shrink-0 snap-start items-center gap-3 rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-gray-200 transition hover:ring-oxford-300 sm:w-[300px]"
            >
              <div className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br ${themeOf(e.id)}`}>
                {e.image_url ? (
                  <img src={e.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full place-items-center font-display text-2xl font-bold text-white/50" aria-hidden>
                    {e.title.trim().charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-[15px] leading-5 font-bold text-oxford-900">{e.title}</div>
                <div className="mt-0.5 truncate text-xs text-gray-500">
                  {fmt(e.starts_at, { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
                  {fmt(e.starts_at, { hour: '2-digit', minute: '2-digit' })}
                  {going > 0 && ` · ${going} going`}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
      {events.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5">
          {events.map((e, i) => (
            <button
              key={e.id}
              type="button"
              aria-label={`Show event ${i + 1}`}
              onClick={() => {
                pause()
                goTo(i)
              }}
              className={`h-1.5 rounded-full transition-all ${i === active ? 'w-5 bg-oxford-900' : 'w-1.5 bg-gray-300'}`}
            />
          ))}
        </div>
      )}
    </section>
  )
}
