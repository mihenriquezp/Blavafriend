import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Avatar, Chip, CountryLabel, LevelBadge, LevelPicker, StarButton, inputCls } from '../components/ui'
import { CONTINENTS, FAMILY_OPTIONS, GENDER_OPTIONS, LEVELS, POLICY_INTERESTS, continentOf, type Level } from '../lib/options'
import { useStore } from '../lib/store'
import type { Student } from '../lib/types'

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export function matchesName(s: Student, q: string) {
  const n = fold(`${s.full_name} ${s.nickname ?? ''}`)
  return fold(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => n.includes(t))
}

function matchesText(s: Student, q: string) {
  const hay = fold(
    [
      s.full_name,
      s.nickname,
      s.job_title,
      s.bio,
      s.country_origin,
      s.country_residence,
      s.college,
      ...s.hobbies,
      ...s.policy_interests,
      ...s.undergrad_fields,
    ]
      .filter(Boolean)
      .join(' '),
  )
  return fold(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t))
}

type Sort = 'name' | 'level-asc' | 'level-desc' | 'recent'

const MULTI_KEYS = ['policy', 'hobby', 'lang', 'degree', 'level'] as const
const SINGLE_KEYS = ['country', 'residence', 'continent', 'college', 'family', 'gender'] as const

export default function People({ wishlist = false }: { wishlist?: boolean }) {
  const { classmates, relationships, setRelationship, hobbyOptions, languageOptions, degreeOptions } = useStore()
  const [params, setParams] = useSearchParams()
  const [showFilters, setShowFilters] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  const q = params.get('q') ?? ''
  const sort = (params.get('sort') as Sort) ?? 'name'
  const starredOnly = wishlist || params.get('starred') === '1'
  const multi = (k: (typeof MULTI_KEYS)[number]) => params.getAll(k)
  const single = (k: (typeof SINGLE_KEYS)[number]) => params.get(k) ?? ''

  const update = (fn: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(params)
    fn(next)
    setParams(next, { replace: true })
  }
  const setSingle = (k: string, v: string) => update((p) => (v ? p.set(k, v) : p.delete(k)))
  const toggleMulti = (k: string, v: string) =>
    update((p) => {
      const cur = p.getAll(k)
      p.delete(k)
      ;(cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).forEach((x) => p.append(k, x))
    })

  const countries = useMemo(
    () => [...new Set(classmates.map((s) => s.country_origin).filter(Boolean) as string[])].sort(),
    [classmates],
  )
  const residences = useMemo(
    () => [...new Set(classmates.map((s) => s.country_residence).filter(Boolean) as string[])].sort(),
    [classmates],
  )
  const colleges = useMemo(
    () => [...new Set(classmates.map((s) => s.college).filter(Boolean) as string[])].sort(),
    [classmates],
  )

  const filtered = useMemo(() => {
    const lvl = (s: Student) => relationships.get(s.id)?.level ?? 0
    const policies = multi('policy')
    const hobbies = multi('hobby')
    const langs = multi('lang')
    const degrees = multi('degree')
    const levels = multi('level').map(Number)
    const list = classmates.filter((s) => {
      if (q && !matchesText(s, q)) return false
      if (starredOnly && !relationships.get(s.id)?.starred) return false
      if (single('country') && s.country_origin !== single('country')) return false
      if (single('residence') && s.country_residence !== single('residence')) return false
      if (single('continent') && continentOf(s.country_origin) !== single('continent')) return false
      if (single('college') && s.college !== single('college')) return false
      if (single('family') && s.family_status !== single('family')) return false
      if (single('gender') && s.gender !== single('gender')) return false
      if (degrees.length && !degrees.some((d) => s.undergrad_fields.includes(d))) return false
      if (policies.length && !policies.some((p) => s.policy_interests.includes(p))) return false
      if (hobbies.length && !hobbies.some((h) => s.hobbies.includes(h))) return false
      if (langs.length && !langs.some((l) => s.languages.includes(l))) return false
      if (levels.length && !levels.includes(lvl(s))) return false
      return true
    })
    const byName = (a: Student, b: Student) => a.full_name.localeCompare(b.full_name)
    return list.sort((a, b) => {
      if (sort === 'level-asc') return lvl(a) - lvl(b) || byName(a, b)
      if (sort === 'level-desc') return lvl(b) - lvl(a) || byName(a, b)
      if (sort === 'recent')
        return (relationships.get(b.id)?.updated_at ?? '').localeCompare(relationships.get(a.id)?.updated_at ?? '') || byName(a, b)
      return byName(a, b)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classmates, relationships, params, starredOnly])

  const activeCount =
    MULTI_KEYS.reduce((n, k) => n + params.getAll(k).length, 0) +
    SINGLE_KEYS.filter((k) => params.get(k)).length +
    (!wishlist && params.get('starred') === '1' ? 1 : 0)

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-oxford-900">{wishlist ? 'Want to meet' : 'People'}</h1>
          <p className="text-sm text-gray-500">
            {wishlist
              ? 'Classmates you starred. They leave the list once you move them up a level.'
              : `${filtered.length} of ${classmates.length} classmates`}
          </p>
        </div>
        <select
          value={sort}
          onChange={(e) => setSingle('sort', e.target.value === 'name' ? '' : e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm"
          aria-label="Sort"
        >
          <option value="name">A–Z</option>
          <option value="level-asc">Least known first</option>
          <option value="level-desc">Best known first</option>
          <option value="recent">Recently updated</option>
        </select>
      </div>

      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setSingle('q', e.target.value)}
          placeholder="Search name, role, hobby…"
          className={inputCls}
          type="search"
        />
        <button
          onClick={() => setShowFilters((s) => !s)}
          className={`shrink-0 rounded-lg border px-3 text-sm font-semibold ${
            activeCount ? 'border-oxford-700 bg-oxford-700 text-white' : 'border-gray-200 bg-white text-oxford-900'
          }`}
        >
          Filters{activeCount ? ` (${activeCount})` : ''}
        </button>
      </div>

      {showFilters && (
        <div className="mt-3 space-y-4 rounded-2xl border border-gray-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Select label="Continent (origin)" value={single('continent')} options={[...CONTINENTS]} onChange={(v) => setSingle('continent', v)} />
            <Select label="Country of origin" value={single('country')} options={countries} onChange={(v) => setSingle('country', v)} />
            <Select label="Country of residence" value={single('residence')} options={residences} onChange={(v) => setSingle('residence', v)} />
            <Select label="College" value={single('college')} options={colleges} onChange={(v) => setSingle('college', v)} />
            <Select
              label="Coming with"
              value={single('family')}
              options={FAMILY_OPTIONS.map((f) => f.value)}
              labels={Object.fromEntries(FAMILY_OPTIONS.map((f) => [f.value, f.label]))}
              onChange={(v) => setSingle('family', v)}
            />
            <Select
              label="Gender"
              value={single('gender')}
              options={GENDER_OPTIONS.map((g) => g.value)}
              labels={Object.fromEntries(GENDER_OPTIONS.map((g) => [g.value, g.label]))}
              onChange={(v) => setSingle('gender', v)}
            />
          </div>
          <ChipFilter
            label="How well you know them"
            options={LEVELS.map((l) => String(l.value))}
            labels={Object.fromEntries(LEVELS.map((l) => [String(l.value), `${l.emoji} ${l.short}`]))}
            value={multi('level')}
            onToggle={(v) => toggleMulti('level', v)}
          />
          <ChipFilter label="Policy interests (any)" options={[...POLICY_INTERESTS]} value={multi('policy')} onToggle={(v) => toggleMulti('policy', v)} collapsible />
          <ChipFilter label="Hobbies (any)" options={hobbyOptions} value={multi('hobby')} onToggle={(v) => toggleMulti('hobby', v)} collapsible />
          <ChipFilter label="Languages (any)" options={languageOptions} value={multi('lang')} onToggle={(v) => toggleMulti('lang', v)} collapsible />
          <ChipFilter label="Undergraduate degree (any)" options={degreeOptions} value={multi('degree')} onToggle={(v) => toggleMulti('degree', v)} collapsible />
          {!wishlist && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={starredOnly} onChange={(e) => setSingle('starred', e.target.checked ? '1' : '')} />
              Only people I want to meet ★
            </label>
          )}
          {activeCount > 0 && (
            <button
              className="text-sm text-oxford-500 underline"
              onClick={() =>
                update((p) => [...MULTI_KEYS, ...SINGLE_KEYS, 'starred'].forEach((k) => p.delete(k)))
              }
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      <ul className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
        {filtered.map((s) => {
          const rel = relationships.get(s.id)
          const level = (rel?.level ?? 0) as Level
          return (
            <li key={s.id} className="rounded-2xl border border-gray-200/80 bg-white shadow-sm">
              <div className="flex items-center gap-3 p-3">
                <Link to={`/people/${s.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={s.full_name} url={s.photo_url} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-oxford-900">
                    {s.full_name}
                    {s.nickname && <span className="font-normal text-gray-500"> “{s.nickname}”</span>}
                  </div>
                  <div className="truncate text-xs text-gray-500">
                    {s.country_origin || s.college ? (
                      <>
                        <CountryLabel country={s.country_origin} />
                        {s.country_origin && s.college && ' · '}
                        {s.college}
                      </>
                    ) : (
                      '—'
                    )}
                  </div>
                  <div className="truncate text-xs text-gray-400">{s.job_title}</div>
                </div>
                </Link>
                <div className="flex flex-col items-end gap-1">
                  <StarButton starred={!!rel?.starred} onToggle={() => setRelationship(s.id, { starred: !rel?.starred })} />
                  <button
                    onClick={() => setEditing(editing === s.id ? null : s.id)}
                    aria-label="Change level"
                    aria-expanded={editing === s.id}
                  >
                    <LevelBadge level={level} />
                  </button>
                </div>
              </div>
              {editing === s.id && (
                <div className="border-t border-gray-100 p-2">
                  <LevelPicker
                    compact
                    value={level}
                    onChange={(l) => {
                      setRelationship(s.id, { level: l })
                      setEditing(null)
                    }}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {!filtered.length && (
        <p className="mt-10 text-center text-gray-500">
          {wishlist ? 'No one starred yet. Go to People and tap ☆ on classmates you want to meet.' : 'No classmates match these filters.'}
        </p>
      )}
    </div>
  )
}

function Select({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  labels?: Record<string, string>
  onChange: (v: string) => void
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold text-oxford-900">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {labels?.[o] ?? o}
          </option>
        ))}
      </select>
    </label>
  )
}

function ChipFilter({
  label,
  options,
  labels,
  value,
  onToggle,
  collapsible,
}: {
  label: string
  options: string[]
  labels?: Record<string, string>
  value: string[]
  onToggle: (v: string) => void
  collapsible?: boolean
}) {
  const [open, setOpen] = useState(!collapsible)
  const shown = open ? options : options.filter((o) => value.includes(o))
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-semibold text-oxford-900">{label}</span>
        {collapsible && (
          <button className="text-xs text-oxford-500 underline" onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide options' : 'Show options'}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((o) => (
          <Chip key={o} active={value.includes(o)} onClick={() => onToggle(o)}>
            {labels?.[o] ?? o}
          </Chip>
        ))}
      </div>
    </div>
  )
}
