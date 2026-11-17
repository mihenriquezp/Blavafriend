import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useStore } from '../lib/store'
import { matchesName } from '../pages/People'
import { Avatar, Card, inputCls } from './ui'

/** Admin: choose which accounts are student reps (they get the reps' planner). */
export function RepsAdmin() {
  const { students, user, reload } = useStore()
  const [reps, setReps] = useState<string[] | null>(null)
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.repMembers().then(setReps, (e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const accounts = useMemo(() => students.filter((s) => s.user_id), [students])
  const current = useMemo(() => accounts.filter((s) => reps?.includes(s.user_id!)), [accounts, reps])
  const matches = useMemo(
    () => (q.trim() ? accounts.filter((s) => !reps?.includes(s.user_id!) && matchesName(s, q)).slice(0, 6) : []),
    [accounts, reps, q],
  )

  const set = async (userId: string, on: boolean) => {
    setError(null)
    try {
      await api.adminSetRep(userId, on)
      setReps((r) => (on ? [...(r ?? []), userId] : (r ?? []).filter((x) => x !== userId)))
      if (userId === user?.id) reload() // my own access changed: show or hide the Reps button
      setQ('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Card>
      <h2 className="font-semibold text-oxford-900">🗂️ Student reps</h2>
      <p className="mb-3 text-xs text-gray-500">
        Reps get the “Reps” planner in the top bar. Only people who have signed in can be added. Being an admin doesn’t
        give access to the planner: add yourself if you’re a rep.
      </p>
      {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {reps === null ? (
        !error && <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          {current.length ? (
            <ul className="mb-3 divide-y divide-gray-100">
              {current.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2">
                  <Avatar name={s.full_name} url={s.photo_url} size={32} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-oxford-900">
                    {s.full_name}
                    {s.user_id === user?.id && <span className="text-gray-400"> (you)</span>}
                  </span>
                  <button className="text-sm text-red-700 underline" onClick={() => set(s.user_id!, false)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-sm text-gray-500">No reps yet.</p>
          )}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Add a rep: search by name"
            className={inputCls}
          />
          {matches.length > 0 && (
            <ul className="mt-2 divide-y divide-gray-100 rounded-xl ring-1 ring-gray-200">
              {matches.map((s) => (
                <li key={s.id}>
                  <button
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-oxford-50"
                    onClick={() => set(s.user_id!, true)}
                  >
                    <Avatar name={s.full_name} url={s.photo_url} size={28} />
                    <span className="flex-1 text-sm text-oxford-900">{s.full_name}</span>
                    <span className="text-sm font-semibold text-oxford-500">＋ Add</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  )
}
