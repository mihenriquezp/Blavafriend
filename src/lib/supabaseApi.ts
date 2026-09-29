import { createClient, type User } from '@supabase/supabase-js'
import { COUNTRY_CONTINENT } from './options'
import type { Api, CohortData, CustomTag, Relationship, RelationshipEvent, SessionUser, Student } from './types'

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
