import type { CohortData, Student } from './types'

export function directoryOverview(students: Student[]): CohortData {
  const cohort = students.filter((student) => student.role !== 'faculty')
  return {
    students: cohort.length, claimed: cohort.filter((student) => student.user_id).length,
    relationships_available: false, trackers: 0, pairs: { met: 0, great: 0, friends: 0 },
    me: null, edges: [], weekly: [], groups: [], mixing: [],
  }
}
