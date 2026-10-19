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

/** One point of a weekly newsletter, shown as a checklist row (tap for the detail). */
export interface NewsletterItem {
  id: string
  category: string
  title: string
  /** One or two lines shown in the list. */
  summary: string
  /** Full detail shown in the pop-up (plain text, blank lines between paragraphs). */
  detail?: string | null
  /** Deadline (YYYY-MM-DD), for sorting and "due" badges. */
  due?: string | null
  /** When and where, as free text (e.g. "Mon 12 Oct, 14:15–15:00 · Lecture Theatre 1"). */
  when?: string | null
  links?: { label: string; url: string }[]
}
export interface Newsletter {
  id: string
  title: string
  week_of: string
  intro: string | null
  items: NewsletterItem[]
  created_at: string
}
export type NewsletterInput = Pick<Newsletter, 'title' | 'week_of' | 'intro' | 'items'>

/** Admin-only: how the newsletter checklists are used (totals; admins left out). */
export interface NewsletterStats {
  students: number
  newsletters: {
    id: string
    title: string
    week_of: string
    items: number
    /** People who opened the checklist (and total person-days). */
    viewers: number
    visits: number
    /** People who ticked at least one item. */
    tickers: number
    /** Among those, average and median share of the checklist ticked (%). */
    avg_share: number
    median_share: number
    complete: number
    /** People by share ticked: ≤25%, 26–50%, 51–75%, 76–99%, 100%. */
    buckets: number[]
    item_ticks: { title: string; ticks: number }[]
  }[]
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

/**
 * A useful tool: an HTML page uploaded by an admin, shown until remove_on.
 * Tools are never deleted by date, only hidden, so people's saved data keeps matching.
 */
export interface Tool {
  id: string
  title: string
  description: string | null
  icon: string
  /** First day it is no longer shown (YYYY-MM-DD); null = no end date. */
  remove_on: string | null
  /** Hidden by an admin (members can't see it; admins still can). */
  hidden: boolean
  created_at: string
}
export type ToolInput = Partial<Pick<Tool, 'title' | 'description' | 'icon' | 'remove_on' | 'hidden'>> & {
  html?: string
}

/** Admin-only engagement by group (see public.admin_engagement). Students only, admins left out. */
export type EngagementSegment = 'core' | 'regular' | 'occasional' | 'dormant'
export type EngagementFeature = 'levels' | 'coffee' | 'tools' | 'newsletter' | 'events' | 'formals'
export interface EngagementData {
  /** Students in the cohort / with an account (admins left out). */
  cohort: number
  joined: number
  /** By active days in the last 28: core 8+, regular 3–7, occasional 1–2, dormant 0. */
  segments: { key: EngagementSegment; n: number; days: number; features: Partial<Record<EngagementFeature, number>> }[]
  /** People by active days in the last 28. */
  histogram: { label: string; n: number }[]
  /** Last 28 days: people active, their active days, and how many of those days the top 20% account for. */
  concentration: { active: number; total_days: number; top20_people: number; top20_days: number }
  /** Last 8 weeks (Monday start); the last is this week so far. */
  weeks: { week: string; active: number; person_days: number; returning: number; new: number }[]
}

/** Seats offered at a college formal (see public.formal_board). */
export interface FormalSlot {
  id: string
  /** The host's user id (students.user_id). */
  host: string
  college: string
  /** YYYY-MM-DD and HH:MM, Oxford time. */
  day: string
  time: string
  /** Per seat, in pounds; 0 = free. */
  price: number
  capacity: number
  notes: string | null
  taken: number
  /** I'm the host / I have a seat. */
  mine: boolean
  booked: boolean
  /** Who is going (user ids): only for the host and that formal's guests. */
  guests: string[]
}
export type FormalInput = Pick<FormalSlot, 'college' | 'day' | 'time' | 'price' | 'capacity' | 'notes'>

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
  formals?: { upcoming: number; seats: number; booked: number; total_bookings: number }
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

  listNewsletters(): Promise<Newsletter[]>
  saveNewsletter(input: NewsletterInput, id?: string): Promise<Newsletter>
  deleteNewsletter(id: string): Promise<void>
  /** Your own ticks (private). */
  listNewsletterChecks(): Promise<{ newsletter_id: string; item_id: string }[]>
  setNewsletterCheck(newsletterId: string, itemId: string, checked: boolean): Promise<void>
  /** Counts an opening of the checklist (once per person per day). */
  newsletterView(id: string): Promise<void>
  adminNewsletterStats(): Promise<NewsletterStats>

  listTools(): Promise<Tool[]>
  getToolHtml(id: string): Promise<string>
  saveTool(input: ToolInput, id?: string): Promise<Tool>
  deleteTool(id: string): Promise<void>
  /** Starts a visit to a tool; returns its id (null if it couldn't be recorded). */
  toolOpen(id: string): Promise<string | null>
  toolHeartbeat(sessionId: string, seconds: number, actions: number): Promise<void>
  /** What I saved inside each tool, backed up to my account (see lib/toolData). */
  listMyToolData(): Promise<{ tool_id: string; saved_at: string }[]>
  getMyToolData(toolId: string): Promise<{ data: Record<string, string>; saved_at: string } | null>
  saveMyToolData(toolId: string, data: Record<string, string>, savedAt: string): Promise<void>
  adminToolStats(): Promise<ToolStats>
  adminEngagement(): Promise<EngagementData>

  /** Upcoming formals with seats left (who is going only on your own or booked ones). */
  formalBoard(): Promise<FormalSlot[]>
  saveFormal(input: FormalInput, id?: string): Promise<void>
  deleteFormal(id: string): Promise<void>
  formalBook(id: string): Promise<void>
  /** Cancel my seat, or as the host take a guest (user id) off my formal. */
  formalCancel(id: string, guest?: string): Promise<void>

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
