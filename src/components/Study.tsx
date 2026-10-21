import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { addDays, fmtDay, londonToday } from '../lib/coffee'
import { callName } from '../lib/names'
import { LANGUAGES, STUDY_SUBJECTS } from '../lib/options'
import { useStore } from '../lib/store'
import type { Student, StudyInput, StudyKind, StudySession } from '../lib/types'
import { Guests, HostContact, MonthCalendar, Row, Step, plural } from './booking'
import { Avatar, Card, Field, Spinner, TagPicker, btnPrimary, btnSecondary, inputCls } from './ui'

type View = 'find' | 'post' | 'mine'
const ALL = ''

const KINDS: Record<
  StudyKind,
  {
    emoji: string
    label: string
    many: string
    post: string
    blurb: string
    join: string
    places: string
    topicHint: string
    cls: string
    seats: number
  }
> = {
  teach: {
    emoji: '🧑‍🏫',
    label: 'Class',
    many: 'Classes',
    post: 'I can teach',
    blurb: 'Give a class on something you’re good at',
    join: 'Join',
    places: 'How many students',
    topicHint: 'e.g. Problem set 3, game theory basics',
    cls: 'bg-sky-100 text-sky-900',
    seats: 4,
  },
  need: {
    emoji: '🙋',
    label: 'Needs a tutor',
    many: 'Need a tutor',
    post: 'I need a tutor',
    blurb: 'Ask someone to help you with a topic',
    join: 'I can help',
    places: 'How many helpers',
    topicHint: 'e.g. Regression output, I’m lost',
    cls: 'bg-amber-100 text-amber-900',
    seats: 1,
  },
  study: {
    emoji: '📖',
    label: 'Study group',
    many: 'Study groups',
    post: 'Study together',
    blurb: 'Find people to study or revise with',
    join: 'Join',
    places: 'How many can join',
    topicHint: 'e.g. Reading group, exam revision',
    cls: 'bg-emerald-100 text-emerald-900',
    seats: 3,
  },
}
const KIND_ORDER: StudyKind[] = ['teach', 'study', 'need']
const LENGTHS = [30, 45, 60, 90, 120, 180]

/** Helper places left (or places left, for a class or group). */
const left = (s: StudySession) => s.capacity - s.taken
/** On a 'need': places left for classmates who want help too. */
const extraLeft = (s: StudySession) => (s.kind === 'need' ? s.extra - s.extra_taken : 0)
const allLeft = (s: StudySession) => left(s) + extraLeft(s)
export const fmtLength = (m: number) =>
  m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`

/**
 * Study: classmates give classes, ask for a tutor or look for a study group, and
 * others join like booking an appointment (subject → day → time).
 */
export function Study() {
  const { students } = useStore()
  const [sessions, setSessions] = useState<StudySession[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('find')
  const [editing, setEditing] = useState<StudySession | null>(null)
  const [newKind, setNewKind] = useState<StudyKind>('teach')

  const load = useCallback(() => api.studyBoard().then(setSessions, (e) => setError(String(e))), [])
  useEffect(() => {
    load()
  }, [load])

  const byUser = useCallback((userId: string) => students.find((s) => s.user_id === userId), [students])
  const mineCount = sessions?.filter((s) => s.mine || s.joined).length ?? 0
  const post = (k: StudyKind) => {
    setNewKind(k)
    setEditing(null)
    setView('post')
  }

  if (!sessions) return error ? <p className="text-red-700">Couldn’t load study sessions: {error}</p> : <Spinner />

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-br from-oxford-50 to-emerald-50">
        <h2 className="font-display text-xl font-bold text-oxford-900">
          <span aria-hidden>📚</span> Study
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Good at something? <b>Give a class</b>. Stuck on a course? <b>Ask for a tutor</b>. Or find people to{' '}
          <b>study together</b>. Pick a subject and a time, and join.
        </p>
      </Card>

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white p-1 ring-1 ring-gray-200" role="tablist">
        {(
          [
            ['find', 'Find'],
            ['post', 'Post'],
            ['mine', `Mine${mineCount ? ` · ${mineCount}` : ''}`],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => {
              setView(v)
              setEditing(null)
            }}
            className={`rounded-xl px-1 py-2 text-sm font-semibold whitespace-nowrap ${view === v ? 'bg-oxford-900 text-white' : 'text-oxford-900 hover:bg-oxford-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'find' && <Find sessions={sessions} byUser={byUser} reload={load} onPost={post} />}
      {view === 'post' && (
        <PostForm
          key={editing?.id ?? newKind}
          initial={editing}
          kind={newKind}
          onDone={() => {
            setEditing(null)
            setView('mine')
            load()
          }}
          onCancel={editing ? () => (setEditing(null), setView('mine')) : undefined}
        />
      )}
      {view === 'mine' && (
        <Mine
          sessions={sessions}
          byUser={byUser}
          reload={load}
          onEdit={(s) => {
            setEditing(s)
            setView('post')
          }}
          onFind={() => setView('find')}
        />
      )}
    </div>
  )
}

function KindBadge({ kind }: { kind: StudyKind }) {
  const k = KINDS[kind]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${k.cls}`}>
      <span aria-hidden>{k.emoji}</span>
      {k.label}
    </span>
  )
}

const when = (s: StudySession) =>
  `${fmtDay(s.day, { weekday: 'short', day: 'numeric', month: 'short' })} · ${s.time} · ${fmtLength(s.minutes)}`

/* ------------------------------------------------------------------ Find */

function Find({
  sessions,
  byUser,
  reload,
  onPost,
}: {
  sessions: StudySession[]
  byUser: (id: string) => Student | undefined
  reload: () => void
  onPost: (k: StudyKind) => void
}) {
  const open = useMemo(() => sessions.filter((s) => !s.mine), [sessions])
  const [kind, setKind] = useState<StudyKind | typeof ALL>(ALL)
  const [lang, setLang] = useState(ALL)
  const langs = useMemo(() => [...new Set(open.flatMap((s) => s.languages))].sort(), [open])
  const inLang = useMemo(() => open.filter((s) => lang === ALL || s.languages.includes(lang)), [open, lang])
  const ofKind = useMemo(() => inLang.filter((s) => kind === ALL || s.kind === kind), [inLang, kind])
  const subjects = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of ofKind) m.set(s.subject, (m.get(s.subject) ?? 0) + allLeft(s))
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [ofKind])
  const [subject, setSubject] = useState(ALL)
  const inSubject = useMemo(() => ofKind.filter((s) => subject === ALL || s.subject === subject), [ofKind, subject])
  const days = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of inSubject) m.set(s.day, (m.get(s.day) ?? 0) + allLeft(s))
    return m
  }, [inSubject])
  const firstFree = [...days].find(([, n]) => n > 0)?.[0] ?? [...days.keys()][0] ?? null
  const [day, setDay] = useState<string | null>(null)
  const shownDay = day && days.has(day) ? day : firstFree
  const [joining, setJoining] = useState<{ s: StudySession; help: boolean } | null>(null)

  if (!open.length)
    return (
      <Card className="text-center">
        <div className="text-4xl" aria-hidden>
          📚
        </div>
        <p className="mt-2 font-semibold text-oxford-900">Nothing on yet</p>
        <p className="mt-1 text-sm text-gray-500">Be the first to post something:</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {KIND_ORDER.map((k) => (
            <button key={k} className={btnSecondary} onClick={() => onPost(k)}>
              {KINDS[k].emoji} {KINDS[k].post}
            </button>
          ))}
        </div>
      </Card>
    )

  const count = (k: StudyKind | typeof ALL) => inLang.filter((s) => k === ALL || s.kind === k).length

  return (
    <div className="space-y-4">
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        {([ALL, ...KIND_ORDER] as const).map((k) => (
          <button
            key={k || 'all'}
            onClick={() => {
              setKind(k)
              setSubject(ALL)
              setDay(null)
            }}
            aria-pressed={kind === k}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${
              kind === k
                ? 'bg-oxford-900 text-white'
                : 'bg-white text-oxford-900 ring-1 ring-gray-200 hover:ring-oxford-300'
            }`}
          >
            {k ? `${KINDS[k].emoji} ${KINDS[k].many}` : 'Everything'}{' '}
            <span className={`text-xs ${kind === k ? 'text-white/70' : 'text-gray-400'}`}>{count(k)}</span>
          </button>
        ))}
      </div>
      {langs.length > 1 && (
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <span aria-hidden>🗣️</span> Language
          <select
            value={lang}
            onChange={(e) => {
              setLang(e.target.value)
              setSubject(ALL)
              setDay(null)
            }}
            className={`${inputCls} !w-auto !py-1.5`}
          >
            <option value="">Any</option>
            {langs.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      )}

      {!ofKind.length ? (
        <Card className="text-center text-sm text-gray-500">Nothing of this kind right now.</Card>
      ) : (
        <>
          <Card>
            <Step n={1} title="Choose a subject" />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[[ALL, subjects.reduce((n, [, c]) => n + c, 0)] as const, ...subjects].map(([c, n]) => (
                <button
                  key={c || 'all'}
                  onClick={() => {
                    setSubject(c)
                    setDay(null)
                  }}
                  aria-pressed={subject === c}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                    subject === c
                      ? 'bg-oxford-900 text-white'
                      : 'bg-white text-oxford-900 ring-1 ring-gray-200 hover:ring-oxford-300'
                  }`}
                >
                  {c || 'All subjects'}{' '}
                  <span
                    className={`text-xs ${subject === c ? 'text-white/70' : n ? 'text-emerald-700' : 'text-gray-400'}`}
                  >
                    {n ? plural(n, 'place') : 'full'}
                  </span>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <Step n={2} title="Pick a day" />
            <MonthCalendar days={days} selected={shownDay} onSelect={setDay} unit="place" />
          </Card>

          {shownDay && (
            <Card>
              <Step
                n={3}
                title={`Choose a time · ${fmtDay(shownDay, { weekday: 'long', day: 'numeric', month: 'long' })}`}
              />
              <ul className="mt-3 space-y-2">
                {inSubject
                  .filter((s) => s.day === shownDay)
                  .map((s) => (
                    <SessionRow key={s.id} s={s} host={byUser(s.host)} onJoin={(help) => setJoining({ s, help })} />
                  ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <p className="text-center text-sm text-gray-500">
        Can’t find what you need?{' '}
        <button className="font-semibold text-oxford-500 underline" onClick={() => onPost('need')}>
          Ask for a tutor
        </button>{' '}
        or{' '}
        <button className="font-semibold text-oxford-500 underline" onClick={() => onPost('study')}>
          start a study group
        </button>
        .
      </p>

      {joining && (
        <JoinDialog
          s={joining.s}
          help={joining.help}
          host={byUser(joining.s.host)}
          onClose={() => setJoining(null)}
          onJoined={reload}
        />
      )}
    </div>
  )
}

function SessionRow({ s, host, onJoin }: { s: StudySession; host?: Student; onJoin: (help: boolean) => void }) {
  const n = left(s)
  const need = s.kind === 'need'
  const x = extraLeft(s)
  return (
    <li className="flex items-start gap-3 rounded-2xl p-3 ring-1 ring-gray-200">
      <div className="w-14 shrink-0 rounded-xl bg-oxford-900 py-1.5 text-center text-white">
        <div className="text-base leading-none font-bold">{s.time}</div>
        <div className="mt-0.5 text-[10px] opacity-75">{fmtLength(s.minutes)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <KindBadge kind={s.kind} />
        <div className="mt-1 font-semibold text-oxford-900">
          {s.subject}
          {s.topic && <span className="font-normal text-gray-600"> · {s.topic}</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
          {host && <Avatar name={host.full_name} url={host.photo_url} size={18} />}
          <span className="truncate">
            {s.kind === 'teach' ? 'Taught by' : s.kind === 'need' ? 'Asked by' : 'With'}{' '}
            {host ? callName(host) : 'a classmate'}
          </span>
        </div>
        {s.place && <div className="mt-0.5 truncate text-xs text-gray-500">📍 {s.place}</div>}
        <div className="mt-0.5 truncate text-xs text-gray-500">🗣️ {s.languages.join(', ')}</div>
        <div className={`mt-0.5 text-xs ${n ? 'text-emerald-700' : 'text-gray-400'}`}>
          {n
            ? need
              ? 'Looking for help'
              : `${n} of ${plural(s.capacity, 'place')} left`
            : need
              ? 'Someone is helping'
              : 'Full'}
        </div>
        {need && s.extra > 0 && (
          <div className={`text-xs ${x ? 'text-emerald-700' : 'text-gray-400'}`}>
            {x ? `${x} of ${plural(s.extra, 'place')} for classmates` : 'Full for classmates'}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-1.5 self-center">
        {s.joined ? (
          <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-900">
            {s.my_role === 'help' ? '✓ Helping' : '✓ In'}
          </span>
        ) : need ? (
          <>
            <button className={`${btnPrimary} !px-3`} disabled={!n} onClick={() => onJoin(true)}>
              {n ? 'I can help' : 'Helped'}
            </button>
            {s.extra > 0 && (
              <button className={`${btnSecondary} !px-3`} disabled={!x} onClick={() => onJoin(false)}>
                Join too
              </button>
            )}
          </>
        ) : (
          <button className={`${btnPrimary} !px-3`} disabled={!n} onClick={() => onJoin(false)}>
            {n ? KINDS[s.kind].join : 'Full'}
          </button>
        )}
      </div>
    </li>
  )
}

function JoinDialog({
  s,
  help,
  host,
  onClose,
  onJoined,
}: {
  s: StudySession
  /** On a 'need': come to help (true) or join to get help too (false). */
  help: boolean
  host?: Student
  onClose: () => void
  onJoined: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = host ? callName(host) : 'them'
  const helping = s.kind === 'need' && help
  const tagAlong = s.kind === 'need' && !help

  const join = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.studyJoin(s.id, s.kind === 'need' ? help : undefined)
      setDone(true)
      onJoined()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-oxford-900/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="study-title"
        className="max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center">
          <div className="text-5xl" aria-hidden>
            {done ? '🙌' : KINDS[s.kind].emoji}
          </div>
          <h2 id="study-title" className="mt-2 font-display text-2xl font-bold text-oxford-900">
            {done
              ? helping
                ? 'Thank you!'
                : 'You’re in!'
              : helping
                ? `Help ${name}?`
                : tagAlong
                  ? `Join ${name}’s session?`
                  : 'Join this session?'}
          </h2>
        </div>
        <dl className="mt-4 space-y-1.5 rounded-2xl bg-oxford-50 p-4 text-sm">
          <Row k="Subject" v={s.topic ? `${s.subject} · ${s.topic}` : s.subject} />
          <Row k="When" v={when(s)} />
          <Row k="Language" v={s.languages.join(', ')} />
          {s.place && <Row k="Where" v={s.place} />}
          <Row k={s.kind === 'need' ? 'Asked by' : 'Host'} v={host?.full_name ?? 'A classmate'} />
          {s.notes && <Row k="Notes" v={s.notes} />}
        </dl>
        {done ? (
          <>
            <p className="mt-4 text-sm text-gray-700">
              {helping
                ? `Message ${name} to agree the details.`
                : `Say hi to ${name}, and check the place before you go.`}{' '}
              You can leave any time from <b>Mine</b>.
            </p>
            {host && <HostContact host={host} />}
          </>
        ) : (
          <p className="mt-4 text-sm text-gray-600">
            {helping
              ? `This tells ${name} you can help, and saves the time for you both.${
                  s.extra_taken ? ` ${plural(s.extra_taken, 'other classmate')} will be there too.` : ''
                }`
              : tagAlong
                ? `Stuck on the same thing? Join ${name} and get help too, whoever comes to help.`
                : 'This saves you a place. If you can’t make it, leave it so someone else can come.'}
          </p>
        )}
        {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex gap-2">
          {done ? (
            <button className={`${btnPrimary} w-full`} onClick={onClose}>
              👍 Done
            </button>
          ) : (
            <>
              <button className={btnSecondary} onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button className={`${btnPrimary} flex-1`} onClick={join} disabled={busy}>
                {busy ? 'Saving…' : helping ? 'I can help' : 'Join'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Mine */

function Mine({
  sessions,
  byUser,
  reload,
  onEdit,
  onFind,
}: {
  sessions: StudySession[]
  byUser: (id: string) => Student | undefined
  reload: () => void
  onEdit: (s: StudySession) => void
  onFind: () => void
}) {
  const posted = sessions.filter((s) => s.mine)
  const joined = sessions.filter((s) => s.joined)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try {
      await fn()
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (!posted.length && !joined.length)
    return (
      <Card className="text-center">
        <p className="font-semibold text-oxford-900">Nothing here yet</p>
        <p className="mt-1 text-sm text-gray-500">Sessions you join and things you post will show here.</p>
        <button className={`${btnPrimary} mt-4`} onClick={onFind}>
          Find a session
        </button>
      </Card>
    )

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {joined.length > 0 && (
        <Card>
          <h3 className="font-semibold text-oxford-900">🙌 You’re in</h3>
          <ul className="mt-3 space-y-3">
            {joined.map((s) => {
              const host = byUser(s.host)
              return (
                <li key={s.id} className="rounded-2xl p-3 ring-1 ring-gray-200">
                  <KindBadge kind={s.kind} />
                  <div className="mt-1 font-semibold text-oxford-900">
                    {s.subject}
                    {s.topic && <span className="font-normal text-gray-600"> · {s.topic}</span>}
                  </div>
                  <div className="text-sm text-gray-600">{when(s)}</div>
                  {s.place && <div className="text-xs text-gray-500">📍 {s.place}</div>}
                  <div className="text-xs text-gray-500">🗣️ {s.languages.join(', ')}</div>
                  <div className="text-xs text-gray-500">
                    {s.my_role === 'help' ? 'You’re helping' : s.kind === 'need' ? 'Asked by' : 'Host'}:{' '}
                    {host?.full_name ?? 'a classmate'}
                  </div>
                  {s.kind === 'need' ? (
                    <>
                      <Guests ids={s.helpers} byUser={byUser} label="Helping" />
                      <Guests
                        ids={s.members.filter((m) => !s.helpers.includes(m))}
                        byUser={byUser}
                        label="Also joining"
                      />
                    </>
                  ) : (
                    <Guests ids={s.members} byUser={byUser} label="Going" />
                  )}
                  {host && <HostContact host={host} />}
                  <button
                    className="mt-3 text-sm text-red-700 underline"
                    onClick={() => confirm('Leave this session?') && run(() => api.studyLeave(s.id))}
                  >
                    Leave
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
      {posted.length > 0 && (
        <Card>
          <h3 className="font-semibold text-oxford-900">📌 Your posts</h3>
          <ul className="mt-3 space-y-3">
            {posted.map((s) => (
              <li key={s.id} className="rounded-2xl p-3 ring-1 ring-gray-200">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <KindBadge kind={s.kind} />
                    <div className="mt-1 font-semibold text-oxford-900">
                      {s.subject}
                      {s.topic && <span className="font-normal text-gray-600"> · {s.topic}</span>}
                    </div>
                    <div className="text-sm text-gray-600">{when(s)}</div>
                    <div className="text-xs text-gray-500">🗣️ {s.languages.join(', ')}</div>
                    <div className="text-xs text-gray-500">
                      {s.kind === 'need'
                        ? `${s.taken ? `${plural(s.taken, 'person')} helping` : 'No helper yet'}${
                            s.extra ? ` · ${s.extra_taken} of ${s.extra} classmates joined` : ''
                          }`
                        : `${s.taken} of ${plural(s.capacity, 'place')} taken`}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-3 text-sm">
                    <button className="text-oxford-500 underline" onClick={() => onEdit(s)}>
                      Edit
                    </button>
                    <button
                      className="text-red-700 underline"
                      onClick={() =>
                        confirm(
                          s.taken
                            ? `Delete this? ${plural(s.taken, 'person has', 'people have')} joined: let them know.`
                            : 'Delete this?',
                        ) && run(() => api.deleteStudy(s.id))
                      }
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {s.members.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {s.members.map((m) => {
                      const st = byUser(m)
                      return (
                        <li key={m} className="flex items-center gap-2 text-sm">
                          {st && <Avatar name={st.full_name} url={st.photo_url} size={28} />}
                          {st ? (
                            <Link
                              to={`/people/${st.id}`}
                              className="min-w-0 flex-1 truncate text-oxford-900 hover:underline"
                            >
                              {st.full_name}
                            </Link>
                          ) : (
                            <span className="flex-1 text-gray-500">A classmate</span>
                          )}
                          {s.kind === 'need' && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                s.helpers.includes(m) ? 'bg-emerald-100 text-emerald-900' : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {s.helpers.includes(m) ? 'helping' : 'joining'}
                            </span>
                          )}
                          <button
                            className="text-xs text-gray-500 underline"
                            onClick={() =>
                              confirm(`Take ${st ? callName(st) : 'this person'} off?`) &&
                              run(() => api.studyLeave(s.id, m))
                            }
                          >
                            Remove
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ Post */

function PostForm({
  initial,
  kind: startKind,
  onDone,
  onCancel,
}: {
  initial: StudySession | null
  kind: StudyKind
  onDone: () => void
  onCancel?: () => void
}) {
  const today = londonToday()
  const [kind, setKind] = useState<StudyKind>(initial?.kind ?? startKind)
  const [subject, setSubject] = useState(initial?.subject ?? '')
  const [topic, setTopic] = useState(initial?.topic ?? '')
  const [day, setDay] = useState(initial?.day ?? addDays(today, 2))
  const [time, setTime] = useState(initial?.time ?? '18:00')
  const [minutes, setMinutes] = useState(initial?.minutes ?? 60)
  const [languages, setLanguages] = useState<string[]>(initial?.languages ?? ['English'])
  const [capacity, setCapacity] = useState(initial?.capacity ?? KINDS[startKind].seats)
  const [place, setPlace] = useState(initial?.place ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [extra, setExtra] = useState(initial?.extra ?? 0)
  const minSeats = Math.max(1, initial?.taken ?? 0)
  const k = KINDS[kind]

  const save = async () => {
    if (!subject) return setError('Choose the subject.')
    if (subject === 'Other' && !topic.trim()) return setError('Say what it’s about in the topic.')
    if (!day || day < today) return setError('Choose a day from today on.')
    if (!/^\d{2}:\d{2}$/.test(time)) return setError('Choose a time.')
    if (!languages.length) return setError('Choose at least one language.')
    if (languages.length > 6) return setError('Choose up to 6 languages.')
    const input: StudyInput = {
      kind,
      subject,
      topic: topic.trim() || null,
      day,
      time,
      minutes,
      languages,
      capacity,
      extra: kind === 'need' ? extra : 0,
      place: place.trim() || null,
      notes: notes.trim() || null,
    }
    setBusy(true)
    setError(null)
    try {
      await api.saveStudy(input, initial?.id)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <h3 className="font-semibold text-oxford-900">{initial ? 'Edit your post' : 'What do you want to post?'}</h3>
      <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Kind">
        {KIND_ORDER.map((x) => (
          <button
            key={x}
            type="button"
            role="radio"
            aria-checked={kind === x}
            disabled={!!initial}
            onClick={() => {
              setKind(x)
              setCapacity(KINDS[x].seats)
            }}
            className={`rounded-2xl p-2.5 text-center ring-1 disabled:cursor-default ${
              kind === x ? 'bg-oxford-900 text-white ring-oxford-900' : 'bg-white text-oxford-900 ring-gray-200'
            } ${initial && kind !== x ? 'opacity-40' : ''}`}
          >
            <div className="text-2xl" aria-hidden>
              {KINDS[x].emoji}
            </div>
            <div className="mt-1 text-xs leading-tight font-semibold">{KINDS[x].post}</div>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500">{k.blurb}.</p>

      <div className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Subject">
            <select value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls}>
              <option value="">Choose…</option>
              {STUDY_SUBJECTS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Length">
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={inputCls}>
              {LENGTHS.map((m) => (
                <option key={m} value={m}>
                  {fmtLength(m)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={subject === 'Other' ? 'Topic' : 'Topic (optional)'}>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={120}
            placeholder={k.topicHint}
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Day">
            <input type="date" value={day} min={today} onChange={(e) => setDay(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Time">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label={k.places} group>
          <Stepper value={capacity} min={minSeats} max={20} onChange={setCapacity}>
            {kind === 'teach' && <span className="text-xs text-gray-500">1 = one-to-one</span>}
          </Stepper>
        </Field>
        {kind === 'need' && (
          <Field
            label="Classmates who can join too"
            hint="Others stuck on the same thing can join your session and get help too. 0 = just you."
            group
          >
            <Stepper value={extra} min={initial?.extra_taken ?? 0} max={19} onChange={setExtra} />
          </Field>
        )}
        <Field label="Languages" hint="Which languages you can do it in." group>
          <TagPicker options={LANGUAGES} value={languages} onChange={setLanguages} placeholder="Add a language…" />
        </Field>
        <Field label="Where (optional)">
          <input
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            maxLength={120}
            placeholder="BSG room, library, or a Teams link"
            className={inputCls}
          />
        </Field>
        <Field label="Notes (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder={
              kind === 'need' ? 'What you’ve tried, what you’re stuck on…' : 'What to bring, what to read first…'
            }
            className={inputCls}
          />
        </Field>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex gap-2">
        {onCancel && (
          <button className={btnSecondary} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        <button className={`${btnPrimary} flex-1`} onClick={save} disabled={busy}>
          {busy ? 'Saving…' : initial ? 'Save' : 'Post'}
        </button>
      </div>
    </Card>
  )
}

function Stepper({
  value,
  min,
  max,
  onChange,
  children,
}: {
  value: number
  min: number
  max: number
  onChange: (n: number) => void
  children?: ReactNode
}) {
  const btn = 'grid h-10 w-10 place-items-center rounded-lg bg-white text-lg ring-1 ring-gray-200 disabled:opacity-40'
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={btn}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="One less"
      >
        −
      </button>
      <span className="w-8 text-center text-lg font-bold text-oxford-900" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={btn}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="One more"
      >
        +
      </button>
      {children}
    </div>
  )
}
