import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar, Card, Chip, CountryLabel, LevelPicker, StarButton, btnPrimary } from '../components/ui'
import { FAMILY_OPTIONS, GENDER_OPTIONS, LEVELS, continentOf, type Level } from '../lib/options'
import { callName } from '../lib/names'
import { socialLinks } from '../lib/social'
import { useStore } from '../lib/store'

export default function Person() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { students, me, relationships, events, setRelationship } = useStore()
  const s = students.find((x) => x.id === id)
  const rel = id ? relationships.get(id) : undefined
  const [note, setNote] = useState(rel?.note ?? '')
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const timer = useRef<number | undefined>(undefined)
  const pendingNote = useRef<string | null>(null)

  useEffect(() => setNote(rel?.note ?? ''), [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) return <p className="text-gray-500">This person isn't in the directory anymore.</p>
  if (s.id === me?.id)
    return (
      <p>
        That's you! <Link to="/me" className="underline">Edit your profile</Link>.
      </p>
    )

  const level = (rel?.level ?? 0) as Level
  const history = events.filter((e) => e.student_id === s.id).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const family = FAMILY_OPTIONS.find((f) => f.value === s.family_status)?.label
  const gender = s.gender && s.gender !== 'prefer_not_say' ? GENDER_OPTIONS.find((g) => g.value === s.gender)?.label : null
  const links = socialLinks(s)

  // Every change is saved straight away; this just tracks it so we can say so.
  const track = async (save: () => Promise<boolean | void>) => {
    setSaved('saving')
    const ok = await save()
    setSaved(ok === false ? 'error' : pendingNote.current === null ? 'saved' : 'saving')
  }

  const flushNote = async () => {
    window.clearTimeout(timer.current)
    const value = pendingNote.current
    if (value === null) return true
    pendingNote.current = null
    return setRelationship(s.id, { note: value || null })
  }

  const saveNote = (value: string) => {
    setNote(value)
    setSaved('saving')
    pendingNote.current = value
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => track(flushNote), 700)
  }

  const done = async () => {
    await track(flushNote)
    if (window.history.length > 1) navigate(-1)
    else navigate('/people')
  }

  return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="text-sm text-oxford-500">
        ← Back
      </button>

      <Card>
        <div className="flex items-start gap-4">
          <Avatar name={s.full_name} url={s.photo_url} size={88} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h1 className="font-display text-2xl font-bold text-oxford-900">{s.full_name}</h1>
                {s.nickname && <p className="text-sm text-gray-500">Goes by “{s.nickname}”</p>}
              </div>
              <StarButton
                starred={!!rel?.starred}
                onToggle={() => track(() => setRelationship(s.id, { starred: !rel?.starred }))}
              />
            </div>
            {s.job_title && <p className="text-gray-700">{s.job_title}</p>}
            <p className="mt-1 text-sm text-gray-500">
              {[s.college && `${s.college} College`, s.age && `${s.age} y/o`].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        {s.bio && <p className="mt-4 whitespace-pre-line text-gray-700">{s.bio}</p>}

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Info
            label="From"
            value={
              s.country_origin && (
                <>
                  <CountryLabel country={s.country_origin} /> ({continentOf(s.country_origin) ?? '—'})
                </>
              )
            }
          />
          <Info label="Lives in" value={s.country_residence && <CountryLabel country={s.country_residence} />} />
          <Info label="Coming" value={family} />
          <Info label="Speaks" value={s.languages.join(', ')} />
          <Info label="Gender" value={gender} />
        </dl>

        {s.policy_interests.length > 0 && (
          <TagRow label="Policy interests" tags={s.policy_interests} param="policy" />
        )}
        {s.hobbies.length > 0 && <TagRow label="Hobbies" tags={s.hobbies} param="hobby" />}
        {s.undergrad_fields.length > 0 && <TagRow label="Undergraduate degree" tags={s.undergrad_fields} param="degree" />}

        {links.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-gray-200 px-3 py-1 text-sm font-medium text-oxford-700 hover:border-oxford-300"
              >
                {l.label}
                {l.label !== 'LinkedIn' && <span className="ml-1 text-gray-400">{l.text}</span>}
              </a>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-oxford-900">How well do you know {callName(s)}?</h2>
        <p className="mb-3 text-xs text-gray-500">🔒 Only you can see this.</p>
        <LevelPicker value={level} onChange={(l) => track(() => setRelationship(s.id, { level: l }))} />
        <p className="mt-2 text-center text-sm font-medium text-oxford-700">{LEVELS[level].label}</p>

        <label className="mt-5 block">
          <span className="mb-1 flex items-center justify-between text-sm font-semibold text-oxford-900">
            Private notes
          </span>
          <textarea
            value={note}
            onChange={(e) => saveNote(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder="What did you talk about? Anything to remember next time…"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-oxford-500"
          />
        </label>

        {history.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-oxford-900">Your history</h3>
            <ol className="space-y-1 text-sm text-gray-600">
              {history.map((e) => (
                <li key={e.id} className="flex gap-2">
                  <span className="w-24 shrink-0 text-gray-400">
                    {new Date(e.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                  <span>
                    {LEVELS[e.from_level].short} → <b>{LEVELS[e.to_level].short}</b> {LEVELS[e.to_level].emoji}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Card>

      <div className="sticky bottom-20 z-10 flex items-center gap-3 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:bottom-4">
        <span className="flex-1 text-sm" role="status" aria-live="polite">
          {saved === 'saving' ? (
            <span className="text-gray-500">Saving…</span>
          ) : saved === 'saved' ? (
            <span className="font-medium text-green-700">✓ Saved</span>
          ) : saved === 'error' ? (
            <span className="font-medium text-red-700">Not saved, please try again</span>
          ) : (
            <span className="text-gray-500">Changes save automatically</span>
          )}
        </span>
        <button className={btnPrimary} onClick={done}>
          Done
        </button>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value?: ReactNode }) {
  if (!value) return null
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-gray-400">{label}</dt>
      <dd className="text-gray-800">{value}</dd>
    </div>
  )
}

function TagRow({ label, tags, param }: { label: string; tags: string[]; param: string }) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-xs font-semibold text-gray-400 uppercase">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <Link key={t} to={`/people?${param}=${encodeURIComponent(t)}`} title={`See everyone into ${t}`}>
            <Chip>{t}</Chip>
          </Link>
        ))}
      </div>
    </div>
  )
}
