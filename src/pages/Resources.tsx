import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Coffee } from '../components/Coffee'
import { Avatar, Card, Field, Spinner, btnPrimary, btnSecondary, inputCls } from '../components/ui'
import { api } from '../lib/api'
import { callName } from '../lib/names'
import { useStore } from '../lib/store'
import type { CalEvent, CalEventInput, Notice, NoticeCategory, NoticeInput, Rsvp, Song, Student } from '../lib/types'

type Tab = 'events' | 'coffee' | 'music' | 'notices'
const TABS: { value: Tab; label: string; emoji: string }[] = [
  { value: 'events', label: 'Events', emoji: '📅' },
  { value: 'coffee', label: 'Coffee', emoji: '☕' },
  { value: 'music', label: 'Music', emoji: '🎵' },
  { value: 'notices', label: 'Notice board', emoji: '📢' },
]

export const NOTICE_CATEGORIES: { value: NoticeCategory; label: string; emoji: string; cls: string }[] = [
  { value: 'event', label: 'Event', emoji: '📅', cls: 'bg-sky-100 text-sky-900' },
  { value: 'deal', label: 'Discount / Deal', emoji: '💸', cls: 'bg-emerald-100 text-emerald-900' },
  { value: 'opportunity', label: 'Opportunity', emoji: '🚀', cls: 'bg-violet-100 text-violet-900' },
  { value: 'housing', label: 'Housing', emoji: '🏠', cls: 'bg-amber-100 text-amber-900' },
  { value: 'for_sale', label: 'For sale / Free', emoji: '🛍️', cls: 'bg-rose-100 text-rose-900' },
  { value: 'other', label: 'Other', emoji: '📌', cls: 'bg-gray-100 text-gray-800' },
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

/** Accepts open.spotify.com/track/… (incl. intl-xx/ and ?si=…) or spotify:track:… */
export function parseSpotifyTrack(input: string): string | null {
  const m = input.trim().match(/(?:open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/|spotify:track:)([A-Za-z0-9]{22})/i)
  return m ? m[1] : null
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
  const tab = (params.get('tab') as Tab) || 'events'
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-oxford-900">Resources</h1>
        <p className="text-sm text-gray-500">
          Plans, coffees, music and tips from the cohort. Everything here is visible to all classmates, except your coffee
          match.
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
      {tab === 'music' && <Music />}
      {tab === 'notices' && <Notices />}
    </div>
  )
}

/* ------------------------------------------------------------------ Events */

function Events() {
  const { user, isAdmin } = useStore()
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
  event: e,
  rsvps,
  myId,
  author,
  canEdit,
  onRsvp,
  onEdit,
  onDelete,
}: {
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    <FormCard title={initial ? 'Edit event' : 'New event'} onCancel={onCancel} onSubmit={submit} busy={busy} error={error} canSubmit={!!title.trim() && !!start}>
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
    </FormCard>
  )
}

/* ------------------------------------------------------------------- Music */

function Music() {
  const { user, isAdmin } = useStore()
  const author = useAuthors()
  const [songs, setSongs] = useState<Song[] | null>(null)
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [limit, setLimit] = useState(10)

  const load = useCallback(() => api.listSongs().then(setSongs, (e) => setError(String(e))), [])
  useEffect(() => {
    load()
  }, [load])

  const trackId = parseSpotifyTrack(url)

  const add = async () => {
    if (!trackId) return setError('Paste a Spotify song link (Share → Copy song link).')
    setBusy(true)
    setError(null)
    try {
      await api.addSong(trackId, note.trim() || null)
      setUrl('')
      setNote('')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <Card>
        <h2 className="font-semibold text-oxford-900">🎧 Share a song you love</h2>
        <p className="mb-3 text-xs text-gray-500">In Spotify: ⋯ → Share → Copy song link, then paste it here.</p>
        <div className="space-y-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://open.spotify.com/track/…"
            className={inputCls}
            aria-label="Spotify song link"
          />
          {url && !trackId && <p className="text-xs text-amber-700">That doesn’t look like a Spotify song link.</p>}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="Why you love it (optional)"
            className={inputCls}
            aria-label="Why you love it"
          />
          <button className={btnPrimary} disabled={busy || !trackId} onClick={add}>
            {busy ? 'Adding…' : 'Add to the cohort playlist'}
          </button>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>
      </Card>

      {!songs ? (
        <Spinner />
      ) : songs.length ? (
        <>
          {songs.slice(0, limit).map((s) => (
            <Card key={s.id} className="!p-3">
              <iframe
                title="Spotify song"
                src={`https://open.spotify.com/embed/track/${s.spotify_id}?utm_source=generator`}
                width="100%"
                height="80"
                loading="lazy"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                className="rounded-xl border-0"
              />
              {s.note && <p className="mt-2 text-sm text-gray-700 italic">“{s.note}”</p>}
              <PostFooter
                by={author(s.created_by)}
                at={s.created_at}
                canEdit={s.created_by === user!.id || isAdmin}
                onDelete={async () => {
                  if (!confirm('Remove this song?')) return
                  await api.deleteSong(s.id)
                  load()
                }}
              />
            </Card>
          ))}
          {songs.length > limit && (
            <button className={`${btnSecondary} w-full`} onClick={() => setLimit((l) => l + 10)}>
              Show more songs ({songs.length - limit} more)
            </button>
          )}
        </>
      ) : (
        <Empty emoji="🎵" text="No songs yet. Start the cohort playlist!" />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ Notices */

function today() {
  return new Date().toISOString().slice(0, 10)
}
function inDays(n: number) {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
}

function Notices() {
  const { user, isAdmin } = useStore()
  const author = useAuthors()
  const [notices, setNotices] = useState<Notice[] | null>(null)
  const [editing, setEditing] = useState<Notice | 'new' | null>(null)
  const [filter, setFilter] = useState<NoticeCategory | 'all'>('all')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => api.listNotices().then(setNotices, (e) => setError(String(e))), [])
  useEffect(() => {
    load()
  }, [load])

  const active = useMemo(() => (notices ?? []).filter((n) => !n.expires_on || n.expires_on >= today()), [notices])
  const shown = filter === 'all' ? active : active.filter((n) => n.category === filter)

  if (error) return <p className="text-red-700">Couldn’t load notices: {error}</p>
  if (!notices) return <Spinner />

  return (
    <div className="space-y-3">
      {editing ? (
        <NoticeForm
          initial={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      ) : (
        <button className={`${btnPrimary} w-full sm:w-auto`} onClick={() => setEditing('new')}>
          ＋ New notice
        </button>
      )}

      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          All ({active.length})
        </FilterChip>
        {NOTICE_CATEGORIES.map((c) => {
          const n = active.filter((x) => x.category === c.value).length
          return (
            <FilterChip key={c.value} active={filter === c.value} onClick={() => setFilter(c.value)}>
              {c.emoji} {c.label} ({n})
            </FilterChip>
          )
        })}
      </div>

      {shown.length ? (
        shown.map((n) => {
          const cat = NOTICE_CATEGORIES.find((c) => c.value === n.category)!
          return (
            <Card key={n.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cat.cls}`}>
                  {cat.emoji} {cat.label}
                </span>
                {n.expires_on && (
                  <span className="text-xs text-gray-500">
                    until {new Date(`${n.expires_on}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>
              <h3 className="mt-2 font-semibold text-oxford-900">{n.title}</h3>
              {n.body && <p className="mt-1 text-sm whitespace-pre-line text-gray-700">{n.body}</p>}
              {n.link && (
                <a href={n.link} target="_blank" rel="noreferrer noopener" className="mt-2 inline-block text-sm font-medium text-oxford-500 underline">
                  🔗 Open link
                </a>
              )}
              <PostFooter
                by={author(n.created_by)}
                at={n.created_at}
                canEdit={n.created_by === user!.id || isAdmin}
                onEdit={() => setEditing(n)}
                onDelete={async () => {
                  if (!confirm(`Delete “${n.title}”?`)) return
                  await api.deleteNotice(n.id)
                  load()
                }}
              />
            </Card>
          )
        })
      ) : (
        <Empty emoji="📢" text={filter === 'all' ? 'Nothing on the board yet. Share a tip, a deal or an opportunity!' : 'Nothing in this category right now.'} />
      )}
    </div>
  )
}

function NoticeForm({ initial, onCancel, onSaved }: { initial: Notice | null; onCancel: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState<NoticeCategory>(initial?.category ?? 'other')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [link, setLink] = useState(initial?.link ?? '')
  const [expires, setExpires] = useState(initial ? (initial.expires_on ?? '') : inDays(30))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const l = safeLink(link)
    if (l === undefined) return setError('That link doesn’t look right.')
    const input: NoticeInput = { category, title: title.trim(), body: body.trim() || null, link: l, expires_on: expires || null }
    setBusy(true)
    setError(null)
    try {
      await api.saveNotice(input, initial?.id)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormCard title={initial ? 'Edit notice' : 'New notice'} onCancel={onCancel} onSubmit={submit} busy={busy} error={error} canSubmit={!!title.trim()}>
      <Field label="Category" group>
        <div className="flex flex-wrap gap-1.5">
          {NOTICE_CATEGORIES.map((c) => (
            <FilterChip key={c.value} active={category === c.value} onClick={() => setCategory(c.value)}>
              {c.emoji} {c.label}
            </FilterChip>
          ))}
        </div>
      </Field>
      <Field label="Title">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={inputCls} required />
      </Field>
      <Field label="Details (optional)">
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2000} className={inputCls} />
      </Field>
      <Field label="Link (optional)">
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" className={inputCls} />
      </Field>
      <Field label="Show until" hint="It disappears from the board after this date. Leave empty to keep it.">
        <input type="date" value={expires} min={today()} onChange={(e) => setExpires(e.target.value)} className={inputCls} />
      </Field>
    </FormCard>
  )
}

/* ------------------------------------------------------------------ Shared */

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

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        active ? 'border-oxford-900 bg-oxford-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-oxford-300'
      }`}
    >
      {children}
    </button>
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
