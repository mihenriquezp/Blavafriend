import type { FamilyStatus, Gender, Level } from './options'

export interface Student {
  id: string
  full_name: string
  age: number | null
  country_residence: string | null
  country_origin: string | null
  job_title: string | null
  college: string | null
  family_status: FamilyStatus | null
  policy_interests: string[]
  hobbies: string[]
  languages: string[]
  bio: string | null
  photo_url: string | null
  linkedin: string | null
  instagram: string | null
  x_handle: string | null
  whatsapp: string | null
  nickname: string | null
  gender: Gender | null
  undergrad_fields: string[]
  /** 'faculty' = faculty or staff: listed in People, left out of every statistic. */
  role: 'student' | 'faculty'
  user_id: string | null
  updated_at: string
}

export type StudentPatch = Partial<Omit<Student, 'id' | 'user_id' | 'updated_at'>>

export interface Relationship {
  student_id: string
  level: Level
  starred: boolean
  note: string | null
  updated_at: string
}

export type RelationshipPatch = Partial<Pick<Relationship, 'level' | 'starred' | 'note'>>

export interface RelationshipEvent {
  id: number | string
  student_id: string
  from_level: Level
  to_level: Level
  created_at: string
}

export interface CustomTag {
  kind: 'hobby' | 'language' | 'degree'
  label: string
}

/** Anonymous, cohort-wide aggregates (see public.cohort_overview). */
export interface CohortData {
  students: number
  claimed: number
  /** People who have marked at least one classmate. */
  trackers: number
  pairs: { met: number; great: number; friends: number }
  /** The caller's node in `edges`, if they have a profile. */
  me: number | null
  /** [node, node, level] — nodes are anonymous and reshuffled on every load. */
  edges: [number, number, number][]
  weekly: { week: string; met: number; great: number }[]
  groups: { name: string; size: number }[]
  mixing: { a: string; b: string; met: number; total: number }[]
}

export interface CalEvent {
  id: string
  title: string
  description: string | null
  starts_at: string
  ends_at: string | null
  location: string | null
  link: string | null
  created_by: string
  created_at: string
}
export type CalEventInput = Pick<CalEvent, 'title' | 'description' | 'starts_at' | 'ends_at' | 'location' | 'link'>

export interface Rsvp {
  event_id: string
  user_id: string
  status: 'going' | 'maybe'
}

export interface Song {
  id: string
  spotify_id: string
  note: string | null
  created_by: string
  created_at: string
}

export type NoticeCategory = 'event' | 'deal' | 'opportunity' | 'housing' | 'for_sale' | 'other'
export interface Notice {
  id: string
  category: NoticeCategory
  title: string
  body: string | null
  link: string | null
  expires_on: string | null
  created_by: string
  created_at: string
}
export type NoticeInput = Pick<Notice, 'category' | 'title' | 'body' | 'link' | 'expires_on'>

export interface SessionUser {
  id: string
  email: string
}

/** Everything the UI needs from a backend. Implemented by Supabase and by the local demo. */
export interface Api {
  mode: 'supabase' | 'demo'
  getUser(): Promise<SessionUser | null>
  onAuthChange(cb: (user: SessionUser | null) => void): () => void
  sendCode(email: string): Promise<void>
  verifyCode(email: string, code: string): Promise<void>
  signOut(): Promise<void>

  isAdmin(): Promise<boolean>
  listStudents(): Promise<Student[]>
  claimStudent(studentId: string): Promise<Student>
  createMyStudent(fullName: string): Promise<Student>
  updateStudent(id: string, patch: StudentPatch): Promise<Student>
  uploadPhoto(studentId: string, file: Blob): Promise<string>

  listRelationships(): Promise<Relationship[]>
  upsertRelationship(studentId: string, patch: RelationshipPatch): Promise<Relationship>
  listEvents(): Promise<RelationshipEvent[]>

  getCohort(): Promise<CohortData>

  listCalEvents(): Promise<CalEvent[]>
  saveCalEvent(input: CalEventInput, id?: string): Promise<CalEvent>
  deleteCalEvent(id: string): Promise<void>
  listRsvps(): Promise<Rsvp[]>
  setRsvp(eventId: string, status: Rsvp['status'] | null): Promise<void>
  listSongs(): Promise<Song[]>
  addSong(spotifyId: string, note: string | null): Promise<Song>
  deleteSong(id: string): Promise<void>
  listNotices(): Promise<Notice[]>
  saveNotice(input: NoticeInput, id?: string): Promise<Notice>
  deleteNotice(id: string): Promise<void>

  listCustomTags(): Promise<CustomTag[]>
  addCustomTag(tag: CustomTag): Promise<void>

  adminCreateStudent(fullName: string): Promise<Student>
  adminDeleteStudent(id: string): Promise<void>
  adminUnclaimStudent(id: string): Promise<Student>
}
