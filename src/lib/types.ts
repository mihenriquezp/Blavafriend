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
  /** Birthday: day and month are shown in the app; the year is optional and never shown. */
  birth_day: number | null
  birth_month: number | null
  birth_year: number | null
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
  /** Optional photo (public URL in the event-photos bucket). */
  image_url: string | null
  created_by: string
  created_at: string
}
export type CalEventInput = Pick<
  CalEvent,
  'title' | 'description' | 'starts_at' | 'ends_at' | 'location' | 'link' | 'image_url'
>

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

/** Admin-only: one day hour by hour (Oxford time), people active in each hour. */
export interface DayActivity {
  day: string
  active: number
  hours: { hour: number; n: number }[]
}

/** Admin-only: how each useful tool was used (totals; admins' own visits left out). */
export interface ToolStats {
  /** Students with a claimed profile, for percentages. */
  students: number
  tools: {
    title: string
    icon: string
    /** Still shown on the home page (false once removed). */
    live: boolean
    opens: number
    people: number
    /** People who opened it more than once. */
    returning: number
    /** Visits where the tool saved something (the person actually used it). */
    engaged: number
    total_seconds: number
    median_seconds: number
    last_open: string
    daily: { day: string; opens: number }[]
  }[]
}

/** A useful tool: an HTML page uploaded by an admin, shown until remove_on. */
export interface Tool {
  id: string
  title: string
  description: string | null
  icon: string
  /** First day it is no longer shown (YYYY-MM-DD); null = no end date. */
  remove_on: string | null
  created_at: string
}
export type ToolInput = Pick<Tool, 'title' | 'description' | 'icon' | 'remove_on'> & { html?: string }

/** Admin-only usage totals (see public.admin_usage). */
export interface UsageData {
  cohort: number
  accounts: number
  claimed: number
  trackers: number
  ratings: number
  stars: number
  notes: number
  active: { d1: number; d7: number; d30: number }
  daily: { day: string; active: number; changes: number; signups: number }[]
  /** Last 30 days, Oxford time: people active per weekday (1 = Mon … 7 = Sun) and hour. */
  hourly: { dow: number; hour: number; n: number }[]
  profiles: { photo: number; birthday: number; country: number; hobbies: number; bio: number; languages: number }
  resources: { events: number; upcoming_events: number; rsvps: number; songs: number; notices: number }
  coffee?: { auto: number; next: number; last: { round: string; people: number; groups: number } | null }
}

/** The signed-in person's view of the weekly coffee roulette (see public.coffee_state). */
export interface CoffeeState {
  /** Sunday (YYYY-MM-DD) of the draw currently open for sign-ups. */
  open_round: string
  draw_at: string
  /** False between the Sunday 20:00 draw and Monday, when the next round opens. */
  open: boolean
  joined: boolean
  auto: boolean
  /** How many people are in the open round so far. */
  entrants: number
  /** The most recent draw that has happened (its coffee week is the current one). */
  latest_round: string
  /** Your matches, newest first: the student ids of the people in your group. */
  matches: { round: string; partners: string[] }[]
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

  getCohort(): Promise<CohortData>

  listCalEvents(): Promise<CalEvent[]>
  saveCalEvent(input: CalEventInput, id?: string): Promise<CalEvent>
  deleteCalEvent(id: string): Promise<void>
  uploadEventPhoto(file: Blob): Promise<string>
  listRsvps(): Promise<Rsvp[]>
  setRsvp(eventId: string, status: Rsvp['status'] | null): Promise<void>
  listSongs(): Promise<Song[]>
  addSong(spotifyId: string, note: string | null): Promise<Song>
  deleteSong(id: string): Promise<void>
  listNotices(): Promise<Notice[]>
  saveNotice(input: NoticeInput, id?: string): Promise<Notice>
  deleteNotice(id: string): Promise<void>

  listTools(): Promise<Tool[]>
  getToolHtml(id: string): Promise<string>
  saveTool(input: ToolInput, id?: string): Promise<Tool>
  deleteTool(id: string): Promise<void>
  /** Starts a visit to a tool; returns its id (null if it couldn't be recorded). */
  toolOpen(id: string): Promise<string | null>
  toolHeartbeat(sessionId: string, seconds: number, actions: number): Promise<void>
  adminToolStats(): Promise<ToolStats>

  coffeeState(): Promise<CoffeeState>
  coffeeJoin(join: boolean): Promise<CoffeeState>
  coffeeSetAuto(on: boolean): Promise<CoffeeState>

  recordVisit(): Promise<void>
  adminUsage(): Promise<UsageData>
  adminDay(day: string): Promise<DayActivity>

  listCustomTags(): Promise<CustomTag[]>
  addCustomTag(tag: CustomTag): Promise<void>

  adminCreateStudent(fullName: string): Promise<Student>
  adminDeleteStudent(id: string): Promise<void>
  adminUnclaimStudent(id: string): Promise<Student>
}
