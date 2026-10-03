/**
 * Collects BSG faculty (name and job title) from the public BSG people
 * directory (filter: Role = Faculty) and writes private/faculty.sql, which adds
 * them to the app as faculty/staff. Run that file in the Supabase SQL editor.
 *
 *   npm run scrape:faculty
 *
 * Safe to re-run: people already in the app (same name, ignoring case and
 * accents) are marked as faculty instead of added again. Only names and job
 * titles are collected; no photos.
 */
import { mkdirSync, writeFileSync } from 'node:fs'

const FACULTY_TYPE_ID = '515'

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))

const clean = (html: string) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
const sql = (s: string | null) => (s === null ? 'null' : `'${s.replace(/'/g, "''")}'`)

async function page(n: number): Promise<string> {
  const url = `https://www.bsg.ox.ac.uk/people?person_type=${FACULTY_TYPE_ID}&page=${n}`
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Blavafriend cohort directory (student project)' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (e) {
      if (attempt >= 4) throw e
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
    }
  }
}

async function main() {
  const people = new Map<string, { name: string; title: string | null }>() // profile path → person
  for (let n = 0; n < 50; n++) {
    const html = await page(n)
    let found = 0
    for (const m of html.matchAll(/<a href="(\/people\/[^"#?]+)" class="content-wrapper"[^>]*>([\s\S]*?)<\/a>/g)) {
      const name = m[2].match(/person-profile__heading[^>]*>([\s\S]*?)<\/h2>/)
      if (!name) continue
      const title = m[2].match(/<p class="details">([\s\S]*?)<\/p>/)
      found++
      people.set(m[1], { name: clean(name[1]), title: title ? clean(title[1]).slice(0, 200) || null : null })
    }
    console.log(`page ${n + 1}: ${found} people`)
    if (!found) break
    await new Promise((r) => setTimeout(r, 500)) // be polite
  }
  const list = [...people.values()].sort((a, b) => a.name.localeCompare(b.name))
  const rows = list.map((p) => `  (${sql(p.name)}, ${sql(p.title)})`).join(',\n')
  const out = `-- BSG faculty from https://www.bsg.ox.ac.uk/people (Role = Faculty), ${new Date().toISOString().slice(0, 10)}.
-- ${list.length} people. Run in the Supabase SQL editor. Safe to re-run.
create extension if not exists unaccent with schema extensions;

with faculty (full_name, job_title) as (values
${rows}
),
marked as (
  -- Already in the app (same name): mark as faculty, fill in the title if empty.
  update public.students s
  set role = 'faculty', job_title = coalesce(s.job_title, f.job_title)
  from faculty f
  where lower(extensions.unaccent(s.full_name)) = lower(extensions.unaccent(f.full_name))
  returning s.full_name
)
insert into public.students (full_name, job_title, role)
select f.full_name, f.job_title, 'faculty'
from faculty f
where not exists (
  select 1 from public.students s
  where lower(extensions.unaccent(s.full_name)) = lower(extensions.unaccent(f.full_name))
);

select count(*) filter (where role = 'faculty') as faculty, count(*) filter (where role = 'student') as students
from public.students;
`
  mkdirSync('private', { recursive: true })
  writeFileSync('private/faculty.sql', out)
  writeFileSync('private/faculty.json', JSON.stringify(list, null, 1))
  console.log(`Saved ${list.length} faculty to private/faculty.sql`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
