// Same rules as public.cohort_overview(), used by the local demo. Keep in sync.
import { continentOf } from './options'
import type { CohortData, Student } from './types'

export interface Rating {
  rater: string
  ratee: string
  level: number
  at: string
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

function shuffle<T>(xs: T[]) {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Pairs from the latest rating per (rater, ratee): level = max of both directions. */
function pairLevels(ratings: Rating[]) {
  const latest = new Map<string, Rating>()
  for (const r of ratings) {
    const k = `${r.rater}>${r.ratee}`
    const prev = latest.get(k)
    if (!prev || prev.at <= r.at) latest.set(k, r)
  }
  const pairs = new Map<string, { a: string; b: string; level: number }>()
  for (const r of latest.values()) {
    if (r.level <= 0 || r.rater === r.ratee) continue
    const k = pairKey(r.rater, r.ratee)
    const [a, b] = r.rater < r.ratee ? [r.rater, r.ratee] : [r.ratee, r.rater]
    const p = pairs.get(k)
    if (!p) pairs.set(k, { a, b, level: r.level })
    else p.level = Math.max(p.level, r.level)
  }
  return pairs
}

export function computeCohort(students: Student[], ratings: Rating[], meId: string | null, now = new Date()): CohortData {
  const node = new Map(shuffle(students).map((s, i) => [s.id, i]))
  const byId = new Map(students.map((s) => [s.id, s]))
  const pairs = pairLevels(ratings)
  const myLevel = new Map<string, number>() // pairKey → the caller's own rating
  for (const r of ratings) if (r.rater === meId && r.level > 0) myLevel.set(pairKey(r.rater, r.ratee), r.level)

  const edges: [number, number, number][] = []
  for (const [k, p] of pairs) {
    const mine = meId !== null && (p.a === meId || p.b === meId)
    if (mine && !myLevel.has(k)) continue
    edges.push([node.get(p.a)!, node.get(p.b)!, mine ? myLevel.get(k)! : p.level])
  }

  const sizes = new Map<string, number>()
  students.forEach((s) => {
    const c = continentOf(s.country_origin)
    if (c) sizes.set(c, (sizes.get(c) ?? 0) + 1)
  })
  const groups = [...sizes].filter(([, n]) => n >= 5).map(([name, size]) => ({ name, size }))
  groups.sort((a, b) => b.size - a.size)
  const metBetween = new Map<string, number>()
  for (const p of pairs.values()) {
    const ca = continentOf(byId.get(p.a)?.country_origin)
    const cb = continentOf(byId.get(p.b)?.country_origin)
    if (!ca || !cb) continue
    const k = ca < cb ? `${ca}|${cb}` : `${cb}|${ca}`
    metBetween.set(k, (metBetween.get(k) ?? 0) + 1)
  }
  const mixing: CohortData['mixing'] = []
  for (const x of groups)
    for (const y of groups) {
      if (x.name > y.name) continue
      mixing.push({
        a: x.name,
        b: y.name,
        met: metBetween.get(`${x.name}|${y.name}`) ?? 0,
        total: x.name === y.name ? (x.size * (x.size - 1)) / 2 : x.size * y.size,
      })
    }

  const weekly: CohortData['weekly'] = []
  if (ratings.length) {
    const first = new Date(Math.min(...ratings.map((r) => +new Date(r.at))))
    const week = new Date(first.getFullYear(), first.getMonth(), first.getDate() - ((first.getDay() + 6) % 7))
    while (week <= now) {
      const end = new Date(week)
      end.setDate(end.getDate() + 7)
      const ps = pairLevels(ratings.filter((r) => new Date(r.at) < end))
      const levels = [...ps.values()].map((p) => p.level)
      weekly.push({
        week: week.toISOString().slice(0, 10),
        met: levels.length,
        great: levels.filter((l) => l >= 3).length,
      })
      week.setDate(week.getDate() + 7)
    }
  }

  const levels = [...pairs.values()].map((p) => p.level)
  return {
    students: students.length,
    claimed: students.filter((s) => s.user_id).length,
    trackers: new Set(ratings.filter((r) => r.level > 0).map((r) => r.rater)).size,
    pairs: {
      met: levels.length,
      great: levels.filter((l) => l >= 3).length,
      friends: levels.filter((l) => l === 4).length,
    },
    me: meId ? (node.get(meId) ?? null) : null,
    edges,
    weekly,
    groups,
    mixing,
  }
}
