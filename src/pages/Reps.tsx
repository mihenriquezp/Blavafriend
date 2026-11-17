import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Avatar, Card, Spinner, btnPrimary, btnSecondary, inputCls } from '../components/ui'
import { api } from '../lib/api'
import { addDays, fmtDay, londonToday } from '../lib/coffee'
import { callName } from '../lib/names'
import { useStore } from '../lib/store'
import type { RepLabel, RepPriority, RepStatus, RepSubtask, RepTask, RepTaskPatch, Student } from '../lib/types'

/* The student reps' planner: a Trello / Microsoft Planner-style board, only for reps. */

const COLUMNS: { status: RepStatus; label: string; dot: string }[] = [
  { status: 'backlog', label: 'Backlog', dot: '#9ca3af' },
  { status: 'not_started', label: 'Not started', dot: '#3987e5' },
  { status: 'in_progress', label: 'In progress', dot: '#c9a227' },
  { status: 'done', label: 'Done', dot: '#2a9d8f' },
]
const STATUS_LABEL = Object.fromEntries(COLUMNS.map((c) => [c.status, c.label])) as Record<RepStatus, string>

const PRIORITIES: { value: RepPriority; label: string; icon: string; cls: string }[] = [
  { value: 'urgent', label: 'Urgent', icon: '🔴', cls: 'bg-red-100 text-red-800' },
  { value: 'high', label: 'High', icon: '🟠', cls: 'bg-orange-100 text-orange-800' },
  { value: 'medium', label: 'Medium', icon: '🔵', cls: 'bg-sky-50 text-sky-800' },
  { value: 'low', label: 'Low', icon: '⚪', cls: 'bg-gray-100 text-gray-600' },
]
const PRIORITY = Object.fromEntries(PRIORITIES.map((p) => [p.value, p])) as Record<
  RepPriority,
  (typeof PRIORITIES)[number]
>
const PRIORITY_RANK: Record<RepPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

const SWATCHES = ['#1c5cab', '#2a9d8f', '#c9a227', '#dc2626', '#7c3aed', '#db2777', '#ea580c', '#6b7280']

/** The Wednesday of this week (today if it's Wednesday), Oxford time. */
function agendaDay(today = londonToday()) {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay() // 0 Sunday … 3 Wednesday
  return addDays(today, (3 - dow + 7) % 7)
}

type Board = { tasks: RepTask[]; labels: RepLabel[] }

export default function Reps() {
  const { isRep, students, user } = useStore()
  const [board, setBoard] = useState<Board | null>(null)
  const [members, setMembers] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'board' | 'agenda'>('board')
  const [open, setOpen] = useState<string | null>(null)
  const [labelsOpen, setLabelsOpen] = useState(false)

  const load = useCallback(() => {
    Promise.all([api.repBoard(), api.repMembers()]).then(
      ([b, m]) => {
        setBoard(b)
        setMembers(m)
      },
      (e) => setError(e instanceof Error ? e.message : String(e)),
    )
  }, [])
  useEffect(() => {
    if (!isRep) return
    load()
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [isRep, load])

  const byUser = useCallback(
    (id: string | null) => (id ? students.find((s) => s.user_id === id) : undefined),
    [students],
  )
  const reps = useMemo(
    () =>
      members
        .map((id) => ({ id, student: byUser(id) }))
        .sort((a, b) => (a.student?.full_name ?? '').localeCompare(b.student?.full_name ?? '')),
    [members, byUser],
  )

  // Apply a change locally right away, then save it; on failure, reload from the server.
  const patchTask = useCallback(
    async (id: string, patch: RepTaskPatch) => {
      setBoard((b) => b && { ...b, tasks: b.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })
      try {
        const saved = await api.saveRepTask(patch, id)
        setBoard((b) => b && { ...b, tasks: b.tasks.map((t) => (t.id === id ? saved : t)) })
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        load()
      }
    },
    [load],
  )
  const setTask = useCallback(
    (t: RepTask) => setBoard((b) => b && { ...b, tasks: b.tasks.map((x) => (x.id === t.id ? t : x)) }),
    [],
  )

  if (!isRep)
    return (
      <Card className="text-center">
        <p className="font-semibold text-oxford-900">Only for student reps</p>
        <p className="mt-1 text-sm text-gray-500">Ask an admin if you should have access.</p>
      </Card>
    )
  if (!board) return error ? <p className="text-red-700">Couldn’t load the planner: {error}</p> : <Spinner />

  const today = londonToday()
  const isWednesday = agendaDay(today) === today
  const openTask = board.tasks.find((t) => t.id === open) ?? null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-oxford-900">🗂️ Reps planner</h1>
          <p className="text-sm text-gray-500">
            Only student reps can see this. Everything is shared between the reps.
          </p>
        </div>
        <div className="flex gap-1 rounded-2xl bg-white p-1 ring-1 ring-gray-200" role="tablist">
          {(
            [
              ['board', 'Board'],
              ['agenda', '📋 Wednesday agenda'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold whitespace-nowrap ${view === v ? 'bg-oxford-900 text-white' : 'text-oxford-900 hover:bg-oxford-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isWednesday && view === 'board' && (
        <button
          onClick={() => setView('agenda')}
          className="flex w-full items-center gap-3 rounded-2xl bg-amber-50 p-3 text-left text-sm ring-1 ring-amber-200"
        >
          <span className="text-2xl" aria-hidden>
            📋
          </span>
          <span className="flex-1 text-amber-900">
            <b>It’s Wednesday:</b> this week’s agenda is ready to share.
          </span>
          <span className="font-semibold text-oxford-700">See it →</span>
        </button>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">
          {error}{' '}
          <button className="underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </p>
      )}

      {view === 'board' ? (
        <BoardView
          board={board}
          reps={reps}
          me={user?.id ?? null}
          byUser={byUser}
          onOpen={setOpen}
          onPatch={patchTask}
          onAdded={(t) => setBoard((b) => b && { ...b, tasks: [...b.tasks, t] })}
          onLabels={() => setLabelsOpen(true)}
          onError={setError}
        />
      ) : (
        <AgendaView board={board} byUser={byUser} onOpen={setOpen} />
      )}

      {openTask && (
        <TaskDialog
          task={openTask}
          labels={board.labels}
          reps={reps}
          onClose={() => setOpen(null)}
          onPatch={(p) => patchTask(openTask.id, p)}
          onLocal={setTask}
          onDelete={async () => {
            if (!confirm(`Delete “${openTask.title}”?`)) return
            setOpen(null)
            setBoard((b) => b && { ...b, tasks: b.tasks.filter((t) => t.id !== openTask.id) })
            await api.deleteRepTask(openTask.id).catch((e) => {
              setError(String(e))
              load()
            })
          }}
          onLabels={() => setLabelsOpen(true)}
          onError={setError}
        />
      )}
      {labelsOpen && (
        <LabelsDialog
          labels={board.labels}
          onClose={() => setLabelsOpen(false)}
          onChange={(labels) => setBoard((b) => b && { ...b, labels })}
          onDeleted={(id) =>
            setBoard(
              (b) =>
                b && {
                  ...b,
                  labels: b.labels.filter((l) => l.id !== id),
                  tasks: b.tasks.map((t) => (t.label_id === id ? { ...t, label_id: null } : t)),
                },
            )
          }
          onError={setError}
        />
      )}
    </div>
  )
}

type Rep = { id: string; student?: Student }

/* ------------------------------------------------------------------ Board */

function BoardView({
  board,
  reps,
  me,
  byUser,
  onOpen,
  onPatch,
  onAdded,
  onLabels,
  onError,
}: {
  board: Board
  reps: Rep[]
  me: string | null
  byUser: (id: string | null) => Student | undefined
  onOpen: (id: string) => void
  onPatch: (id: string, patch: RepTaskPatch) => void
  onAdded: (t: RepTask) => void
  onLabels: () => void
  onError: (e: string) => void
}) {
  const [owner, setOwner] = useState('')
  const [label, setLabel] = useState('')
  const [priority, setPriority] = useState('')
  const [agendaOnly, setAgendaOnly] = useState(false)
  const [q, setQ] = useState('')
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<RepStatus | null>(null)

  const shown = board.tasks.filter(
    (t) =>
      (!owner || (owner === 'none' ? !t.assignee : t.assignee === (owner === 'me' ? me : owner))) &&
      (!label || t.label_id === label) &&
      (!priority || t.priority === priority) &&
      (!agendaOnly || t.on_agenda) &&
      (!q.trim() || t.title.toLowerCase().includes(q.trim().toLowerCase())),
  )
  const filtered = shown.length !== board.tasks.length
  const labelOf = (id: string | null) => board.labels.find((l) => l.id === id)

  // Drop before `beforeId` (or at the end of the column).
  const drop = (status: RepStatus, beforeId: string | null) => {
    const id = dragging
    setDragging(null)
    setOver(null)
    if (!id) return
    const col = board.tasks.filter((t) => t.status === status && t.id !== id).sort((a, b) => a.position - b.position)
    const i = beforeId ? col.findIndex((t) => t.id === beforeId) : -1
    let position: number
    if (i < 0) position = (col[col.length - 1]?.position ?? 0) + 1
    else position = i === 0 ? col[0].position - 1 : (col[i - 1].position + col[i].position) / 2
    const task = board.tasks.find((t) => t.id === id)
    if (task && (task.status !== status || task.position !== position)) onPatch(id, { status, position })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tasks…"
          className={`${inputCls} !w-44 !py-1.5`}
        />
        <select value={owner} onChange={(e) => setOwner(e.target.value)} className={`${inputCls} !w-auto !py-1.5`}>
          <option value="">Everyone</option>
          <option value="me">My tasks</option>
          <option value="none">Unassigned</option>
          {reps.map((r) => (
            <option key={r.id} value={r.id}>
              {r.student ? callName(r.student) : 'A rep'}
            </option>
          ))}
        </select>
        <select value={label} onChange={(e) => setLabel(e.target.value)} className={`${inputCls} !w-auto !py-1.5`}>
          <option value="">All labels</option>
          {board.labels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className={`${inputCls} !w-auto !py-1.5`}
        >
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.icon} {p.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={agendaOnly}
            onChange={(e) => setAgendaOnly(e.target.checked)}
            className="h-4 w-4 accent-oxford-900"
          />
          📌 On agenda
        </label>
        <button className="ml-auto text-sm font-semibold text-oxford-500 underline" onClick={onLabels}>
          🏷️ Edit labels
        </button>
      </div>

      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
        {COLUMNS.map((c) => {
          const tasks = shown.filter((t) => t.status === c.status).sort((a, b) => a.position - b.position)
          return (
            <section
              key={c.status}
              aria-label={c.label}
              onDragOver={(e) => {
                if (!dragging) return
                e.preventDefault()
                setOver(c.status)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                drop(c.status, null)
              }}
              className={`flex w-72 shrink-0 snap-start flex-col rounded-2xl p-2 lg:w-auto ${
                over === c.status ? 'bg-oxford-100 ring-2 ring-oxford-300' : 'bg-gray-100/80'
              }`}
            >
              <h2 className="flex items-center gap-2 px-1.5 pt-1 pb-2 text-sm font-semibold text-oxford-900">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.dot }} aria-hidden />
                {c.label}
                <span className="rounded-full bg-white px-2 text-xs font-medium text-gray-500">{tasks.length}</span>
              </h2>
              <ul className="space-y-2">
                {tasks.map((t) => (
                  <li
                    key={t.id}
                    draggable
                    onDragStart={(e) => {
                      setDragging(t.id)
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', t.id)
                    }}
                    onDragEnd={() => {
                      setDragging(null)
                      setOver(null)
                    }}
                    onDragOver={(e) => {
                      if (!dragging) return
                      e.preventDefault()
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      drop(c.status, t.id)
                    }}
                    className={dragging === t.id ? 'opacity-40' : ''}
                  >
                    <TaskCard
                      task={t}
                      label={labelOf(t.label_id)}
                      owner={byUser(t.assignee)}
                      onOpen={() => onOpen(t.id)}
                    />
                  </li>
                ))}
              </ul>
              {!filtered && <AddTask status={c.status} tasks={tasks} onAdded={onAdded} onError={onError} />}
            </section>
          )
        })}
      </div>
      <p className="text-xs text-gray-400">
        Drag cards between columns on a computer, or open a card to change its status on the phone.
      </p>
    </div>
  )
}

function TaskCard({
  task: t,
  label,
  owner,
  onOpen,
}: {
  task: RepTask
  label?: RepLabel
  owner?: Student
  onOpen: () => void
}) {
  const done = t.subtasks.filter((s) => s.done).length
  const p = PRIORITY[t.priority]
  const overdue = t.due_on && t.status !== 'done' && t.due_on < londonToday()
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-xl bg-white p-3 text-left shadow-sm ring-1 ring-gray-200 transition hover:ring-oxford-300"
    >
      {label && (
        <span
          className="mb-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
          style={{ background: label.color }}
        >
          {label.name}
        </span>
      )}
      <div
        className={`text-sm font-semibold ${t.status === 'done' ? 'text-gray-500 line-through' : 'text-oxford-900'}`}
      >
        {t.title}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
        {(t.priority === 'urgent' || t.priority === 'high') && (
          <span className={`rounded-full px-1.5 py-0.5 font-semibold ${p.cls}`}>
            {p.icon} {p.label}
          </span>
        )}
        {t.due_on && (
          <span className={overdue ? 'font-semibold text-red-700' : ''}>
            📅 {fmtDay(t.due_on, { day: 'numeric', month: 'short' })}
          </span>
        )}
        {t.subtasks.length > 0 && (
          <span className={done === t.subtasks.length ? 'text-emerald-700' : ''}>
            ☑ {done}/{t.subtasks.length}
          </span>
        )}
        {t.notes && <span title="Has notes">📝</span>}
        {t.on_agenda && <span title="On this week's agenda">📌</span>}
        <span className="ml-auto">
          {owner ? (
            <span title={owner.full_name}>
              <Avatar name={owner.full_name} url={owner.photo_url} size={22} />
            </span>
          ) : (
            <span className="text-gray-400">Unassigned</span>
          )}
        </span>
      </div>
    </button>
  )
}

function AddTask({
  status,
  tasks,
  onAdded,
  onError,
}: {
  status: RepStatus
  tasks: RepTask[]
  onAdded: (t: RepTask) => void
  onError: (e: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const add = async () => {
    const t = title.trim()
    if (!t) return setAdding(false)
    setBusy(true)
    try {
      const position = (tasks[tasks.length - 1]?.position ?? 0) + 1
      onAdded(await api.saveRepTask({ title: t, status, position }))
      setTitle('')
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  if (!adding)
    return (
      <button
        className="mt-2 rounded-lg px-2 py-1.5 text-left text-sm text-gray-500 hover:bg-white hover:text-oxford-900"
        onClick={() => setAdding(true)}
      >
        ＋ Add a task
      </button>
    )
  return (
    <div className="mt-2 space-y-1.5">
      <textarea
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            add()
          }
          if (e.key === 'Escape') setAdding(false)
        }}
        maxLength={200}
        rows={2}
        placeholder="What needs doing?"
        className={`${inputCls} text-sm`}
      />
      <div className="flex gap-2">
        <button className={`${btnPrimary} !py-1.5`} onClick={add} disabled={busy}>
          Add
        </button>
        <button className="text-sm text-gray-500" onClick={() => setAdding(false)}>
          Cancel
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ Task detail */

function Modal({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-oxford-900/50 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-500">{label}</span>
      {children}
    </label>
  )
}

function TaskDialog({
  task: t,
  labels,
  reps,
  onClose,
  onPatch,
  onLocal,
  onDelete,
  onLabels,
  onError,
}: {
  task: RepTask
  labels: RepLabel[]
  reps: Rep[]
  onClose: () => void
  onPatch: (p: RepTaskPatch) => void
  onLocal: (t: RepTask) => void
  onDelete: () => void
  onLabels: () => void
  onError: (e: string) => void
}) {
  const [title, setTitle] = useState(t.title)
  const [notes, setNotes] = useState(t.notes ?? '')
  const [newSub, setNewSub] = useState('')
  const subRef = useRef<HTMLInputElement>(null)
  const done = t.subtasks.filter((s) => s.done).length
  const sel = `${inputCls} !py-1.5 text-sm`

  const saveTitle = () => {
    const v = title.trim()
    if (!v) return setTitle(t.title)
    if (v !== t.title) onPatch({ title: v })
  }
  const saveNotes = () => {
    const v = notes.trim() || null
    if (v !== (t.notes ?? null)) onPatch({ notes: v })
  }
  const setSubs = (subtasks: RepSubtask[]) => onLocal({ ...t, subtasks })
  const addSub = async () => {
    const v = newSub.trim()
    if (!v) return
    setNewSub('')
    try {
      const s = await api.addRepSubtask(t.id, v, (t.subtasks[t.subtasks.length - 1]?.position ?? 0) + 1)
      setSubs([...t.subtasks, s])
      subRef.current?.focus()
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    }
  }
  const updateSub = (s: RepSubtask, patch: Partial<Pick<RepSubtask, 'title' | 'done'>>) => {
    setSubs(t.subtasks.map((x) => (x.id === s.id ? { ...x, ...patch } : x)))
    api.updateRepSubtask(s.id, patch).catch((e) => onError(String(e)))
  }
  const deleteSub = (s: RepSubtask) => {
    setSubs(t.subtasks.filter((x) => x.id !== s.id))
    api.deleteRepSubtask(s.id).catch((e) => onError(String(e)))
  }

  return (
    <Modal onClose={onClose} label={t.title}>
      <div className="flex items-start gap-2">
        <textarea
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
          maxLength={200}
          rows={1}
          aria-label="Title"
          className="min-w-0 flex-1 resize-none rounded-lg px-1 py-0.5 font-display text-xl font-bold text-oxford-900 outline-none focus:ring-2 focus:ring-oxford-100 [field-sizing:content]"
        />
        <button
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xl text-gray-500 hover:bg-gray-100"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Prop label="Status">
          <select value={t.status} onChange={(e) => onPatch({ status: e.target.value as RepStatus })} className={sel}>
            {COLUMNS.map((c) => (
              <option key={c.status} value={c.status}>
                {c.label}
              </option>
            ))}
          </select>
        </Prop>
        <Prop label="Owner">
          <select
            value={t.assignee ?? ''}
            onChange={(e) => onPatch({ assignee: e.target.value || null })}
            className={sel}
          >
            <option value="">Unassigned</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.student?.full_name ?? 'A rep'}
              </option>
            ))}
          </select>
        </Prop>
        <Prop label="Priority">
          <select
            value={t.priority}
            onChange={(e) => onPatch({ priority: e.target.value as RepPriority })}
            className={sel}
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.icon} {p.label}
              </option>
            ))}
          </select>
        </Prop>
        <Prop label="Label">
          <div className="flex gap-1.5">
            <select
              value={t.label_id ?? ''}
              onChange={(e) => onPatch({ label_id: e.target.value || null })}
              className={sel}
            >
              <option value="">No label</option>
              {labels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="shrink-0 text-lg"
              onClick={onLabels}
              title="Edit labels"
              aria-label="Edit labels"
            >
              🏷️
            </button>
          </div>
        </Prop>
        <Prop label="Due date">
          <input
            type="date"
            value={t.due_on ?? ''}
            onChange={(e) => onPatch({ due_on: e.target.value || null })}
            className={sel}
          />
        </Prop>
        <div className="flex items-end">
          <label className="flex w-full cursor-pointer items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm ring-1 ring-amber-200">
            <input
              type="checkbox"
              checked={t.on_agenda}
              onChange={(e) => onPatch({ on_agenda: e.target.checked })}
              className="h-4 w-4 accent-oxford-900"
            />
            <span className="font-semibold text-amber-900">📌 On this week’s agenda</span>
          </label>
        </div>
      </div>

      <section className="mt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-oxford-900">☑ Subtasks</h3>
          {t.subtasks.length > 0 && (
            <span className="text-xs text-gray-500">
              {done} of {t.subtasks.length}
            </span>
          )}
        </div>
        {t.subtasks.length > 0 && (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${(done / t.subtasks.length) * 100}%` }}
            />
          </div>
        )}
        <ul className="mt-2 space-y-1">
          {t.subtasks.map((s) => (
            <li key={s.id} className="group flex items-center gap-2">
              <input
                type="checkbox"
                checked={s.done}
                onChange={(e) => updateSub(s, { done: e.target.checked })}
                className="h-4 w-4 shrink-0 accent-oxford-900"
                aria-label={`Done: ${s.title}`}
              />
              <input
                defaultValue={s.title}
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v && v !== s.title) updateSub(s, { title: v })
                  else e.target.value = s.title
                }}
                maxLength={200}
                className={`min-w-0 flex-1 rounded px-1 py-1 text-sm outline-none focus:ring-2 focus:ring-oxford-100 ${s.done ? 'text-gray-400 line-through' : 'text-gray-800'}`}
              />
              <button
                className="px-1 text-gray-400 hover:text-red-700"
                onClick={() => deleteSub(s)}
                aria-label={`Delete ${s.title}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <input
            ref={subRef}
            value={newSub}
            onChange={(e) => setNewSub(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSub()}
            maxLength={200}
            placeholder="Add a subtask…"
            className={`${inputCls} !py-1.5 text-sm`}
          />
          <button className={`${btnSecondary} !py-1.5`} onClick={addSub} disabled={!newSub.trim()}>
            Add
          </button>
        </div>
      </section>

      <section className="mt-5">
        <h3 className="mb-1.5 text-sm font-semibold text-oxford-900">📝 Notes</h3>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          maxLength={5000}
          rows={4}
          placeholder="Context, decisions, links, who to talk to…"
          className={`${inputCls} text-sm`}
        />
      </section>

      <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-400">
        <span>
          Updated{' '}
          {new Date(t.updated_at).toLocaleString('en-GB', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
        <button className="text-sm text-red-700 underline" onClick={onDelete}>
          Delete task
        </button>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ Labels */

function LabelsDialog({
  labels,
  onClose,
  onChange,
  onDeleted,
  onError,
}: {
  labels: RepLabel[]
  onClose: () => void
  onChange: (labels: RepLabel[]) => void
  onDeleted: (id: string) => void
  onError: (e: string) => void
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(SWATCHES[0])
  const save = async (input: Pick<RepLabel, 'name' | 'color'>, id?: string) => {
    try {
      const l = await api.saveRepLabel(input, id)
      onChange(id ? labels.map((x) => (x.id === id ? l : x)) : [...labels, l])
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <Modal onClose={onClose} label="Labels">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-oxford-900">🏷️ Labels</h2>
        <button
          className="grid h-9 w-9 place-items-center rounded-full text-xl text-gray-500 hover:bg-gray-100"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <p className="mt-1 text-sm text-gray-500">Shared by all reps. Deleting a label just removes it from its tasks.</p>
      <ul className="mt-4 space-y-2">
        {labels.map((l) => (
          <li key={l.id} className="flex items-center gap-2">
            <input
              type="color"
              value={l.color}
              onChange={(e) => save({ name: l.name, color: e.target.value }, l.id)}
              className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-gray-200 bg-white p-1"
              aria-label={`Colour of ${l.name}`}
            />
            <input
              defaultValue={l.name}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== l.name) save({ name: v, color: l.color }, l.id)
                else e.target.value = l.name
              }}
              maxLength={40}
              className={`${inputCls} !py-1.5`}
              aria-label="Label name"
            />
            <button
              className="shrink-0 px-2 text-sm text-red-700 underline"
              onClick={async () => {
                if (!confirm(`Delete the label “${l.name}”?`)) return
                try {
                  await api.deleteRepLabel(l.id)
                  onDeleted(l.id)
                } catch (e) {
                  onError(e instanceof Error ? e.message : String(e))
                }
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-2xl bg-oxford-50 p-3">
        <div className="mb-2 text-sm font-semibold text-oxford-900">New label</div>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="e.g. Careers"
            className={`${inputCls} !py-1.5`}
          />
          <button
            className={`${btnPrimary} !py-1.5`}
            disabled={!name.trim()}
            onClick={() => {
              save({ name: name.trim(), color })
              setName('')
            }}
          >
            Add
          </button>
        </div>
        <div className="mt-2 flex gap-1.5">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
              className={`h-7 w-7 rounded-full ${color === c ? 'ring-2 ring-oxford-900 ring-offset-2' : ''}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ Agenda */

/** The Wednesday summary: tasks on the agenda (and those done in the last 7 days), as a table. */
function AgendaView({
  board,
  byUser,
  onOpen,
}: {
  board: Board
  byUser: (id: string | null) => Student | undefined
  onOpen: (id: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const day = agendaDay()
  const weekAgo = Date.now() - 7 * 86_400_000
  const order: RepStatus[] = ['in_progress', 'not_started', 'backlog', 'done']
  const rows = board.tasks
    .filter((t) => t.on_agenda && (t.status !== 'done' || (t.done_at && Date.parse(t.done_at) >= weekAgo)))
    .sort(
      (a, b) =>
        order.indexOf(a.status) - order.indexOf(b.status) ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'),
    )
  const labelName = (id: string | null) => board.labels.find((l) => l.id === id)?.name ?? ''
  const ownerName = (id: string | null) => byUser(id)?.full_name ?? 'Unassigned'
  const title = `Reps agenda · ${fmtDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}`
  const due = (d: string | null) => (d ? fmtDay(d, { day: 'numeric', month: 'short' }) : '')
  const subs = (t: RepTask) =>
    t.subtasks.length ? `${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}` : ''

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const head = ['#', 'Item', 'Owner', 'Status', 'Priority', 'Label', 'Due', 'Subtasks']
  const cells = (t: RepTask, i: number) => [
    String(i + 1),
    t.title + (t.notes ? ` — ${t.notes.split('\n')[0]}` : ''),
    ownerName(t.assignee),
    STATUS_LABEL[t.status],
    PRIORITY[t.priority].label,
    labelName(t.label_id),
    due(t.due_on),
    subs(t),
  ]
  const html = `<h3>${esc(title)}</h3><table border="1" cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:13px"><tr>${head
    .map((h) => `<th style="background:#002147;color:#fff;text-align:left">${h}</th>`)
    .join('')}</tr>${rows
    .map(
      (t, i) =>
        `<tr>${cells(t, i)
          .map((c) => `<td>${esc(c)}</td>`)
          .join('')}</tr>`,
    )
    .join('')}</table>`
  const text = [
    title,
    '',
    ...rows.map((t, i) => {
      const [, item, owner, status, prio, lab, d, s] = cells(t, i)
      return `${i + 1}. ${item}\n   ${owner} · ${status} · ${prio}${lab ? ` · ${lab}` : ''}${d ? ` · due ${d}` : ''}${s ? ` · ${s} subtasks` : ''}`
    }),
  ].join('\n')

  const copy = async () => {
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          }),
        ])
      } else await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      prompt('Copy the agenda:', text)
    }
  }
  const share = async () => {
    if (navigator.share) await navigator.share({ title, text }).catch(() => {})
    else window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-oxford-900">{title}</h2>
          <p className="text-sm text-gray-500">
            Every task marked 📌 on the agenda, plus what was done in the last 7 days. Untick 📌 on a task to leave it
            out.
          </p>
        </div>
        <div className="flex gap-2">
          <button className={btnPrimary} onClick={copy}>
            {copied ? '✓ Copied' : '📋 Copy table'}
          </button>
          <button className={btnSecondary} onClick={share}>
            ✉️ Send
          </button>
        </div>
      </div>
      {!rows.length ? (
        <p className="mt-4 text-sm text-gray-500">Nothing on the agenda this week.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500">
                {head.map((h) => (
                  <th key={h} className="px-2 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => {
                const owner = byUser(t.assignee)
                const label = board.labels.find((l) => l.id === t.label_id)
                const p = PRIORITY[t.priority]
                return (
                  <tr key={t.id} className="border-b border-gray-100 align-top">
                    <td className="px-2 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-2 py-2">
                      <button
                        className={`text-left font-semibold hover:underline ${t.status === 'done' ? 'text-gray-500 line-through' : 'text-oxford-900'}`}
                        onClick={() => onOpen(t.id)}
                      >
                        {t.title}
                      </button>
                      {t.notes && <div className="line-clamp-2 text-xs text-gray-500">{t.notes}</div>}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {owner ? (
                        <span className="flex items-center gap-1.5">
                          <Avatar name={owner.full_name} url={owner.photo_url} size={20} />
                          {callName(owner)}
                        </span>
                      ) : (
                        <span className="text-gray-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{STATUS_LABEL[t.status]}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${p.cls}`}>
                        {p.icon} {p.label}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      {label && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white"
                          style={{ background: label.color }}
                        >
                          {label.name}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{due(t.due_on)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{subs(t)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-gray-400">
        “Copy table” pastes as a real table into Gmail, Outlook or Word, and as a list into WhatsApp.
      </p>
    </Card>
  )
}
