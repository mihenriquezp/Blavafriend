import { useMemo, useState, type ReactNode } from 'react'
import { COUNTRIES, COUNTRY_CODE, LEVELS, type Level } from '../lib/options'

export function Avatar({ name, url, size = 48 }: { name: string; url?: string | null; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
  const style = { width: size, height: size, fontSize: size * 0.38 }
  if (url) {
    return <img src={url} alt="" style={style} className="shrink-0 rounded-full object-cover bg-oxford-100" loading="lazy" />
  }
  return (
    <div style={style} className="grid shrink-0 place-items-center rounded-full bg-oxford-100 font-semibold text-oxford-700">
      {initials || '?'}
    </div>
  )
}

export function LevelBadge({ level }: { level: Level }) {
  const l = LEVELS[level]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        level === 0 ? 'bg-gray-100 text-gray-500' : level === 4 ? 'bg-oxford-900 text-white' : 'bg-oxford-50 text-oxford-700'
      }`}
    >
      <span aria-hidden>{l.emoji}</span>
      {l.short}
    </span>
  )
}

export function LevelPicker({ value, onChange, compact }: { value: Level; onChange: (l: Level) => void; compact?: boolean }) {
  return (
    <div role="radiogroup" aria-label="How well do you know them?" className="grid grid-cols-5 gap-1">
      {LEVELS.map((l) => {
        const active = value === l.value
        return (
          <button
            key={l.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={l.label}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onChange(l.value)
            }}
            className={`flex flex-col items-center justify-center rounded-xl border px-1 transition ${
              compact ? 'py-1.5' : 'py-2.5'
            } ${
              active
                ? l.value === 4
                  ? 'border-oxford-900 bg-oxford-900 text-white'
                  : l.value === 0
                    ? 'border-gray-400 bg-gray-100 text-gray-700'
                    : 'border-oxford-500 bg-oxford-50 text-oxford-900'
                : 'border-gray-200 bg-white text-gray-500 hover:border-oxford-300'
            }`}
          >
            <span className={compact ? 'text-base' : 'text-lg'} aria-hidden>
              {l.emoji}
            </span>
            <span className="text-[10px] leading-tight font-medium sm:text-xs">{l.short}</span>
          </button>
        )
      })}
    </div>
  )
}

export function StarButton({ starred, onToggle }: { starred: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle()
      }}
      aria-pressed={starred}
      title={starred ? 'Remove from “want to meet”' : 'Add to “want to meet”'}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xl transition ${
        starred ? 'text-gold' : 'text-gray-300 hover:text-gold'
      }`}
    >
      {starred ? '★' : '☆'}
    </button>
  )
}

export function Chip({ children, active, onClick }: { children: ReactNode; active?: boolean; onClick?: () => void }) {
  const cls = `inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition ${
    active ? 'border-oxford-700 bg-oxford-700 text-white' : 'border-gray-200 bg-white text-gray-700'
  }`
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} hover:border-oxford-300`}>
      {children}
    </button>
  ) : (
    <span className={cls}>{children}</span>
  )
}

/** Multi-select over a closed list, with optional "Other…" to add a new option. */
export function TagPicker({
  options,
  value,
  onChange,
  onAddOther,
  placeholder = 'Search…',
  groups,
}: {
  options: readonly string[]
  value: string[]
  onChange: (v: string[]) => void
  onAddOther?: (label: string) => Promise<void> | void
  placeholder?: string
  groups?: { group: string; items: string[] }[]
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o])
  const norm = q.trim().toLowerCase()
  const filtered = useMemo(() => options.filter((o) => o.toLowerCase().includes(norm)), [options, norm])
  const exact = options.some((o) => o.toLowerCase() === norm)

  const grouped = useMemo(() => {
    if (!groups || norm) return [{ group: '', items: filtered }]
    const inGroups = new Set(groups.flatMap((g) => g.items))
    const rest = options.filter((o) => !inGroups.has(o))
    return [...groups, ...(rest.length ? [{ group: 'Added by classmates', items: rest }] : [])]
  }, [groups, filtered, norm, options])

  return (
    <div>
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => toggle(v)}
              className="inline-flex items-center gap-1 rounded-full bg-oxford-700 px-2.5 py-1 text-xs font-medium text-white"
            >
              {v} <span aria-hidden>×</span>
              <span className="sr-only">remove</span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-medium text-oxford-500 hover:underline"
      >
        {open ? 'Done' : value.length ? 'Edit selection' : 'Choose…'}
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-gray-200 bg-white p-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            className="mb-3 w-full rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-oxford-500"
          />
          <div className="max-h-72 space-y-3 overflow-y-auto">
            {grouped.map((g) =>
              g.items.length ? (
                <div key={g.group}>
                  {g.group && <div className="mb-1 text-xs font-semibold text-gray-500 uppercase">{g.group}</div>}
                  <div className="flex flex-wrap gap-1.5">
                    {g.items.map((o) => (
                      <Chip key={o} active={value.includes(o)} onClick={() => toggle(o)}>
                        {o}
                      </Chip>
                    ))}
                  </div>
                </div>
              ) : null,
            )}
            {!filtered.length && <p className="text-sm text-gray-500">No matches.</p>}
          </div>
          {onAddOther && norm && !exact && (
            <button
              type="button"
              onClick={async () => {
                const label = q.trim().replace(/\s+/g, ' ')
                const pretty = label[0].toUpperCase() + label.slice(1)
                await onAddOther(pretty)
                onChange([...value, pretty])
                setQ('')
              }}
              className="mt-3 w-full rounded-lg border border-dashed border-oxford-300 px-3 py-2 text-sm font-medium text-oxford-700 hover:bg-oxford-50"
            >
              + Other: add “{q.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm ${className}`}>{children}</div>
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="grid min-h-[40vh] place-items-center text-sm text-gray-500" role="status">
      <div className="flex items-center gap-2">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-oxford-200 border-t-oxford-700" />
        {label}
      </div>
    </div>
  )
}

/**
 * Form field with a label. Use `group` for composite pickers (buttons, lists):
 * a <label> would forward clicks to its first control and mis-select options.
 */
export function Field({
  label,
  hint,
  group,
  children,
}: {
  label: string
  hint?: string
  group?: boolean
  children: ReactNode
}) {
  const inner = (
    <>
      <span className="mb-1 block text-sm font-semibold text-oxford-900">{label}</span>
      {hint && <span className="mb-1.5 block text-xs text-gray-500">{hint}</span>}
      {children}
    </>
  )
  return group ? (
    <div role="group" aria-label={label} className="block">
      {inner}
    </div>
  ) : (
    <label className="block">{inner}</label>
  )
}

export const inputCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 outline-none focus:border-oxford-500 focus:ring-2 focus:ring-oxford-100'

export const btnPrimary =
  'inline-flex items-center justify-center rounded-xl bg-oxford-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-oxford-700 disabled:opacity-50'

export const btnSecondary =
  'inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-oxford-900 hover:border-oxford-300 disabled:opacity-50'

/** Small flag image (emoji flags don't render on Windows). */
export function Flag({ country, className = '' }: { country: string | null | undefined; className?: string }) {
  const code = country ? COUNTRY_CODE[country] : undefined
  if (!code) return null
  return (
    <img
      src={`/flags/${code}.svg`}
      alt=""
      title={country ?? undefined}
      loading="lazy"
      className={`inline-block h-[0.85em] w-auto rounded-[2px] align-[-0.05em] shadow-[0_0_0_1px_rgba(0,0,0,0.08)] ${className}`}
    />
  )
}

/** "🇨🇱 Chile" with a flag image in front. */
export function CountryLabel({ country }: { country: string | null | undefined }) {
  if (!country) return null
  return (
    <span className="whitespace-nowrap">
      <Flag country={country} className="mr-1" />
      {country}
    </span>
  )
}

// Other names people may type when looking for their country.
const COUNTRY_ALIASES: Record<string, string[]> = {
  Palestine: ['palestina', 'state of palestine', 'palestinian territories', 'occupied palestinian territory'],
  'United States': ['usa', 'us', 'america', 'estados unidos', 'eeuu'],
  'United Kingdom': ['uk', 'britain', 'great britain', 'england', 'scotland', 'wales', 'northern ireland', 'reino unido'],
  'South Korea': ['korea', 'republic of korea', 'corea'],
  'North Korea': ['dprk'],
  "Côte d'Ivoire": ['ivory coast', 'cote divoire'],
  'Czech Republic': ['czechia'],
  Eswatini: ['swaziland'],
  'Timor-Leste': ['east timor'],
  'DR Congo': ['democratic republic of the congo', 'drc', 'congo kinshasa'],
  Congo: ['republic of the congo', 'congo brazzaville'],
  Myanmar: ['burma'],
  Turkey: ['turkiye', 'türkiye', 'turquia'],
  'North Macedonia': ['macedonia'],
  Netherlands: ['holland', 'paises bajos'],
  'Cape Verde': ['cabo verde'],
  Brazil: ['brasil'],
  Mexico: ['méxico'],
  Spain: ['españa'],
  Germany: ['alemania', 'deutschland'],
  Japan: ['japon'],
  China: ['prc'],
  'United Arab Emirates': ['uae', 'emirates'],
  Russia: ['russian federation'],
  Vietnam: ['viet nam'],
  Laos: ['lao'],
}

const foldText = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, '')

/** Type-to-search country picker with flags (a 198-item <select> is hard to use). */
export function CountryPicker({
  value,
  onChange,
  placeholder = 'Type to search, e.g. “pal”',
}: {
  value: string | null
  onChange: (v: string | null) => void
  placeholder?: string
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const matches = useMemo(() => {
    const n = foldText(q).trim()
    if (!n) return COUNTRIES
    return COUNTRIES.filter(
      (c) => foldText(c).includes(n) || (COUNTRY_ALIASES[c] ?? []).some((a) => foldText(a).startsWith(n)),
    )
  }, [q])
  const pick = (c: string | null) => {
    onChange(c)
    setQ('')
    setOpen(false)
  }

  if (!open)
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`${inputCls} flex items-center justify-between text-left`}
        >
          {value ? <CountryLabel country={value} /> : <span className="text-gray-400">Choose a country…</span>}
          <span className="ml-2 text-gray-400" aria-hidden>
            ▾
          </span>
        </button>
        {value && (
          <button type="button" onClick={() => pick(null)} className="shrink-0 text-xs text-gray-500 underline">
            Clear
          </button>
        )}
      </div>
    )

  return (
    <div className="rounded-xl border border-oxford-300 bg-white p-2">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (matches[0]) pick(matches[0])
          } else if (e.key === 'Escape') setOpen(false)
        }}
        placeholder={placeholder}
        className={inputCls}
        aria-label="Search countries"
      />
      <ul className="mt-2 max-h-56 overflow-y-auto" role="listbox">
        {matches.map((c) => (
          <li key={c}>
            <button
              type="button"
              role="option"
              aria-selected={c === value}
              onClick={() => pick(c)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-oxford-50 ${c === value ? 'bg-oxford-50 font-semibold' : ''}`}
            >
              <CountryLabel country={c} />
            </button>
          </li>
        ))}
        {!matches.length && <li className="px-3 py-2 text-sm text-gray-500">No country matches “{q}”.</li>}
      </ul>
      <button type="button" onClick={() => setOpen(false)} className="mt-1 text-xs text-gray-500 underline">
        Cancel
      </button>
    </div>
  )
}
