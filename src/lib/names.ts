import type { Student } from './types'

/** What to call someone: their nickname if they set one, else their first name. */
export function callName(s: Pick<Student, 'full_name' | 'nickname'>) {
  return s.nickname?.trim() || s.full_name.split(' ')[0]
}
