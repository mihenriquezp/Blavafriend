import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { fmtDay } from '../lib/coffee'
import { parseNewsletterHtml, readEmailFile } from '../lib/newsletterParse'
import type { Newsletter, NewsletterInput, NewsletterItem } from '../lib/types'
import { Card, btnPrimary, btnSecondary, inputCls } from './ui'

/** Checks pasted JSON and keeps only the fields the app uses. */
function parseNewsletter(text: string): NewsletterInput {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('That isn’t valid JSON. Paste the whole block, from { to }.')
  }
  const o = raw as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const title = str(o.title)
  const week = str(o.week_of)
  if (!title) throw new Error('Missing "title".')
  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new Error('"week_of" must be a date like 2026-10-12.')
  if (!Array.isArray(o.items) || !o.items.length) throw new Error('"items" must be a non-empty list.')
  const ids = new Set<string>()
  const items: NewsletterItem[] = o.items.map((it: Record<string, unknown>, i: number) => {
    const id = str(it.id)
    const t = str(it.title)
    if (!id || !t) throw new Error(`Item ${i + 1} needs an "id" and a "title".`)
    if (ids.has(id)) throw new Error(`Two items share the id "${id}".`)
    ids.add(id)
    const due = str(it.due)
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error(`Item "${id}": "due" must be a date like 2026-10-13.`)
    const links = Array.isArray(it.links)
      ? (it.links as Record<string, unknown>[])
          .map((l) => ({ label: str(l.label) ?? 'Link', url: str(l.url) ?? '' }))
          .filter((l) => /^(https?:|mailto:)/i.test(l.url))
      : []
    return {
      id,
      category: str(it.category) ?? 'Other',
      title: t,
      summary: str(it.summary) ?? '',
      detail: str(it.detail),
      due,
      when: str(it.when),
      ...(links.length ? { links } : {}),
    }
  })
  return { title, week_of: week, intro: str(o.intro), items }
}

/** Admin: publish each week's newsletter as a checklist (pasted JSON). */
export function NewslettersAdmin() {
  const [list, setList] = useState<Newsletter[] | null>(null)
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<NewsletterInput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [reading, setReading] = useState(false)

  // Upload the email as it arrives (.eml or .msg): it's turned into the JSON below, which can still be edited.
  const upload = async (file: File | undefined) => {
    if (!file) return
    setReading(true)
    setError(null)
    try {
      const { subject, date, html } = await readEmailFile(file)
      if (!html) throw new Error('This email has no HTML body to read.')
      check(JSON.stringify(parseNewsletterHtml(html, subject, date), null, 1))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setReading(false)
    }
  }

  const load = useCallback(() => api.listNewsletters().then(setList, (e) => setError(String(e))), [])
  useEffect(() => {
    load()
  }, [load])

  const check = (t: string) => {
    setText(t)
    setError(null)
    if (!t.trim()) return setPreview(null)
    try {
      setPreview(parseNewsletter(t))
    } catch (e) {
      setPreview(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const publish = async () => {
    if (!preview) return
    // Same week again = replace it (ticks on items with the same id are kept).
    const existing = list?.find((n) => n.week_of === preview.week_of)
    if (existing && !confirm(`Replace the newsletter for the week of ${fmtDay(existing.week_of)}?`)) return
    setBusy(true)
    try {
      await api.saveNewsletter(preview, existing?.id)
      setText('')
      setPreview(null)
      setAdding(false)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-oxford-900">📰 Newsletters</h2>
          <p className="text-xs text-gray-500">Each week’s newsletter as a checklist on everyone’s home page.</p>
        </div>
        {!adding && (
          <button className={btnPrimary} onClick={() => setAdding(true)}>
            ＋ Add
          </button>
        )}
      </div>
      {adding && (
        <div className="mb-3 space-y-2 rounded-xl bg-oxford-50/60 p-3">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-4 text-sm font-semibold text-oxford-700 hover:border-oxford-300">
            {reading ? 'Reading the email…' : '✉️ Upload the newsletter email (.eml or .msg)'}
            <input
              type="file"
              accept=".eml,.msg,message/rfc822,application/vnd.ms-outlook"
              className="sr-only"
              disabled={reading}
              onChange={(e) => {
                upload(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
          <p className="text-xs text-gray-500">
            In Outlook: open the email → File → Save as (.msg), or drag it to your desktop. Personal tracking codes in
            links are removed automatically. You can also paste or edit the JSON below.
          </p>
          <label className="block text-sm font-semibold text-oxford-900" htmlFor="nl-json">
            Newsletter (JSON)
          </label>
          <textarea
            id="nl-json"
            value={text}
            onChange={(e) => check(e.target.value)}
            rows={6}
            spellCheck={false}
            placeholder='{ "title": "…", "week_of": "2026-10-12", "items": [ … ] }'
            className={`${inputCls} font-mono text-xs`}
          />
          {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          {preview && (
            <div className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-900">
              <p>
                ✓ “{preview.title}”, week of {fmtDay(preview.week_of)}: {preview.items.length} items in{' '}
                {new Set(preview.items.map((i) => i.category)).size} sections.
              </p>
              <details className="mt-1">
                <summary className="cursor-pointer text-xs font-semibold">Check the items</summary>
                <ul className="mt-1 max-h-64 space-y-0.5 overflow-y-auto text-xs">
                  {preview.items.map((i) => (
                    <li key={i.id}>
                      <span className="text-emerald-700">{i.category} ·</span> {i.title}
                      {i.due && <b> · due {fmtDay(i.due)}</b>}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}
          <div className="flex gap-2">
            <button
              className={btnSecondary}
              onClick={() => {
                setAdding(false)
                check('')
              }}
            >
              Cancel
            </button>
            <button className={`${btnPrimary} flex-1`} disabled={!preview || busy} onClick={publish}>
              {busy ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </div>
      )}
      {list && !list.length && !adding && <p className="text-sm text-gray-500">No newsletters yet.</p>}
      {list && list.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {list.map((n) => (
            <li key={n.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <Link to={`/newsletter/${n.id}`} className="block truncate font-medium text-oxford-900 hover:underline">
                  {n.title}
                </Link>
                <div className="text-xs text-gray-500">
                  Week of {fmtDay(n.week_of)} · {n.items.length} items
                </div>
              </div>
              <button
                className="text-sm text-red-700 underline"
                onClick={async () => {
                  if (!confirm(`Delete “${n.title}”? Everyone’s ticks for it are deleted too.`)) return
                  try {
                    await api.deleteNewsletter(n.id)
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
