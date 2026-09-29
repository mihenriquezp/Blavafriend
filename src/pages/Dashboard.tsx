import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BreakdownBars, LevelBar, LevelLegend, ProgressChart } from '../components/charts'
import { Avatar, Card, LevelBadge } from '../components/ui'
import { DIMENSIONS, breakdown, levelCounts, weeklyProgress, type Dimension } from '../lib/stats'
import { callName } from '../lib/names'
import { useStore } from '../lib/store'
import type { Level } from '../lib/options'

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0)

export default function Dashboard() {
  const { me, classmates, relationships, events } = useStore()
  const [dim, setDim] = useState<Dimension>('continent')

  const counts = useMemo(() => levelCounts(classmates, relationships), [classmates, relationships])
  const total = classmates.length
  const met = total - counts[0]
  const positive = counts[3] + counts[4]
  const rows = useMemo(() => breakdown(classmates, relationships, dim), [classmates, relationships, dim])
  const progress = useMemo(() => weeklyProgress(events, new Set(classmates.map((s) => s.id))), [events, classmates])

  const starred = classmates.filter((s) => relationships.get(s.id)?.starred)
  const nextUp = starred.slice(0, 6)

  const suggestions = useMemo(() => {
    if (!me) return []
    const mine = new Set([...me.hobbies, ...me.policy_interests])
    if (!mine.size) return []
    return classmates
      .filter((s) => (relationships.get(s.id)?.level ?? 0) === 0)
      .map((s) => ({ s, shared: [...s.hobbies, ...s.policy_interests].filter((t) => mine.has(t)) }))
      .filter((x) => x.shared.length > 0)
      .sort((a, b) => b.shared.length - a.shared.length || a.s.full_name.localeCompare(b.s.full_name))
      .slice(0, 5)
  }, [me, classmates, relationships])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-oxford-900">Hi {me && callName(me)} 👋</h1>
        <p className="text-sm text-gray-500">Your private overview of the {total + 1}-strong cohort. Only you see this.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Classmates met" value={met} sub={`of ${total} · ${pct(met, total)}%`} />
        <Tile label="Great chat or friends" value={positive} sub={`${pct(positive, total)}% of the cohort`} />
        <Tile label="Friends 💙" value={counts[4]} sub="your inner circle" />
        <Tile
          label="Want to meet ★"
          value={starred.length}
          sub={starred.length ? 'still on your list' : 'star people to build it'}
        />
      </div>

      <Card>
        <h2 className="mb-3 font-semibold text-oxford-900">Where you stand with everyone</h2>
        <LevelBar counts={counts} />
        <div className="mt-3">
          <LevelLegend counts={counts} />
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold text-oxford-900">Coverage by group</h2>
          <span className="text-xs text-gray-500">met / total in group</span>
        </div>
        <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist">
          {DIMENSIONS.map((d) => (
            <button
              key={d.value}
              role="tab"
              aria-selected={dim === d.value}
              onClick={() => setDim(d.value)}
              className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${
                dim === d.value ? 'bg-oxford-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <BreakdownBars rows={rows} />
        <div className="mt-4">
          <LevelLegend />
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-oxford-900">Your progress, week by week</h2>
        {progress.length ? (
          <ProgressChart points={progress} total={total} />
        ) : (
          <p className="text-sm text-gray-500">Once you start marking people you've met, your weekly progress shows up here.</p>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold text-oxford-900">★ Next up from your list</h2>
          {nextUp.length ? (
            <PersonList people={nextUp} />
          ) : (
            <p className="text-sm text-gray-500">
              Star classmates you want to meet and they’ll show up here. Once you move them up a level, they come off the
              list.{' '}
              <Link to="/people" className="text-oxford-500 underline">
                Browse people
              </Link>
            </p>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold text-oxford-900">You might click with…</h2>
          {suggestions.length ? (
            <ul className="space-y-2">
              {suggestions.map(({ s, shared }) => (
                <li key={s.id}>
                  <Link to={`/people/${s.id}`} className="flex items-center gap-3">
                    <Avatar name={s.full_name} url={s.photo_url} size={40} />
                    <div className="min-w-0">
                      <div className="truncate font-medium text-oxford-900">{s.full_name}</div>
                      <div className="truncate text-xs text-gray-500">Both into {shared.slice(0, 3).join(', ')}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">
              Add hobbies and policy interests to{' '}
              <Link to="/me" className="text-oxford-500 underline">
                your profile
              </Link>{' '}
              to get suggestions of people you haven't met who share them.
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: number | string; sub: string }) {
  return (
    <Card className="!p-3.5">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="font-display text-3xl font-bold text-oxford-900 tabular-nums">{value}</div>
      <div className="text-xs text-gray-500">{sub}</div>
    </Card>
  )
}

function PersonList({ people }: { people: { id: string; full_name: string; photo_url: string | null; college: string | null }[] }) {
  const { relationships } = useStore()
  return (
    <ul className="space-y-2">
      {people.map((s) => (
        <li key={s.id}>
          <Link to={`/people/${s.id}`} className="flex items-center gap-3">
            <Avatar name={s.full_name} url={s.photo_url} size={40} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-oxford-900">{s.full_name}</div>
              <div className="truncate text-xs text-gray-500">{s.college}</div>
            </div>
            <LevelBadge level={(relationships.get(s.id)?.level ?? 0) as Level} />
          </Link>
        </li>
      ))}
    </ul>
  )
}
