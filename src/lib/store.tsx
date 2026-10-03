import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from './api'
import { callName } from './names'
import { HOBBIES, LANGUAGES, UNDERGRAD_FIELDS } from './options'
import type {
  CustomTag,
  Relationship,
  RelationshipEvent,
  RelationshipPatch,
  SessionUser,
  Student,
  StudentPatch,
} from './types'

interface Store {
  user: SessionUser | null
  authLoading: boolean
  dataLoading: boolean
  error: string | null
  isAdmin: boolean
  students: Student[]
  me: Student | null
  classmates: Student[]
  /** Classmates who count in statistics: students only (no faculty/staff). */
  peers: Student[]
  relationships: Map<string, Relationship>
  events: RelationshipEvent[]
  hobbyOptions: string[]
  languageOptions: string[]
  degreeOptions: string[]
  /** Short-lived message shown as a toast. */
  notice: string | null
  reload(): Promise<void>
  /** Saves right away (optimistically); resolves false if the server rejected it. */
  setRelationship(studentId: string, patch: RelationshipPatch): Promise<boolean>
  updateStudent(id: string, patch: StudentPatch): Promise<void>
  claim(studentId: string): Promise<void>
  createMine(fullName: string): Promise<void>
  addTag(tag: CustomTag): Promise<void>
  replaceStudent(s: Student): void
  removeStudent(id: string): void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [students, setStudents] = useState<Student[]>([])
  const [rels, setRels] = useState<Relationship[]>([])
  const [events, setEvents] = useState<RelationshipEvent[]>([])
  const [tags, setTags] = useState<CustomTag[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const latestSave = useRef(new Map<string, number>())

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), 3500)
    return () => window.clearTimeout(t)
  }, [notice])

  useEffect(() => {
    api.getUser().then((u) => {
      setUser(u)
      setAuthLoading(false)
    })
    return api.onAuthChange((u) => setUser((prev) => (prev?.id === u?.id ? prev : u)))
  }, [])

  const reload = useCallback(async () => {
    setDataLoading(true)
    setError(null)
    try {
      const [s, r, e, t, admin] = await Promise.all([
        api.listStudents(),
        api.listRelationships(),
        api.listEvents(),
        api.listCustomTags(),
        api.isAdmin(),
      ])
      setStudents(s)
      setRels(r)
      setEvents(e)
      setTags(t)
      setIsAdmin(admin)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDataLoading(false)
    }
  }, [])

  // Count this account as active today and this hour (nothing else is recorded).
  // Also when the app comes back to the foreground (the DB keeps one row per hour).
  useEffect(() => {
    if (!user) return
    api.recordVisit().catch(() => {})
    const onVisible = () => document.visibilityState === 'visible' && api.recordVisit().catch(() => {})
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [user])

  useEffect(() => {
    if (user) reload()
    else {
      setStudents([])
      setRels([])
      setEvents([])
    }
  }, [user, reload])

  const me = useMemo(() => (user ? (students.find((s) => s.user_id === user.id) ?? null) : null), [students, user])
  const classmates = useMemo(() => students.filter((s) => s.id !== me?.id), [students, me])
  const peers = useMemo(() => classmates.filter((s) => s.role !== 'faculty'), [classmates])
  const relationships = useMemo(() => new Map(rels.map((r) => [r.student_id, r])), [rels])

  const setRelationship = useCallback(
    async (studentId: string, patch: RelationshipPatch) => {
      const prev = rels.find((r) => r.student_id === studentId)
      // Meeting someone you starred takes them off your "want to meet" list.
      if (patch.level !== undefined && patch.level > (prev?.level ?? 0) && prev?.starred && patch.starred === undefined) {
        patch = { ...patch, starred: false }
        const person = students.find((s) => s.id === studentId)
        const name = person && callName(person)
        setNotice(`${name ?? 'They'} came off your “want to meet” list ★`)
      }
      const optimistic: Relationship = {
        student_id: studentId,
        level: 0,
        starred: false,
        note: null,
        ...prev,
        ...patch,
        updated_at: new Date().toISOString(),
      }
      setRels((rs) => [...rs.filter((r) => r.student_id !== studentId), optimistic])
      if (patch.level !== undefined && patch.level !== (prev?.level ?? 0)) {
        setEvents((es) => [
          ...es,
          {
            id: `local-${Date.now()}`,
            student_id: studentId,
            from_level: prev?.level ?? 0,
            to_level: patch.level!,
            created_at: optimistic.updated_at,
          },
        ])
      }
      // Only the latest change for a person counts: an older reply arriving late
      // (e.g. after a quick double tap on the star) must not undo a newer one.
      const seq = (latestSave.current.get(studentId) ?? 0) + 1
      latestSave.current.set(studentId, seq)
      try {
        const saved = await api.upsertRelationship(studentId, patch)
        if (latestSave.current.get(studentId) !== seq) return true
        setRels((rs) => [...rs.filter((r) => r.student_id !== studentId), saved])
      } catch (err) {
        if (latestSave.current.get(studentId) !== seq) return true
        setRels((rs) => [...rs.filter((r) => r.student_id !== studentId), ...(prev ? [prev] : [])])
        const message = err instanceof Error ? err.message : String(err)
        setNotice(`Couldn’t save that change: ${message}`)
        return false
      }
      return true
    },
    [rels, students],
  )

  const replaceStudent = useCallback((s: Student) => {
    setStudents((ss) => {
      const next = ss.some((x) => x.id === s.id) ? ss.map((x) => (x.id === s.id ? s : x)) : [...ss, s]
      return next.sort((a, b) => a.full_name.localeCompare(b.full_name))
    })
  }, [])

  const removeStudent = useCallback((id: string) => setStudents((ss) => ss.filter((s) => s.id !== id)), [])

  const updateStudent = useCallback(
    async (id: string, patch: StudentPatch) => replaceStudent(await api.updateStudent(id, patch)),
    [replaceStudent],
  )
  const claim = useCallback(async (id: string) => replaceStudent(await api.claimStudent(id)), [replaceStudent])
  const createMine = useCallback(
    async (name: string) => replaceStudent(await api.createMyStudent(name)),
    [replaceStudent],
  )
  const addTag = useCallback(async (tag: CustomTag) => {
    await api.addCustomTag(tag)
    setTags((ts) => (ts.some((t) => t.kind === tag.kind && t.label === tag.label) ? ts : [...ts, tag]))
  }, [])

  const hobbyOptions = useMemo(() => mergeOptions(HOBBIES, tags, 'hobby', students, (s) => s.hobbies), [tags, students])
  const languageOptions = useMemo(
    () => mergeOptions(LANGUAGES, tags, 'language', students, (s) => s.languages),
    [tags, students],
  )
  const degreeOptions = useMemo(
    () => mergeOptions(UNDERGRAD_FIELDS, tags, 'degree', students, (s) => s.undergrad_fields),
    [tags, students],
  )

  const value: Store = {
    user,
    authLoading,
    dataLoading,
    error,
    isAdmin,
    students,
    me,
    classmates,
    peers,
    relationships,
    events,
    hobbyOptions,
    languageOptions,
    degreeOptions,
    notice,
    reload,
    setRelationship,
    updateStudent,
    claim,
    createMine,
    addTag,
    replaceStudent,
    removeStudent,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function mergeOptions(
  base: readonly string[],
  tags: CustomTag[],
  kind: CustomTag['kind'],
  students: Student[],
  get: (s: Student) => string[],
) {
  const extra = new Set<string>()
  tags.filter((t) => t.kind === kind).forEach((t) => extra.add(t.label))
  students.forEach((s) => get(s).forEach((v) => extra.add(v)))
  base.forEach((b) => extra.delete(b))
  return [...base, ...[...extra].sort((a, b) => a.localeCompare(b))]
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}

export function levelOf(rels: Map<string, Relationship>, id: string) {
  return rels.get(id)?.level ?? 0
}
