import assert from 'node:assert/strict'
import test from 'node:test'
import { createSupabaseApi } from '../src/lib/supabaseApi.ts'

const missingTable = { code: 'PGRST205', message: "Could not find the table 'public.student_private' in the schema cache" }
const member = { id: 'fixture-member', full_name: 'Fictional Member', user_id: 'fixture-user' }
function backend(reply: (url: URL, init?: RequestInit) => Response) {
  const requests: URL[] = []
  const api = createSupabaseApi('https://fixture.invalid', 'fictional-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input))
      requests.push(url)
      return reply(url, init)
    } },
  })
  return { api, requests }
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
})

test('new frontend against old schema keeps directory usable and never requests public birth years', async () => {
  const { api, requests } = backend((url) => url.pathname.endsWith('/student_private')
    ? json(missingTable, 404) : json([member]))
  assert.deepEqual(await api.listStudents(), [{ ...member, birth_year: null }])
  const columns = requests.find((url) => url.pathname.endsWith('/students'))!.searchParams.get('select')!.split(',')
  assert.ok(!columns.includes('*'))
  assert.ok(!columns.includes('birth_year'))
})

test('new frontend restores only the year returned by owner-scoped private reads', async () => {
  const { api } = backend((url) => url.pathname.endsWith('/student_private')
    ? json([{ student_id: member.id, birth_year: 1995 }])
    : json([member, { ...member, id: 'fixture-peer', user_id: 'fixture-peer-user' }]))
  assert.deepEqual((await api.listStudents()).map((s) => s.birth_year), [1995, null])
})

test('permission and unrelated failures are not disguised as missing migrations', async () => {
  for (const error of [
    { code: '42501', message: 'permission denied for table student_private' },
    { code: 'PGRST205', message: "Could not find the table 'public.unrelated' in the schema cache" },
  ]) {
    const { api } = backend((url) => url.pathname.endsWith('/student_private') ? json(error, 403) : json([member]))
    await assert.rejects(api.listStudents(), { message: error.message })
  }
})

test('claiming still succeeds when the optional private table is not deployed', async () => {
  const { api } = backend((url) => url.pathname.endsWith('/student_private') ? json(missingTable, 404) : json(member))
  assert.deepEqual(await api.claimStudent(member.id), { ...member, birth_year: null })
})

test('missing profile RPC never falls back to writing a private year into the public table', async () => {
  const { api, requests } = backend(() => json({
    code: 'PGRST202', message: "Could not find the function public.update_student_profile in the schema cache",
  }, 404))
  await assert.rejects(api.updateStudent(member.id, { birth_year: 1995 }), /temporarily unavailable/)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].pathname, '/rest/v1/rpc/update_student_profile')
})
