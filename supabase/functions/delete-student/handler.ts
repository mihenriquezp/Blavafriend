export interface DeletionServices {
  verifyUser: (token: string) => Promise<string | null>
  isAdmin: (token: string) => Promise<boolean>
  prepare: (student: string, actor: string) => Promise<{ user_id: string | null } | null>
  listObjects: (student: string) => Promise<{ bucket_id: string; name: string }[]>
  removeObjects: (bucket: string, names: string[]) => Promise<void>
  deleteUser: (user: string) => Promise<void>
  finish: (student: string) => Promise<void>
}

// The handler is independent of Deno so auth, ordering and failure paths can be
// tested without making any requests to production or needing credentials.
export function createDeletionHandler(services: DeletionServices, allowedOrigins: string[]) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
    }
    const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers })
    if (origin && !allowedOrigins.includes(origin)) return reply(403, { error: 'Origin not allowed' })
    if (origin) headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info'
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (req.method !== 'POST') return reply(405, { error: 'Use POST' })
    const token = req.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1]
    if (!token) return reply(401, { error: 'Sign in to continue' })
    try {
      const actor = await services.verifyUser(token)
      if (!actor) return reply(401, { error: 'Sign in to continue' })
      if (!await services.isAdmin(token)) return reply(403, { error: 'Only admins can delete accounts' })
      let body: unknown
      try { body = await req.json() } catch { return reply(400, { error: 'Invalid request' }) }
      const student = (body as { student_id?: unknown } | null)?.student_id
      if (typeof student !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(student)) {
        return reply(400, { error: 'A valid student_id is required' })
      }
      const job = await services.prepare(student, actor)
      if (!job) return reply(200, { deleted: true })
      // Leave the job intact on failure/time limit. The same request resumes it.
      const deadline = Date.now() + 40_000
      let cleaned = false
      for (let page = 0; page < 20 && Date.now() < deadline; page++) {
        const objects = await services.listObjects(student)
        if (!objects.length) { cleaned = true; break }
        const buckets = new Map<string, string[]>()
        for (const object of objects) {
          const paths = buckets.get(object.bucket_id) ?? []
          paths.push(object.name)
          buckets.set(object.bucket_id, paths)
        }
        for (const [bucket, paths] of buckets) await services.removeObjects(bucket, paths)
      }
      if (!cleaned) return reply(503, { error: 'Deletion is in progress. Retry to finish removing the remaining files.' })
      if (job.user_id) await services.deleteUser(job.user_id)
      await services.finish(student)
      return reply(200, { deleted: true })
    } catch {
      // Do not return raw database/Auth errors, tokens, paths or personal data.
      return reply(503, { error: 'Deletion could not finish. Retry; if it continues to fail, ask the project operator to check the deletion job. Admin accounts must have their admin role removed first.' })
    }
  }
}
