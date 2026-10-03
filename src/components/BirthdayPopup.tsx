import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { isBirthday } from '../lib/birthdays'
import { coffeeWeek, fmtDay } from '../lib/coffee'
import { callName } from '../lib/names'
import { useStore } from '../lib/store'
import { Avatar, CountryLabel, btnPrimary } from './ui'

const todayKey = () => {
  const d = new Date()
  return `blavafriend-birthdays-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}
const coffeeKey = (round: string) => `blavafriend-coffee-${round}`

const seen = (key: string) => {
  try {
    return !!localStorage.getItem(key)
  } catch {
    return false // private mode: show it anyway
  }
}

/**
 * Once a day (per device), a pop-up with everyone whose birthday is today; once a
 * week, your new coffee match. Both show in the same pop-up.
 */
export function BirthdayPopup() {
  const { students, me } = useStore()
  const people = useMemo(() => {
    const list = students.filter((s) => isBirthday(s))
    // Put yourself first if it's your birthday.
    return list.sort((a, b) => (a.id === me?.id ? -1 : b.id === me?.id ? 1 : a.full_name.localeCompare(b.full_name)))
  }, [students, me])
  const [match, setMatch] = useState<{ round: string; partners: string[] } | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const myId = me?.id

  // Once per session: is there a coffee match for this week you haven't seen yet?
  useEffect(() => {
    if (!myId) return
    let live = true
    api.coffeeState().then(
      (st) => {
        const m = st.matches.find((x) => x.round === st.latest_round)
        if (live && m && m.partners.length && !seen(coffeeKey(m.round))) setMatch(m)
      },
      () => {},
    )
    return () => {
      live = false
    }
  }, [myId])

  const coffee = useMemo(() => {
    const partners = (match?.partners ?? []).flatMap((id) => students.filter((s) => s.id === id))
    return match && partners.length ? { round: match.round, partners } : null
  }, [match, students])

  const showBirthdays = people.length > 0 && !seen(todayKey())
  const open = !dismissed && (showBirthdays || !!coffee)

  const close = () => {
    try {
      if (people.length) localStorage.setItem(todayKey(), '1')
      if (coffee) localStorage.setItem(coffeeKey(coffee.round), '1')
    } catch {
      /* ignore */
    }
    setDismissed(true)
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
        {showBirthdays && (
          <>
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
                <li
                  key={s.id}
                  className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-oxford-50 to-gold/10 p-3"
                >
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
                    <Link
                      to={`/people/${s.id}`}
                      onClick={close}
                      className="shrink-0 text-sm font-semibold text-oxford-500 hover:underline"
                    >
                      Profile →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {coffee && (
          <div className={showBirthdays ? 'mt-5 border-t border-gray-100 pt-5' : ''}>
            <div className="text-center">
              <div className="text-5xl" aria-hidden>
                ☕
              </div>
              <h2
                id={showBirthdays ? undefined : 'bday-title'}
                className="mt-2 font-display text-2xl font-bold text-oxford-900"
              >
                Your coffee match!
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                For the week of{' '}
                {fmtDay(coffeeWeek(coffee.round).from, { weekday: 'short', day: 'numeric', month: 'short' })}. Send{' '}
                {coffee.partners.length > 1 ? 'them' : callName(coffee.partners[0])} a message and find a time.
              </p>
            </div>
            <ul className="mt-4 space-y-3">
              {coffee.partners.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-oxford-50 to-amber-50 p-3"
                >
                  <Avatar name={s.full_name} url={s.photo_url} size={56} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-oxford-900">{callName(s)}</div>
                    <div className="truncate text-xs text-gray-500">{s.full_name}</div>
                  </div>
                  <Link
                    to={`/people/${s.id}`}
                    onClick={close}
                    className="shrink-0 text-sm font-semibold text-oxford-500 hover:underline"
                  >
                    Profile →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button className={`${btnPrimary} mt-5 w-full`} onClick={close} autoFocus>
          {showBirthdays ? '🎉 Got it' : '☕ Got it'}
        </button>
      </div>
    </div>
  )
}
