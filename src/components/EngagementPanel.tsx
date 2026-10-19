import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { fmtDay } from '../lib/coffee'
import type { EngagementData, EngagementFeature, EngagementSegment } from '../lib/types'
import { Spinner } from './ui'

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0)
const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1)

// Groups are ordered from most to least engaged: one hue, dark to light (the app's level ramp).
type Group = EngagementSegment | 'none'
const GROUPS: Record<Group, { label: string; hint: string; color: string }> = {
  core: { label: 'Core', hint: '8+ days in 4 weeks (2+ a week)', color: '#0d366b' },
  regular: { label: 'Regular', hint: '3–7 days in 4 weeks', color: '#1c5cab' },
  occasional: { label: 'Occasional', hint: '1–2 days in 4 weeks', color: '#3987e5' },
  dormant: { label: 'Dormant', hint: 'has an account, not in 4 weeks', color: '#86b6ef' },
  none: { label: 'Not joined', hint: 'no account yet', color: '#d6d5d0' },
}

// Weekly mix: categorical, validated (adjacent pairs pass for colour-blind readers); gold is light,
// so every value is also written out below the chart.
const WEEK_SERIES = [
  { key: 'kept', label: 'Kept coming', hint: 'also active the week before', color: '#1c5cab' },
  { key: 'back', label: 'Came back', hint: 'used it before, not the week before', color: '#2a9d8f' },
  { key: 'new', label: 'First time', hint: 'first ever active week', color: '#c9a227' },
] as const

const FEATURES: [EngagementFeature, string][] = [
  ['levels', '👥 Marked people'],
  ['newsletter', '📰 Newsletter'],
  ['coffee', '☕ Coffee'],
  ['tools', '🧰 Tools'],
  ['events', '📅 RSVPs'],
  ['formals', '🎓 Formals'],
]

/** Admin: is it the same few people every time, or many people now and then? Counts only. */
export function EngagementPanel() {
  const [data, setData] = useState<EngagementData | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.adminEngagement().then(setData, (e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  if (error) return <p className="text-sm text-red-700">Couldn’t load engagement: {error}</p>
  if (!data) return <Spinner label="Loading engagement…" />

  return (
    <div className="space-y-5">
      <Summary data={data} />
      <Groups data={data} />
      <DaysHistogram data={data} />
      <Weekly data={data} />
      <FeaturesByGroup data={data} />
    </div>
  )
}

/* ------------------------------------------------------------- summary */

function trendSentence(weeks: EngagementData['weeks']) {
  const done = weeks.slice(0, -1) // the last week isn't over yet
  const now = done.slice(-2)
  const before = done.slice(-4, -2)
  const people = (w: typeof done) => w.reduce((n, x) => n + x.active, 0) / w.length
  const freq = (w: typeof done) => {
    const a = w.reduce((n, x) => n + x.active, 0)
    return a ? w.reduce((n, x) => n + x.person_days, 0) / a : 0
  }
  if (now.length < 2 || before.length < 2 || !people(before) || !people(now)) return null
  const dp = people(now) / people(before) - 1
  const df = freq(before) ? freq(now) / freq(before) - 1 : 0
  const dir = (x: number) => (x > 0.1 ? 1 : x < -0.1 ? -1 : 0)
  const p = dir(dp)
  const f = dir(df)
  const text =
    p > 0
      ? f < 0
        ? 'More people are using it, each a bit less often.'
        : 'More people are using it, and at least as often.'
      : p === 0
        ? f > 0
          ? 'About the same people, coming back more often.'
          : f < 0
            ? 'About the same people, coming a bit less often.'
            : 'Steady: about the same people, as often as before.'
        : f > 0
          ? 'Fewer people, but those who stay use it more: it’s concentrating.'
          : 'Fewer people, and less often: usage is dropping.'
  return {
    text,
    detail: `Last 2 full weeks vs the 2 before: ${one(people(before))} → ${one(people(now))} people a week, ${one(freq(before))} → ${one(freq(now))} days each.`,
  }
}

function Summary({ data }: { data: EngagementData }) {
  const c = data.concentration
  const share = pct(c.top20_days, c.total_days)
  const trend = trendSentence(data.weeks)
  const spread =
    share >= 50
      ? 'Usage is concentrated: a small core carries most of it.'
      : share >= 35
        ? 'Usage is moderately concentrated.'
        : 'Usage is spread out: many people use it a little.'
  return (
    <div className="rounded-2xl bg-oxford-50 p-4 text-sm text-gray-700">
      <ul className="space-y-2">
        <li>
          👥 <b>{c.active}</b> of {data.joined} classmates with an account ({pct(c.active, data.joined)}%) used the app
          in the last 4 weeks. {data.cohort - data.joined} of {data.cohort} students haven’t joined yet.
        </li>
        {c.active > 0 && (
          <li>
            🎯 The most active 20% ({c.top20_people} {c.top20_people === 1 ? 'person' : 'people'}) account for{' '}
            <b>{share}%</b> of all active days. {spread}
          </li>
        )}
        {trend && (
          <li>
            📈 <b>{trend.text}</b> <span className="text-gray-500">{trend.detail}</span>
          </li>
        )}
      </ul>
    </div>
  )
}

/* -------------------------------------------------------------- groups */

function Groups({ data }: { data: EngagementData }) {
  const rows: { key: Group; n: number; days: number }[] = [
    ...data.segments.map((s) => ({ key: s.key as Group, n: s.n, days: s.days })),
    { key: 'none', n: data.cohort - data.joined, days: 0 },
  ]
  const total = rows.reduce((n, r) => n + r.n, 0)
  const [hover, setHover] = useState<Group | null>(null)
  const shown = rows.find((r) => r.key === hover)
  return (
    <section>
      <h4 className="text-sm font-semibold text-oxford-900">Groups of students</h4>
      <p className="mb-2 text-[11px] text-gray-500">
        By how many days each person used the app in the last 4 weeks. Every student counted once.
      </p>
      <div className="flex h-7 gap-[2px] overflow-hidden rounded-md" role="img" aria-label="Students by group">
        {rows
          .filter((r) => r.n > 0)
          .map((r) => (
            <button
              key={r.key}
              type="button"
              className="h-full min-w-[3px] transition-opacity"
              style={{
                width: `${(r.n / total) * 100}%`,
                background: GROUPS[r.key].color,
                opacity: hover && hover !== r.key ? 0.45 : 1,
              }}
              onMouseEnter={() => setHover(r.key)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setHover(hover === r.key ? null : r.key)}
              aria-label={`${GROUPS[r.key].label}: ${r.n} students`}
            />
          ))}
      </div>
      <p className="mt-1 h-4 text-xs text-gray-600">
        {shown &&
          `${GROUPS[shown.key].label}: ${shown.n} students (${pct(shown.n, total)}%)${
            shown.n && shown.days ? ` · ${one(shown.days / shown.n)} active days each` : ''
          }`}
      </p>
      <ul className="mt-1 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.key} className="flex items-baseline gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 translate-y-[1px] rounded-full"
              style={{ background: GROUPS[r.key].color }}
            />
            <span className="font-semibold text-oxford-900">{GROUPS[r.key].label}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-gray-500">{GROUPS[r.key].hint}</span>
            <span className="text-gray-700 tabular-nums">
              {r.n} <span className="text-xs text-gray-400">· {pct(r.n, total)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ----------------------------------------------------------- histogram */

function DaysHistogram({ data }: { data: EngagementData }) {
  const max = Math.max(1, ...data.histogram.map((h) => h.n))
  return (
    <section>
      <h4 className="text-sm font-semibold text-oxford-900">How often people come</h4>
      <p className="mb-2 text-[11px] text-gray-500">
        Students with an account, by number of days they used the app in the last 4 weeks.
      </p>
      <div className="flex h-36 items-end gap-2 border-b border-gray-200 px-1">
        {data.histogram.map((h) => (
          <div
            key={h.label}
            className="flex h-full flex-1 flex-col items-center justify-end"
            title={`${h.label} days: ${h.n} people`}
          >
            <span className="mb-0.5 text-xs text-gray-700 tabular-nums">{h.n}</span>
            <span
              className="w-full max-w-[24px] rounded-t bg-oxford-500"
              style={{ height: `calc((100% - 18px) * ${h.n / max})`, minHeight: h.n ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2 px-1">
        {data.histogram.map((h) => (
          <span key={h.label} className="flex-1 text-center text-[11px] text-gray-500">
            {h.label}
          </span>
        ))}
      </div>
      <p className="mt-0.5 text-center text-[11px] text-gray-400">active days in the last 4 weeks</p>
    </section>
  )
}

/* -------------------------------------------------------------- weekly */

function Weekly({ data }: { data: EngagementData }) {
  const weeks = data.weeks.map((w) => {
    const kept = w.returning
    const newer = w.new
    return { ...w, kept, back: Math.max(0, w.active - kept - newer), new: newer }
  })
  const max = Math.max(1, ...weeks.map((w) => w.active))
  const lastDone = weeks.length - 2
  const [hover, setHover] = useState<number | null>(null)
  const i = hover ?? lastDone
  const w = weeks[i]
  const prev = weeks[i - 1]
  const label = (k: number) => fmtDay(weeks[k].week, { day: 'numeric', month: 'short' })
  const short = (k: number) => {
    const [, m, d] = weeks[k].week.split('-')
    return `${+d}/${+m}`
  }

  return (
    <section>
      <h4 className="text-sm font-semibold text-oxford-900">Week by week</h4>
      <p className="mb-2 text-[11px] text-gray-500">
        People active each week (Monday to Sunday), split by whether they also came the week before. The last week is
        still going.
      </p>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
        {WEEK_SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-xs text-gray-700">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            <b className="font-semibold">{s.label}</b>
            <span className="text-gray-500">{s.hint}</span>
          </li>
        ))}
      </ul>
      {w && (
        <p className="mb-1 min-h-8 text-xs text-gray-600">
          <b className="text-oxford-900">
            Week of {label(i)}
            {i === weeks.length - 1 && ' (so far)'}:
          </b>{' '}
          {w.active} people · {w.kept} kept coming · {w.back} came back · {w.new} first time
          {w.active > 0 && ` · ${one(w.person_days / w.active)} days each`}
          {prev?.active ? ` · ${pct(w.kept, prev.active)}% of the week before’s people stayed` : ''}
        </p>
      )}
      <div className="flex h-40 items-end gap-1.5 border-b border-gray-200 px-1" onMouseLeave={() => setHover(null)}>
        {weeks.map((wk, k) => (
          <button
            key={wk.week}
            type="button"
            className={`flex h-full flex-1 flex-col items-center justify-end ${k === weeks.length - 1 ? 'opacity-50' : ''}`}
            onMouseEnter={() => setHover(k)}
            onClick={() => setHover(k)}
            aria-label={`Week of ${label(k)}: ${wk.active} people`}
          >
            <span className={`mb-0.5 text-xs tabular-nums ${k === i ? 'font-bold text-oxford-900' : 'text-gray-600'}`}>
              {wk.active}
            </span>
            <span
              className="flex w-full max-w-[24px] flex-col-reverse gap-[2px]"
              style={{ height: `calc((100% - 18px) * ${wk.active / max})` }}
            >
              {WEEK_SERIES.filter((s) => wk[s.key] > 0).map((s, j, arr) => (
                <span
                  key={s.key}
                  className={j === arr.length - 1 ? 'rounded-t' : ''}
                  style={{ flexGrow: wk[s.key], flexBasis: 0, minHeight: 2, background: s.color }}
                />
              ))}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5 px-1">
        {weeks.map((wk, k) => (
          <span key={wk.week} className="flex-1 text-center text-[10px] leading-tight text-gray-500">
            {label(k)}
          </span>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-right text-[11px] tabular-nums">
          <thead>
            <tr className="text-gray-500">
              <th className="py-1 text-left font-medium">Week of</th>
              {weeks.map((wk, k) => (
                <th key={wk.week} className="px-0.5 py-1 font-medium">
                  {short(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-gray-700">
            <tr className="border-t border-gray-100">
              <td className="py-1 text-left text-gray-500">People</td>
              {weeks.map((wk) => (
                <td key={wk.week} className="px-1">
                  {wk.active}
                </td>
              ))}
            </tr>
            <tr className="border-t border-gray-100">
              <td className="py-1 text-left text-gray-500">Days each</td>
              {weeks.map((wk) => (
                <td key={wk.week} className="px-1">
                  {wk.active ? one(wk.person_days / wk.active) : '–'}
                </td>
              ))}
            </tr>
            <tr className="border-t border-gray-100">
              <td className="py-1 text-left text-gray-500">Stayed</td>
              {weeks.map((wk, k) => (
                <td key={wk.week} className="px-1">
                  {k && weeks[k - 1].active ? `${pct(wk.kept, weeks[k - 1].active)}%` : '–'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        <p className="mt-1 text-[11px] text-gray-400">
          “Stayed” = share of the week before’s people who were active again this week. If “People” grows while “Days
          each” falls, more people are using it less often.
        </p>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------- features */

function FeaturesByGroup({ data }: { data: EngagementData }) {
  const groups = data.segments.filter((s) => s.key !== 'dormant' && s.n > 0)
  if (!groups.length) return null
  return (
    <section>
      <h4 className="text-sm font-semibold text-oxford-900">What each group does</h4>
      <p className="mb-2 text-[11px] text-gray-500">
        Share of each group that used each part of the app in the last 4 weeks (beyond opening it).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-xs text-gray-500">
              <th className="py-1 text-left font-medium" />
              {groups.map((g) => (
                <th key={g.key} className="px-1 py-1 text-right font-medium">
                  <span
                    className="mr-1 inline-block h-2 w-2 rounded-full"
                    style={{ background: GROUPS[g.key].color }}
                    aria-hidden
                  />
                  {GROUPS[g.key].label}
                  <span className="block text-gray-400">{g.n} people</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURES.map(([f, label]) => (
              <tr key={f} className="border-t border-gray-100">
                <td className="py-1.5 pr-1 text-gray-700">{label}</td>
                {groups.map((g) => {
                  const v = pct(g.features[f] ?? 0, g.n)
                  return (
                    <td key={g.key} className="px-1 py-1.5 text-right tabular-nums">
                      <span
                        className="inline-block min-w-[2.75rem] rounded-md px-1 py-0.5 text-gray-800"
                        style={{ background: `rgba(28, 92, 171, ${(v / 100) * 0.35})` }}
                      >
                        {v}%
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
