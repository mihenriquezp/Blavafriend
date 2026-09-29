import { continentOf, type Level } from './options'
import type { Relationship, RelationshipEvent, Student } from './types'

export type Dimension = 'continent' | 'country' | 'college' | 'policy' | 'language' | 'hobby'

export const DIMENSIONS: { value: Dimension; label: string }[] = [
  { value: 'continent', label: 'Continent' },
  { value: 'country', label: 'Country' },
  { value: 'college', label: 'College' },
  { value: 'policy', label: 'Policy interest' },
  { value: 'language', label: 'Language' },
  { value: 'hobby', label: 'Hobby' },
]

export function groupsOf(s: Student, dim: Dimension): string[] {
  switch (dim) {
    case 'continent':
      return [continentOf(s.country_origin) ?? 'Unknown']
    case 'country':
      return [s.country_origin ?? 'Unknown']
    case 'college':
      return [s.college ?? 'Unknown']
    case 'policy':
      return s.policy_interests.length ? s.policy_interests : ['Not specified']
    case 'language':
      return s.languages.length ? s.languages : ['Not specified']
    case 'hobby':
      return s.hobbies.length ? s.hobbies : ['Not specified']
  }
}

export interface GroupRow {
  group: string
  total: number
  /** counts[level] = number of classmates in this group at that level */
  counts: [number, number, number, number, number]
}

export function breakdown(classmates: Student[], rels: Map<string, Relationship>, dim: Dimension): GroupRow[] {
  const rows = new Map<string, GroupRow>()
  for (const s of classmates) {
    const level = rels.get(s.id)?.level ?? 0
    for (const g of groupsOf(s, dim)) {
      let row = rows.get(g)
      if (!row) rows.set(g, (row = { group: g, total: 0, counts: [0, 0, 0, 0, 0] }))
      row.total++
      row.counts[level]++
    }
  }
  return [...rows.values()].sort((a, b) => b.total - a.total || a.group.localeCompare(b.group))
}

export function levelCounts(classmates: Student[], rels: Map<string, Relationship>) {
  const counts: [number, number, number, number, number] = [0, 0, 0, 0, 0]
  for (const s of classmates) counts[rels.get(s.id)?.level ?? 0]++
  return counts
}

export interface WeekPoint {
  weekStart: Date
  met: number
  positive: number
}

function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)) // Monday
  return x
}

/** Replays level changes and returns, per week, how many classmates were ≥1 and ≥3 at week end. */
export function weeklyProgress(events: RelationshipEvent[], classmateIds: Set<string>, now = new Date()): WeekPoint[] {
  const sorted = events
    .filter((e) => classmateIds.has(e.student_id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  if (!sorted.length) return []
  const levels = new Map<string, Level>()
  const points: WeekPoint[] = []
  let week = startOfWeek(new Date(sorted[0].created_at))
  const lastWeek = startOfWeek(now)
  let i = 0
  while (week <= lastWeek) {
    const next = new Date(week)
    next.setDate(next.getDate() + 7)
    while (i < sorted.length && new Date(sorted[i].created_at) < next) {
      levels.set(sorted[i].student_id, sorted[i].to_level)
      i++
    }
    let met = 0
    let positive = 0
    for (const l of levels.values()) {
      if (l >= 1) met++
      if (l >= 3) positive++
    }
    points.push({ weekStart: new Date(week), met, positive })
    week = next
  }
  return points
}
