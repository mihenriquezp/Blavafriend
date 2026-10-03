import { area, curveMonotoneX, line } from 'd3-shape'
import { useEffect, useMemo, useRef, useState } from 'react'
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

      <h3 className="mt-5 mb-0.5 text-sm font-semibold text-oxford-900">Time of day</h3>
      <p className="mb-2 text-[11px] text-gray-500">
        Average people active per day in each hour, last 30 days (Oxford time). Counts app opens and actions.
      </p>
      <HourlyChart hourly={data.hourly} />

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
            {data.coffee && (
              <>
                <Row label="☕ Coffee: signed up for next draw" value={data.coffee.next} />
                <Row label="☕ Coffee: “every week” on" value={data.coffee.auto} />
                {data.coffee.last && (
                  <Row label="☕ Coffee: last draw" value={`${data.coffee.last.people} people · ${data.coffee.last.groups} groups`} />
                )}
              </>
            )}
            <Row label="Accounts created" value={data.accounts} />
          </ul>
        </div>
      </div>
    </Card>
  )
}

type View = 'compare' | 'all' | 'weekdays' | 'weekend'
const VIEWS: [View, string][] = [
  ['compare', 'Compare'],
  ['all', 'Every day'],
  ['weekdays', 'Mon–Fri'],
  ['weekend', 'Sat–Sun'],
]
// Categorical slots 1–2 of the chart palette (validated pair).
const SERIES_STYLE = {
  all: { label: 'Every day', color: '#2a78d6' },
  weekdays: { label: 'Mon–Fri', color: '#2a78d6' },
  weekend: { label: 'Sat–Sun', color: '#eb6834' },
} as const
type SeriesKey = keyof typeof SERIES_STYLE

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`

/** Average people active per day in each hour, for the days that match `keep`. */
function perHour(hourly: UsageData['hourly'], keep: (dow: number) => boolean) {
  let days = 0
  for (let i = 0; i < 30; i++) {
    const d = new Date(Date.now() - i * 86_400_000).getDay() // 0 = Sun
    if (keep(d === 0 ? 7 : d)) days++
  }
  return Array.from({ length: 24 }, (_, h) =>
    hourly.filter((x) => x.hour === h && keep(x.dow)).reduce((n, x) => n + x.n, 0) / Math.max(1, days),
  )
}

const KEEP: Record<SeriesKey, (dow: number) => boolean> = {
  all: () => true,
  weekdays: (d) => d <= 5,
  weekend: (d) => d >= 6,
}

function HourlyChart({ hourly }: { hourly: UsageData['hourly'] }) {
  const [view, setView] = useState<View>('compare')
  const [hover, setHover] = useState<number | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const keys: SeriesKey[] = view === 'compare' ? ['weekdays', 'weekend'] : [view]
  const series = useMemo(
    () => keys.map((k) => ({ key: k, ...SERIES_STYLE[k], values: perHour(hourly, KEEP[k]) })),
    [hourly, view], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const H = 200
  const pad = { l: 30, r: 10, t: 14, b: 22 }
  const max = Math.max(0.5, ...series.flatMap((s) => s.values))
  // Round top so the middle gridline is a whole number too (e.g. 0 / 4 / 8).
  const niceMax = max * 1.15 > 2 ? Math.ceil((max * 1.15) / 2) * 2 : Math.ceil(max * 1.15 * 2) / 2
  const x = (h: number) => pad.l + (h / 23) * (width - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - v / niceMax) * (H - pad.t - pad.b)
  const ticks = [0, niceMax / 2, niceMax]
  const lineGen = line<number>().x((_, i) => x(i)).y((v) => y(v)).curve(curveMonotoneX)
  const areaGen = area<number>().x((_, i) => x(i)).y0(y(0)).y1((v) => y(v)).curve(curveMonotoneX)
  const hasData = series.some((s) => s.values.some((v) => v > 0))
  const peakOf = (vals: number[]) => vals.indexOf(Math.max(...vals))

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1" role="radiogroup" aria-label="Which days">
        {VIEWS.map(([v, label]) => (
          <button
            key={v}
            role="radio"
            aria-checked={view === v}
            onClick={() => setView(v)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              view === v ? 'bg-oxford-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        {series.map((s) => {
          const peak = peakOf(s.values)
          return (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: s.color }} />
              {s.label}
              {hasData && (
                <span className="text-gray-500">
                  · busiest <b className="text-oxford-900">{hh(peak)}</b>
                </span>
              )}
            </span>
          )
        })}
      </div>

      <div ref={wrap} className="relative">
        {!hasData ? (
          <div style={{ height: H }} className="grid place-items-center text-sm text-gray-500">
            No activity yet
          </div>
        ) : (
          <svg
            width={width}
            height={H}
            className="block touch-none"
            role="img"
            aria-label={series.map((s) => `${s.label}: busiest ${hh(peakOf(s.values))}`).join('; ')}
            onMouseLeave={() => setHover(null)}
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              const h = Math.round(((e.clientX - r.left - pad.l) / (width - pad.l - pad.r)) * 23)
              setHover(Math.max(0, Math.min(23, h)))
            }}
            onPointerDown={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              const h = Math.round(((e.clientX - r.left - pad.l) / (width - pad.l - pad.r)) * 23)
              setHover(Math.max(0, Math.min(23, h)))
            }}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="#e7e6e2" strokeWidth={1} />
                <text x={pad.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill="#6b6a66">
                  {Number.isInteger(t) ? t : t.toFixed(1)}
                </text>
              </g>
            ))}
            {(width < 480 ? [0, 6, 12, 18] : [0, 3, 6, 9, 12, 15, 18, 21]).map((h) => (
              <text key={h} x={x(h)} y={H - 6} textAnchor={h === 0 ? 'start' : 'middle'} fontSize={10} fill="#6b6a66">
                {hh(h)}
              </text>
            ))}
            {series.map((s) => (
              <path key={`a-${s.key}`} d={areaGen(s.values) ?? ''} fill={s.color} opacity={series.length > 1 ? 0.07 : 0.12} />
            ))}
            {series.map((s) => (
              <path
                key={`l-${s.key}`}
                d={lineGen(s.values) ?? ''}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {hover === null &&
              series.map((s) => {
                const p = peakOf(s.values)
                return <circle key={`p-${s.key}`} cx={x(p)} cy={y(s.values[p])} r={4.5} fill={s.color} stroke="#fff" strokeWidth={2} />
              })}
            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="#9a9994" strokeWidth={1} />
                {series.map((s) => (
                  <circle key={`h-${s.key}`} cx={x(hover)} cy={y(s.values[hover])} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />
                ))}
              </g>
            )}
          </svg>
        )}
        {hover !== null && hasData && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg bg-oxford-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg"
            style={{ left: Math.min(Math.max(x(hover), 70), width - 70) }}
          >
            <div className="font-semibold">
              {hh(hover)}–{hh((hover + 1) % 24)}
            </div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}: {s.values[hover].toFixed(1)} people/day
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
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
