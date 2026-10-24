// A fully local backend used when Supabase isn't configured. Data is fictional
// and lives in this browser's localStorage, so anyone can try the app safely.
import { COLLEGES, COUNTRIES, GENDER_OPTIONS, HOBBIES, LANGUAGES, POLICY_INTERESTS, UNDERGRAD_FIELDS, type Level } from './options'
import { computeCohort, type Rating } from './cohort'
import { COHORT_CONSENT_VERSION } from './cohortConsent'
import { addDays, drawAt, londonToday, matchGroups, openRound } from './coffee'
import type {
  Api,
  CalEvent,
  CoffeeState,
  CohortConsent,
  CustomTag,
  EngagementData,
  FormalSlot,
  Newsletter,
  StudySession,
  Tool,
  Notice,
  Relationship,
  RelationshipEvent,
  Rsvp,
  SessionUser,
  Song,
  Student,
} from './types'

const KEY = 'blavafriend-demo-v6'
const DEMO_USER: SessionUser = { id: 'demo-user', email: 'demo1234@ox.ac.uk' }

interface DemoState {
  cohortConsent?: CohortConsent
  signedIn: boolean
  students: Student[]
  relationships: Relationship[]
  events: RelationshipEvent[]
  tags: CustomTag[]
  calEvents: CalEvent[]
  rsvps: Rsvp[]
  songs: Song[]
  notices: Notice[]
  /** Added later, so older saved demos may not have it. Rounds hold groups of student ids. */
  tools?: (Tool & { html: string })[]
  toolData?: Record<string, { data: Record<string, string>; saved_at: string }>
  newsletters?: Newsletter[]
  newsletterChecks?: { newsletter_id: string; item_id: string }[]
  coffee?: { auto: boolean; entries: Record<string, boolean>; rounds: Record<string, string[][]> }
  formals?: { slots: DemoFormal[]; bookings: { slot_id: string; guest: string }[] }
  study?: { sessions: DemoStudy[]; joins: DemoJoin[] }
}
/** extra / helper may be missing in demos saved before they existed. */
type DemoStudy = Omit<StudySession, 'taken' | 'extra_taken' | 'mine' | 'joined' | 'my_role' | 'members' | 'helpers'>
type DemoJoin = { session_id: string; member: string; helper?: boolean }
type DemoFormal = Omit<FormalSlot, 'taken' | 'mine' | 'booked' | 'guests'>

/** Stable pseudo-random number for a string (demo only). */
const hash = (s: string) => [...s].reduce((x, ch) => (Math.imul(x, 31) + ch.charCodeAt(0)) >>> 0, 7)

const FIRST = [
  'Ana', 'Kofi', 'Mei', 'Lucas', 'Priya', 'Tomás', 'Aiko', 'Omar', 'Sofia', 'Daniel', 'Amara',
  'Rahul', 'Elena', 'Jonas', 'Leila', 'Mateo', 'Hana', 'Samuel', 'Nadia', 'Kwame', 'Isabel',
  'Arjun', 'Chloe', 'Diego', 'Fatima', 'Liam', 'Yuki', 'Zara', 'Felipe', 'Ines', 'Tariq', 'Grace',
  'Min-jun', 'Olivia', 'Pablo', 'Ruth', 'Sipho', 'Valentina', 'Wei', 'Aditi',
]
const LAST = [
  'Silva', 'Mensah', 'Chen', 'Martin', 'Sharma', 'Rojas', 'Tanaka', 'Haddad', 'Rossi', 'Kim',
  'Okafor', 'Patel', 'Novak', 'Berg', 'Karimi', 'Fernández', 'Sato', 'Adeyemi', 'Hassan', 'Boateng',
]
const ROLES = [
  'Civil servant', 'Strategy consultant', 'NGO programme lead', 'Central banker', 'Policy advisor',
  'Diplomat', 'Researcher', 'Journalist', 'Founder', 'Lawyer', 'Just completed BA',
]
const DEMO_COUNTRIES = [
  'Chile', 'Ghana', 'China', 'Brazil', 'India', 'Colombia', 'Japan', 'Lebanon', 'Italy',
  'South Korea', 'Nigeria', 'United Kingdom', 'Canada', 'Australia', 'Mexico', 'Kenya',
  'Singapore', 'Germany', 'Pakistan', 'United States', 'Peru', 'South Africa',
]

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

function seed(): DemoState {
  const r = rng(42)
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]
  const some = <T,>(xs: readonly T[], min: number, max: number) => {
    const n = min + Math.floor(r() * (max - min + 1))
    return [...new Set(Array.from({ length: n }, () => pick(xs)))]
  }
  const students: Student[] = FIRST.map((first, i) => {
    const country = pick(DEMO_COUNTRIES)
    return {
      id: `demo-${i}`,
      full_name: `${first} ${LAST[i % LAST.length]}`,
      age: r() < 0.8 ? 23 + Math.floor(r() * 14) : null,
      country_origin: country,
      country_residence: r() < 0.8 ? country : pick(COUNTRIES),
      job_title: i >= FIRST.length - 3 ? 'Professor of Public Policy' : pick(ROLES),
      college: pick(COLLEGES),
      family_status: r() < 0.75 ? 'none' : pick(['partner', 'family', 'partner_family'] as const),
      policy_interests: some(POLICY_INTERESTS, 1, 3),
      hobbies: some(HOBBIES, 2, 5),
      languages: ['English', ...some(LANGUAGES, 0, 2)].filter((v, j, a) => a.indexOf(v) === j),
      bio: r() < 0.5 ? 'Fictional demo profile. Loves long walks along the Thames.' : null,
      photo_url: null,
      linkedin: r() < 0.6 ? 'https://www.linkedin.com/in/example' : null,
      instagram: r() < 0.5 ? 'example' : null,
      x_handle: null,
      whatsapp: null,
      nickname: r() < 0.3 ? first.slice(0, 3) : null,
      gender: r() < 0.9 ? pick(GENDER_OPTIONS.slice(0, 3)).value : null,
      undergrad_fields: some(UNDERGRAD_FIELDS, 1, 2),
      role: i >= FIRST.length - 3 ? 'faculty' : 'student',
      // Two fictional classmates celebrate today so the birthday pop-up shows in the demo.
      birth_day: i === 4 || i === 9 ? new Date().getDate() : i % 5 === 0 ? null : 1 + (i * 7) % 28,
      birth_month: i === 4 || i === 9 ? new Date().getMonth() + 1 : i % 5 === 0 ? null : 1 + (i * 5) % 12,
      birth_year: null,
      user_id: null,
      updated_at: new Date().toISOString(),
    }
  })

  // Some history over the last few weeks so the stats page has something to show.
  const relationships: Relationship[] = []
  const events: RelationshipEvent[] = []
  const now = Date.now()
  const day = 86_400_000
  students.slice(1, 26).forEach((s, i) => {
    let level = 0 as Level
    const target = (1 + Math.floor(r() * 4)) as Level
    let t = now - (28 - Math.floor(r() * 10)) * day
    while (level < target) {
      const next = Math.min(4, level + 1 + Math.floor(r() * 2)) as Level
      events.push({ id: `${i}-${level}`, student_id: s.id, from_level: level, to_level: next, created_at: new Date(t).toISOString() })
      level = next
      t += Math.floor(r() * 8) * day
      if (t > now) t = now
    }
    relationships.push({ student_id: s.id, level, starred: r() < 0.15, note: null, updated_at: new Date(t).toISOString() })
  })
  students.slice(30, 35).forEach((s) =>
    relationships.push({ student_id: s.id, level: 0, starred: true, note: null, updated_at: new Date().toISOString() }),
  )
  // A few fictional classmates have accounts, so their posts show an author.
  students.slice(1, 9).forEach((s, i) => (s.user_id = `demo-u-${i}`))
  const iso = (days: number, hour = 19) => {
    const d = new Date(now + days * day)
    d.setHours(hour, 0, 0, 0)
    return d.toISOString()
  }
  const calEvents: CalEvent[] = [
    { id: 'ev1', title: 'Pub quiz at The Eagle and Child', description: 'Teams of 4–6, mixing encouraged! First round on the winners.', starts_at: iso(2, 19), ends_at: iso(2, 22), location: 'The Eagle and Child, St Giles', link: null, image_url: null, created_by: 'demo-u-0', created_at: iso(-1) },
    { id: 'ev2', title: 'Sunday hike to Shotover', description: 'Easy 8 km walk, back for lunch.', starts_at: iso(5, 10), ends_at: null, location: 'Meet at Carfax Tower', link: null, image_url: null, created_by: 'demo-u-3', created_at: iso(-2) },
    { id: 'ev3', title: 'Latin American dinner', description: 'Bring a dish from home 🌮', starts_at: iso(9, 19), ends_at: null, location: 'Kellogg College common room', link: 'https://example.com/signup', image_url: null, created_by: 'demo-u-5', created_at: iso(-3) },
    { id: 'ev4', title: 'Welcome drinks', description: null, starts_at: iso(-4, 18), ends_at: null, location: 'BSG café', link: null, image_url: null, created_by: 'demo-u-1', created_at: iso(-10) },
  ]
  const rsvps: Rsvp[] = [
    ...['demo-u-0', 'demo-u-1', 'demo-u-2', 'demo-u-4', 'demo-u-6'].map((u) => ({ event_id: 'ev1', user_id: u, status: 'going' as const })),
    { event_id: 'ev1', user_id: 'demo-u-7', status: 'maybe' },
    ...['demo-u-3', 'demo-u-5'].map((u) => ({ event_id: 'ev2', user_id: u, status: 'going' as const })),
    ...['demo-u-5', 'demo-u-2', 'demo-u-6'].map((u) => ({ event_id: 'ev3', user_id: u, status: 'going' as const })),
  ]
  const songs: Song[] = [
    { id: 'so1', spotify_id: '4cOdK2wGLETKBW3PvgPWqT', note: 'Never gonna give you up 🙃', created_by: 'demo-u-2', created_at: iso(-1) },
    { id: 'so2', spotify_id: '3n3Ppam7vgaVa1iaRUc9Lp', note: 'For the pre-drinks', created_by: 'demo-u-4', created_at: iso(-2) },
    { id: 'so3', spotify_id: '7qiZfU4dY1lWllzX7mPBI3', note: null, created_by: 'demo-u-6', created_at: iso(-3) },
  ]
  const notices: Notice[] = [
    { id: 'no1', category: 'deal', title: '20% off at Walton Street Cycles with student card', body: 'Valid on bikes and repairs until the end of the month.', link: 'https://example.com/bikes', expires_on: iso(25).slice(0, 10), created_by: 'demo-u-1', created_at: iso(-1) },
    { id: 'no2', category: 'opportunity', title: 'OECD summer internship: applications open', body: 'Deadline 15 November. Happy to share tips!', link: 'https://example.com/oecd', expires_on: iso(40).slice(0, 10), created_by: 'demo-u-5', created_at: iso(-2) },
    { id: 'no3', category: 'housing', title: 'Room available in Jericho from January', body: 'Shared house with 2 DPhil students, 5 min walk to BSG.', link: null, expires_on: null, created_by: 'demo-u-3', created_at: iso(-3) },
    { id: 'no4', category: 'for_sale', title: 'Free: desk lamp and kettle', body: 'Pick up at Wolfson.', link: null, expires_on: iso(10).slice(0, 10), created_by: 'demo-u-7', created_at: iso(-4) },
  ]
  return { signedIn: false, students, relationships, events, tags: [], calEvents, rsvps, songs, notices }
}

function blankStudent(full_name: string, user_id: string | null): Student {
  return {
    id: `demo-${crypto.randomUUID()}`, full_name, user_id, age: null, country_origin: null,
    country_residence: null, job_title: null, college: null, family_status: null,
    policy_interests: [], hobbies: [], languages: [], bio: null, photo_url: null, linkedin: null,
    instagram: null, x_handle: null, whatsapp: null, nickname: null, gender: null, undergrad_fields: [], role: 'student',
    birth_day: null, birth_month: null, birth_year: null,
    updated_at: new Date().toISOString(),
  }
}

export function createDemoApi(): Api {
  let state: DemoState
  try {
    state = JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? seed()
  } catch {
    state = seed()
  }
  const listeners = new Set<(u: SessionUser | null) => void>()
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* private mode: keep in memory only */
    }
  }
  const user = () => (state.signedIn ? DEMO_USER : null)
  const clone = <T,>(x: T): T => structuredClone(x)
  const findStudent = (id: string) => {
    const s = state.students.find((x) => x.id === id)
    if (!s) throw new Error('Student not found')
    return s
  }

  const coffee = () => (state.coffee ??= { auto: false, entries: {}, rounds: {} })
  // A few fictional study sessions by fictional classmates.
  const study = () =>
    (state.study ??= (() => {
      const today = londonToday()
      const hosts = state.students.filter((s) => s.user_id?.startsWith('demo-u-'))
      const rows: [number, StudySession['kind'], string, string, number, string, number, number, string][] = [
        [2, 'teach', 'Economics', 'Problem set 3: elasticities', 1, '18:00', 90, 4, 'BSG seminar room 2'],
        [5, 'study', 'Foundations', 'Reading group: Rawls', 1, '16:00', 60, 3, 'Library café'],
        [1, 'need', 'Evidence', 'Regression output, I’m lost', 2, '12:30', 45, 1, 'Online (Teams)'],
        [3, 'teach', 'Economics', 'Game theory basics', 4, '17:30', 60, 6, 'BSG ground floor'],
        [6, 'study', 'Law', 'Case notes before the seminar', 6, '10:00', 120, 4, 'Radcliffe Camera'],
      ]
      const sessions: DemoStudy[] = rows.map(([h, kind, subject, topic, d, time, minutes, capacity, place], i) => ({
        id: `study-${i}`,
        host: hosts[h % hosts.length].user_id!,
        kind,
        subject,
        topic,
        day: addDays(today, d),
        time,
        minutes,
        languages: i === 1 ? ['English', 'Spanish'] : i === 4 ? ['English', 'French'] : ['English'],
        capacity,
        extra: kind === 'need' ? 3 : 0,
        place,
        notes: null,
      }))
      const joins: DemoJoin[] = [
        { session_id: 'study-0', member: hosts[0].user_id! },
        { session_id: 'study-0', member: hosts[4].user_id! },
        { session_id: 'study-1', member: hosts[7].user_id! },
        { session_id: 'study-2', member: hosts[6].user_id!, helper: false },
      ]
      return { sessions, joins }
    })())
  // A few fictional formals offered by fictional classmates.
  const formals = () =>
    (state.formals ??= (() => {
      const today = londonToday()
      const hosts = state.students.filter((s) => s.user_id?.startsWith('demo-u-'))
      const slots: DemoFormal[] = [
        [0, 2, '19:15', 25, 2, 'Black tie, gowns optional. Drinks in the bar before.'],
        [1, 3, '19:30', 0, 1, 'My treat! Just bring good conversation.'],
        [2, 3, '19:00', 30, 3, null],
        [3, 6, '19:30', 22.5, 2, 'Meet at the porters’ lodge at 19:10.'],
        [4, 9, '19:15', 28, 1, null],
        [0, 13, '19:15', 25, 4, 'Halloween formal: dress up!'],
      ].map(([h, d, time, price, capacity, notes], i) => {
        const host = hosts[(h as number) % hosts.length]
        return {
          id: `formal-${i}`,
          host: host.user_id!,
          college: host.college ?? COLLEGES[i],
          day: addDays(today, d as number),
          time: time as string,
          price: price as number,
          capacity: capacity as number,
          notes: notes as string | null,
        }
      })
      const bookings = [
        { slot_id: 'formal-0', guest: hosts[5].user_id! },
        { slot_id: 'formal-2', guest: hosts[1].user_id! },
        { slot_id: 'formal-2', guest: hosts[6].user_id! },
        { slot_id: 'formal-4', guest: hosts[2].user_id! },
      ]
      return { slots, bookings }
    })())
  // A fictional sample newsletter for the demo.
  const newsletters = () =>
    (state.newsletters ??= [
      {
        id: 'nl-1',
        title: 'Programme newsletter',
        week_of: new Date().toISOString().slice(0, 10),
        intro: 'A fictional weekly newsletter for the demo: a few things to do, a couple of events and some information.',
        created_at: new Date().toISOString(),
        items: [
          { id: 'survey', category: 'To do', title: 'Fill in the welcome survey', summary: 'Five minutes, closes on Wednesday at 17:00.', detail: 'Tell us how the first weeks went. You received a personal link by email.', due: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10) },
          { id: 'reading', category: 'To do', title: 'Check the reading lists', summary: 'Economics and Foundations lists are on the course page.', detail: 'Both reading lists are now available on the course page. Start with the first two readings for week 1.', links: [{ label: 'Course page', url: 'https://example.com/course' }] },
          { id: 'careers', category: 'Register', title: 'Careers kick-off session', summary: 'Monday 15:15, bring one job description.', when: 'Monday, 15:15–16:45 · Lecture Theatre 1', detail: 'An introduction to the careers approach. Please bring one or two job descriptions you are interested in.' },
          { id: 'talk', category: 'Events', title: 'Panel: who should regulate AI?', summary: 'Tuesday evening, drinks afterwards.', when: 'Tuesday, 17:30–19:00 · Lecture Theatre 1' },
          { id: 'terms', category: 'For information', title: 'Term dates', summary: 'Autumn, winter and spring term dates for the year.', detail: 'Autumn: 28 Sep – 18 Dec\nWinter: 11 Jan – 19 Mar\nSpring: 19 Apr – 18 Jun' },
        ],
      },
    ])
  // A fictional sample tool so the "Useful tools" row has something to show.
  const tools = () =>
    (state.tools ??= [
      {
        id: 'tool-1',
        title: 'Tip splitter',
        description: 'Split a restaurant bill between friends, tip included.',
        icon: '🧮',
        remove_on: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
        hidden: false,
        created_at: new Date().toISOString(),
        html: DEMO_TOOL_HTML,
      },
    ])
  const myId = () => state.students.find((s) => s.user_id === DEMO_USER.id)?.id
  const inRound = (round: string) => coffee().entries[round] ?? coffee().auto
  // Fictional classmates in a round: a stable ~45% of everyone else.
  const participants = (round: string) => {
    const me = myId()
    const others = state.students.filter((s) => s.id !== me && hash(round + s.id) % 100 < 45).map((s) => s.id)
    return me && inRound(round) ? [me, ...others] : others
  }
  const levelOf = (a: string, b: string) => {
    if (a === myId()) return state.relationships.find((r) => r.student_id === b)?.level ?? 0
    const h = hash(a + b)
    return h % 10 < 7 ? 0 : 1 + (h % 4)
  }
  const draw = (round: string) => {
    const c = coffee()
    if (c.rounds[round]) return
    const ids = participants(round)
    const before = Object.entries(c.rounds).filter(([r]) => r < round).flatMap(([, gs]) => gs)
    const metBefore = (a: string, b: string) => before.some((g) => g.includes(a) && g.includes(b))
    const cost = (i: number, j: number) =>
      levelOf(ids[i], ids[j]) ** 2 + levelOf(ids[j], ids[i]) ** 2 + (metBefore(ids[i], ids[j]) ? 100 : 0)
    c.rounds[round] = matchGroups(ids.length, cost).map((g) => g.map((i) => ids[i]))
  }
  const coffeeState = (): CoffeeState => {
    const c = coffee()
    const open = openRound()
    const isOpen = Date.now() < drawAt(open).getTime()
    const latest = isOpen ? addDays(open, -7) : open
    // First visit: pretend you joined last week, so the demo has a match to show.
    if (!Object.keys(c.rounds).length && myId()) c.entries[latest] = true
    draw(latest)
    save()
    const me = myId()
    const matches = Object.entries(c.rounds)
      .sort(([a], [b]) => b.localeCompare(a))
      .flatMap(([round, groups]) => {
        const g = groups.find((x) => me && x.includes(me))
        return g ? [{ round, partners: g.filter((id) => id !== me) }] : []
      })
    return {
      open_round: open,
      draw_at: drawAt(open).toISOString(),
      open: isOpen,
      joined: inRound(open),
      auto: c.auto,
      entrants: participants(open).length,
      latest_round: latest,
      matches,
    }
  }

  return {
    mode: 'demo',
    async getUser() {
      return user()
    },
    onAuthChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    async sendCode() {},
    async verifyCode(_email, code) {
      if (!/^\d{6}$/.test(code)) throw new Error('Enter any 6 digits in demo mode')
      state.signedIn = true
      save()
      listeners.forEach((l) => l(user()))
    },
    async signOut() {
      state.signedIn = false
      save()
      listeners.forEach((l) => l(null))
    },
    async isAdmin() {
      return true
    },
    async listStudents() {
      return clone(state.students).sort((a, b) => a.full_name.localeCompare(b.full_name))
    },
    async claimStudent(id) {
      if (state.students.some((s) => s.user_id === DEMO_USER.id)) throw new Error('You have already claimed a profile')
      const s = findStudent(id)
      if (s.user_id) throw new Error('This profile has already been claimed.')
      s.user_id = DEMO_USER.id
      save()
      return clone(s)
    },
    async createMyStudent(full_name) {
      const s = blankStudent(full_name, DEMO_USER.id)
      state.students.push(s)
      save()
      return clone(s)
    },
    async updateStudent(id, patch) {
      const s = findStudent(id)
      Object.assign(s, patch, { updated_at: new Date().toISOString() })
      save()
      return clone(s)
    },
    async uploadPhoto(_id, file) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
    },
    async listRelationships() {
      return clone(state.relationships)
    },
    async upsertRelationship(studentId, patch) {
      let rel = state.relationships.find((r) => r.student_id === studentId)
      if (!rel) {
        rel = { student_id: studentId, level: 0, starred: false, note: null, updated_at: '' }
        state.relationships.push(rel)
      }
      if (patch.level !== undefined && patch.level !== rel.level) {
        state.events.push({
          id: crypto.randomUUID(),
          student_id: studentId,
          from_level: rel.level,
          to_level: patch.level,
          created_at: new Date().toISOString(),
        })
      }
      Object.assign(rel, patch, { updated_at: new Date().toISOString() })
      save()
      return clone(rel)
    },
    async listEvents() {
      return clone(state.events)
    },
    async getCohort() {
      const me = state.students.find((s) => s.user_id === DEMO_USER.id) ?? null
      // Fictional classmates rating each other over the last few weeks, plus your own ratings.
      const r = rng(7)
      const others = state.students.filter((s) => s.id !== me?.id)
      const day = 86_400_000
      const ratings: Rating[] = []
      for (const a of others)
        for (const b of others) {
          if (a.id === b.id || r() > 0.12) continue
          const at = new Date(Date.now() - Math.floor(r() * 35) * day).toISOString()
          ratings.push({ rater: a.id, ratee: b.id, level: 1 + Math.floor(r() * 4), at })
        }
      if (me)
        for (const e of state.events) ratings.push({ rater: me.id, ratee: e.student_id, level: e.to_level, at: e.created_at })
      // Fictional classmates are willing participants; the real demo visitor opts in explicitly.
      const consenting = new Set(others.map((student) => student.id))
      if (me && state.cohortConsent?.enabled && state.cohortConsent.version === COHORT_CONSENT_VERSION) consenting.add(me.id)
      return computeCohort(state.students, ratings, me?.id ?? null, consenting)
    },
    async getCohortConsent() {
      const choice = state.cohortConsent
      return { enabled: choice?.version === COHORT_CONSENT_VERSION && choice.enabled,
        version: COHORT_CONSENT_VERSION, updated_at: choice?.updated_at ?? null }
    },
    async setCohortConsent(enabled) {
      state.cohortConsent = { enabled, version: COHORT_CONSENT_VERSION, updated_at: new Date().toISOString() }
      save()
      return clone(state.cohortConsent)
    },

    async listCalEvents() {
      return clone(state.calEvents).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    },
    async saveCalEvent(input, id) {
      let ev = id ? state.calEvents.find((e) => e.id === id) : undefined
      if (ev) Object.assign(ev, input)
      else {
        ev = { ...input, id: crypto.randomUUID(), created_by: DEMO_USER.id, created_at: new Date().toISOString() }
        state.calEvents.push(ev)
      }
      save()
      return clone(ev)
    },
    async uploadEventPhoto(file) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
    },
    async deleteCalEvent(id) {
      state.calEvents = state.calEvents.filter((e) => e.id !== id)
      state.rsvps = state.rsvps.filter((r) => r.event_id !== id)
      save()
    },
    async listRsvps() {
      return clone(state.rsvps)
    },
    async setRsvp(eventId, status) {
      state.rsvps = state.rsvps.filter((r) => !(r.event_id === eventId && r.user_id === DEMO_USER.id))
      if (status) state.rsvps.push({ event_id: eventId, user_id: DEMO_USER.id, status })
      save()
    },
    async listSongs() {
      return clone(state.songs).sort((a, b) => b.created_at.localeCompare(a.created_at))
    },
    async addSong(spotify_id, note) {
      const song: Song = { id: crypto.randomUUID(), spotify_id, note, created_by: DEMO_USER.id, created_at: new Date().toISOString() }
      state.songs.push(song)
      save()
      return clone(song)
    },
    async deleteSong(id) {
      state.songs = state.songs.filter((s) => s.id !== id)
      save()
    },
    async listNotices() {
      return clone(state.notices).sort((a, b) => b.created_at.localeCompare(a.created_at))
    },
    async saveNotice(input, id) {
      let n = id ? state.notices.find((x) => x.id === id) : undefined
      if (n) Object.assign(n, input)
      else {
        n = { ...input, id: crypto.randomUUID(), created_by: DEMO_USER.id, created_at: new Date().toISOString() }
        state.notices.push(n)
      }
      save()
      return clone(n)
    },
    async deleteNotice(id) {
      state.notices = state.notices.filter((n) => n.id !== id)
      save()
    },

    async listNewsletters() {
      return clone(newsletters()).sort((a, b) => b.week_of.localeCompare(a.week_of))
    },
    async saveNewsletter(input, id) {
      let n = id ? newsletters().find((x) => x.id === id) : undefined
      if (n) Object.assign(n, input)
      else {
        n = { ...input, id: crypto.randomUUID(), created_at: new Date().toISOString() }
        newsletters().push(n)
      }
      save()
      return clone(n)
    },
    async deleteNewsletter(id) {
      state.newsletters = newsletters().filter((n) => n.id !== id)
      state.newsletterChecks = (state.newsletterChecks ?? []).filter((c) => c.newsletter_id !== id)
      save()
    },
    async listNewsletterChecks() {
      return clone(state.newsletterChecks ?? [])
    },
    async setNewsletterCheck(newsletterId, itemId, checked) {
      const rest = (state.newsletterChecks ?? []).filter((c) => !(c.newsletter_id === newsletterId && c.item_id === itemId))
      state.newsletterChecks = checked ? [...rest, { newsletter_id: newsletterId, item_id: itemId }] : rest
      save()
    },

    async newsletterView() {},
    async adminNewsletterStats() {
      // Fictional numbers for the demo.
      return {
        students: 74,
        newsletters: newsletters().map((n) => ({
          id: n.id,
          title: n.title,
          week_of: n.week_of,
          items: n.items.length,
          viewers: 48,
          visits: 91,
          tickers: 33,
          avg_share: 46,
          median_share: 40,
          complete: 5,
          buckets: [9, 10, 6, 3, 5],
          item_ticks: n.items.map((it, i) => ({ title: it.title, ticks: Math.max(0, 29 - i * 3 - (i % 3) * 4) })),
        })),
      }
    },

    async listTools() {
      // The demo user is an admin, who sees every tool (the home row filters).
      return tools().map(({ html: _html, ...t }) => clone({ ...t, hidden: !!t.hidden }))
    },
    async getToolHtml(id) {
      const t = tools().find((x) => x.id === id)
      if (!t) throw new Error('Tool not found')
      return t.html
    },
    async saveTool(input, id) {
      let t = id ? tools().find((x) => x.id === id) : undefined
      if (t) Object.assign(t, input)
      else {
        t = {
          html: '',
          title: '',
          description: null,
          icon: '🧰',
          remove_on: null,
          hidden: false,
          ...input,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
        }
        tools().unshift(t)
      }
      save()
      const { html: _html, ...rest } = t
      return clone(rest)
    },
    async toolOpen() {
      return 'demo-session'
    },
    async toolHeartbeat() {},
    async listMyToolData() {
      return Object.entries(state.toolData ?? {}).map(([tool_id, d]) => ({ tool_id, saved_at: d.saved_at }))
    },
    async getMyToolData(toolId) {
      const d = state.toolData?.[toolId]
      return d ? clone(d) : null
    },
    async saveMyToolData(toolId, data, savedAt) {
      ;(state.toolData ??= {})[toolId] = { data: clone(data), saved_at: savedAt }
      save()
    },
    async adminEngagement(): Promise<EngagementData> {
      // Fictional numbers for the demo: a core group plus many occasional users.
      const week0 = addDays(londonToday(), -((new Date(`${londonToday()}T12:00:00Z`).getUTCDay() + 6) % 7))
      const act = [9, 14, 31, 38, 33, 36, 34, 22]
      return {
        cohort: 74,
        joined: 58,
        segments: [
          { key: 'core' as const, n: 11, days: 142, features: { levels: 9, coffee: 8, tools: 7, newsletter: 10, events: 6, formals: 3 } },
          { key: 'regular' as const, n: 17, days: 73, features: { levels: 10, coffee: 9, tools: 6, newsletter: 12, events: 5, formals: 2 } },
          { key: 'occasional' as const, n: 19, days: 27, features: { levels: 6, coffee: 4, tools: 3, newsletter: 7, events: 1 } },
          { key: 'dormant' as const, n: 11, days: 0, features: {} },
        ],
        histogram: [
          { label: '0', n: 11 },
          { label: '1', n: 12 },
          { label: '2–3', n: 13 },
          { label: '4–7', n: 11 },
          { label: '8–14', n: 8 },
          { label: '15+', n: 3 },
        ],
        concentration: { active: 47, total_days: 242, top20_people: 10, top20_days: 121 },
        weeks: act.map((a, i) => ({
          week: addDays(week0, (i - 7) * 7),
          active: a,
          person_days: Math.round(a * [1.4, 1.6, 2.6, 2.3, 2.1, 2.2, 2.0, 1.5][i]),
          returning: i ? Math.min(a, Math.round(act[i - 1] * 0.62)) : 0,
          new: [9, 8, 15, 6, 3, 2, 2, 1][i],
        })),
      }
    },
    async adminToolStats() {
      // Fictional numbers for the demo.
      const r = rng(5)
      const daily = Array.from({ length: 14 }, (_, i) => ({
        day: new Date(Date.now() - (13 - i) * 86_400_000).toISOString().slice(0, 10),
        opens: i < 9 ? 0 : Math.round(4 + r() * 18 * (i === 12 ? 2 : 1)),
      }))
      return {
        students: 74,
        tools: tools().map((t, i) => ({
          title: t.title,
          icon: t.icon,
          live: true,
          opens: 61 - i * 30,
          people: 38 - i * 20,
          returning: 14 - i * 8,
          engaged: 44 - i * 25,
          total_seconds: 9840 - i * 6000,
          median_seconds: 148 - i * 60,
          last_open: new Date().toISOString(),
          daily,
        })),
      }
    },
    async deleteTool(id) {
      state.tools = tools().filter((t) => t.id !== id)
      save()
    },

    async formalBoard() {
      const { slots, bookings } = formals()
      const now = new Date()
      const me = DEMO_USER.id
      return slots
        .filter((s) => new Date(`${s.day}T${s.time}:00`) > now)
        .sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time))
        .map((s) => {
          const guests = bookings.filter((b) => b.slot_id === s.id).map((b) => b.guest)
          const mine = s.host === me
          const booked = guests.includes(me)
          return clone({ ...s, taken: guests.length, mine, booked, guests: mine || booked ? guests : [] })
        })
    },
    async saveFormal(input, id) {
      const f = formals()
      if (id) {
        const s = f.slots.find((x) => x.id === id && x.host === DEMO_USER.id)
        if (!s) throw new Error('Not allowed')
        if (input.capacity < f.bookings.filter((b) => b.slot_id === id).length)
          throw new Error('Some of these seats are already booked: you can’t offer fewer than that.')
        Object.assign(s, input)
      } else f.slots.push({ ...input, id: crypto.randomUUID(), host: DEMO_USER.id })
      save()
    },
    async deleteFormal(id) {
      const f = formals()
      f.slots = f.slots.filter((s) => !(s.id === id && s.host === DEMO_USER.id))
      f.bookings = f.bookings.filter((b) => f.slots.some((s) => s.id === b.slot_id))
      save()
    },
    async formalBook(id) {
      const f = formals()
      const s = f.slots.find((x) => x.id === id)
      if (!s) throw new Error('This formal is no longer offered.')
      if (s.host === DEMO_USER.id) throw new Error('You can’t book a seat at your own formal.')
      const guests = f.bookings.filter((b) => b.slot_id === id)
      if (guests.some((b) => b.guest === DEMO_USER.id)) return
      if (guests.length >= s.capacity) throw new Error('Sorry, the last seat was just taken.')
      f.bookings.push({ slot_id: id, guest: DEMO_USER.id })
      save()
    },
    async formalCancel(id, guest) {
      const f = formals()
      const who = guest ?? DEMO_USER.id
      if (who !== DEMO_USER.id && !f.slots.some((s) => s.id === id && s.host === DEMO_USER.id)) throw new Error('Not allowed')
      f.bookings = f.bookings.filter((b) => !(b.slot_id === id && b.guest === who))
      save()
    },

    async studyBoard() {
      const { sessions, joins } = study()
      const now = new Date()
      const me = DEMO_USER.id
      return sessions
        .filter((s) => new Date(`${s.day}T${s.time}:00`) > now)
        .sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time))
        .map((s) => {
          const need = s.kind === 'need'
          const js = joins.filter((j) => j.session_id === s.id)
          const isHelper = (j: DemoJoin) => need && (j.helper ?? true)
          const members = js.map((j) => j.member)
          const helpers = js.filter(isHelper).map((j) => j.member)
          const mineJ = js.find((j) => j.member === me)
          const mine = s.host === me
          const show = mine || !!mineJ
          return clone({
            ...s,
            extra: s.extra ?? 0,
            taken: need ? helpers.length : members.length,
            extra_taken: need ? members.length - helpers.length : 0,
            mine,
            joined: !!mineJ,
            my_role: mineJ ? (isHelper(mineJ) ? ('help' as const) : ('join' as const)) : null,
            members: show ? members : [],
            helpers: show ? helpers : [],
          })
        })
    },
    async saveStudy(input, id) {
      const st = study()
      if (id) {
        const s = st.sessions.find((x) => x.id === id && x.host === DEMO_USER.id)
        if (!s) throw new Error('Not allowed')
        const js = st.joins.filter((j) => j.session_id === id)
        const helpers = js.filter((j) => s.kind === 'need' && (j.helper ?? true)).length
        if (input.capacity < (s.kind === 'need' ? helpers : js.length) || input.extra < js.length - helpers)
          throw new Error('Some people have already joined: you can’t offer fewer places than that.')
        Object.assign(s, input)
      } else st.sessions.push({ ...input, id: crypto.randomUUID(), host: DEMO_USER.id })
      save()
    },
    async deleteStudy(id) {
      const st = study()
      st.sessions = st.sessions.filter((s) => !(s.id === id && s.host === DEMO_USER.id))
      st.joins = st.joins.filter((j) => st.sessions.some((s) => s.id === j.session_id))
      save()
    },
    async studyJoin(id, help) {
      const st = study()
      const s = st.sessions.find((x) => x.id === id)
      if (!s) throw new Error('This session is no longer on.')
      if (s.host === DEMO_USER.id) throw new Error('This is your own session.')
      const js = st.joins.filter((j) => j.session_id === id)
      if (js.some((j) => j.member === DEMO_USER.id)) return
      const need = s.kind === 'need'
      const helper = need && (help ?? true)
      const helpers = js.filter((j) => need && (j.helper ?? true)).length
      if (need && !helper) {
        if (js.length - helpers >= (s.extra ?? 0)) throw new Error('Sorry, there’s no room for more classmates in this one.')
      } else if ((need ? helpers : js.length) >= s.capacity)
        throw new Error(helper ? 'Someone is already helping with this one.' : 'Sorry, the last place was just taken.')
      st.joins.push({ session_id: id, member: DEMO_USER.id, helper })
      save()
    },
    async studyLeave(id, member) {
      const st = study()
      const who = member ?? DEMO_USER.id
      if (who !== DEMO_USER.id && !st.sessions.some((s) => s.id === id && s.host === DEMO_USER.id))
        throw new Error('Not allowed')
      st.joins = st.joins.filter((j) => !(j.session_id === id && j.member === who))
      save()
    },

    async coffeeState() {
      return coffeeState()
    },
    async coffeeJoin(join) {
      const round = openRound()
      if (Date.now() >= drawAt(round).getTime()) throw new Error('This week’s draw has closed. Sign-ups for next week open on Monday.')
      coffee().entries[round] = join
      save()
      return coffeeState()
    },
    async coffeeSetAuto(on) {
      const c = coffee()
      const round = openRound()
      const open = Date.now() < drawAt(round).getTime()
      if (open && (on || inRound(round))) c.entries[round] = true
      c.auto = on
      save()
      return coffeeState()
    },

    async recordVisit() {},
    async adminDay(day) {
      // Fictional: a daily rhythm that varies from day to day.
      const r = rng(hash(day))
      const shape = [1, 0, 0, 0, 0, 0, 1, 3, 6, 7, 5, 5, 9, 8, 5, 4, 5, 7, 9, 12, 15, 16, 11, 5]
      const hours = shape.map((v, hour) => ({ hour, n: Math.round(v * (0.4 + r() * 0.9)) }))
      return { day, active: Math.round(Math.max(...hours.map((h) => h.n)) * 2.2), hours }
    },
    async adminUsage() {
      // Fictional usage numbers for the demo.
      const r = rng(11)
      const claimed = state.students.filter((s) => s.user_id).length + 22
      const daily = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(Date.now() - (29 - i) * 86_400_000)
        const ramp = Math.min(1, i / 12)
        return {
          day: d.toISOString().slice(0, 10),
          active: Math.round((6 + r() * 14) * (0.4 + ramp)),
          changes: Math.round(r() * 40 * ramp),
          signups: i < 14 ? Math.round(r() * 5) : Math.round(r() * 2),
        }
      })
      // Fictional daily rhythm: lunchtime bump, evening peak, quieter weekend mornings.
      const shape = [1, 0, 0, 0, 0, 0, 1, 3, 6, 7, 5, 5, 9, 8, 5, 4, 5, 7, 9, 12, 15, 16, 11, 5]
      const hourly = Array.from({ length: 7 }, (_, d) =>
        shape.map((v, hour) => ({
          dow: d + 1,
          hour,
          n: Math.round(v * (d >= 5 ? (hour < 11 ? 0.4 : 1.2) : 1) * (0.7 + r() * 0.6) * 1.5),
        })),
      ).flat()
      return {
        hourly,
        cohort: state.students.filter((s) => s.role !== 'faculty').length,
        accounts: claimed + 3,
        claimed,
        trackers: 24,
        ratings: 412,
        stars: 57,
        notes: 33,
        active: { d1: daily[29].active, d7: 26, d30: 31 },
        daily,
        profiles: { photo: 14, birthday: 11, country: 27, hobbies: 25, bio: 9, languages: 21 },
        resources: {
          events: state.calEvents.length,
          upcoming_events: state.calEvents.filter((e) => new Date(e.ends_at ?? e.starts_at) >= new Date()).length,
          rsvps: state.rsvps.length,
          songs: state.songs.length,
          notices: state.notices.length,
        },
        coffee: { auto: 9, next: participants(openRound()).length, last: { round: addDays(openRound(), -7), people: 19, groups: 9 } },
        formals: {
          upcoming: formals().slots.length,
          seats: formals().slots.reduce((n, s) => n + s.capacity, 0),
          booked: formals().bookings.length,
          total_bookings: formals().bookings.length,
        },
      }
    },

    async listCustomTags() {
      return clone(state.tags)
    },
    async addCustomTag(tag) {
      if (!state.tags.some((t) => t.kind === tag.kind && t.label === tag.label)) state.tags.push(tag)
      save()
    },
    async adminCreateStudent(full_name) {
      const s = blankStudent(full_name, null)
      state.students.push(s)
      save()
      return clone(s)
    },
    async adminPendingDeletions() {
      return []
    },
    async adminDeleteStudent(id) {
      if (state.students.find((student) => student.id === id)?.user_id === DEMO_USER.id) {
        throw new Error('Remove the admin role before deleting this account')
      }
      state.students = state.students.filter((s) => s.id !== id)
      state.relationships = state.relationships.filter((r) => r.student_id !== id)
      state.events = state.events.filter((event) => event.student_id !== id)
      save()
    },
    async adminUnclaimStudent(id) {
      const s = findStudent(id)
      s.user_id = null
      save()
      return clone(s)
    },
  }
}

const DEMO_TOOL_HTML = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;padding:20px;color:#002147}input{font-size:18px;padding:8px;width:100%;box-sizing:border-box;margin:4px 0 12px}
b{font-size:28px}</style>
<h2>Tip splitter</h2>
<label>Bill (£)<input id="bill" type="number" value="84"></label>
<label>Tip (%)<input id="tip" type="number" value="12.5"></label>
<label>People<input id="n" type="number" value="4"></label>
<p>Each pays <b id="out"></b></p>
<script>
const f = () => { const t = +bill.value * (1 + +tip.value / 100) / Math.max(1, +n.value); out.textContent = '£' + t.toFixed(2) }
document.querySelectorAll('input').forEach((i) => i.oninput = f); f()
</script>`

export function resetDemo() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
