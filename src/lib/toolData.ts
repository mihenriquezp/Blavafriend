import { api } from './api'

/**
 * What a person saves inside a tool (stars, notes…) is kept on the device and
 * backed up to their account, so it follows them to another device or to the
 * app's other address. The newest copy wins; the device copy is used while
 * offline or if the backup isn't available.
 */
export type ToolSaved = Record<string, string>

const PREFIX = 'blavafriend-tool-'
const dataKey = (id: string) => `${PREFIX}${id}`
const atKey = (id: string) => `${PREFIX}at-${id}`
export const MAX_SAVED = 200_000 // characters kept per tool

function readLocal(id: string): { data: ToolSaved; at: number } | null {
  try {
    const text = localStorage.getItem(dataKey(id))
    if (!text) return null
    return { data: JSON.parse(text) ?? {}, at: Number(localStorage.getItem(atKey(id))) || 0 }
  } catch {
    return null
  }
}

function writeLocal(id: string, data: ToolSaved, at: number) {
  try {
    localStorage.setItem(dataKey(id), JSON.stringify(data))
    localStorage.setItem(atKey(id), String(at))
  } catch {
    /* storage full or blocked: the backup still has it */
  }
}

// Data saved before the backup existed has no time; it is stamped when first uploaded.
async function upload(id: string, data: ToolSaved, at: number) {
  const when = at || Date.now()
  await api.saveMyToolData(id, data, new Date(when).toISOString())
  if (!at) writeLocal(id, data, when)
}

/** The newest saved data for a tool (device or account), copying it to whichever side is older. */
export async function loadToolData(id: string): Promise<ToolSaved> {
  const local = readLocal(id)
  let remote: Awaited<ReturnType<typeof api.getMyToolData>> = null
  try {
    remote = await api.getMyToolData(id)
  } catch {
    return local?.data ?? {}
  }
  const remoteAt = remote ? Date.parse(remote.saved_at) : -1
  if (remote && (!local || remoteAt > local.at)) {
    writeLocal(id, remote.data, remoteAt)
    return remote.data
  }
  if (local && (!remote || local.at > remoteAt)) upload(id, local.data, local.at).catch(() => {})
  return local?.data ?? {}
}

/** Saves on the device now and to the account shortly after (one upload per burst of changes). */
export function toolSaver(id: string) {
  let timer: number | undefined
  let pending: { data: ToolSaved; at: number } | null = null
  const flush = () => {
    window.clearTimeout(timer)
    if (!pending) return
    const { data, at } = pending
    pending = null
    upload(id, data, at).catch(() => {})
  }
  return {
    save(data: ToolSaved) {
      if (JSON.stringify(data).length > MAX_SAVED) return
      pending = { data, at: Date.now() }
      writeLocal(id, data, pending.at)
      window.clearTimeout(timer)
      timer = window.setTimeout(flush, 1500)
    },
    flush,
  }
}

/**
 * Once per app start: back up anything saved on this device that the account
 * doesn't have yet (so it is there when the person opens the app elsewhere).
 */
export async function backupToolData() {
  let ids: string[]
  try {
    ids = Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX) && !k.startsWith(`${PREFIX}at-`))
      .map((k) => k.slice(PREFIX.length))
  } catch {
    return
  }
  if (!ids.length) return
  const remote = new Map((await api.listMyToolData()).map((r) => [r.tool_id, Date.parse(r.saved_at)]))
  for (const id of ids) {
    const local = readLocal(id)
    if (!local) continue
    const remoteAt = remote.get(id)
    // Unstamped data only goes up if the account has nothing (it may be older than the backup).
    if (remoteAt === undefined || (local.at && local.at > remoteAt))
      await upload(id, local.data, local.at).catch(() => {})
  }
}
