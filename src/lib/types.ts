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

  listCustomTags(): Promise<CustomTag[]>
  addCustomTag(tag: CustomTag): Promise<void>

  adminCreateStudent(fullName: string): Promise<Student>
  adminDeleteStudent(id: string): Promise<void>
  adminUnclaimStudent(id: string): Promise<Student>
}
