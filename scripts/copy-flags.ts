/**
 * Copies the flag SVGs for every country in src/lib/options.ts from the
 * flag-icons package (MIT) into public/flags.
 *
 *   npm run flags -- path/to/flag-icons/flags/4x3
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { COUNTRY_CODE, COUNTRY_CONTINENT } from '../src/lib/options.ts'

const src = process.argv[2]
if (!src) throw new Error('Usage: npm run flags -- path/to/flag-icons/flags/4x3')
mkdirSync('public/flags', { recursive: true })
const missing: string[] = []
for (const country of Object.keys(COUNTRY_CONTINENT)) {
  const code = COUNTRY_CODE[country]
  if (!code || !existsSync(join(src, `${code}.svg`))) {
    missing.push(country)
    continue
  }
  copyFileSync(join(src, `${code}.svg`), `public/flags/${code}.svg`)
}
writeFileSync(
  'public/flags/LICENSE',
  'Flag images from flag-icons (https://github.com/lipis/flag-icons), MIT License, Copyright (c) 2013 Panayiotis Lipiridis.\n',
)
console.log(`Copied ${Object.keys(COUNTRY_CONTINENT).length - missing.length} flags`, missing.length ? `; missing: ${missing.join(', ')}` : '')
