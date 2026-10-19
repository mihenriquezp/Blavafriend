import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { addDays, fmtDay, londonToday } from '../lib/coffee'
import { callName } from '../lib/names'
import { COLLEGES } from '../lib/options'
import { socialLinks } from '../lib/social'
import { useStore } from '../lib/store'
import type { FormalInput, FormalSlot, Student } from '../lib/types'
import { Avatar, Card, Field, Spinner, btnPrimary, btnSecondary, inputCls } from './ui'

type View = 'find' | 'offer' | 'mine'
const ALL = ''

export const fmtPrice = (p: number) => (p === 0 ? 'Free' : `£${p % 1 ? p.toFixed(2) : p}`)
const seatsLeft = (s: FormalSlot) => s.capacity - s.taken
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * Formals: classmates offer seats at their college's formal dinner and others
 * book one, like picking an appointment (college → day → time). No money goes
 * through the app: the guest pays the host directly.
 */
export function Formals() {
  const { students } = useStore()
  const [slots, setSlots] = useState<FormalSlot[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('find')
  const [editing, setEditing] = useState<FormalSlot | null>(null)

  const load = useCallback(() => api.formalBoard().then(setSlots, (e) => setError(String(e))), [])
  useEffect(() => {
    load()
  }, [load])

  const byUser = useCallback((userId: string) => students.find((s) => s.user_id === userId), [students])
  const mineCount = slots?.filter((s) => s.mine || s.booked).length ?? 0

  if (!slots) return error ? <p className="text-red-700">Couldn’t load the formals: {error}</p> : <Spinner />

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-br from-oxford-50 to-amber-50">
        <h2 className="font-display text-xl font-bold text-oxford-900">
          <span aria-hidden>🎓</span> Formals
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Got spare seats at your college’s formal? Offer them here. Want to try another college’s? Pick one, choose a
          day and book a seat. The app only makes the match: <b>you pay the host directly</b>.
        </p>
      </Card>

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white p-1 ring-1 ring-gray-200" role="tablist">
        {(
          [
            ['find', 'Find a seat'],
            ['offer', 'Offer seats'],
            ['mine', `Mine${mineCount ? ` · ${mineCount}` : ''}`],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => {
              setView(v)
              setEditing(null)
            }}
            className={`rounded-xl px-1 py-2 text-sm font-semibold whitespace-nowrap ${view === v ? 'bg-oxford-900 text-white' : 'text-oxford-900 hover:bg-oxford-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'find' && <Find slots={slots} byUser={byUser} reload={load} onOffer={() => setView('offer')} />}
      {view === 'offer' && (
        <OfferForm
          initial={editing}
          onDone={() => {
            setEditing(null)
            setView('mine')
            load()
          }}
          onCancel={editing ? () => (setEditing(null), setView('mine')) : undefined}
        />
      )}
      {view === 'mine' && (
        <Mine
          slots={slots}
          byUser={byUser}
          reload={load}
          onEdit={(s) => {
            setEditing(s)
            setView('offer')
          }}
          onFind={() => setView('find')}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ Find */

function Find({
  slots,
  byUser,
  reload,
  onOffer,
}: {
  slots: FormalSlot[]
  byUser: (id: string) => Student | undefined
  reload: () => void
  onOffer: () => void
}) {
  const open = useMemo(() => slots.filter((s) => !s.mine), [slots])
  const colleges = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of open) m.set(s.college, (m.get(s.college) ?? 0) + seatsLeft(s))
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [open])
  const [college, setCollege] = useState(ALL)
  const inCollege = useMemo(() => open.filter((s) => college === ALL || s.college === college), [open, college])
  const days = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of inCollege) m.set(s.day, (m.get(s.day) ?? 0) + seatsLeft(s))
    return m
  }, [inCollege])
  const firstFree = [...days].find(([, n]) => n > 0)?.[0] ?? [...days.keys()][0] ?? null
  const [day, setDay] = useState<string | null>(null)
  const shownDay = day && days.has(day) ? day : firstFree
  const [booking, setBooking] = useState<FormalSlot | null>(null)

  if (!open.length)
    return (
      <Card className="text-center">
        <div className="text-4xl" aria-hidden>
          🍽️
        </div>
        <p className="mt-2 font-semibold text-oxford-900">No seats on offer yet</p>
        <p className="mt-1 text-sm text-gray-500">
          Have spare seats at your college’s formal? Be the first to offer them.
        </p>
        <button className={`${btnPrimary} mt-4`} onClick={onOffer}>
          ➕ Offer seats
        </button>
      </Card>
    )

  return (
    <div className="space-y-4">
      <Card>
        <Step n={1} title="Choose a college" />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[[ALL, colleges.reduce((n, [, c]) => n + c, 0)] as const, ...colleges].map(([c, n]) => (
            <button
              key={c || 'all'}
              onClick={() => {
                setCollege(c)
                setDay(null)
              }}
              aria-pressed={college === c}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                college === c
                  ? 'bg-oxford-900 text-white'
                  : 'bg-white text-oxford-900 ring-1 ring-gray-200 hover:ring-oxford-300'
              }`}
            >
              {c || 'All colleges'}{' '}
              <span className={`text-xs ${college === c ? 'text-white/70' : n ? 'text-emerald-700' : 'text-gray-400'}`}>
                {n ? plural(n, 'seat') : 'full'}
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <Step n={2} title="Pick a day" />
        <MonthCalendar days={days} selected={shownDay} onSelect={setDay} />
      </Card>

      {shownDay && (
        <Card>
          <Step
            n={3}
            title={`Choose a time · ${fmtDay(shownDay, { weekday: 'long', day: 'numeric', month: 'long' })}`}
          />
          <ul className="mt-3 space-y-2">
            {inCollege
              .filter((s) => s.day === shownDay)
              .map((s) => (
                <SlotRow key={s.id} slot={s} host={byUser(s.host)} onBook={() => setBooking(s)} />
              ))}
          </ul>
        </Card>
      )}

      {booking && (
        <BookDialog slot={booking} host={byUser(booking.host)} onClose={() => setBooking(null)} onBooked={reload} />
      )}
    </div>
  )
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <h3 className="flex items-center gap-2 font-semibold text-oxford-900">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-oxford-900 text-xs text-white">
        {n}
      </span>
      {title}
    </h3>
  )
}

/** Month grid like a booking calendar: days with seats are tappable, others greyed out. */
function MonthCalendar({
  days,
  selected,
  onSelect,
}: {
  days: Map<string, number>
  selected: string | null
  onSelect: (d: string) => void
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
              aria-label={`${fmtDay(d, { weekday: 'long', day: 'numeric', month: 'long' })}${has ? `, ${seats ? plural(seats, 'seat') : 'full'}` : ''}`}
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

function SlotRow({ slot: s, host, onBook }: { slot: FormalSlot; host?: Student; onBook: () => void }) {
  const left = seatsLeft(s)
  return (
    <li className="flex items-start gap-3 rounded-2xl p-3 ring-1 ring-gray-200">
      <div className="w-14 shrink-0 rounded-xl bg-oxford-900 py-2 text-center text-white">
        <div className="text-base leading-none font-bold">{s.time}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-oxford-900">{s.college}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
          {host && <Avatar name={host.full_name} url={host.photo_url} size={18} />}
          <span className="truncate">with {host ? callName(host) : 'a classmate'}</span>
        </div>
        <div className="mt-1 text-sm text-gray-700">
          <b>{fmtPrice(s.price)}</b>
          {s.price > 0 && ' per seat'} ·{' '}
          <span className={left ? 'text-emerald-700' : 'text-gray-400'}>
            {left ? `${left} of ${plural(s.capacity, 'seat')} left` : 'Full'}
          </span>
        </div>
        {s.notes && <p className="mt-1 line-clamp-2 text-xs text-gray-500">{s.notes}</p>}
      </div>
      <div className="shrink-0 self-center">
        {s.booked ? (
          <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-900">
            ✓ Going
          </span>
        ) : (
          <button className={btnPrimary} disabled={!left} onClick={onBook}>
            {left ? 'Book' : 'Full'}
          </button>
        )}
      </div>
    </li>
  )
}

/** Confirm a seat, then show how to reach the host to pay and arrange. */
function BookDialog({
  slot: s,
  host,
  onClose,
  onBooked,
}: {
  slot: FormalSlot
  host?: Student
  onClose: () => void
  onBooked: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = host ? callName(host) : 'the host'

  const book = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.formalBook(s.id)
      setDone(true)
      onBooked()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-oxford-900/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="formal-title"
        className="max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center">
          <div className="text-5xl" aria-hidden>
            {done ? '🥂' : '🎓'}
          </div>
          <h2 id="formal-title" className="mt-2 font-display text-2xl font-bold text-oxford-900">
            {done ? 'You’re going!' : 'Book this seat?'}
          </h2>
        </div>
        <dl className="mt-4 space-y-1.5 rounded-2xl bg-oxford-50 p-4 text-sm">
          <Row k="College" v={s.college} />
          <Row k="When" v={`${fmtDay(s.day, { weekday: 'long', day: 'numeric', month: 'long' })} · ${s.time}`} />
          <Row k="Price" v={s.price ? `${fmtPrice(s.price)} per seat` : 'Free, on the host'} />
          <Row k="Host" v={host?.full_name ?? 'A classmate'} />
          {s.notes && <Row k="Notes" v={s.notes} />}
        </dl>
        {done ? (
          <>
            <p className="mt-4 text-sm text-gray-700">
              Message {name} to say hi
              {s.price > 0 && (
                <>
                  {' '}
                  and sort out the <b>{fmtPrice(s.price)}</b>
                </>
              )}
              . The app doesn’t handle any money.
            </p>
            {host && <HostContact host={host} />}
          </>
        ) : (
          <p className="mt-4 text-sm text-gray-600">
            This saves you a seat. {s.price > 0 ? `You pay ${name} directly` : `${name} is treating`}: nothing is
            charged in the app. You can cancel later in <b>Mine</b>.
          </p>
        )}
        {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex gap-2">
          {done ? (
            <button className={`${btnPrimary} w-full`} onClick={onClose}>
              👍 Done
            </button>
          ) : (
            <>
              <button className={btnSecondary} onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button className={`${btnPrimary} flex-1`} onClick={book} disabled={busy}>
                {busy ? 'Booking…' : 'Book my seat'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0 text-gray-500">{k}</dt>
      <dd className="min-w-0 flex-1 font-medium text-oxford-900">{v}</dd>
    </div>
  )
}

function HostContact({ host }: { host: Student }) {
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

/* ------------------------------------------------------------------ Mine */

function Mine({
  slots,
  byUser,
  reload,
  onEdit,
  onFind,
}: {
  slots: FormalSlot[]
  byUser: (id: string) => Student | undefined
  reload: () => void
  onEdit: (s: FormalSlot) => void
  onFind: () => void
}) {
  const hosting = slots.filter((s) => s.mine)
  const going = slots.filter((s) => s.booked)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try {
      await fn()
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const when = (s: FormalSlot) => `${fmtDay(s.day, { weekday: 'short', day: 'numeric', month: 'short' })} · ${s.time}`

  if (!hosting.length && !going.length)
    return (
      <Card className="text-center">
        <p className="font-semibold text-oxford-900">Nothing here yet</p>
        <p className="mt-1 text-sm text-gray-500">Seats you book and formals you offer will show here.</p>
        <button className={`${btnPrimary} mt-4`} onClick={onFind}>
          🔎 Find a seat
        </button>
      </Card>
    )

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {going.length > 0 && (
        <Card>
          <h3 className="font-semibold text-oxford-900">🥂 You’re going</h3>
          <ul className="mt-3 space-y-3">
            {going.map((s) => {
              const host = byUser(s.host)
              return (
                <li key={s.id} className="rounded-2xl p-3 ring-1 ring-gray-200">
                  <div className="font-semibold text-oxford-900">
                    {s.college} · {when(s)}
                  </div>
                  <div className="text-sm text-gray-600">
                    With {host?.full_name ?? 'a classmate'} ·{' '}
                    {s.price ? `${fmtPrice(s.price)}, pay them directly` : 'free, on the host'}
                  </div>
                  {s.notes && <p className="mt-1 text-xs text-gray-500">{s.notes}</p>}
                  <Guests ids={s.guests} byUser={byUser} label="Going" />
                  {host && <HostContact host={host} />}
                  <button
                    className="mt-3 text-sm text-red-700 underline"
                    onClick={() => confirm('Give up your seat?') && run(() => api.formalCancel(s.id))}
                  >
                    Cancel my seat
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
      {hosting.length > 0 && (
        <Card>
          <h3 className="font-semibold text-oxford-900">🎓 You’re hosting</h3>
          <ul className="mt-3 space-y-3">
            {hosting.map((s) => (
              <li key={s.id} className="rounded-2xl p-3 ring-1 ring-gray-200">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-oxford-900">
                      {s.college} · {when(s)}
                    </div>
                    <div className="text-sm text-gray-600">
                      {fmtPrice(s.price)}
                      {s.price > 0 && ' per seat'} · {s.taken} of {plural(s.capacity, 'seat')} booked
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-3 text-sm">
                    <button className="text-oxford-500 underline" onClick={() => onEdit(s)}>
                      Edit
                    </button>
                    <button
                      className="text-red-700 underline"
                      onClick={() =>
                        confirm(
                          s.taken
                            ? `Delete this formal? ${plural(s.taken, 'person has', 'people have')} a seat: let them know.`
                            : 'Delete this formal?',
                        ) && run(() => api.deleteFormal(s.id))
                      }
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {s.guests.length ? (
                  <ul className="mt-2 space-y-1.5">
                    {s.guests.map((g) => {
                      const st = byUser(g)
                      return (
                        <li key={g} className="flex items-center gap-2 text-sm">
                          {st && <Avatar name={st.full_name} url={st.photo_url} size={28} />}
                          {st ? (
                            <Link
                              to={`/people/${st.id}`}
                              className="min-w-0 flex-1 truncate text-oxford-900 hover:underline"
                            >
                              {st.full_name}
                            </Link>
                          ) : (
                            <span className="flex-1 text-gray-500">A classmate</span>
                          )}
                          <button
                            className="text-xs text-gray-500 underline"
                            onClick={() =>
                              confirm(`Take ${st ? callName(st) : 'this guest'} off your formal?`) &&
                              run(() => api.formalCancel(s.id, g))
                            }
                          >
                            Remove
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-gray-500">No bookings yet.</p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function Guests({ ids, byUser, label }: { ids: string[]; byUser: (id: string) => Student | undefined; label: string }) {
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

/* ------------------------------------------------------------------ Offer */

function OfferForm({
  initial,
  onDone,
  onCancel,
}: {
  initial: FormalSlot | null
  onDone: () => void
  onCancel?: () => void
}) {
  const { me } = useStore()
  const today = londonToday()
  const [college, setCollege] = useState(initial?.college ?? me?.college ?? '')
  const [day, setDay] = useState(initial?.day ?? addDays(today, 3))
  const [time, setTime] = useState(initial?.time ?? '19:15')
  const [price, setPrice] = useState(initial ? String(initial.price) : '')
  const [capacity, setCapacity] = useState(initial?.capacity ?? 1)
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const minSeats = Math.max(1, initial?.taken ?? 0)

  const save = async () => {
    const p = price.trim() === '' ? 0 : Number(price)
    if (!college) return setError('Choose the college.')
    if (!day || day < today) return setError('Choose a day from today on.')
    if (!/^\d{2}:\d{2}$/.test(time)) return setError('Choose a time.')
    if (!Number.isFinite(p) || p < 0 || p > 500) return setError('The price must be between £0 and £500.')
    const input: FormalInput = {
      college,
      day,
      time,
      price: Math.round(p * 100) / 100,
      capacity,
      notes: notes.trim() || null,
    }
    setBusy(true)
    setError(null)
    try {
      await api.saveFormal(input, initial?.id)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <h3 className="font-semibold text-oxford-900">{initial ? 'Edit your formal' : 'Offer seats at your formal'}</h3>
      <p className="mt-0.5 text-xs text-gray-500">
        Classmates book a seat here; you agree the payment with them directly.
      </p>
      <div className="mt-4 space-y-3">
        <Field label="College">
          <select value={college} onChange={(e) => setCollege(e.target.value)} className={inputCls}>
            <option value="">Choose…</option>
            {COLLEGES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Day">
            <input type="date" value={day} min={today} onChange={(e) => setDay(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Time">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price per seat (£)" hint="Leave empty if it’s free.">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={500}
              step={0.5}
              value={price}
              placeholder="0"
              onChange={(e) => setPrice(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Seats" group>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="grid h-10 w-10 place-items-center rounded-lg bg-white text-lg ring-1 ring-gray-200 disabled:opacity-40"
                onClick={() => setCapacity((c) => Math.max(minSeats, c - 1))}
                disabled={capacity <= minSeats}
                aria-label="One seat less"
              >
                −
              </button>
              <span className="w-6 text-center text-lg font-bold text-oxford-900" aria-live="polite">
                {capacity}
              </span>
              <button
                type="button"
                className="grid h-10 w-10 place-items-center rounded-lg bg-white text-lg ring-1 ring-gray-200 disabled:opacity-40"
                onClick={() => setCapacity((c) => Math.min(10, c + 1))}
                disabled={capacity >= 10}
                aria-label="One seat more"
              >
                +
              </button>
            </div>
          </Field>
        </div>
        <Field label="Notes (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder="Dress code, where to meet, gowns…"
            className={inputCls}
          />
        </Field>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex gap-2">
        {onCancel && (
          <button className={btnSecondary} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        <button className={`${btnPrimary} flex-1`} onClick={save} disabled={busy}>
          {busy ? 'Saving…' : initial ? 'Save' : `Offer ${plural(capacity, 'seat')}`}
        </button>
      </div>
    </Card>
  )
}
