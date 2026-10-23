import { createClient, type User } from '@supabase/supabase-js'
import { COUNTRY_CONTINENT } from './options'
import { COHORT_CONSENT_VERSION } from './cohortConsent'
import type {
  Api,
  CalEvent,
  CoffeeState,
  DayActivity,
  Newsletter,
  NewsletterStats,
  CohortData,
  CohortConsent,
  CustomTag,
  Notice,
  Relationship,
  RelationshipEvent,
  Rsvp,
  SessionUser,
  Song,
  Student,
  EngagementData,
  FormalSlot,
  StudySession,
  Tool,
  ToolStats,
  UsageData,
} from './types'

const REL_COLUMNS = 'student_id, level, starred, note, updated_at'
const TOOL_COLS = 'id, title, description, icon, remove_on, hidden, created_at'

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
      const students = check(await sb.from('students').select('*').order('full_name')) as Student[]
      // RLS returns only the caller's private row, including for app admins.
      const privateRows = check(await sb.from('student_private').select('student_id,birth_year'))
      const years = new Map((privateRows ?? []).map((row) => [row.student_id, row.birth_year]))
      return students.map((student) => ({ ...student, birth_year: years.get(student.id) ?? null }))
    },

    async claimStudent(studentId) {
      const student = check(await sb.rpc('claim_student', { p_student_id: studentId })) as Student
      const privateRow = check(await sb.from('student_private').select('birth_year').eq('student_id', student.id).maybeSingle())
      return { ...student, birth_year: privateRow?.birth_year ?? null }
    },

    async createMyStudent(fullName) {
      return check(await sb.rpc('create_my_student', { p_full_name: fullName })) as Student
    },

    async updateStudent(id, patch) {
      return check(await sb.rpc('update_student_profile', { p_id: id, p_patch: patch })) as Student
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

    async getCohortConsent() {
      return check(await sb.rpc('get_cohort_consent')) as CohortConsent
    },

    async setCohortConsent(enabled) {
      return check(await sb.rpc('set_cohort_consent', { p_enabled: enabled, p_version: COHORT_CONSENT_VERSION })) as CohortConsent
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
    async uploadEventPhoto(file) {
      const { data } = await sb.auth.getSession()
      const uid = data.session?.user.id
      if (!uid) throw new Error('Not signed in')
      const path = `${uid}/${crypto.randomUUID()}.jpg`
      const { error } = await sb.storage
        .from('event-photos')
        .upload(path, file, { contentType: 'image/jpeg', upsert: false })
      if (error) throw new Error(error.message)
      return sb.storage.from('event-photos').getPublicUrl(path).data.publicUrl
    },
    async listRsvps() {
      return check(await sb.from('cal_rsvps').select('event_id, user_id, status')) as Rsvp[]
    },
    async setRsvp(eventId, status) {
      const { data } = await sb.auth.getSession()
      const user_id = data.session?.user.id
      if (status === null) check(await sb.from('cal_rsvps').delete().eq('event_id', eventId).eq('user_id', user_id!))
      else
        check(
          await sb.from('cal_rsvps').upsert({ event_id: eventId, user_id, status }, { onConflict: 'event_id,user_id' }),
        )
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

    async listNewsletters() {
      return check(await sb.from('newsletters').select('*').order('week_of', { ascending: false })) as Newsletter[]
    },
    async saveNewsletter(input, id) {
      const q = id ? sb.from('newsletters').update(input).eq('id', id) : sb.from('newsletters').insert(input)
      return check(await q.select().single()) as Newsletter
    },
    async deleteNewsletter(id) {
      check(await sb.from('newsletters').delete().eq('id', id))
    },
    async listNewsletterChecks() {
      return check(await sb.from('newsletter_checks').select('newsletter_id, item_id')) as {
        newsletter_id: string
        item_id: string
      }[]
    },
    async setNewsletterCheck(newsletterId, itemId, checked) {
      if (checked)
        check(
          await sb
            .from('newsletter_checks')
            .upsert({ newsletter_id: newsletterId, item_id: itemId }, { onConflict: 'newsletter_id,item_id,user_id' }),
        )
      else check(await sb.from('newsletter_checks').delete().eq('newsletter_id', newsletterId).eq('item_id', itemId))
    },

    async newsletterView(id) {
      await sb.rpc('newsletter_view', { p_newsletter: id })
    },
    async adminNewsletterStats() {
      return check(await sb.rpc('admin_newsletter_stats')) as NewsletterStats
    },

    async listTools() {
      const list = (cols: string) => sb.from('tools').select(cols).order('created_at', { ascending: false })
      let res = await list(TOOL_COLS)
      // Before the database has the hidden column, keep showing the tools.
      if (res.error?.code === '42703') res = await list(TOOL_COLS.replace(', hidden', ''))
      return (check(res) as unknown as Tool[]).map((t) => ({ ...t, hidden: !!t.hidden }))
    },
    async getToolHtml(id) {
      return (check(await sb.from('tools').select('html').eq('id', id).single()) as { html: string }).html
    },
    async saveTool(input, id) {
      const q = id ? sb.from('tools').update(input).eq('id', id) : sb.from('tools').insert(input)
      return check(await q.select(TOOL_COLS).single()) as unknown as Tool
    },
    async deleteTool(id) {
      check(await sb.from('tools').delete().eq('id', id))
    },
    async toolOpen(id) {
      const { data, error } = await sb.rpc('tool_open', { p_tool: id })
      return error ? null : ((data as string | null) ?? null)
    },
    async toolHeartbeat(sessionId, seconds, actions) {
      await sb.rpc('tool_heartbeat', { p_session: sessionId, p_seconds: seconds, p_actions: actions })
    },
    async listMyToolData() {
      return check(await sb.from('tool_data').select('tool_id, saved_at')) as { tool_id: string; saved_at: string }[]
    },
    async getMyToolData(toolId) {
      const { data, error } = await sb.from('tool_data').select('data, saved_at').eq('tool_id', toolId).maybeSingle()
      if (error) throw new Error(error.message)
      return data as { data: Record<string, string>; saved_at: string } | null
    },
    async saveMyToolData(toolId, data, savedAt) {
      const { data: s } = await sb.auth.getSession()
      check(
        await sb
          .from('tool_data')
          .upsert({ user_id: s.session?.user.id, tool_id: toolId, data, saved_at: savedAt }, { onConflict: 'user_id,tool_id' }),
      )
    },
    async adminEngagement() {
      return check(await sb.rpc('admin_engagement')) as EngagementData
    },
    async adminToolStats() {
      return check(await sb.rpc('admin_tool_stats')) as ToolStats
    },

    async formalBoard() {
      const rows = check(await sb.rpc('formal_board')) as FormalSlot[]
      return rows.map((r) => ({ ...r, price: Number(r.price) }))
    },
    async saveFormal(input, id) {
      const { time, ...rest } = input
      const row = { ...rest, at: time }
      check(await (id ? sb.from('formal_slots').update(row).eq('id', id) : sb.from('formal_slots').insert(row)))
    },
    async deleteFormal(id) {
      check(await sb.from('formal_slots').delete().eq('id', id))
    },
    async formalBook(id) {
      check(await sb.rpc('formal_book', { p_slot: id }))
    },
    async formalCancel(id, guest) {
      check(await sb.rpc('formal_cancel', { p_slot: id, p_guest: guest ?? null }))
    },
    async studyBoard() {
      return check(await sb.rpc('study_board')) as StudySession[]
    },
    async saveStudy(input, id) {
      const { time, ...rest } = input
      const row = { ...rest, at: time }
      check(await (id ? sb.from('study_sessions').update(row).eq('id', id) : sb.from('study_sessions').insert(row)))
    },
    async deleteStudy(id) {
      check(await sb.from('study_sessions').delete().eq('id', id))
    },
    async studyJoin(id, help) {
      check(await sb.rpc('study_join', { p_session: id, p_help: help ?? null }))
    },
    async studyLeave(id, member) {
      check(await sb.rpc('study_leave', { p_session: id, p_member: member ?? null }))
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
    async adminDay(day) {
      return check(await sb.rpc('admin_day', { p_day: day })) as DayActivity
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

    async adminPendingDeletions() {
      return check(await sb.rpc('admin_pending_deletions')) ?? []
    },

    async adminDeleteStudent(id) {
      const result = check(await sb.functions.invoke('delete-student', { body: { student_id: id } }))
      if (result?.deleted !== true) throw new Error('Account deletion is incomplete. Please retry.')
    },

    async adminUnclaimStudent(id) {
      return check(await sb.from('students').update({ user_id: null }).eq('id', id).select().single()) as Student
    },
  }
}
