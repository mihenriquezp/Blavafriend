import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force'
import { useEffect, useMemo, useRef, useState } from 'react'

// Canvas can't read CSS variables, so the level ramp is repeated here (see index.css).
const EDGE_COLORS = ['', '#86b6ef', '#3987e5', '#1c5cab', '#0d366b']

interface Node {
  index: number
  x: number
  y: number
  degree: number
}

/**
 * Anonymous network of the cohort: one dot per classmate, one line per pair
 * who've met. Only the viewer's own dot is highlighted.
 */
export function Constellation({
  size,
  edges,
  me,
  minLevel,
}: {
  size: number
  edges: [number, number, number][]
  me: number | null
  minLevel: number
}) {
  const shown = useMemo(() => edges.filter((e) => e[2] >= minLevel), [edges, minLevel])

  // Lay the network out once per data/filter change (synchronously; ~150 nodes is fast).
  const nodes = useMemo(() => {
    const ns: Node[] = Array.from({ length: size }, (_, i) => ({ index: i, x: 0, y: 0, degree: 0 }))
    shown.forEach(([a, b]) => {
      ns[a].degree++
      ns[b].degree++
    })
    const links = shown.map(([source, target, level]) => ({ source, target, level }))
    const sim = forceSimulation(ns)
      .force('charge', forceManyBody().strength(-22))
      .force(
        'link',
        forceLink(links)
          .distance(28)
          .strength((l) => 0.04 + 0.04 * (l as { level: number }).level),
      )
      .force('x', forceX(0).strength(0.06))
      .force('y', forceY(0).strength(0.06))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide(5))
      .stop()
    for (let i = 0; i < 300; i++) sim.tick()
    return ns
  }, [size, shown])

  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(600)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const height = Math.round(Math.min(560, Math.max(320, width * 0.8)))

  useEffect(() => {
    const c = canvas.current
    if (!c || !nodes.length) return
    const dpr = window.devicePixelRatio || 1
    c.width = width * dpr
    c.height = height * dpr
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    // Fit the layout into the canvas.
    const xs = nodes.map((n) => n.x)
    const ys = nodes.map((n) => n.y)
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const pad = 18
    const scale = Math.min((width - 2 * pad) / (maxX - minX || 1), (height - 2 * pad) / (maxY - minY || 1))
    const px = (n: Node) => pad + (n.x - minX) * scale + (width - 2 * pad - (maxX - minX) * scale) / 2
    const py = (n: Node) => pad + (n.y - minY) * scale + (height - 2 * pad - (maxY - minY) * scale) / 2

    // Weaker ties first so stronger ones sit on top.
    const sorted = [...shown].sort((a, b) => a[2] - b[2])
    for (const [a, b, level] of sorted) {
      const mine = a === me || b === me
      ctx.strokeStyle = EDGE_COLORS[level]
      ctx.globalAlpha = mine ? 0.95 : 0.25 + level * 0.12
      ctx.lineWidth = (mine ? 1.2 : 0.6) + level * 0.35
      ctx.beginPath()
      ctx.moveTo(px(nodes[a]), py(nodes[a]))
      ctx.lineTo(px(nodes[b]), py(nodes[b]))
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    for (const n of nodes) {
      if (n.index === me) continue
      ctx.fillStyle = n.degree ? '#5d6b82' : '#c5cbd5'
      ctx.beginPath()
      ctx.arc(px(n), py(n), n.degree ? 3.2 : 2.6, 0, Math.PI * 2)
      ctx.fill()
    }
    if (me !== null && nodes[me]) {
      const n = nodes[me]
      ctx.fillStyle = '#c9a227'
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(px(n), py(n), 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.font = '600 12px Inter, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 4
      ctx.strokeText('You', px(n), py(n) - 12)
      ctx.fillStyle = '#002147'
      ctx.fillText('You', px(n), py(n) - 12)
    }
  }, [nodes, shown, me, width, height])

  const connected = nodes.filter((n) => n.degree > 0).length
  return (
    <div ref={wrap}>
      <canvas
        ref={canvas}
        style={{ width, height }}
        className="block rounded-xl bg-oxford-50/60"
        role="img"
        aria-label={`Anonymous network of ${size} classmates: ${shown.length} ties shown, ${connected} classmates connected.`}
      />
    </div>
  )
}
