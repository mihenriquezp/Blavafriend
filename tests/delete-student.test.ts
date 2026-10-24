import assert from 'node:assert/strict'
import test from 'node:test'
import { createDeletionHandler, type DeletionServices } from '../supabase/functions/delete-student/handler.ts'

const student = '10000000-0000-4000-8000-000000000001'
const origin = 'https://blavafriend.app'
const request = (body: unknown = { student_id: student }, token = 'Bearer verified-test-token', method = 'POST') =>
  new Request(`${origin}/delete-student`, {
    method, headers: { origin, authorization: token, 'content-type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  })
function fixture(overrides: Partial<DeletionServices> = {}) {
  const calls: string[] = []
  let objects = [{ bucket_id: 'photos', name: `${student}/old.jpg` }, { bucket_id: 'event-photos', name: 'owner/unused.jpg' }]
  const services: DeletionServices = {
    verifyUser: async () => 'verified-admin',
    isAdmin: async () => true,
    prepare: async (_student, actor) => { calls.push(`prepare:${actor}`); return { user_id: 'owner' } },
    listObjects: async () => objects,
    removeObjects: async (bucket, paths) => {
      calls.push(`remove:${bucket}`)
      objects = objects.filter((object) => object.bucket_id !== bucket || !paths.includes(object.name))
    },
    deleteUser: async () => { calls.push('delete-auth') },
    finish: async () => { calls.push('finish') },
    ...overrides,
  }
  return { calls, services, handle: createDeletionHandler(services, [origin]) }
}

test('requires a verified admin and validates method, origin and ID before mutation', async () => {
  const { calls, handle } = fixture()
  assert.equal((await handle(request({}, '', 'POST'))).status, 401)
  assert.equal((await handle(request({}, '', 'GET'))).status, 405)
  assert.equal((await handle(request({ student_id: 'not-a-uuid' }))).status, 400)
  assert.equal((await handle(request(null))).status, 400)
  assert.equal((await handle(new Request('https://test', { method: 'POST', headers: { origin: 'https://untrusted.example' } }))).status, 403)
  assert.equal((await handle(request({}, '', 'OPTIONS'))).status, 204)
  assert.deepEqual(calls, [])
  for (const overrides of [{ verifyUser: async () => null }, { isAdmin: async () => false }]) {
    const f = fixture(overrides)
    assert.ok([401, 403].includes((await f.handle(request())).status))
    assert.deepEqual(f.calls, [])
  }
})

test('ignores a forged actor/user in JSON and removes files before hard deleting Auth', async () => {
  const { calls, handle } = fixture()
  const response = await handle(request({ student_id: student, actor: 'forged-admin', user_id: 'someone-else' }))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { deleted: true })
  assert.deepEqual(calls, ['prepare:verified-admin', 'remove:photos', 'remove:event-photos', 'delete-auth', 'finish'])
})

test('Storage, Auth and finalization failures never report success; retry resumes', async () => {
  for (const stage of ['removeObjects', 'deleteUser', 'finish'] as const) {
    const f = fixture()
    const original = f.services[stage]
    let fail = true
    // Each stage can fail once, including after files have already been removed.
    f.services[stage] = (async (...args: unknown[]) => {
      if (fail) { fail = false; throw new Error('sensitive upstream error') }
      return (original as (...args: unknown[]) => Promise<void>)(...args)
    })
    const response = await f.handle(request())
    assert.equal(response.status, 503)
    const text = await response.text()
    assert.ok(!text.includes('sensitive upstream error'))
    assert.ok(!text.includes('"deleted":true'))
    if (stage === 'removeObjects') assert.ok(!f.calls.includes('delete-auth'))
    if (stage === 'deleteUser') assert.ok(!f.calls.includes('finish'))
    assert.equal((await f.handle(request())).status, 200)
  }
})

test('unclaimed and already deleted profiles are idempotent', async () => {
  const unclaimed = fixture({ prepare: async () => ({ user_id: null }) })
  assert.equal((await unclaimed.handle(request())).status, 200)
  assert.ok(!unclaimed.calls.includes('delete-auth'))
  const absent = fixture({ prepare: async () => null })
  assert.equal((await absent.handle(request())).status, 200)
  assert.deepEqual(absent.calls, [])
})

test('bounded cleanup never deletes Auth while files remain', async () => {
  const f = fixture({ removeObjects: async () => {} })
  assert.equal((await f.handle(request())).status, 503)
  assert.ok(!f.calls.includes('delete-auth'))
  assert.ok(!f.calls.includes('finish'))
})
