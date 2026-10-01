import type { Student } from './types'

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Days in a month, allowing 29 February (birthdays don't need a year). */
export const daysInMonth = (month: number) => [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

/** True if it's s's birthday on `date` (29 Feb birthdays are celebrated on 28 Feb in other years). */
export function isBirthday(s: Pick<Student, 'birth_day' | 'birth_month'>, date = new Date()) {
  if (!s.birth_day || !s.birth_month) return false
  const d = date.getDate()
  const m = date.getMonth() + 1
  if (s.birth_month === m && s.birth_day === d) return true
  return s.birth_month === 2 && s.birth_day === 29 && m === 2 && d === 28 && !isLeap(date.getFullYear())
}

/** "14 March" — the year is never shown. */
export function formatBirthday(s: Pick<Student, 'birth_day' | 'birth_month'>) {
  return s.birth_day && s.birth_month ? `${s.birth_day} ${MONTHS[s.birth_month - 1]}` : null
}
