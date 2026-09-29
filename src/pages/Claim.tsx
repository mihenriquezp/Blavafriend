import { useMemo, useState } from 'react'
import { Avatar, btnPrimary, btnSecondary, inputCls } from '../components/ui'
import { api } from '../lib/api'
import { useStore } from '../lib/store'
import { matchesName } from './People'

export default function Claim() {
  const { students, claim, createMine, user } = useStore()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const results = useMemo(() => (q.trim() ? students.filter((s) => matchesName(s, q)).slice(0, 12) : []), [students, q])
  const selected = students.find((s) => s.id === picked)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="font-display text-3xl font-bold text-oxford-900">Welcome! Who are you?</h1>
      <p className="mt-2 text-gray-600">
        Find yourself in the cohort list so your classmates can find you, and so you're left out of your own
        stats. You can only do this once.
      </p>

      {!creating ? (
        <>
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPicked(null)
            }}
            placeholder="Type your name…"
            className={`${inputCls} mt-6`}
          />
          <ul className="mt-3 space-y-2">
            {results.map((s) => (
              <li key={s.id}>
                <button
                  disabled={!!s.user_id}
                  onClick={() => setPicked(s.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${
                    picked === s.id ? 'border-oxford-700 bg-oxford-50' : 'border-gray-200 bg-white'
                  } disabled:opacity-50`}
                >
                  <Avatar name={s.full_name} url={s.photo_url} size={40} />
                  <div className="min-w-0">
                    <div className="font-semibold">{s.full_name}</div>
                    <div className="truncate text-xs text-gray-500">
                      {s.user_id ? 'Already claimed' : [s.country_origin, s.college].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {q.trim() && !results.length && <p className="mt-3 text-sm text-gray-500">No one with that name yet.</p>}

          {selected && (
            <button className={`${btnPrimary} mt-4 w-full`} disabled={busy} onClick={() => run(() => claim(selected.id))}>
              Yes, I'm {selected.full_name.split(' ')[0]}
            </button>
          )}

          <button className="mt-6 w-full text-sm text-oxford-500 underline" onClick={() => setCreating(true)}>
            I'm not on the list
          </button>
        </>
      ) : (
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => createMine(q.trim()))
          }}
        >
          <label className="mb-1 block text-sm font-semibold">Your full name</label>
          <input autoFocus required value={q} onChange={(e) => setQ(e.target.value)} className={inputCls} />
          <div className="mt-4 flex gap-2">
            <button type="button" className={btnSecondary} onClick={() => setCreating(false)}>
              Back
            </button>
            <button className={`${btnPrimary} flex-1`} disabled={busy || q.trim().length < 2}>
              Create my profile
            </button>
          </div>
        </form>
      )}

      {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <p className="mt-10 text-center text-xs text-gray-400">
        Signed in as {user?.email} ·{' '}
        <button className="underline" onClick={() => api.signOut()}>
          Sign out
        </button>
      </p>
    </div>
  )
}
