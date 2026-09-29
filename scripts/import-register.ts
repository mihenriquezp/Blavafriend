/**
 * Turns the cohort's hand-filled "Informal Register" spreadsheet into SQL that
 * seeds the students table, mapping free text onto the app's closed lists.
 *
 *   npm run import -- path/to/register.xlsx
 *
 * Writes (both git-ignored, because this repo is public):
 *   private/seed.sql     → paste into the Supabase SQL editor and run
 *   private/review.md    → rows and phrases that need a human look
 */
import ExcelJS from 'exceljs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { COLLEGES, COUNTRY_CONTINENT } from '../src/lib/options.ts'

const COUNTRY_ALIASES: Record<string, string> = {
  uk: 'United Kingdom', 'u.k.': 'United Kingdom', england: 'United Kingdom', scotland: 'United Kingdom',
  wales: 'United Kingdom', 'n. ireland': 'United Kingdom', 'northern ireland': 'United Kingdom',
  britain: 'United Kingdom', us: 'United States', usa: 'United States', 'u.s.': 'United States',
  america: 'United States', méxico: 'Mexico', brasil: 'Brazil', korea: 'South Korea',
  'republic of korea': 'South Korea', kashmir: 'India', ind: 'India', perú: 'Peru', türkiye: 'Turkey',
  'viet nam': 'Vietnam', uae: 'United Arab Emirates', drc: 'DR Congo',
}

const COLLEGE_ALIASES: Record<string, string> = {
  chch: 'Christ Church', univ: 'University', lmh: 'Lady Margaret Hall', 'lady margeret hall': 'Lady Margaret Hall',
  teddy: 'St Edmund Hall', seh: 'St Edmund Hall', gtc: 'Green Templeton', 'st anne': "St Anne's",
  'st antony': "St Antony's", 'st catz': "St Catherine's", 'st catherine': "St Catherine's",
}

// [pattern, tag]. Patterns run against the whole lower-cased cell.
const HOBBY_RULES: [RegExp, string][] = [
  [/football|soccer|gaelic/, 'Football'], [/basketball/, 'Basketball'], [/(?<!table )tennis/, 'Tennis'],
  [/padel/, 'Padel'], [/badminton/, 'Badminton'], [/squash/, 'Squash'], [/cricket/, 'Cricket'],
  [/rugby/, 'Rugby'], [/rowing/, 'Rowing'], [/cycling|\bbike|biking/, 'Cycling'],
  [/running|jogging|\bjog\b|marathon|\brun\b/, 'Running'], [/swim/, 'Swimming'],
  [/martial|jiu ?jitsu|bjj|muay thai|boxing/, 'Martial arts'], [/boulder|climbing/, 'Climbing / Bouldering'],
  [/frisbee/, 'Ultimate frisbee'], [/golf/, 'Golf'], [/volleyball/, 'Volleyball'],
  [/football fan|watching sport/, 'Watching sports'], [/\bf1\b|formula/, 'F1'],
  [/gym|fitness|spinning|weights/, 'Gym'], [/yoga/, 'Yoga'], [/pilates/, 'Pilates'],
  [/danc|ballet/, 'Dancing'], [/meditat/, 'Meditation'],
  [/hik|trek|backpack|outdoor/, 'Hiking'], [/travel|exploring/, 'Travel'], [/sail/, 'Sailing'],
  [/kayak|paddle/, 'Kayaking'], [/surf/, 'Surfing'], [/scuba|diving/, 'Scuba diving'],
  [/garden|bonsai/, 'Gardening'], [/cook/, 'Cooking'], [/bak(e|ing)/, 'Baking'], [/coff?ee?\b/, 'Coffee'],
  [/\btea\b/, 'Tea'], [/restaurant|caf[eé]|food|brunch|breakfast|eating/, 'Restaurants & cafés'],
  [/wine/, 'Wine'], [/\bpubs?\b|\bbars?\b|shisha|bartender/, 'Pubs & bars'], [/nightlife/, 'Nightlife'],
  [/\bmusic\b/, 'Music'], [/concert/, 'Concerts & live music'], [/sing|karaoke/, 'Singing'],
  [/paint|drawing|calligraph/, 'Painting & drawing'], [/photo/, 'Photography'],
  [/movie|cinema|film/, 'Film & cinema'], [/theat|musical/, 'Theatre & musicals'],
  [/museum|\bart\b|culture/, 'Museums'], [/ceramic|pottery|woodwork|craft/, 'Ceramics & crafts'],
  [/writing/, 'Writing'], [/makeup|fashion/, 'Fashion'], [/read/, 'Reading'],
  [/board ?game|tabletop|game night|escape room/, 'Board games'], [/card game/, 'Card games'],
  [/video ?game|gaming/, 'Video games'], [/trivia|quiz|intellectual game|puzzle/, 'Trivia & quizzes'],
  [/chess/, 'Chess'], [/debat/, 'Debating'], [/philosoph/, 'Philosophy'],
  [/learning (spanish|french|languages?)/, 'Learning languages'], [/podcast/, 'Podcasts'],
  [/hang|meeting friends|friends/, 'Hanging out'], [/volunteer/, 'Volunteering'],
  [/church|faith|spiritual/, 'Faith & spirituality'],
]

const POLICY_RULES: [RegExp, string][] = [
  [/\bai\b|artificial intelligence|tech|data rights|internet governance|digital markets/, 'AI & Tech Governance'],
  [/digital government|public service delivery|information governance/, 'Digital Government'],
  [/cyber/, 'Cybersecurity'],
  [/climate|environment|air quality|socioecological/, 'Climate & Environment'],
  [/energy|critical minerals/, 'Energy'],
  [/sustainab/, 'Sustainability'],
  [/\beconom(y|ic(?! development))|political economy/, 'Economic Policy'],
  [/economic development|econ development|regional development|development theor|green industrial/, 'Economic Development'],
  [/international development|^development$/, 'International Development'],
  [/financ|fintech|central bank/, 'Finance & Financial Regulation'],
  [/trade|\bfdi\b|investment/, 'Trade & Investment'],
  [/industrial|innovation/, 'Industrial Policy & Innovation'],
  [/entrepreneur/, 'Entrepreneurship'],
  [/public financial management/, 'Public Financial Management'],
  [/health|infectious/, 'Health'],
  [/educat/, 'Education'],
  [/social|welfare|inequality|mobility|disadvantage/, 'Social Policy & Protection'],
  [/housing|homeless/, 'Housing & Homelessness'],
  [/labou?r|employment/, 'Labour & Employment'],
  [/urban|transport|tranport|built environment|local government|infrastructure/, 'Urban Policy & Transport'],
  [/agricultur|food/, 'Agriculture & Food'],
  [/gender|women|gbv/, 'Gender Equality'],
  [/child|youth|intergenerational|families/, 'Children & Youth'],
  [/indigenous/, 'Indigenous Peoples'],
  [/human rights|children's rights/, 'Human Rights'],
  [/migra|refugee/, 'Migration & Refugees'],
  [/\blaw\b|justice/, 'Justice & Rule of Law'],
  [/criminal|public security|violence|crime/, 'Public Security & Crime'],
  [/defen[cs]e|(?<!public |food |economic )secur|intelligence|conflict|crisis/, 'Defence & National Security'],
  [/foreign policy|diplomacy/, 'Foreign Policy & Diplomacy'],
  [/multilateral/, 'Multilateral Governance'],
  [/humanitarian|emergency response/, 'Humanitarian Affairs'],
  [/governance|institution|reunification|democratic/, 'Governance & Institutions'],
  [/public sector|public manag|public administration|capacity building|diversity management|public-private|public institutions/, 'Public Sector Management'],
  [/corruption/, 'Anti-corruption'],
  [/election|democracy/, 'Democracy & Elections'],
  [/regulation|competition|antitrust/, 'Regulation & Competition'],
  [/media|communications/, 'Media & Communications'],
  [/evaluation|behaviou?r/, 'Behavioural Science & Evaluation'],
]

const COUNTRY_LIST = Object.keys(COUNTRY_CONTINENT)
const review: string[] = []

const clean = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    const o = v as { richText?: { text: string }[]; text?: unknown; hyperlink?: string; result?: unknown }
    if (o.richText) return o.richText.map((t) => t.text).join('').trim()
    // Hyperlink cells: keep the visible text and the link target (they often differ).
    if (o.hyperlink !== undefined) return `${clean(o.text)} ${o.hyperlink}`.trim()
    if (o.text !== undefined) return clean(o.text)
    if (o.result !== undefined) return clean(o.result)
  }
  return String(v).trim()
}

function country(raw: string): string | null {
  const t = raw.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!t) return null
  for (const part of t.split(/\s*(?:,|\/| and )\s*/)) {
    const p = part.trim()
    const exact = COUNTRY_LIST.find((c) => c.toLowerCase() === p)
    if (exact) return exact
    if (COUNTRY_ALIASES[p]) return COUNTRY_ALIASES[p]
  }
  const contained = COUNTRY_LIST.find((c) => t.includes(c.toLowerCase()))
  return contained ?? null
}

function college(raw: string): string | null {
  const key = (s: string) =>
    s
      .toLowerCase()
      .replace(/college/g, '')
      .replace(/[.'’]/g, '')
      .replace(/\bst\b/g, 'st')
      .replace(/s\b/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const k = key(raw)
  if (!k) return null
  const alias = Object.entries(COLLEGE_ALIASES).find(([a]) => key(a) === k)
  if (alias) return alias[1]
  return COLLEGES.find((c) => key(c) === k) ?? null
}

function family(raw: string): string | null {
  const t = raw.toLowerCase()
  if (!t) return null
  const partner = /partner|wife|husband|spouse/.test(t)
  const kids = /family|child|daughter|son\b|kids/.test(t)
  if (partner && kids) return 'partner_family'
  if (kids) return 'family'
  if (partner) return 'partner'
  if (/^no\b/.test(t)) return 'none'
  return null
}

function tags(raw: string, rules: [RegExp, string][], who: string, what: string): string[] {
  const t = raw.toLowerCase()
  const out = new Set<string>()
  for (const [re, tag] of rules) if (re.test(t)) out.add(tag)
  // Report fragments that produced no tag at all.
  for (const frag of t.split(/[,;/&+\n]| and |\(|\)/).map((f) => f.trim()).filter((f) => f.length > 2)) {
    if (!rules.some(([re]) => re.test(frag))) review.push(`- ${who} — unmapped ${what}: “${frag}”`)
  }
  return [...out]
}

function socials(raw: string) {
  const t = raw.replace(/\s+/g, ' ')
  const li = t.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com\/in\/([^\s/?,]+)/i)
  let ig: string | null = null
  const igUrl = t.match(/instagram\.com\/([\w.]+)/i)
  if (igUrl) ig = igUrl[1]
  else {
    const igLabel = t.match(/\b(?:ig|insta(?:gram)?)\s*[:\-]?\s*@?([\w.]+)/i)
    if (igLabel) ig = igLabel[1].replace(/\.$/, '')
  }
  return {
    linkedin: li ? `https://www.linkedin.com/in/${li[1].replace(/\/$/, '')}` : null,
    instagram: ig,
  }
}

const looksLikeFamily = (s: string) => /^(no|yes|partner|family)\b/i.test(s.trim())
const looksLikeArrival = (s: string) =>
  /\d|sept|oct|aug|not sure|maybe|live/i.test(s) && !looksLikeFamily(s)

function realign(row: string[], who: string): string[] {
  const r = [...row]
  // Age missing and everything shifted left.
  if (r[1] && Number.isNaN(Number(r[1])) && country(r[1])) {
    r.splice(1, 0, '')
    review.push(`- ${who} — age cell missing; shifted columns`)
  }
  // Country of origin missing (role landed in origin).
  if (r[3] && !country(r[3]) && college(r[4]) && !college(r[5])) {
    r.splice(3, 0, '')
    review.push(`- ${who} — country of origin missing; shifted columns`)
  }
  // Arrival date missing (family answer landed in arrival).
  if (r[6] && looksLikeFamily(r[6]) && !looksLikeFamily(r[7])) {
    r.splice(6, 0, '')
    review.push(`- ${who} — arrival date missing; shifted columns`)
  }
  // College, arrival and family all missing (policy landed in college).
  if (r[5] && !college(r[5]) && r[5].length > 25 && !looksLikeArrival(r[6])) {
    r.splice(5, 0, '', '', '')
    review.push(`- ${who} — college/arrival/family missing; shifted columns`)
  }
  return r
}

const sql = (v: string | number | null) =>
  v === null || v === '' ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`
const sqlArr = (xs: string[]) => (xs.length ? `array[${xs.map((x) => sql(x)).join(', ')}]::text[]` : `'{}'::text[]`)

async function main() {
  const file = process.argv[2]
  if (!file) throw new Error('Usage: npm run import -- path/to/register.xlsx')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const ws = wb.worksheets[0]

  const values: string[] = []
  ws.eachRow((row, n) => {
    if (n === 1) return
    const cells = Array.from({ length: 12 }, (_, i) => clean(row.getCell(i + 1).value))
    const name = cells[0].replace(/\s+/g, ' ').trim()
    if (!name) return
    const r = realign(cells, name)
    const ageNum = Number(r[1])
    const age = r[1] && Number.isFinite(ageNum) && ageNum >= 16 && ageNum < 100 ? Math.round(ageNum) : null
    const residence = country(r[2])
    const origin = country(r[3]) ?? residence
    const col = college(r[5])
    const fam = family(r[7])
    if (r[2] && !residence) review.push(`- ${name} — unknown country of residence “${r[2]}”`)
    if (r[3] && !country(r[3])) review.push(`- ${name} — unknown country of origin “${r[3]}”`)
    if (r[5] && !col) review.push(`- ${name} — unknown college “${r[5]}”`)
    if (r[7] && !fam) review.push(`- ${name} — unclear partner/family answer “${r[7]}”`)
    const s = socials(r[10])
    if (r[10] && !s.linkedin && !s.instagram && r[10].length > 3)
      review.push(`- ${name} — no social link recognised in “${r[10].slice(0, 80)}”`)

    values.push(
      `(${[
        sql(name),
        sql(age),
        sql(residence),
        sql(origin),
        sql(r[4].replace(/\s+/g, ' ').replace(/\.$/, '') || null),
        sql(col),
        sql(fam),
        sqlArr(tags(r[8], POLICY_RULES, name, 'policy interest')),
        sqlArr(tags(r[9], HOBBY_RULES, name, 'hobby')),
        sql(s.linkedin),
        sql(s.instagram),
      ].join(', ')})`,
    )
  })

  mkdirSync('private', { recursive: true })
  writeFileSync(
    'private/seed.sql',
    `-- Generated by scripts/import-register.ts from ${file.split('/').pop()}\n` +
      `-- ${values.length} students. Skips anyone whose exact name already exists.\n\n` +
      `insert into public.students\n  (full_name, age, country_residence, country_origin, job_title, college, family_status, policy_interests, hobbies, linkedin, instagram)\n` +
      `select * from (values\n  ${values.join(',\n  ')}\n) as v(full_name, age, country_residence, country_origin, job_title, college, family_status, policy_interests, hobbies, linkedin, instagram)\n` +
      `where not exists (select 1 from public.students s where lower(s.full_name) = lower(v.full_name));\n`,
  )
  writeFileSync('private/review.md', `# Import review (${values.length} students)\n\n${review.join('\n')}\n`)
  console.log(`Wrote private/seed.sql (${values.length} students) and private/review.md (${review.length} notes)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
