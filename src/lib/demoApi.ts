// A fully local backend used when Supabase isn't configured. Data is fictional
// and lives in this browser's localStorage, so anyone can try the app safely.
import { COLLEGES, COUNTRIES, GENDER_OPTIONS, HOBBIES, LANGUAGES, POLICY_INTERESTS, UNDERGRAD_FIELDS, type Level } from './options'
import { computeCohort, type Rating } from './cohort'
import type {
  Api,
  CalEvent,
  CustomTag,
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
  signedIn: boolean
  students: Student[]
  relationships: Relationship[]
  events: RelationshipEvent[]
  tags: CustomTag[]
  calEvents: CalEvent[]
  rsvps: Rsvp[]
  songs: Song[]
  notices: Notice[]
}

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
    { id: 'ev1', title: 'Pub quiz at The Eagle and Child', description: 'Teams of 4–6, mixing encouraged! First round on the winners.', starts_at: iso(2, 19), ends_at: iso(2, 22), location: 'The Eagle and Child, St Giles', link: null, created_by: 'demo-u-0', created_at: iso(-1) },
    { id: 'ev2', title: 'Sunday hike to Shotover', description: 'Easy 8 km walk, back for lunch.', starts_at: iso(5, 10), ends_at: null, location: 'Meet at Carfax Tower', link: null, created_by: 'demo-u-3', created_at: iso(-2) },
    { id: 'ev3', title: 'Latin American dinner', description: 'Bring a dish from home 🌮', starts_at: iso(9, 19), ends_at: null, location: 'Kellogg College common room', link: 'https://example.com/signup', created_by: 'demo-u-5', created_at: iso(-3) },
    { id: 'ev4', title: 'Welcome drinks', description: null, starts_at: iso(-4, 18), ends_at: null, location: 'BSG café', link: null, created_by: 'demo-u-1', created_at: iso(-10) },
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
      return computeCohort(state.students, ratings, me?.id ?? null)
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
    async adminDeleteStudent(id) {
      state.students = state.students.filter((s) => s.id !== id)
      state.relationships = state.relationships.filter((r) => r.student_id !== id)
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

export function resetDemo() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
