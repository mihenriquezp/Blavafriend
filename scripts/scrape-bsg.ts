/**
 * Collects the names of the current MPP cohort from the public BSG people
 * directory (filters: Role = MPP, MPP Year = 2026) and saves them to
 * private/bsg-names.json for scripts/import-register.ts to merge.
 *
 *   npm run scrape
 *
 * Only names are collected. Change YEAR_ID for another cohort (see the "year"
 * select on https://www.bsg.ox.ac.uk/people for the ids).
 */
import { mkdirSync, writeFileSync } from 'node:fs'

const MPP_TYPE_ID = '1615'
const YEAR_ID = '1652' // 2026
const CLASS_LABEL = 'MPP class of 2026'

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))

async function page(n: number): Promise<string> {
  const url = `https://www.bsg.ox.ac.uk/people?person_type=${MPP_TYPE_ID}&year=${YEAR_ID}&page=${n}`
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
  const people = new Map<string, string>() // profile path → name
  for (let n = 0; n < 50; n++) {
    const html = await page(n)
    let found = 0
    for (const m of html.matchAll(/<a[^>]+href="(\/people\/[^"#?]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const text = decode(m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim()
      if (!text.includes(CLASS_LABEL)) continue
      found++
      people.set(m[1], text.replace(CLASS_LABEL, '').trim())
    }
    console.log(`page ${n + 1}: ${found} people`)
    if (!found) break
    await new Promise((r) => setTimeout(r, 500)) // be polite
  }
  const names = [...people.values()].sort((a, b) => a.localeCompare(b))
  mkdirSync('private', { recursive: true })
  writeFileSync('private/bsg-names.json', JSON.stringify(names, null, 1))
  console.log(`Saved ${names.length} names to private/bsg-names.json`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
