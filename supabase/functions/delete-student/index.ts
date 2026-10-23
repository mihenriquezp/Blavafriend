import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import { createDeletionHandler } from './handler.ts'

const url = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
// Built-in Edge Function secret; never a VITE_* variable or a browser key.
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const origins = (Deno.env.get('DELETION_ALLOWED_ORIGINS') ??
  'https://blavafriend.app,https://www.blavafriend.app,https://blavafriend.vercel.app')
  .split(',').map((origin) => origin.trim()).filter(Boolean)

function checked<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw error
  return data
}

Deno.serve(createDeletionHandler({
  async verifyUser(token) {
    const { data, error } = await service.auth.getUser(token)
    return error ? null : data.user?.id ?? null
  },
  async isAdmin(token) {
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    return checked(await caller.rpc('is_admin')) === true
  },
  async prepare(student, actor) {
    return checked(await service.rpc('prepare_account_deletion', { p_student: student, p_actor: actor }))
  },
  async listObjects(student) {
    return checked(await service.rpc('account_deletion_objects', { p_student: student }))
  },
  async removeObjects(bucket, paths) {
    // SQL DELETE on storage.objects does not remove the underlying file.
    checked(await service.storage.from(bucket).remove(paths))
  },
  async deleteUser(user) {
    const { error } = await service.auth.admin.deleteUser(user, false)
    // A retry can reach this step after the Auth deletion already succeeded.
    if (error && error.code !== 'user_not_found') throw error
  },
  async finish(student) {
    checked(await service.rpc('finish_account_deletion', { p_student: student }))
  },
}, origins))
