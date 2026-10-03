import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { coffeeWeek, fmtDay } from '../lib/coffee'
import { callName } from '../lib/names'
import { levelOf, useStore } from '../lib/store'
import type { CoffeeState, Student } from '../lib/types'
import { Avatar, Card, CountryLabel, FacultyBadge, LevelPicker, Spinner, btnPrimary } from './ui'

const weekLabel = (round: string) => {
  const { from, to } = coffeeWeek(round)
  return `${fmtDay(from, { weekday: 'short', day: 'numeric', month: 'short' })} – ${fmtDay(to, { weekday: 'short', day: 'numeric', month: 'short' })}`
}

const drawLabel = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

export function Coffee() {
  const { students } = useStore()
  const [state, setState] = useState<CoffeeState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.coffeeState().then(setState, (e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const run = useCallback(async (fn: () => Promise<CoffeeState>) => {
    setBusy(true)
    setError(null)
    try {
      setState(await fn())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  if (!state) return error ? <p className="text-red-700">Couldn’t load the coffee roulette: {error}</p> : <Spinner />

  const byId = (id: string) => students.find((s) => s.id === id)
  const current = state.matches.find((m) => m.round === state.latest_round)
  const past = state.matches.filter((m) => m.round < state.latest_round)

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-br from-amber-50 to-white">
        <h2 className="font-display text-xl font-bold text-oxford-900">
          <span aria-hidden>☕</span> Coffee roulette
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Every <b>Sunday at 20:00</b> everyone who signed up is matched for a coffee the following week. The draw puts
          together people who haven’t met yet first, and friends only as a last resort. Everyone who signs up gets a
          match.
        </p>
      </Card>

      {current && (
        <Card>
          <h3 className="font-semibold text-oxford-900">Your coffee this week</h3>
          <p className="text-xs text-gray-500">
            {weekLabel(current.round)} · Send them a message and find a time
            {current.partners.length > 1 && ' (you’re a group of three!)'}
          </p>
          <ul className="mt-3 space-y-3">
            {current.partners.map((id) => {
              const s = byId(id)
              return s ? <MatchCard key={id} student={s} /> : null
            })}
            {!current.partners.some(byId) && (
              <li className="text-sm text-gray-500">Your match is no longer in the app.</li>
            )}
          </ul>
        </Card>
      )}

      <Card>
        {state.open ? (
          <>
            <h3 className="font-semibold text-oxford-900">Next round</h3>
            <p className="text-xs text-gray-500">
              Draw on {drawLabel(state.draw_at)} · coffee in the week of {weekLabel(state.open_round)}
            </p>
            <p className="mt-3 text-sm text-gray-700">
              {state.entrants === 0
                ? 'Nobody has signed up yet. Be the first!'
                : `${state.entrants} ${state.entrants === 1 ? 'person has' : 'people have'} signed up so far.`}
            </p>
            {state.joined ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-semibold text-emerald-900">
                  ✓ You’re in
                </span>
                <button
                  className="text-sm text-gray-500 underline"
                  disabled={busy}
                  onClick={() => run(() => api.coffeeJoin(false))}
                >
                  {state.auto ? 'Skip this week' : 'Leave this week'}
                </button>
              </div>
            ) : (
              <button
                className={`${btnPrimary} mt-3 w-full`}
                disabled={busy}
                onClick={() => run(() => api.coffeeJoin(true))}
              >
                ☕ Join this week’s coffee
              </button>
            )}
          </>
        ) : (
          <>
            <h3 className="font-semibold text-oxford-900">This week’s draw is done</h3>
            <p className="mt-1 text-sm text-gray-600">Sign-ups for next week open on Monday.</p>
          </>
        )}

        <label className="mt-4 flex cursor-pointer items-start gap-3 border-t border-gray-100 pt-4">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 accent-oxford-900"
            checked={state.auto}
            disabled={busy}
            onChange={(e) => run(() => api.coffeeSetAuto(e.target.checked))}
          />
          <span className="text-sm">
            <span className="font-semibold text-oxford-900">Sign me up every week</span>
            <span className="block text-xs text-gray-500">
              You can still skip a week. It pauses on its own if you don’t open the app for 3 weeks, so nobody gets
              matched with someone who isn’t around.
            </span>
          </span>
        </label>
        {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      </Card>

      {past.length > 0 && (
        <Card>
          <h3 className="font-semibold text-oxford-900">Past coffees</h3>
          <ul className="mt-2 divide-y divide-gray-100">
            {past.map((m) => (
              <li key={m.round} className="flex items-center gap-3 py-2">
                <span className="w-24 shrink-0 text-xs text-gray-500">
                  {fmtDay(coffeeWeek(m.round).from, { day: 'numeric', month: 'short' })}
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1">
                  {m.partners.map((id) => {
                    const s = byId(id)
                    return s ? (
                      <Link
                        key={id}
                        to={`/people/${id}`}
                        className="flex min-w-0 items-center gap-2 text-sm hover:underline"
                      >
                        <Avatar name={s.full_name} url={s.photo_url} size={28} />
                        <span className="truncate">{callName(s)}</span>
                      </Link>
                    ) : null
                  })}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="px-1 text-xs text-gray-500">
        🔒 The draw reads both people’s levels only inside the database. Nobody, not even the admin, sees why two people
        were matched, and only you can see your match.
      </p>
    </div>
  )
}

function MatchCard({ student: s }: { student: Student }) {
  const { relationships, setRelationship } = useStore()
  return (
    <li className="rounded-2xl bg-gradient-to-r from-oxford-50 to-amber-50 p-3">
      <div className="flex items-center gap-3">
        <Avatar name={s.full_name} url={s.photo_url} size={56} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-oxford-900">
            {callName(s)}
            <FacultyBadge role={s.role} />
          </div>
          <div className="truncate text-xs text-gray-500">{s.full_name}</div>
          <div className="truncate text-xs text-gray-500">
            {s.country_origin && <CountryLabel country={s.country_origin} />}
            {s.country_origin && s.college && ' · '}
            {s.college}
          </div>
        </div>
        <Link
          to={`/people/${s.id}`}
          className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-oxford-900 hover:border-oxford-300"
        >
          Profile →
        </Link>
      </div>
      <p className="mb-1.5 mt-3 text-xs font-medium text-gray-600">Had your coffee? Update how well you know them:</p>
      <LevelPicker compact value={levelOf(relationships, s.id)} onChange={(l) => setRelationship(s.id, { level: l })} />
    </li>
  )
}
