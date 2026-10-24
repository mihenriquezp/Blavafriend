import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createSupabaseApi } from '../../src/lib/supabaseApi'

// This suite creates and permanently deletes only disposable local fixtures.
// It cannot be pointed at a hosted project by changing an environment variable.
const url = process.env.VITE_SUPABASE_URL!
if (url !== 'http://127.0.0.1:54321') throw new Error('Refusing to run destructive fixtures outside local Supabase')
const publicKey = process.env.VITE_SUPABASE_ANON_KEY!
const serviceKey = process.env.TEST_SUPABASE_SERVICE_KEY!
if (!publicKey || !serviceKey) throw new Error('Local Supabase keys are required; demo mode is not a test')
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const service = createClient(url, serviceKey, options)
const client = () => createClient(url, publicKey, options)
function value<T extends { data: unknown; error: { message: string } | null }>(result: T): NonNullable<T['data']> {
  if (result.error) throw new Error(result.error.message)
  return result.data as NonNullable<T['data']>
}

async function fixture(n: number, name: string, birthYear: number) {
  const email = `fixture${n}@ox.ac.uk`
  const password = randomBytes(24).toString('hex')
  const user = value(await service.auth.admin.createUser({ email, password, email_confirm: true })).user!
  const student = value(await service.from('students').insert({
    full_name: name, user_id: user.id, birth_year: birthYear, birth_day: 4, birth_month: 5,
  }).select().single())
  const sb = client()
  const session = value(await sb.auth.signInWithPassword({ email, password })).session!
  return { email, user, student, sb, token: session.access_token }
}

async function loginInBrowser(page: Page, email: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign in with your Oxford email →' }).click()
  await page.getByLabel('Your Oxford username email').fill(email)
  await page.getByRole('button', { name: 'Email me a sign-in code' }).click()
  await expect(page.getByLabel('Sign-in code')).toBeVisible()
  // Mailpit receives real GoTrue SMTP output, without sending outside the test stack.
  let code = ''
  await expect.poll(async () => {
    const response = await fetch(`http://127.0.0.1:54324/view/latest.txt?query=${encodeURIComponent(`to:${email}`)}`)
    const text = response.ok ? await response.text() : ''
    code = text.match(/\b\d{6}\b/)?.[0] ?? ''
    return code.length
  }, { timeout: 30_000 }).toBe(6)
  await page.getByLabel('Sign-in code').fill(code)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('link', { name: 'People', exact: true }).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText("Couldn't load data:", { exact: false })).toHaveCount(0)
  // Follow the actual first-login tour; otherwise its modal blocks navigation.
  const tour = page.getByRole('dialog')
  for (let step = 0; step < 8 && await tour.isVisible(); step++) {
    const next = tour.getByRole('button', { name: 'Next →', exact: true })
    if (await next.isVisible()) await next.click()
    else await tour.getByRole('button', { name: /Got it/ }).click()
  }
  await expect(tour).toHaveCount(0)
}

async function privateRows(sb: SupabaseClient) {
  return value(await sb.from('student_private').select('student_id,birth_year'))
}

test('real Supabase: mixed versions, email login, private data, consent and full erasure', async ({ page, browser }, info) => {
  const a = await fixture(1001, 'Fictional Member A', 1990)
  const b = await fixture(1002, 'Fictional Member B', 1991)
  const admin = await fixture(1003, 'Fictional Admin', 1992)
  value(await service.from('app_admins').insert({ email: admin.email }))
  value(await service.from('students').insert({ full_name: 'Fictional Faculty', role: 'faculty' }))

  await test.step('new candidate works with old backend, including real email login and Faculty', async () => {
    await loginInBrowser(page, a.email)
    await page.goto('/people')
    await expect(page.getByText('Fictional Member B', { exact: true })).toBeVisible()
    await page.getByRole('tab', { name: 'Faculty', exact: true }).click()
    await expect(page.getByText('Fictional Faculty', { exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath('before-migration-authenticated.png'), fullPage: true })
  })

  await test.step('deploy SQL, verify old-client writes and new owner-only reads', async () => {
    // Fixed loopback target; no linked/cloud project or production credentials.
    execFileSync('psql', ['postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      '-v', 'ON_ERROR_STOP=1', '-f', 'supabase/migrations/202610220001_privacy_boundaries.sql'], { stdio: 'pipe' })
    await expect.poll(async () => (await a.sb.from('student_private').select('student_id')).error?.code ?? 'ready',
      { timeout: 30_000 }).toBe('ready')
    expect(await privateRows(a.sb)).toEqual([{ student_id: a.student.id, birth_year: 1990 }])
    expect(await privateRows(b.sb)).toEqual([{ student_id: b.student.id, birth_year: 1991 }])
    expect(await privateRows(admin.sb)).toEqual([{ student_id: admin.student.id, birth_year: 1992 }])
    expect((await client().from('student_private').select('*')).error).not.toBeNull()
    value(await a.sb.from('students').update({ birth_year: 1994, bio: 'Legacy client save' }).eq('id', a.student.id))
    expect((await privateRows(a.sb))[0].birth_year).toBe(1994)
    value(await a.sb.from('students').update({ birth_year: null }).eq('id', a.student.id))
    expect((await privateRows(a.sb))[0].birth_year).toBe(1994)
    const directory = value(await b.sb.from('students').select('birth_year'))
    expect(directory.every((s) => s.birth_year === null)).toBe(true)
    expect((await admin.sb.from('students').delete().eq('id', a.student.id)).error).not.toBeNull()
  })

  await test.step('authenticated UI saves the private year and keeps personal Stats usable', async () => {
    await page.goto('/me')
    await expect(page.getByLabel('Birthday year (private, optional)')).toHaveValue('1994')
    await page.getByLabel('Birthday year (private, optional)').fill('1998')
    await page.getByRole('button', { name: 'Save profile', exact: true }).click()
    await expect(page.getByText('Saved ✓', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Birthday year (private, optional)')).toHaveValue('1998')
    expect((await privateRows(b.sb)).some((row) => row.student_id === a.student.id)).toBe(false)
    await page.goto('/')
    await expect(page.getByText("Couldn't load data:", { exact: false })).toHaveCount(0)
  })

  await test.step('consent is optional, needs both people and can be withdrawn without losing notes', async () => {
    value(await a.sb.from('relationships').upsert({ owner_id: a.user.id, student_id: b.student.id, level: 3, note: 'Private fixture note', starred: true }))
    expect(value(await a.sb.rpc('cohort_overview')).students).toBe(0)
    await page.goto('/cohort')
    const consent = page.getByRole('checkbox', { name: /I understand this explanation/ })
    await expect(consent).not.toBeChecked()
    await consent.click()
    await expect(page.getByText('Choice saved.', { exact: false })).toBeVisible()
    await expect(consent).toBeChecked()
    expect(value(await a.sb.rpc('cohort_overview')).pairs.met).toBe(0)
    value(await b.sb.rpc('set_cohort_consent', { p_enabled: true, p_version: '2026-10-23.v1' }))
    const overview = value(await a.sb.rpc('cohort_overview'))
    expect(overview.pairs.met).toBe(1)
    expect(JSON.stringify(overview)).not.toContain('Private fixture note')
    expect(value(await b.sb.from('relationships').select('*'))).toEqual([])
    await consent.click()
    await expect(consent).not.toBeChecked()
    await expect(page.getByText('Your connections are not included', { exact: false })).toBeVisible()
    await page.reload()
    await expect(consent).not.toBeChecked()
    expect(value(await a.sb.rpc('cohort_overview')).pairs.met).toBe(0)
    expect(value(await a.sb.from('relationships').select('note'))[0].note).toBe('Private fixture note')
    await page.screenshot({ path: info.outputPath('consent-verified.png'), fullPage: true })
  })

  await test.step('deployed Edge Function rejects unauthorised calls and deletes Auth, files and both sides of records', async () => {
    const target = a
    value(await b.sb.from('relationships').insert({ owner_id: b.user.id, student_id: target.student.id, level: 2 }))
    // More than a single 100-object page. Real Storage API, not metadata-only rows.
    const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF1EAAAAASUVORK5CYII=', 'base64')
    const paths = Array.from({ length: 101 }, () => `${target.student.id}/${randomUUID()}.png`)
    for (let offset = 0; offset < paths.length; offset += 10)
      await Promise.all(paths.slice(offset, offset + 10).map(async (path) => value(await target.sb.storage.from('photos').upload(path, photo, { contentType: 'image/png' }))))
    const photoUrl = target.sb.storage.from('photos').getPublicUrl(paths[0]).data.publicUrl
    expect((await fetch(photoUrl)).ok).toBe(true)
    await expect.poll(async () => {
      try { return (await fetch(`${url}/functions/v1/delete-student`, { method: 'POST', headers: { apikey: publicKey } })).status }
      catch { return 0 }
    }, { timeout: 60_000 }).toBe(401)
    const rejected = await fetch(`${url}/functions/v1/delete-student`, {
      method: 'POST', headers: { apikey: publicKey, Authorization: `Bearer ${b.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: target.student.id }),
    })
    expect(rejected.status).toBe(403)
    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()
    await loginInBrowser(adminPage, admin.email)
    // Use the same adapter as the Admin UI, with a verified, real Auth session.
    const api = createSupabaseApi(url, publicKey, { ...options,
      global: { headers: { Authorization: `Bearer ${admin.token}` } } })
    await api.adminDeleteStudent(target.student.id)
    expect((await service.auth.admin.getUserById(target.user.id)).error).not.toBeNull()
    expect(value(await service.from('students').select('id').eq('id', target.student.id))).toEqual([])
    expect(value(await service.from('student_private').select('*').eq('student_id', target.student.id))).toEqual([])
    expect(value(await service.from('relationships').select('*').or(`owner_id.eq.${target.user.id},student_id.eq.${target.student.id}`))).toEqual([])
    expect(value(await service.from('relationship_events').select('*').or(`owner_id.eq.${target.user.id},student_id.eq.${target.student.id}`))).toEqual([])
    expect(value(await service.from('cohort_consents').select('*').eq('user_id', target.user.id))).toEqual([])
    expect(value(await service.storage.from('photos').list(target.student.id))).toEqual([])
    expect((await fetch(photoUrl, { cache: 'no-store' })).ok).toBe(false)
    expect(value(await service.from('account_deletions').select('*'))).toEqual([])
    expect(value(await target.sb.rpc('is_member'))).toBe(false) // stale JWT fails closed
    expect(value(await service.auth.admin.getUserById(b.user.id)).user!.id).toBe(b.user.id)
    await api.adminDeleteStudent(target.student.id) // completed retries are idempotent
    await adminPage.goto('/admin')
    await expect(adminPage.getByRole('heading', { name: 'Admin', exact: true })).toBeVisible()
    await expect(adminPage.getByText('Fictional Member A', { exact: true })).toHaveCount(0)
    await adminPage.screenshot({ path: info.outputPath('after-account-erasure.png'), fullPage: true })
    await adminContext.close()
  })
})
