import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { isBirthday } from '../lib/birthdays'
import { callName } from '../lib/names'
import { useStore } from '../lib/store'
import { Avatar, CountryLabel, btnPrimary } from './ui'

const todayKey = () => {
  const d = new Date()
  return `blavafriend-birthdays-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** Once a day (per device), a pop-up with everyone whose birthday is today. */
export function BirthdayPopup() {
  const { students, me } = useStore()
  const people = useMemo(() => {
    const list = students.filter((s) => isBirthday(s))
    // Put yourself first if it's your birthday.
    return list.sort((a, b) => (a.id === me?.id ? -1 : b.id === me?.id ? 1 : a.full_name.localeCompare(b.full_name)))
  }, [students, me])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!people.length) return
    try {
      if (localStorage.getItem(todayKey())) return
    } catch {
      /* private mode: show it anyway */
    }
    setOpen(true)
  }, [people.length])

  const close = () => {
    try {
      localStorage.setItem(todayKey(), '1')
    } catch {
      /* ignore */
    }
    setOpen(false)
  }

  if (!open) return null
  const others = people.filter((s) => s.id !== me?.id)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-oxford-900/60 p-4 backdrop-blur-sm" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bday-title"
        className="max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center">
          <div className="text-5xl" aria-hidden>
            🎂
          </div>
          <h2 id="bday-title" className="mt-2 font-display text-2xl font-bold text-oxford-900">
            {others.length ? 'Birthday today!' : 'Happy birthday!'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {others.length
              ? `Don’t forget to wish ${others.length === 1 ? 'them' : 'them all'} a happy birthday 🎉`
              : 'The whole cohort is celebrating you today 🎉'}
          </p>
        </div>

        <ul className="mt-4 space-y-3">
          {people.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-oxford-50 to-gold/10 p-3">
              <Avatar name={s.full_name} url={s.photo_url} size={64} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-oxford-900">
                  {s.id === me?.id ? 'You! 🥳' : callName(s)}
                </div>
                <div className="truncate text-xs text-gray-500">{s.full_name}</div>
                <div className="truncate text-xs text-gray-500">
                  {s.country_origin && <CountryLabel country={s.country_origin} />}
                  {s.country_origin && s.college && ' · '}
                  {s.college}
                </div>
              </div>
              {s.id !== me?.id && (
                <Link to={`/people/${s.id}`} onClick={close} className="shrink-0 text-sm font-semibold text-oxford-500 hover:underline">
                  Profile →
                </Link>
              )}
            </li>
          ))}
        </ul>

        <button className={`${btnPrimary} mt-5 w-full`} onClick={close} autoFocus>
          🎉 Got it
        </button>
      </div>
    </div>
  )
}
