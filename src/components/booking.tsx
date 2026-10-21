import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays, fmtDay, londonToday } from '../lib/coffee'
import { callName } from '../lib/names'
import { socialLinks } from '../lib/social'
import { useStore } from '../lib/store'
import type { Student } from '../lib/types'
import { Avatar, btnPrimary, btnSecondary } from './ui'

/* Pieces shared by the appointment-style sections (Formals, Study). */

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function Step({ n, title }: { n: number; title: string }) {
  return (
    <h3 className="flex items-center gap-2 font-semibold text-oxford-900">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-oxford-900 text-xs text-white">
        {n}
      </span>
      {title}
    </h3>
  )
}

/** Month grid like a booking calendar: days with places left are tappable, others greyed out. */
export function MonthCalendar({
  days,
  selected,
  onSelect,
  unit = 'seat',
}: {
  /** Days with something on, and how many places are left (0 = full). */
  days: Map<string, number>
  selected: string | null
  onSelect: (d: string) => void
  unit?: string
}) {
  const today = londonToday()
  const months = useMemo(() => {
    const all = [...days.keys(), today].map((d) => d.slice(0, 7))
    const first = all.reduce((a, b) => (a < b ? a : b))
    const last = all.reduce((a, b) => (a > b ? a : b))
    const out: string[] = []
    for (let m = first; m <= last; m = addDays(`${m}-28`, 7).slice(0, 7)) out.push(m)
    return out
  }, [days, today])
  const [month, setMonth] = useState<string | null>(null)
  const shown = month && months.includes(month) ? month : (selected?.slice(0, 7) ?? months[0])
  const i = months.indexOf(shown)

  const first = `${shown}-01`
  const lead = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7 // Monday first
  const cells: (string | null)[] = Array.from({ length: lead }, () => null)
  for (let d = first; d.startsWith(shown); d = addDays(d, 1)) cells.push(d)

  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          className="grid h-9 w-9 place-items-center rounded-full text-oxford-900 hover:bg-oxford-50 disabled:opacity-25"
          disabled={i <= 0}
          onClick={() => setMonth(months[i - 1])}
          aria-label="Previous month"
        >
          ‹
        </button>
        <div className="font-semibold text-oxford-900">{fmtDay(first, { month: 'long', year: 'numeric' })}</div>
        <button
          className="grid h-9 w-9 place-items-center rounded-full text-oxford-900 hover:bg-oxford-50 disabled:opacity-25"
          disabled={i >= months.length - 1}
          onClick={() => setMonth(months[i + 1])}
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, k) => (
          <div key={k} className="pb-1 text-[11px] font-semibold text-gray-400">
            {d}
          </div>
        ))}
        {cells.map((d, k) => {
          if (!d) return <div key={k} />
          const seats = days.get(d)
          const has = seats !== undefined
          const sel = d === selected
          return (
            <button
              key={d}
              disabled={!has}
              onClick={() => onSelect(d)}
              aria-pressed={sel}
              aria-label={`${fmtDay(d, { weekday: 'long', day: 'numeric', month: 'long' })}${has ? `, ${seats ? plural(seats, unit) : 'full'}` : ''}`}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm ${
                sel
                  ? 'bg-oxford-900 font-bold text-white'
                  : has
                    ? seats
                      ? 'bg-oxford-50 font-bold text-oxford-900 ring-1 ring-oxford-200 hover:ring-oxford-500'
                      : 'bg-gray-50 text-gray-400 line-through'
                    : d < today
                      ? 'text-gray-300'
                      : 'text-gray-400'
              } ${d === today && !sel ? 'underline decoration-gold decoration-2 underline-offset-4' : ''}`}
            >
              {Number(d.slice(8))}
              {has && !!seats && (
                <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${sel ? 'bg-gold' : 'bg-emerald-500'}`} aria-hidden />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0 text-gray-500">{k}</dt>
      <dd className="min-w-0 flex-1 font-medium text-oxford-900">{v}</dd>
    </div>
  )
}

export function HostContact({ host }: { host: Student }) {
  const links = socialLinks(host)
  const wa = links.find((l) => l.label === 'WhatsApp')
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {wa && (
        <a href={wa.href} target="_blank" rel="noreferrer" className={btnPrimary}>
          💬 WhatsApp {callName(host)}
        </a>
      )}
      <Link to={`/people/${host.id}`} className={btnSecondary}>
        Profile →
      </Link>
    </div>
  )
}

export function Guests({
  ids,
  byUser,
  label,
}: {
  ids: string[]
  byUser: (id: string) => Student | undefined
  label: string
}) {
  const { user } = useStore()
  const people = ids.flatMap((id) => byUser(id) ?? [])
  if (!people.length) return null
  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
      {label}:
      <div className="flex -space-x-1.5">
        {people.map((p) => (
          <span key={p.id} title={p.full_name} className="rounded-full ring-2 ring-white">
            <Avatar name={p.full_name} url={p.photo_url} size={22} />
          </span>
        ))}
      </div>
      <span className="truncate">{people.map((p) => (p.user_id === user?.id ? 'you' : callName(p))).join(', ')}</span>
    </div>
  )
}
