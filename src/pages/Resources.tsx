import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Coffee } from '../components/Coffee'
import { Formals } from '../components/Formals'
import { Study } from '../components/Study'
import { Avatar, Card, Field, Spinner, btnPrimary, btnSecondary, inputCls } from '../components/ui'
import { api } from '../lib/api'
import { resizeImage } from '../lib/image'
import { callName } from '../lib/names'
import { useStore } from '../lib/store'
import type { CalEvent, CalEventInput, Rsvp, Student } from '../lib/types'

type Tab = 'events' | 'coffee' | 'formals' | 'study'
const TABS: { value: Tab; label: string; emoji: string }[] = [
  { value: 'coffee', label: 'Coffee roulette', emoji: '☕' },
  { value: 'formals', label: 'Formals', emoji: '🎓' },
  { value: 'study', label: 'Study', emoji: '📚' },
  { value: 'events', label: 'Events', emoji: '📅' },
]

const safeLink = (v: string) => {
  const t = v.trim()
  if (!t) return null
  const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`
  try {
    return new URL(withProto).toString()
  } catch {
    return undefined // invalid
  }
}

const dateFmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString('en-GB', opts)

function useAuthors() {
  const { students } = useStore()
  return useCallback(
    (userId: string): Student | undefined => students.find((s) => s.user_id === userId),
    [students],
  )
}

export default function Resources() {
  const [params, setParams] = useSearchParams()
  const asked = params.get('tab') as Tab
  const tab = TABS.some((t) => t.value === asked) ? asked : 'coffee'
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-oxford-900">Coffee +</h1>
        <p className="text-sm text-gray-500">
          Coffees, formals, study sessions and events with the cohort. Everything here is visible to all
          classmates, except your coffee match and who joins each formal or study session.
        </p>
      </div>
      <div className="flex gap-1 overflow-x-auto" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setParams({ tab: t.value }, { replace: true })}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold ${
              tab === t.value ? 'bg-oxford-900 text-white' : 'bg-white text-oxford-900 ring-1 ring-gray-200 hover:ring-oxford-300'
            }`}
          >
            <span aria-hidden>{t.emoji}</span> {t.label}
          </button>
        ))}
      </div>
      {tab === 'events' && <Events />}
      {tab === 'coffee' && <Coffee />}
      {tab === 'formals' && <Formals />}
      {tab === 'study' && <Study />}
    </div>
  )
}

/* ------------------------------------------------------------------ Events */

function Events() {
  const { user, isAdmin } = useStore()
  const [params] = useSearchParams()
  const target = params.get('event')
  const author = useAuthors()
  const [events, setEvents] = useState<CalEvent[] | null>(null)
  const [rsvps, setRsvps] = useState<Rsvp[]>([])
  const [editing, setEditing] = useState<CalEvent | 'new' | null>(null)
  const [showPast, setShowPast] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [e, r] = await Promise.all([api.listCalEvents(), api.listRsvps()])
      setEvents(e)
      setRsvps(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])

  // Opened from the home carousel: bring that event into view.
  useEffect(() => {
    const ev = target && events?.find((e) => e.id === target)
    if (!ev) return
    if (new Date(ev.ends_at ?? ev.starts_at).getTime() + 3 * 3600_000 < Date.now()) setShowPast(true)
    const t = window.setTimeout(
      () => document.getElementById(`event-${ev.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      150,
    )
    return () => window.clearTimeout(t)
  }, [events, target])

  if (error) return <p className="text-red-700">Couldn’t load events: {error}</p>
  if (!events) return <Spinner />

  const now = Date.now()
  const isPast = (e: CalEvent) => new Date(e.ends_at ?? e.starts_at).getTime() + 3 * 3600_000 < now
  const upcoming = events.filter((e) => !isPast(e))
  const past = events.filter(isPast).reverse()

  const rsvp = async (eventId: string, status: Rsvp['status'] | null) => {
    setRsvps((rs) => [
      ...rs.filter((r) => !(r.event_id === eventId && r.user_id === user!.id)),
      ...(status ? [{ event_id: eventId, user_id: user!.id, status }] : []),
    ])
    try {
      await api.setRsvp(eventId, status)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const card = (e: CalEvent) => (
    <EventCard
      key={e.id}
      highlight={e.id === target}
      event={e}
      rsvps={rsvps.filter((r) => r.event_id === e.id)}
      myId={user!.id}
      author={author}
      canEdit={e.created_by === user!.id || isAdmin}
      onRsvp={(s) => rsvp(e.id, s)}
      onEdit={() => setEditing(e)}
      onDelete={async () => {
        if (!confirm(`Delete “${e.title}”?`)) return
        await api.deleteCalEvent(e.id)
        load()
      }}
    />
  )

  return (
    <div className="space-y-3">
      {editing ? (
        <EventForm
          initial={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      ) : (
        <button className={`${btnPrimary} w-full sm:w-auto`} onClick={() => setEditing('new')}>
          ＋ New event
        </button>
      )}
      {upcoming.length ? upcoming.map(card) : <Empty emoji="📅" text="No upcoming events yet. Organise the first one!" />}
      {past.length > 0 && (
        <div>
          <button className="text-sm text-oxford-500 underline" onClick={() => setShowPast((v) => !v)}>
            {showPast ? 'Hide past events' : `Show past events (${past.length})`}
          </button>
          {showPast && <div className="mt-3 space-y-3 opacity-75">{past.map(card)}</div>}
        </div>
      )}
    </div>
  )
}

function EventCard({
  highlight,
  event: e,
  rsvps,
  myId,
  author,
  canEdit,
  onRsvp,
  onEdit,
  onDelete,
}: {
  highlight?: boolean
  event: CalEvent
  rsvps: Rsvp[]
  myId: string
  author: (id: string) => Student | undefined
  canEdit: boolean
  onRsvp: (s: Rsvp['status'] | null) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [showWho, setShowWho] = useState(false)
  const mine = rsvps.find((r) => r.user_id === myId)?.status ?? null
  const going = rsvps.filter((r) => r.status === 'going')
  const maybe = rsvps.filter((r) => r.status === 'maybe')
  const by = author(e.created_by)
  const start = new Date(e.starts_at)
  const time = dateFmt(e.starts_at, { hour: '2-digit', minute: '2-digit' })
  const endTime = e.ends_at ? dateFmt(e.ends_at, { hour: '2-digit', minute: '2-digit' }) : null

  return (
    <div
      id={`event-${e.id}`}
      className={`scroll-mt-24 rounded-2xl ${highlight ? 'ring-2 ring-gold ring-offset-2 ring-offset-[#f7f8fb]' : ''}`}
    >
      <Card>
        <div className="flex gap-3">
          <div className="w-14 shrink-0 overflow-hidden rounded-xl text-center ring-1 ring-oxford-100">
            <div className="bg-oxford-900 py-0.5 text-[11px] font-semibold text-white uppercase">
              {start.toLocaleString('en-GB', { month: 'short' })}
            </div>
            <div className="font-display text-2xl font-bold text-oxford-900">{start.getDate()}</div>
            <div className="pb-1 text-[10px] text-gray-500">{start.toLocaleString('en-GB', { weekday: 'short' })}</div>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-oxford-900">{e.title}</h3>
            <div className="mt-0.5 space-y-0.5 text-sm text-gray-600">
              <div>
                🕒 {time}
                {endTime && ` – ${endTime}`}
              </div>
              {e.location && <div>📍 {e.location}</div>}
              {e.link && (
                <a href={e.link} target="_blank" rel="noreferrer noopener" className="block truncate text-oxford-500 underline">
                  🔗 {e.link.replace(/^https?:\/\/(www\.)?/, '')}
                </a>
              )}
            </div>
          </div>
          {e.image_url && (
            <a href={e.image_url} target="_blank" rel="noreferrer noopener" className="shrink-0" title="Open photo">
              <img src={e.image_url} alt="" loading="lazy" className="h-16 w-16 rounded-xl object-cover ring-1 ring-gray-200" />
            </a>
          )}
        </div>
        {e.description && <p className="mt-3 text-sm whitespace-pre-line text-gray-700">{e.description}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => onRsvp(mine === 'going' ? null : 'going')}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
              mine === 'going' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
            aria-pressed={mine === 'going'}
          >
            {mine === 'going' ? '✓ Going' : 'I’m going'}
          </button>
          <button
            onClick={() => onRsvp(mine === 'maybe' ? null : 'maybe')}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
              mine === 'maybe' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
            }`}
            aria-pressed={mine === 'maybe'}
          >
            {mine === 'maybe' ? '✓ Maybe' : 'Maybe'}
          </button>
          <button onClick={() => setShowWho((v) => !v)} className="ml-auto flex items-center gap-2 text-sm text-gray-600">
            <span className="flex -space-x-1">
              {going.slice(0, 5).map((r) => {
                const s = author(r.user_id)
                return s ? (
                  <span key={r.user_id} className="inline-flex rounded-full ring-2 ring-white">
                    <Avatar name={s.full_name} url={s.photo_url} size={26} />
                  </span>
                ) : null
              })}
            </span>
            <span>
              <b>{going.length}</b> going{maybe.length ? ` · ${maybe.length} maybe` : ''}
            </span>
          </button>
        </div>
        {showWho && (going.length > 0 || maybe.length > 0) && (
          <div className="mt-2 space-y-1 rounded-xl bg-gray-50 p-3 text-sm">
            <WhoList label="Going" rows={going} author={author} />
            <WhoList label="Maybe" rows={maybe} author={author} />
          </div>
        )}

        <PostFooter by={by} at={e.created_at} canEdit={canEdit} onEdit={onEdit} onDelete={onDelete} />
      </Card>
    </div>
  )
}

function WhoList({ label, rows, author }: { label: string; rows: Rsvp[]; author: (id: string) => Student | undefined }) {
  if (!rows.length) return null
  return (
    <div>
      <span className="font-semibold text-oxford-900">{label}: </span>
      {rows
        .map((r) => author(r.user_id))
        .filter(Boolean)
        .map((s, i) => (
          <span key={s!.id}>
            {i > 0 && ', '}
            <Link to={`/people/${s!.id}`} className="hover:underline">
              {callName(s!)}
            </Link>
          </span>
        ))}
    </div>
  )
}

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function EventForm({ initial, onCancel, onSaved }: { initial: CalEvent | null; onCancel: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [start, setStart] = useState(toLocalInput(initial?.starts_at))
  const [end, setEnd] = useState(toLocalInput(initial?.ends_at))
  const [location, setLocation] = useState(initial?.location ?? '')
  const [link, setLink] = useState(initial?.link ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [image, setImage] = useState<string | null>(initial?.image_url ?? null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      setImage(await api.uploadEventPhoto(await resizeImage(file, 1200, 750)))
    } catch (err) {
      setError(`Couldn’t upload the photo: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setUploading(false)
    }
  }

  const submit = async () => {
    const l = safeLink(link)
    if (l === undefined) return setError('That link doesn’t look right.')
    if (end && new Date(end) < new Date(start)) return setError('The end time is before the start.')
    const input: CalEventInput = {
      title: title.trim(),
      starts_at: new Date(start).toISOString(),
      ends_at: end ? new Date(end).toISOString() : null,
      location: location.trim() || null,
      link: l,
      description: description.trim() || null,
      image_url: image,
    }
    setBusy(true)
    setError(null)
    try {
      await api.saveCalEvent(input, initial?.id)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormCard title={initial ? 'Edit event' : 'New event'} onCancel={onCancel} onSubmit={submit} busy={busy} error={error} canSubmit={!!title.trim() && !!start && !uploading}>
      <Field label="What’s the plan?">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Pub quiz at The Eagle and Child" className={inputCls} required />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Starts">
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} required />
        </Field>
        <Field label="Ends (optional)">
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <Field label="Where (optional)">
        <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} placeholder="Place or address" className={inputCls} />
      </Field>
      <Field label="Link (optional)" hint="Sign-up form, tickets, map…">
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" className={inputCls} />
      </Field>
      <Field label="Details (optional)">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} className={inputCls} />
      </Field>
      <Field label="Photo (optional)" hint="Shown on the event and in the home carousel." group>
        {image ? (
          <div className="space-y-2">
            <img src={image} alt="" className="aspect-[8/5] w-full rounded-xl object-cover" />
            <div className="flex gap-3 text-sm">
              <label className="cursor-pointer font-semibold text-oxford-500 underline">
                Change photo
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => pickPhoto(e.target.files?.[0])} />
              </label>
              <button type="button" className="text-red-700 underline" onClick={() => setImage(null)}>
                Remove
              </button>
            </div>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-5 text-sm font-semibold text-oxford-700 hover:border-oxford-300">
            {uploading ? 'Uploading…' : '📷 Add a photo'}
            <input type="file" accept="image/*" className="sr-only" disabled={uploading} onChange={(e) => pickPhoto(e.target.files?.[0])} />
          </label>
        )}
      </Field>
    </FormCard>
  )
}

function FormCard({
  title,
  children,
  onCancel,
  onSubmit,
  busy,
  error,
  canSubmit,
}: {
  title: string
  children: ReactNode
  onCancel: () => void
  onSubmit: () => void
  busy: boolean
  error: string | null
  canSubmit: boolean
}) {
  return (
    <Card className="ring-2 ring-oxford-200">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        <h2 className="font-semibold text-oxford-900">{title}</h2>
        {children}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button type="button" className={btnSecondary} onClick={onCancel}>
            Cancel
          </button>
          <button className={`${btnPrimary} flex-1`} disabled={busy || !canSubmit}>
            {busy ? 'Saving…' : 'Publish'}
          </button>
        </div>
      </form>
    </Card>
  )
}

function PostFooter({
  by,
  at,
  canEdit,
  onEdit,
  onDelete,
}: {
  by: Student | undefined
  at: string
  canEdit: boolean
  onEdit?: () => void
  onDelete: () => void
}) {
  return (
    <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-2 text-xs text-gray-500">
      {by ? (
        <Link to={`/people/${by.id}`} className="flex items-center gap-1.5 hover:underline">
          <Avatar name={by.full_name} url={by.photo_url} size={20} />
          {callName(by)}
        </Link>
      ) : (
        <span>A classmate</span>
      )}
      <span>· {dateFmt(at, { day: 'numeric', month: 'short' })}</span>
      {canEdit && (
        <span className="ml-auto flex gap-3">
          {onEdit && (
            <button className="underline" onClick={onEdit}>
              Edit
            </button>
          )}
          <button className="text-red-700 underline" onClick={onDelete}>
            Delete
          </button>
        </span>
      )}
    </div>
  )
}

function Empty({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
      <div className="mb-2 text-3xl" aria-hidden>
        {emoji}
      </div>
      {text}
    </div>
  )
}
