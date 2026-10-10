import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { londonToday, addDays, fmtDay } from '../lib/coffee'
import type { Tool } from '../lib/types'
import { Card, Field, btnPrimary, btnSecondary, inputCls } from './ui'

const MAX_BYTES = 2_500_000
const ICONS = ['🧰', '📚', '🗓️', '🧮', '🗺️', '📝', '🎓', '🔗']

/** Admin: upload HTML pages as "Useful tools" with a title, description, icon and removal date. */
export function ToolsAdmin() {
  const [tools, setTools] = useState<Tool[] | null>(null)
  const [editing, setEditing] = useState<Tool | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => api.listTools().then(setTools, (e) => setError(String(e))), [])
  useEffect(() => {
    load()
  }, [load])

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-oxford-900">🧰 Useful tools</h2>
          <p className="text-xs text-gray-500">HTML pages shown on everyone’s home page until their removal date.</p>
        </div>
        {!editing && (
          <button className={btnPrimary} onClick={() => setEditing('new')}>
            ＋ Add
          </button>
        )}
      </div>
      {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {editing && (
        <ToolForm
          initial={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
      {tools && !tools.length && !editing && <p className="text-sm text-gray-500">No tools yet.</p>}
      {tools && tools.length > 0 && (
        <ul className="mt-2 divide-y divide-gray-100">
          {tools.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2">
              <span className="text-2xl" aria-hidden>
                {t.icon}
              </span>
              <div className="min-w-0 flex-1">
                <Link to={`/tools/${t.id}`} className="block truncate font-medium text-oxford-900 hover:underline">
                  {t.title}
                </Link>
                <div className="text-xs text-gray-500">
                  {t.remove_on
                    ? `Disappears on ${fmtDay(t.remove_on, { day: 'numeric', month: 'short', year: 'numeric' })}`
                    : 'No end date'}
                </div>
              </div>
              <button className="text-sm text-oxford-500 underline" onClick={() => setEditing(t)}>
                Edit
              </button>
              <button
                className="text-sm text-red-700 underline"
                onClick={async () => {
                  if (!confirm(`Delete “${t.title}”?`)) return
                  try {
                    await api.deleteTool(t.id)
                    load()
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e))
                  }
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function ToolForm({ initial, onCancel, onSaved }: { initial: Tool | null; onCancel: () => void; onSaved: () => void }) {
  const tomorrow = addDays(londonToday(), 1)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? '🧰')
  const [removeOn, setRemoveOn] = useState(initial ? (initial.remove_on ?? '') : addDays(londonToday(), 30))
  const [file, setFile] = useState<{ name: string; html: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = async (f: File | undefined) => {
    setError(null)
    if (!f) return
    if (f.size > MAX_BYTES) return setError('That file is too big (max 2.5 MB).')
    const html = await f.text()
    if (!/<(html|body|div|script|style|p|h1)\b/i.test(html)) return setError('That doesn’t look like an HTML page.')
    setFile({ name: f.name, html })
    if (!title.trim()) setTitle(f.name.replace(/\.html?$/i, '').replace(/[_-]+/g, ' '))
  }

  const save = async () => {
    if (!initial && !file) return setError('Choose an HTML file.')
    if (removeOn && removeOn < tomorrow) return setError('The removal date must be tomorrow or later.')
    setBusy(true)
    setError(null)
    try {
      await api.saveTool(
        {
          title: title.trim(),
          description: description.trim() || null,
          icon: icon.trim() || '🧰',
          remove_on: removeOn || null,
          ...(file ? { html: file.html } : {}),
        },
        initial?.id,
      )
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-3 space-y-3 rounded-xl bg-oxford-50/60 p-3">
      <Field label={initial ? 'Replace the HTML file (optional)' : 'HTML file'} group>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-4 text-sm font-semibold text-oxford-700 hover:border-oxford-300">
          {file ? `📄 ${file.name}` : '📄 Choose an .html file'}
          <input
            type="file"
            accept=".html,.htm,text/html"
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </label>
      </Field>
      <Field label="Title">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={inputCls} />
      </Field>
      <Field label="Description (optional)">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={300}
          className={inputCls}
        />
      </Field>
      <Field label="Icon" group>
        <div className="flex flex-wrap items-center gap-1.5">
          {ICONS.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIcon(i)}
              aria-pressed={icon === i}
              className={`grid h-10 w-10 place-items-center rounded-lg text-xl ${icon === i ? 'bg-oxford-900' : 'bg-white ring-1 ring-gray-200'}`}
            >
              {i}
            </button>
          ))}
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            maxLength={8}
            aria-label="Or type any emoji"
            placeholder="or any emoji"
            className={`${inputCls} !w-28`}
          />
        </div>
      </Field>
      <Field label="Remove on" hint="From this day it disappears for everyone and is deleted. Leave empty to keep it.">
        <input
          type="date"
          value={removeOn}
          min={tomorrow}
          onChange={(e) => setRemoveOn(e.target.value)}
          className={inputCls}
        />
      </Field>
      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button className={btnSecondary} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className={`${btnPrimary} flex-1`} onClick={save} disabled={busy || !title.trim()}>
          {busy ? 'Saving…' : initial ? 'Save' : 'Publish tool'}
        </button>
      </div>
    </div>
  )
}
