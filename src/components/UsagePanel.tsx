import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { UsageData } from '../lib/types'
import { Card, Spinner } from './ui'

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0)
const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** Admin-only: how people are using the app. Totals only, never individual activity. */
export function UsagePanel() {
  const [data, setData] = useState<UsageData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.adminUsage().then(setData, (e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  if (error) return <Card><p className="text-sm text-red-700">Couldn’t load usage stats: {error}</p></Card>
  if (!data) return <Spinner label="Loading usage…" />

  const p = data.profiles
  const completeness: [string, number][] = [
    ['📸 Photo', p.photo],
    ['🎂 Birthday', p.birthday],
    ['🗺️ Country', p.country],
    ['🎾 Hobbies', p.hobbies],
    ['🗣️ Languages', p.languages],
    ['✍️ Intro', p.bio],
  ]
  const weekChanges = data.daily.slice(-7).reduce((n, d) => n + d.changes, 0)

  return (
    <Card>
      <h2 className="font-semibold text-oxford-900">📈 Usage</h2>
      <p className="mb-3 text-xs text-gray-500">Only you see this. Totals only: no names, no individual activity or ratings.</p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile value={data.claimed} label="profiles claimed" sub={`${pct(data.claimed, data.cohort)}% of ${data.cohort} students`} />
        <Tile value={data.active.d7} label="active this week" sub={`${data.active.d1} today · ${data.active.d30} this month`} />
        <Tile value={data.trackers} label="tracking classmates" sub={`${pct(data.trackers, data.claimed)}% of claimed profiles`} />
        <Tile value={weekChanges} label="level changes" sub="in the last 7 days" />
      </div>

      <h3 className="mt-5 mb-0.5 text-sm font-semibold text-oxford-900">Daily active users, last 30 days</h3>
      <p className="mb-2 text-[11px] text-gray-500">
        Active = opened the app or did something in it (changed a level, posted, RSVP’d). Days are Oxford time.
      </p>
      <DailyBars days={data.daily} pick={(d) => d.active} unit="active" />

      <h3 className="mt-5 mb-2 text-sm font-semibold text-oxford-900">Level changes per day</h3>
      <DailyBars days={data.daily} pick={(d) => d.changes} unit="changes" />

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-oxford-900">Profile completeness</h3>
          <ul className="space-y-1.5">
            {completeness
              .sort((a, b) => b[1] - a[1])
              .map(([label, n]) => (
                <li key={label} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-2 text-sm">
                  <span className="text-gray-700">{label}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                    <span className="block h-full rounded-full bg-oxford-500" style={{ width: `${pct(n, data.claimed)}%` }} />
                  </span>
                  <span className="text-right text-xs text-gray-600 tabular-nums" title={`${n} of ${data.claimed}`}>
                    {pct(n, data.claimed)}%
                  </span>
                </li>
              ))}
          </ul>
          <p className="mt-1 text-[11px] text-gray-400">Share of claimed profiles that have each field.</p>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-oxford-900">Engagement</h3>
          <ul className="space-y-1 text-sm text-gray-700">
            <Row label="Classmates marked (total)" value={data.ratings} />
            <Row label="Avg. per tracking person" value={data.trackers ? (data.ratings / data.trackers).toFixed(1) : '0'} />
            <Row label="★ Want-to-meet marks" value={data.stars} />
            <Row label="Private notes written" value={data.notes} />
            <Row label="📅 Events (upcoming)" value={`${data.resources.events} (${data.resources.upcoming_events})`} />
            <Row label="RSVPs" value={data.resources.rsvps} />
            <Row label="🎵 Songs" value={data.resources.songs} />
            <Row label="📢 Active notices" value={data.resources.notices} />
            <Row label="Accounts created" value={data.accounts} />
          </ul>
        </div>
      </div>
    </Card>
  )
}

function Tile({ value, label, sub }: { value: number; label: string; sub: string }) {
  return (
    <div className="rounded-xl bg-oxford-50 px-3 py-2.5">
      <div className="font-display text-2xl font-bold text-oxford-900 tabular-nums">{value}</div>
      <div className="text-xs font-medium text-oxford-900">{label}</div>
      <div className="text-[11px] text-gray-500">{sub}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: number | string }) {
  return (
    <li className="flex justify-between gap-2 border-b border-gray-100 py-1 last:border-0">
      <span>{label}</span>
      <b className="text-oxford-900 tabular-nums">{value}</b>
    </li>
  )
}

function DailyBars({
  days,
  pick,
  unit,
}: {
  days: UsageData['daily']
  pick: (d: UsageData['daily'][number]) => number
  unit: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const values = days.map(pick)
  const max = Math.max(1, ...values)
  const shown = hover ?? values.length - 1
  return (
    <div>
      <div className="mb-1 text-xs text-gray-600" aria-live="polite">
        {days[shown] && (
          <>
            {hover === null ? 'Today' : fmtDay(days[shown].day)}: <b className="text-oxford-900">{values[shown]}</b> {unit}
          </>
        )}
      </div>
      <div className="flex h-24 items-end gap-[2px]" role="img" aria-label={`${unit} per day over the last 30 days`}>
        {values.map((v, i) => (
          <div
            key={days[i].day}
            className="flex h-full flex-1 cursor-default items-end"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => setHover(hover === i ? null : i)}
          >
            <div
              className={`w-full rounded-t ${hover === i ? 'bg-oxford-900' : 'bg-oxford-500'}`}
              style={{ height: `${Math.max(v ? 4 : 1, (v / max) * 100)}%`, opacity: v ? 1 : 0.25 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-gray-400">
        <span>{fmtDay(days[0].day)}</span>
        <span>{fmtDay(days[days.length - 1].day)}</span>
      </div>
    </div>
  )
}
