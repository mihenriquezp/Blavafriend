import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ProfileForm } from '../components/ProfileForm'
import { Avatar, Card, FacultyBadge, btnPrimary, inputCls } from '../components/ui'
import { api } from '../lib/api'
import { useStore } from '../lib/store'
import { matchesName } from './People'

export default function Admin() {
  const { isAdmin, students, replaceStudent, removeStudent } = useStore()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const list = useMemo(() => students.filter((s) => !q || matchesName(s, q)), [students, q])
  const claimed = students.filter((s) => s.user_id).length

  if (!isAdmin) return <Navigate to="/" replace />

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-oxford-900">Admin</h1>
        <p className="text-sm text-gray-500">
          {students.length} students · {claimed} have signed in and claimed their profile. You can't see anyone's
          levels or notes from here.
        </p>
      </div>

      <Card>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              replaceStudent(await api.adminCreateStudent(newName.trim()))
              setNewName('')
            })
          }}
        >
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add a student by full name" className={inputCls} />
          <button className={btnPrimary} disabled={newName.trim().length < 2}>
            Add
          </button>
        </form>
      </Card>

      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className={inputCls} type="search" />

      <ul className="space-y-2">
        {list.map((s) => (
          <li key={s.id} className="rounded-2xl border border-gray-200 bg-white">
            <div className="flex items-center gap-3 p-3">
              <Avatar name={s.full_name} url={s.photo_url} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {s.full_name}
                  <FacultyBadge role={s.role} />
                </div>
                <div className="text-xs text-gray-500">{s.user_id ? 'Claimed' : 'Not claimed yet'}</div>
              </div>
              <button className="text-sm text-oxford-500 underline" onClick={() => setEditing(editing === s.id ? null : s.id)}>
                {editing === s.id ? 'Close' : 'Edit'}
              </button>
              {s.user_id && (
                <button
                  className="text-sm text-amber-700 underline"
                  onClick={() =>
                    confirm(`Unlink ${s.full_name} from the account that claimed it? They (or someone else) can then claim it again.`) &&
                    run(async () => replaceStudent(await api.adminUnclaimStudent(s.id)))
                  }
                >
                  Unclaim
                </button>
              )}
              <button
                className="text-sm text-red-700 underline"
                onClick={() =>
                  confirm(`Delete ${s.full_name}? This also removes them from everyone's stats.`) &&
                  run(async () => {
                    await api.adminDeleteStudent(s.id)
                    removeStudent(s.id)
                  })
                }
              >
                Delete
              </button>
            </div>
            {editing === s.id && (
              <div className="border-t border-gray-100 p-4">
                <ProfileForm student={s} onDone={() => setEditing(null)} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
