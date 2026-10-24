import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

// A separate project starts at the exact schema used by the rollback release.
// Production credentials and links are never copied into this directory.
const root = 'private/integration-stack'
if (existsSync(`${root}/supabase/.temp/project-ref`)) throw new Error('Refusing a linked project')
mkdirSync(`${root}/supabase/migrations`, { recursive: true })
const config = readFileSync('supabase/config.toml', 'utf8')
  .replace('project_id = "blavafriend-local"', 'project_id = "blavafriend-integration"')
writeFileSync(`${root}/supabase/config.toml`, config)
cpSync('supabase/templates', `${root}/supabase/templates`, { recursive: true })
cpSync('supabase/functions', `${root}/supabase/functions`, { recursive: true })
const legacy = execFileSync('git', ['show', 'e51c6b1867902c0275723fb6433ffedbca25812c:supabase/schema.sql'])
writeFileSync(`${root}/supabase/migrations/202610210000_legacy.sql`, legacy)
writeFileSync(`${root}/function.env`, 'DELETION_ALLOWED_ORIGINS=http://127.0.0.1:4173\n', { mode: 0o600 })
console.log(`Prepared isolated Supabase at ${root}; no production connection.`)
