import { geoNaturalEarth1, geoPath, type GeoPermissibleObjects } from 'd3-geo'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CohortData } from '../lib/types'

interface ContinentFeature {
  type: 'Feature'
  properties: { name: string }
  geometry: GeoPermissibleObjects
}
interface World {
  type: 'FeatureCollection'
  features: ContinentFeature[]
}

let worldCache: Promise<World> | null = null
const loadWorld = () => (worldCache ??= fetch('/world-continents.json').then((r) => r.json() as Promise<World>))

// Where each continent's label and arcs sit (lon, lat); centroids land in odd places.
const ANCHORS: Record<string, [number, number]> = {
  Africa: [18, 4],
  Asia: [92, 30],
  Europe: [18, 50],
  'Latin America & Caribbean': [-60, -12],
  'North America': [-100, 44],
  Oceania: [136, -25],
}
const SHORT: Record<string, string> = { 'Latin America & Caribbean': 'Latin America', 'North America': 'N. America' }

// One-hue sequential ramp for "share of pairs met" (light = few, dark = many).
export const SHARE_RAMP = ['#eef3f9', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#1c5cab', '#0d366b']
export const shareColor = (share: number) => SHARE_RAMP[Math.min(SHARE_RAMP.length - 1, Math.ceil(share * (SHARE_RAMP.length - 1)))]

const fmt = (n: number) => n.toLocaleString('en-GB')

/** World map: continents shaded by how well people within them know each other, arcs for pairs across them. */
export function WorldMap({ data }: { data: CohortData }) {
  const [world, setWorld] = useState<World | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)

  useEffect(() => {
    loadWorld().then(setWorld, () => setWorld(null))
  }, [])
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const height = Math.round(width * 0.5)
  const shown = useMemo(() => new Set(data.groups.map((g) => g.name)), [data.groups])
  const cell = useMemo(() => {
    const m = new Map<string, { a: string; b: string; met: number; total: number }>()
    data.mixing.forEach((c) => {
      m.set(`${c.a}|${c.b}`, c)
      m.set(`${c.b}|${c.a}`, c)
    })
    return m
  }, [data.mixing])

  const { path, project } = useMemo(() => {
    const projection = geoNaturalEarth1()
    if (world) projection.fitExtent([[4, 4], [width - 4, height - 4]], world as never)
    return { path: geoPath(projection), project: (p: [number, number]) => projection(p) ?? [0, 0] }
  }, [world, width, height])

  const arcs = data.mixing
    .filter((c) => c.a !== c.b && shown.has(c.a) && shown.has(c.b) && ANCHORS[c.a] && ANCHORS[c.b])
    .map((c) => {
      const [x1, y1] = project(ANCHORS[c.a])
      const [x2, y2] = project(ANCHORS[c.b])
      const [mx, my] = [(x1 + x2) / 2, (y1 + y2) / 2]
      const len = Math.hypot(x2 - x1, y2 - y1)
      // Bend every arc upwards (towards the top of the map).
      let [nx, ny] = [-(y2 - y1) / (len || 1), (x2 - x1) / (len || 1)]
      if (ny > 0) [nx, ny] = [-nx, -ny]
      const d = `M${x1},${y1} Q${mx + nx * len * 0.28},${my + ny * len * 0.28} ${x2},${y2}`
      const share = c.total ? c.met / c.total : 0
      return { key: `${c.a}|${c.b}`, d, share }
    })
    .sort((a, b) => a.share - b.share)

  const info = hover ? cell.get(hover) : null
  const [ha, hb] = hover ? hover.split('|') : []

  return (
    <div>
      <div ref={wrap} className="relative">
        {!world ? (
          <div style={{ height }} className="grid place-items-center rounded-xl bg-oxford-50/60 text-sm text-gray-500">
            Loading map…
          </div>
        ) : (
          <svg width={width} height={height} className="block rounded-xl bg-oxford-50/60" role="img" aria-label="World map of connections between continents">
            {world.features.map((f) => {
              const name = f.properties.name
              const within = cell.get(`${name}|${name}`)
              const isShown = shown.has(name)
              const share = within && within.total ? within.met / within.total : 0
              return (
                <path
                  key={name}
                  d={path(f.geometry) ?? undefined}
                  fill={isShown ? shareColor(share) : '#e3e6eb'}
                  stroke="#ffffff"
                  strokeWidth={0.6}
                  className={isShown ? 'cursor-pointer' : ''}
                  opacity={hover && isShown && hover !== `${name}|${name}` && !hover.includes(name) ? 0.55 : 1}
                  onMouseEnter={() => isShown && setHover(`${name}|${name}`)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => isShown && setHover(hover === `${name}|${name}` ? null : `${name}|${name}`)}
                />
              )
            })}
            {arcs.map((a) => {
              const active = hover === a.key || hover === a.key.split('|').reverse().join('|')
              // Fixed scale (not relative to the busiest arc) so thickness grows through the year.
              const w = 1.5 + Math.min(1, a.share / 0.6) * Math.max(8, width / 40)
              return (
                <g key={a.key}>
                  <path d={a.d} fill="none" stroke="#ffffff" strokeWidth={w + 2.5} strokeLinecap="round" opacity={0.8} />
                  <path
                    d={a.d}
                    fill="none"
                    stroke={active ? '#8a6d10' : '#c9a227'}
                    strokeWidth={w}
                    strokeLinecap="round"
                    opacity={hover && !active ? 0.35 : 0.95}
                  />
                  {/* Wider invisible stroke so thin arcs are easy to tap. */}
                  <path
                    d={a.d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={Math.max(16, w + 10)}
                    className="cursor-pointer"
                    onMouseEnter={() => setHover(a.key)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => setHover(hover === a.key ? null : a.key)}
                  />
                </g>
              )
            })}
            {data.groups.map((g) => {
              if (!ANCHORS[g.name]) return null
              const [x, y] = project(ANCHORS[g.name])
              const within = cell.get(`${g.name}|${g.name}`)
              const pct = within && within.total ? Math.round((within.met / within.total) * 100) : 0
              return (
                <g key={g.name} pointerEvents="none" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif">
                  <circle cx={x} cy={y} r={4} fill="#002147" stroke="#fff" strokeWidth={1.5} />
                  <text x={x} y={y - 9} fontSize={width < 480 ? 10 : 12} fontWeight={600} fill="#002147" stroke="#fff" strokeWidth={3} paintOrder="stroke">
                    {SHORT[g.name] ?? g.name} {pct}%
                  </text>
                </g>
              )
            })}
          </svg>
        )}
      </div>

      <p className="mt-2 min-h-[1.25rem] text-xs text-gray-600" aria-live="polite">
        {info ? (
          ha === hb ? (
            <>
              Within <b>{ha}</b>: {fmt(info.met)} of {fmt(info.total)} pairs have met ({Math.round((info.met / (info.total || 1)) * 100)}%).
            </>
          ) : (
            <>
              <b>{ha}</b> ↔ <b>{hb}</b>: {fmt(info.met)} of {fmt(info.total)} pairs have met ({Math.round((info.met / (info.total || 1)) * 100)}%).
            </>
          )
        ) : (
          <>Tap a continent or an arc for details.</>
        )}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <span>Within a continent</span>
          <span className="flex overflow-hidden rounded">
            {SHARE_RAMP.map((c) => (
              <span key={c} className="h-2.5 w-4" style={{ background: c }} />
            ))}
          </span>
          <span>more pairs met →</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-1 w-6 rounded bg-gold" />
          <span>Between continents: thicker = more pairs met</span>
        </div>
      </div>
    </div>
  )
}
