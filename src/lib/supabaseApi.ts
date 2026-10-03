import { createClient, type User } from '@supabase/supabase-js'
import { COUNTRY_CONTINENT } from './options'
import type {
  Api,
  CalEvent,
  CoffeeState,
  CohortData,
  CustomTag,
  Notice,
  Relationship,
  RelationshipEvent,
  Rsvp,
  SessionUser,
  Song,
  Student,
  UsageData,
} from './types'

const REL_COLUMNS = 'student_id, level, starred, note, updated_at'

function toSessionUser(u: User | null | undefined): SessionUser | null {
  return u ? { id: u.id, email: u.email ?? '' } : null
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

export function createSupabaseApi(url: string, anonKey: string): Api {
  const sb = createClient(url, anonKey, { auth: { persistSession: true } })

  return {
    mode: 'supabase',

    async getUser() {
      const { data } = await sb.auth.getSession()
      return toSessionUser(data.session?.user)
    },

    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => cb(toSessionUser(session?.user)))
      return () => data.subscription.unsubscribe()
    },

    async sendCode(email) {
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
      if (error) throw new Error(error.message)
    },

    async verifyCode(email, code) {
      const { error } = await sb.auth.verifyOtp({ email, token: code, type: 'email' })
      if (error) throw new Error(error.message)
    },

    async signOut() {
      await sb.auth.signOut()
    },

    async isAdmin() {
      return check(await sb.rpc('is_admin')) === true
    },

    async listStudents() {
      return check(await sb.from('students').select('*').order('full_name')) as Student[]
    },

    async claimStudent(studentId) {
      return check(await sb.rpc('claim_student', { p_student_id: studentId })) as Student
    },

    async createMyStudent(fullName) {
      return check(await sb.rpc('create_my_student', { p_full_name: fullName })) as Student
    },

    async updateStudent(id, patch) {
      return check(await sb.from('students').update(patch).eq('id', id).select().single()) as Student
    },

    async uploadPhoto(studentId, file) {
      const path = `${studentId}/${crypto.randomUUID()}.jpg`
      const { error } = await sb.storage.from('photos').upload(path, file, {
        contentType: 'image/jpeg',
        upsert: false,
      })
      if (error) throw new Error(error.message)
      return sb.storage.from('photos').getPublicUrl(path).data.publicUrl
    },

    async listRelationships() {
      return check(await sb.from('relationships').select(REL_COLUMNS)) as Relationship[]
    },

    async upsertRelationship(studentId, patch) {
      const { data: sess } = await sb.auth.getSession()
      const owner_id = sess.session?.user.id
      return check(
        await sb
          .from('relationships')
          .upsert({ owner_id, student_id: studentId, ...patch }, { onConflict: 'owner_id,student_id' })
          .select(REL_COLUMNS)
          .single(),
      ) as Relationship
    },

    async listEvents() {
      return check(
        await sb
          .from('relationship_events')
          .select('id, student_id, from_level, to_level, created_at')
          .order('created_at'),
      ) as RelationshipEvent[]
    },

    async getCohort() {
      return check(await sb.rpc('cohort_overview', { p_continents: COUNTRY_CONTINENT })) as CohortData
    },

    async listCalEvents() {
      return check(await sb.from('cal_events').select('*').order('starts_at')) as CalEvent[]
    },
    async saveCalEvent(input, id) {
      const q = id ? sb.from('cal_events').update(input).eq('id', id) : sb.from('cal_events').insert(input)
      return check(await q.select().single()) as CalEvent
    },
    async deleteCalEvent(id) {
      check(await sb.from('cal_events').delete().eq('id', id))
    },
    async listRsvps() {
      return check(await sb.from('cal_rsvps').select('event_id, user_id, status')) as Rsvp[]
    },
    async setRsvp(eventId, status) {
      const { data } = await sb.auth.getSession()
      const user_id = data.session?.user.id
      if (status === null) check(await sb.from('cal_rsvps').delete().eq('event_id', eventId).eq('user_id', user_id!))
      else check(await sb.from('cal_rsvps').upsert({ event_id: eventId, user_id, status }, { onConflict: 'event_id,user_id' }))
    },
    async listSongs() {
      return check(await sb.from('songs').select('*').order('created_at', { ascending: false })) as Song[]
    },
    async addSong(spotify_id, note) {
      return check(await sb.from('songs').insert({ spotify_id, note }).select().single()) as Song
    },
    async deleteSong(id) {
      check(await sb.from('songs').delete().eq('id', id))
    },
    async listNotices() {
      return check(await sb.from('notices').select('*').order('created_at', { ascending: false })) as Notice[]
    },
    async saveNotice(input, id) {
      const q = id ? sb.from('notices').update(input).eq('id', id) : sb.from('notices').insert(input)
      return check(await q.select().single()) as Notice
    },
    async deleteNotice(id) {
      check(await sb.from('notices').delete().eq('id', id))
    },

    async coffeeState() {
      return check(await sb.rpc('coffee_state')) as CoffeeState
    },
    async coffeeJoin(join) {
      return check(await sb.rpc('coffee_join', { p_join: join })) as CoffeeState
    },
    async coffeeSetAuto(on) {
      return check(await sb.rpc('coffee_set_auto', { p_on: on })) as CoffeeState
    },

    async recordVisit() {
      await sb.rpc('record_visit')
    },
    async adminUsage() {
      return check(await sb.rpc('admin_usage')) as UsageData
    },

    async listCustomTags() {
      return check(await sb.from('custom_tags').select('kind, label')) as CustomTag[]
    },

    async addCustomTag(tag) {
      const { error } = await sb.from('custom_tags').insert(tag)
      // 23505 = already exists, which is fine.
      if (error && error.code !== '23505') throw new Error(error.message)
    },

    async adminCreateStudent(fullName) {
      return check(await sb.from('students').insert({ full_name: fullName }).select().single()) as Student
    },

    async adminDeleteStudent(id) {
      check(await sb.from('students').delete().eq('id', id))
    },

    async adminUnclaimStudent(id) {
      return check(
        await sb.from('students').update({ user_id: null }).eq('id', id).select().single(),
      ) as Student
    },
  }
}
