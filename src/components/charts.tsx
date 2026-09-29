import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { LEVELS } from '../lib/options'
import type { GroupRow, WeekPoint } from '../lib/stats'
import { Flag } from './ui'

// Level colours: one-hue ordinal ramp, defined in index.css.
export const LEVEL_COLORS = ['var(--color-lvl-0)', 'var(--color-lvl-1)', 'var(--color-lvl-2)', 'var(--color-lvl-3)', 'var(--color-lvl-4)']

function Tooltip({ x, y, children }: { x: number | string; y: number | string; children: ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute z-10 -mt-2 -translate-x-1/2 -translate-y-full rounded-lg bg-oxford-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg"
      style={{ left: x, top: y }}
    >
      {children}
    </div>
  )
}

export function LevelLegend({ counts }: { counts?: number[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
      {LEVELS.map((l) => (
        <li key={l.value} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: LEVEL_COLORS[l.value] }} />
          {l.short}
          {counts && <b className="text-oxford-900">{counts[l.value]}</b>}
        </li>
      ))}
    </ul>
  )
}

/** One 100% stacked bar: how the whole cohort splits across levels. */
export function LevelBar({ counts }: { counts: number[] }) {
  const total = counts.reduce((a, b) => a + b, 0) || 1
  const [hover, setHover] = useState<{ i: number; x: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  // Draw highest level first so "Friends" anchors the left edge.
  const order = [4, 3, 2, 1, 0]
  return (
    <div ref={ref} className="relative">
      <div className="flex h-7 gap-[2px] overflow-hidden rounded-md" role="img" aria-label={LEVELS.map((l) => `${l.short}: ${counts[l.value]}`).join(', ')}>
        {order.map((i) =>
          counts[i] ? (
            <div
              key={i}
              style={{ width: `${(counts[i] / total) * 100}%`, background: LEVEL_COLORS[i] }}
              className="h-full min-w-[3px] first:rounded-l-md last:rounded-r-md"
              onMouseMove={(e) => {
                const r = ref.current!.getBoundingClientRect()
                setHover({ i, x: e.clientX - r.left })
              }}
              onMouseLeave={() => setHover(null)}
            />
          ) : null,
        )}
      </div>
      {hover && (
        <Tooltip x={hover.x} y={0}>
          {LEVELS[hover.i].emoji} {LEVELS[hover.i].label}: <b>{counts[hover.i]}</b> ({Math.round((counts[hover.i] / total) * 100)}%)
        </Tooltip>
      )}
    </div>
  )
}

/** Rows of stacked bars: for each group, the share of classmates at each level ≥ 1. */
export function BreakdownBars({ rows, limit = 12, withFlags }: { rows: GroupRow[]; limit?: number; withFlags?: boolean }) {
  const [showAll, setShowAll] = useState(false)
  const [hover, setHover] = useState<{ row: GroupRow; x: number; y: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const shown = showAll ? rows : rows.slice(0, limit)
  return (
    <div ref={ref} className="relative">
      <ul className="space-y-2.5">
        {shown.map((row) => {
          const met = row.total - row.counts[0]
          return (
            <li
              key={row.group}
              className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[minmax(0,13rem)_1fr_auto]"
              onMouseMove={(e) => {
                const r = ref.current!.getBoundingClientRect()
                setHover({ row, x: e.clientX - r.left, y: e.currentTarget.offsetTop })
              }}
              onMouseLeave={() => setHover(null)}
            >
              <span className="truncate text-gray-700" title={row.group}>
                {withFlags && <Flag country={row.group} className="mr-1.5" />}
                {row.group}
              </span>
              <div className="flex h-3.5 gap-[2px] overflow-hidden rounded bg-gray-100">
                {[4, 3, 2, 1].map((i) =>
                  row.counts[i] ? (
                    <div
                      key={i}
                      className="h-full first:rounded-l last:rounded-r"
                      style={{ width: `${(row.counts[i] / row.total) * 100}%`, background: LEVEL_COLORS[i] }}
                    />
                  ) : null,
                )}
              </div>
              <span className="w-14 text-right text-xs text-gray-500 tabular-nums">
                <b className="text-oxford-900">{met}</b>/{row.total}
              </span>
            </li>
          )
        })}
      </ul>
      {hover && (
        <Tooltip x={hover.x} y={hover.y}>
          <div className="mb-0.5 font-semibold">{hover.row.group}</div>
          {[4, 3, 2, 1, 0].map((i) => (
            <div key={i}>
              {LEVELS[i].short}: {hover.row.counts[i]}
            </div>
          ))}
        </Tooltip>
      )}
      {rows.length > limit && (
        <button className="mt-3 text-sm text-oxford-500 underline" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  )
}

const SERIES = [
  { key: 'met' as const, label: 'Met (hello or more)', color: '#2a78d6' },
  { key: 'positive' as const, label: 'Great conversation or friends', color: '#eb6834' },
]

export function ProgressChart({ points, total }: { points: WeekPoint[]; total: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(640)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = 220
  const pad = { l: 34, r: 12, t: 12, b: 26 }
  const maxY = Math.max(5, total ? Math.min(total, Math.ceil(Math.max(...points.map((p) => p.met)) * 1.15)) : 5)
  const x = (i: number) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (points.length - 1)) * (W - pad.l - pad.r))
  const y = (v: number) => pad.t + (1 - v / maxY) * (H - pad.t - pad.b)
  const ticks = useMemo(() => {
    const step = Math.max(1, Math.ceil(maxY / 4 / 5) * 5)
    const t: number[] = []
    for (let v = 0; v <= maxY; v += step) t.push(v)
    return t
  }, [maxY])
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const labelEvery = Math.ceil(points.length / Math.max(2, Math.floor(W / 90)))

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="relative" ref={box}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          className="block w-full"
          role="img"
          aria-label="Weekly progress"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            const px = ((e.clientX - r.left) / r.width) * W
            let best = 0
            points.forEach((_, i) => {
              if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i
            })
            setHover(best)
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e7e6e2" strokeWidth={1} />
              <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#6b6a66">
                {t}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            i % labelEvery === 0 || i === points.length - 1 ? (
              <text
                key={i}
                x={x(i)}
                y={H - 6}
                textAnchor={i === points.length - 1 && points.length > 1 ? 'end' : i === 0 && points.length > 1 ? 'start' : 'middle'}
                fontSize={11}
                fill="#6b6a66"
              >
                {fmt(p.weekStart)}
              </text>
            ) : null,
          )}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="#9a9994" strokeWidth={1} />}
          {SERIES.map((s) => (
            <g key={s.key}>
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={points.map((p, i) => `${x(i)},${y(p[s.key])}`).join(' ')}
              />
              {points.map((p, i) => (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(p[s.key])}
                  r={hover === i || points.length === 1 ? 4.5 : 0}
                  fill={s.color}
                  stroke="#fff"
                  strokeWidth={2}
                />
              ))}
            </g>
          ))}
        </svg>
        {hover !== null && (
          <Tooltip x={`${(x(hover) / W) * 100}%`} y={`${(y(points[hover].met) / H) * 100}%`}>
            <div className="font-semibold">Week of {fmt(points[hover].weekStart)}</div>
            <div>Met: {points[hover].met}</div>
            <div>Great chat or friends: {points[hover].positive}</div>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
