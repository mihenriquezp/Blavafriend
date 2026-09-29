import { useState } from 'react'
import { api } from '../lib/api'
import { COLLEGES, COUNTRIES, FAMILY_OPTIONS, GENDER_OPTIONS, HOBBY_GROUPS, POLICY_INTERESTS } from '../lib/options'
import { useStore } from '../lib/store'
import type { Student, StudentPatch } from '../lib/types'
import { Avatar, Field, TagPicker, btnPrimary, btnSecondary, inputCls } from './ui'

async function resizeImage(file: File, max = 640): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  // Crop to a centred square so avatars look consistent.
  const side = Math.min(bitmap.width, bitmap.height)
  const out = Math.round(side * scale)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = out
  canvas.getContext('2d')!.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    out,
    out,
  )
  return await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process image'))), 'image/jpeg', 0.85),
  )
}

export function ProfileForm({ student, onDone }: { student: Student; onDone?: () => void }) {
  const { updateStudent, hobbyOptions, languageOptions, degreeOptions, addTag } = useStore()
  const [draft, setDraft] = useState<Student>(student)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const set = <K extends keyof Student>(k: K, v: Student[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const text = (k: keyof StudentPatch) => ({
    value: (draft[k] as string | null) ?? '',
    onChange: (e: { target: { value: string } }) => set(k, (e.target.value || null) as never),
    className: inputCls,
  })

  const save = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const patch: StudentPatch = {
        full_name: draft.full_name.trim(),
        age: draft.age,
        country_residence: draft.country_residence,
        country_origin: draft.country_origin,
        job_title: draft.job_title?.trim() || null,
        college: draft.college,
        family_status: draft.family_status,
        policy_interests: draft.policy_interests,
        hobbies: draft.hobbies,
        languages: draft.languages,
        bio: draft.bio?.trim() || null,
        photo_url: draft.photo_url,
        linkedin: draft.linkedin?.trim() || null,
        instagram: draft.instagram?.trim() || null,
        x_handle: draft.x_handle?.trim() || null,
        whatsapp: draft.whatsapp?.trim() || null,
        nickname: draft.nickname?.trim() || null,
        gender: draft.gender,
        undergrad_fields: draft.undergrad_fields,
      }
      await updateStudent(student.id, patch)
      setMsg({ ok: true, text: 'Saved ✓' })
      onDone?.()
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  const onPhoto = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setMsg(null)
    try {
      const blob = await resizeImage(file)
      set('photo_url', await api.uploadPhoto(student.id, blob))
      setMsg({ ok: true, text: 'Photo uploaded. Remember to save.' })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <div className="flex items-center gap-4">
        <Avatar name={draft.full_name} url={draft.photo_url} size={88} />
        <div className="space-y-2">
          <label className={`${btnSecondary} cursor-pointer`}>
            {draft.photo_url ? 'Change photo' : 'Upload photo'}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
          {draft.photo_url && (
            <button type="button" className="block text-xs text-gray-500 underline" onClick={() => set('photo_url', null)}>
              Remove photo
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
        <Field label="Full name">
          <input required {...text('full_name')} />
        </Field>
        <Field label="Nickname (optional)">
          <input maxLength={40} placeholder="What friends call you" {...text('nickname')} />
        </Field>
      </div>

      <Field label="Short intro" hint="A few lines about you: what you did before, what you're excited about.">
        <textarea rows={4} maxLength={1000} {...text('bio')} />
      </Field>

      <Field label="Current / most recent role">
        <input maxLength={200} placeholder="e.g. Policy advisor, Ministry of Finance" {...text('job_title')} />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Country of origin">
          <CountrySelect value={draft.country_origin} onChange={(v) => set('country_origin', v)} />
        </Field>
        <Field label="Country of residence">
          <CountrySelect value={draft.country_residence} onChange={(v) => set('country_residence', v)} />
        </Field>
        <Field label="College">
          <select value={draft.college ?? ''} onChange={(e) => set('college', e.target.value || null)} className={inputCls}>
            <option value="">—</option>
            {COLLEGES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Age (optional)">
          <input
            type="number"
            min={16}
            max={99}
            value={draft.age ?? ''}
            onChange={(e) => set('age', e.target.value ? Number(e.target.value) : null)}
            className={inputCls}
          />
        </Field>
        <Field label="Gender (optional)">
          <select
            value={draft.gender ?? ''}
            onChange={(e) => set('gender', (e.target.value || null) as Student['gender'])}
            className={inputCls}
          >
            <option value="">—</option>
            {GENDER_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Coming with partner / family? (optional)">
          <select
            value={draft.family_status ?? ''}
            onChange={(e) => set('family_status', (e.target.value || null) as Student['family_status'])}
            className={inputCls}
          >
            <option value="">Prefer not to say</option>
            {FAMILY_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Undergraduate degree" hint="Pick one or more. Can't find yours? Type it and choose “Other”.">
        <TagPicker
          options={degreeOptions}
          value={draft.undergrad_fields}
          onChange={(v) => set('undergrad_fields', v)}
          onAddOther={(label) => addTag({ kind: 'degree', label })}
        />
      </Field>

      <Field label="Policy interests">
        <TagPicker options={POLICY_INTERESTS} value={draft.policy_interests} onChange={(v) => set('policy_interests', v)} />
      </Field>
      <Field label="Hobbies & interests" hint="Can't find yours? Type it and choose “Other”.">
        <TagPicker
          options={hobbyOptions}
          groups={HOBBY_GROUPS}
          value={draft.hobbies}
          onChange={(v) => set('hobbies', v)}
          onAddOther={(label) => addTag({ kind: 'hobby', label })}
        />
      </Field>
      <Field label="Languages you speak">
        <TagPicker
          options={languageOptions}
          value={draft.languages}
          onChange={(v) => set('languages', v)}
          onAddOther={(label) => addTag({ kind: 'language', label })}
        />
      </Field>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold text-oxford-900">Social media (all optional)</legend>
        <input placeholder="LinkedIn URL" {...text('linkedin')} />
        <input placeholder="Instagram handle" {...text('instagram')} />
        <input placeholder="X / Twitter handle" {...text('x_handle')} />
        <input placeholder="WhatsApp number, with country code" {...text('whatsapp')} />
      </fieldset>

      <div className="sticky bottom-20 flex items-center gap-3 rounded-2xl bg-white/90 py-2 backdrop-blur sm:bottom-2">
        <button className={btnPrimary} disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</span>}
      </div>
    </form>
  )
}

function CountrySelect({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={inputCls}>
      <option value="">—</option>
      {value && !COUNTRIES.includes(value) && <option value={value}>{value}</option>}
      {COUNTRIES.map((c) => (
        <option key={c}>{c}</option>
      ))}
    </select>
  )
}
