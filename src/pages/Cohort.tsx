import { useEffect, useMemo, useState } from 'react'
import { ProgressChart } from '../components/charts'
import { Constellation } from '../components/Constellation'
import { Card, Spinner } from '../components/ui'
import { WorldMap, shareColor } from '../components/WorldMap'
import { api } from '../lib/api'
import type { CohortData } from '../lib/types'

const MILESTONES = [25, 50, 75]
const fmt = (n: number) => n.toLocaleString('en-GB')
const pct = (n: number, d: number) => (d ? (n / d) * 100 : 0)

const SHORT: Record<string, string> = {
  'Latin America & Caribbean': 'Latin America',
  'North America': 'N. America',
}

export default function Cohort() {
  const [data, setData] = useState<CohortData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [minLevel, setMinLevel] = useState(1)
  const [asTable, setAsTable] = useState(false)

  useEffect(() => {
    api.getCohort().then(setData, (e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  if (error) return <p className="text-red-700">Couldn’t load the cohort view: {error}</p>
  if (!data) return <Spinner label="Connecting the dots…" />

  const totalPairs = (data.students * (data.students - 1)) / 2
  const index = pct(data.pairs.met, totalPairs)
  const next = MILESTONES.find((m) => m > index)
  const toNext = next ? Math.ceil((next / 100) * totalPairs) - data.pairs.met : 0
  const avg = data.students ? (2 * data.pairs.met) / data.students : 0

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-oxford-900">Our cohort 🌐</h1>
        <p className="text-sm text-gray-500">
          How well do we all know each other? Built from everyone’s levels, completely anonymous.
        </p>
      </div>

      <Card>
        <div className="text-sm font-medium text-gray-500">Cohort Connection Index</div>
        <div className="flex items-baseline gap-3">
          <span className="font-display text-5xl font-bold text-oxford-900 tabular-nums">{index.toFixed(index < 10 ? 1 : 0)}%</span>
          <span className="text-sm text-gray-600">
            of all {fmt(totalPairs)} possible pairs of classmates have met
          </span>
        </div>
        <MilestoneBar value={index} />
        <p className="mt-2 text-sm text-gray-600">
          {next ? (
            <>
              Next milestone: <b>{next}%</b>, just <b>{fmt(toNext)}</b> more pairs to go.
            </>
          ) : (
            <>All milestones reached. What a cohort! 🎉</>
          )}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat value={fmt(data.pairs.met)} label="pairs have met" />
          <Stat value={fmt(data.pairs.great)} label="great conversations" />
          <Stat value={fmt(data.pairs.friends)} label="friendships 💙" />
        </div>
        <p className="mt-3 text-xs text-gray-500">
          On average each of us has met <b>{avg.toFixed(1)}</b> classmates. Based on the <b>{data.trackers}</b> of{' '}
          {data.students} classmates who have started marking people in Blavafriend, so the more of us join, the more
          accurate it gets.
        </p>
      </Card>

      <Card>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-oxford-900">The constellation</h2>
          <div className="flex gap-1" role="radiogroup" aria-label="Which ties to show">
            {[
              [1, 'All ties'],
              [3, 'Great chats +'],
              [4, 'Friends'],
            ].map(([v, label]) => (
              <button
                key={v}
                role="radio"
                aria-checked={minLevel === v}
                onClick={() => setMinLevel(v as number)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  minLevel === v ? 'bg-oxford-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-3 text-xs text-gray-500">
          Each dot is a classmate (no names), each line a pair who’ve met. Dots move around every time you open this
          page. Your dot <span className="font-semibold text-gold">●</span> only shows the ties you marked yourself.
        </p>
        <Constellation size={data.students} edges={data.edges} me={data.me} minLevel={minLevel} />
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
          {[
            ['Said hello', 'var(--color-lvl-1)'],
            ['First conversation', 'var(--color-lvl-2)'],
            ['Great conversation', 'var(--color-lvl-3)'],
            ['Friends', 'var(--color-lvl-4)'],
          ].map(([label, color], i) =>
            i + 1 >= minLevel ? (
              <li key={label} className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded" style={{ background: color, height: 1 + (i + 1) * 0.6 }} />
                {label}
              </li>
            ) : null,
          )}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-oxford-900">Week by week</h2>
        {data.weekly.length ? (
          <ProgressChart
            points={data.weekly.map((w) => ({ weekStart: new Date(`${w.week}T00:00:00`), met: w.met, positive: w.great }))}
            total={totalPairs}
            unit="pairs"
          />
        ) : (
          <p className="text-sm text-gray-500">The cohort’s progress will show up here once people start marking classmates.</p>
        )}
      </Card>

      <Card>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-oxford-900">Bridges across continents</h2>
          {data.groups.length >= 2 && (
            <button className="text-xs text-oxford-500 underline" onClick={() => setAsTable((t) => !t)}>
              {asTable ? 'Show as map' : 'Show as table'}
            </button>
          )}
        </div>
        <p className="mb-3 text-xs text-gray-500">
          How well we know each other within and across our continents of origin. Continents with fewer than 5 of us
          aren’t shown, to keep everyone anonymous.
        </p>
        {data.groups.length < 2 ? (
          <p className="text-sm text-gray-500">Not enough people have added their country yet.</p>
        ) : asTable ? (
          <MixingMatrix data={data} />
        ) : (
          <WorldMap data={data} />
        )}
      </Card>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-oxford-50 px-2 py-2.5">
      <div className="font-display text-xl font-bold text-oxford-900 tabular-nums">{value}</div>
      <div className="text-[11px] leading-tight text-gray-600">{label}</div>
    </div>
  )
}

function MilestoneBar({ value }: { value: number }) {
  return (
    <div className="relative mt-3 mb-5">
      <div className="h-3 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-oxford-700 transition-all" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      {MILESTONES.map((m) => (
        <div key={m} className="absolute top-0 -translate-x-1/2" style={{ left: `${m}%` }}>
          <div className={`h-3 w-0.5 ${value >= m ? 'bg-white/70' : 'bg-gray-300'}`} />
          <div className={`mt-0.5 text-[10px] ${value >= m ? 'font-semibold text-oxford-700' : 'text-gray-400'}`}>
            {value >= m ? '✓ ' : ''}
            {m}%
          </div>
        </div>
      ))}
    </div>
  )
}


function MixingMatrix({ data }: { data: CohortData }) {
  const [hover, setHover] = useState<string | null>(null)
  const groups = data.groups.map((g) => g.name)
  const cell = useMemo(() => {
    const m = new Map<string, { met: number; total: number }>()
    data.mixing.forEach((c) => {
      m.set(`${c.a}|${c.b}`, c)
      m.set(`${c.b}|${c.a}`, c)
    })
    return m
  }, [data.mixing])

  if (groups.length < 2)
    return <p className="text-sm text-gray-500">Not enough people have added their country yet.</p>

  const info = hover ? cell.get(hover) : null
  const [ha, hb] = hover ? hover.split('|') : []
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[3px] text-xs">
          <thead>
            <tr>
              <th />
              {groups.map((g) => (
                <th key={g} className="w-14 px-0.5 pb-1 text-center align-bottom leading-tight font-medium text-gray-600">
                  {SHORT[g] ?? g}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((a) => (
              <tr key={a}>
                <th className="pr-2 text-right font-medium whitespace-nowrap text-gray-600">{SHORT[a] ?? a}</th>
                {groups.map((b) => {
                  const c = cell.get(`${a}|${b}`)
                  const share = c && c.total ? c.met / c.total : 0
                  const bg = shareColor(share)
                  const key = `${a}|${b}`
                  return (
                    <td key={b} className="p-0">
                      <button
                        type="button"
                        onMouseEnter={() => setHover(key)}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => setHover(hover === key ? null : key)}
                        className={`grid h-11 w-14 place-items-center rounded-md tabular-nums ${
                          a === b ? 'ring-2 ring-gold/70' : ''
                        } ${share > 0.45 ? 'text-white' : 'text-oxford-900'} ${hover === key ? 'outline-2 outline-oxford-900' : ''}`}
                        style={{ background: bg }}
                        aria-label={`${a} and ${b}: ${Math.round(share * 100)}% of pairs have met`}
                      >
                        {Math.round(share * 100)}%
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 min-h-[1.25rem] text-xs text-gray-600" aria-live="polite">
        {info ? (
          ha === hb ? (
            <>
              Within <b>{ha}</b>: {fmt(info.met)} of {fmt(info.total)} pairs have met.
            </>
          ) : (
            <>
              <b>{ha}</b> ↔ <b>{hb}</b>: {fmt(info.met)} of {fmt(info.total)} pairs have met.
            </>
          )
        ) : (
          <>Tap a square for details. Squares with a gold border are within the same continent.</>
        )}
      </p>
    </div>
  )
}
