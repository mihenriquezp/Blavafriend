import { useMemo, useState, type ReactNode } from 'react'
import { FAMILY_OPTIONS, GENDER_OPTIONS, continentOf } from '../lib/options'
import type { Student } from '../lib/types'
import { Flag } from './ui'

type Dim = 'country' | 'policy' | 'hobby' | 'degree' | 'language' | 'college'

const DIMS: { value: Dim; label: string; emoji: string; get: (s: Student) => string[] }[] = [
  { value: 'country', label: 'Countries', emoji: '🌍', get: (s) => (s.country_origin ? [s.country_origin] : []) },
  { value: 'policy', label: 'Policy interests', emoji: '🏛️', get: (s) => s.policy_interests },
  { value: 'hobby', label: 'Hobbies', emoji: '🎾', get: (s) => s.hobbies },
  { value: 'degree', label: 'Undergrad', emoji: '🎓', get: (s) => s.undergrad_fields },
  { value: 'language', label: 'Languages', emoji: '🗣️', get: (s) => s.languages },
  { value: 'college', label: 'Colleges', emoji: '🏰', get: (s) => (s.college ? [s.college] : []) },
]

const fmt = (n: number) => n.toLocaleString('en-GB')

function countBy(students: Student[], get: (s: Student) => string[]) {
  const m = new Map<string, number>()
  let answered = 0
  for (const s of students) {
    const vs = get(s)
    if (vs.length) answered++
    for (const v of vs) m.set(v, (m.get(v) ?? 0) + 1)
  }
  return { rows: [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), answered }
}

function quantile(sorted: number[], q: number) {
  const i = (sorted.length - 1) * q
  const lo = Math.floor(i)
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo)
}

/** A portrait of the cohort from everyone's (public) profiles. Students only. */
export function WhoWeAre({ students }: { students: Student[] }) {
  const [dim, setDim] = useState<Dim>('country')
  const [showAll, setShowAll] = useState(false)

  const facts = useMemo(() => {
    const countries = new Set(students.map((s) => s.country_origin).filter(Boolean))
    const continents = new Set(students.map((s) => continentOf(s.country_origin)).filter(Boolean))
    const languages = new Set(students.flatMap((s) => s.languages))
    const colleges = new Set(students.map((s) => s.college).filter(Boolean))
    const ages = students.map((s) => s.age).filter((a): a is number => a != null).sort((a, b) => a - b)
    const genders = countBy(students, (s) => (s.gender && s.gender !== 'prefer_not_say' ? [s.gender] : []))
    const family = students.filter((s) => s.family_status)
    const withFamily = family.filter((s) => s.family_status !== 'none').length
    return { countries, continents, languages, colleges, ages, genders, family, withFamily }
  }, [students])

  const current = DIMS.find((d) => d.value === dim)!
  const { rows, answered } = useMemo(() => countBy(students, current.get), [students, current])
  const shown = showAll ? rows : rows.slice(0, 8)
  const max = rows[0]?.[1] ?? 1
  const { ages } = facts

  return (
    <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-oxford-900 via-oxford-700 to-oxford-500 p-4 text-white shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold">Who we are ✨</h2>
          <p className="mt-0.5 text-xs text-white/70">
            A portrait of the cohort from everyone’s profiles (students only). It grows as more of us fill them in.
          </p>
        </div>
        <span className="text-4xl leading-none" aria-hidden>
          🌍
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
        <Big emoji="🎓" value={students.length} label="students" />
        <Big emoji="🗺️" value={facts.countries.size} label="countries" />
        <Big emoji="🧭" value={facts.continents.size} label="continents" />
        <Big emoji="🗣️" value={facts.languages.size} label="languages" />
        <Big emoji="🏛️" value={facts.colleges.size} label="colleges" className="hidden sm:block" />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <Fact emoji="🎂" title="Age">
          {ages.length >= 5 ? (
            <>
              Most of us are <b>{Math.round(quantile(ages, 0.25))}–{Math.round(quantile(ages, 0.75))}</b>, median{' '}
              <b>{Math.round(quantile(ages, 0.5))}</b>
            </>
          ) : (
            'Not enough ages yet'
          )}
          <Coverage n={ages.length} of={students.length} />
        </Fact>
        <Fact emoji="🧑‍🤝‍🧑" title="Gender">
          {facts.genders.answered ? (
            <span>
              {facts.genders.rows
                .map(([g, n]) => `${GENDER_OPTIONS.find((o) => o.value === g)?.label ?? g} ${Math.round((n / facts.genders.answered) * 100)}%`)
                .join(' · ')}
            </span>
          ) : (
            'Not enough answers yet'
          )}
          <Coverage n={facts.genders.answered} of={students.length} />
        </Fact>
        <Fact emoji="👨‍👩‍👧" title="With partner or family">
          {facts.family.length ? (
            <>
              <b>{Math.round((facts.withFamily / facts.family.length) * 100)}%</b> of us
              <span className="text-white/70">
                {' '}
                (
                {FAMILY_OPTIONS.filter((f) => f.value !== 'none')
                  .map((f) => `${f.label.replace('With ', '').toLowerCase()} ${facts.family.filter((s) => s.family_status === f.value).length}`)
                  .join(', ')}
                )
              </span>
            </>
          ) : (
            'Not enough answers yet'
          )}
          <Coverage n={facts.family.length} of={students.length} />
        </Fact>
      </div>

      <div className="mt-4 rounded-xl bg-white p-3 text-oxford-900 sm:p-4">
        <div className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist">
          {DIMS.map((d) => (
            <button
              key={d.value}
              role="tab"
              aria-selected={dim === d.value}
              onClick={() => {
                setDim(d.value)
                setShowAll(false)
              }}
              className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${
                dim === d.value ? 'bg-gold text-oxford-900' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span aria-hidden>{d.emoji}</span> {d.label}
            </button>
          ))}
        </div>
        {rows.length ? (
          <ul className="space-y-1.5">
            {shown.map(([label, n]) => (
              <li key={label} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[minmax(0,14rem)_1fr_auto]">
                <span className="truncate text-gray-700" title={label}>
                  {dim === 'country' && <Flag country={label} className="mr-1.5" />}
                  {label}
                </span>
                <span className="h-3 overflow-hidden rounded-full bg-gray-100">
                  <span className="block h-full rounded-full bg-gold" style={{ width: `${(n / max) * 100}%` }} />
                </span>
                <span className="w-8 text-right text-xs text-gray-600 tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Nobody has added this yet.</p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
          <span>
            {fmt(answered)} of {fmt(students.length)} have filled this in
          </span>
          {rows.length > 8 && (
            <button className="text-oxford-500 underline" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show top 8' : `Show all ${rows.length}`}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

function Big({ emoji, value, label, className = '' }: { emoji: string; value: number; label: string; className?: string }) {
  return (
    <div className={`rounded-xl bg-white/10 px-2 py-2.5 ring-1 ring-white/15 ${className}`}>
      <div className="text-xl leading-none" aria-hidden>
        {emoji}
      </div>
      <div className="mt-1 font-display text-2xl font-bold tabular-nums">{fmt(value)}</div>
      <div className="text-[11px] text-white/75">{label}</div>
    </div>
  )
}

function Fact({ emoji, title, children }: { emoji: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-white/10 p-3 ring-1 ring-white/15">
      <div className="mb-0.5 text-xs font-semibold tracking-wide text-white/70 uppercase">
        <span aria-hidden>{emoji}</span> {title}
      </div>
      <div>{children}</div>
    </div>
  )
}

function Coverage({ n, of }: { n: number; of: number }) {
  return (
    <div className="mt-1 text-[11px] text-white/55">
      based on {n} of {of}
    </div>
  )
}
