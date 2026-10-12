// Turns the programme newsletter email (.eml or .msg, as saved from Outlook)
// into a checklist. The newsletter is a Mailchimp template: section headings
// are 20px bold, item titles 18px bold, and a bold line right under a title is
// usually its date/time. Runs in the browser.
import type { NewsletterInput, NewsletterItem } from './types'

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]
const MONTH_RE = '(January|February|March|April|May|June|July|August|September|October|November|December)'
const GENERIC_LABEL = /^(here|click here|this form|link|r|c|canvas|register here|egister here|lick here|click|this)$/i

type Line = { kind: 'section' | 'title' | 'text'; text: string; bold: boolean; links: { label: string; url: string }[] }

/** Reads the email file and returns its subject, date and HTML body. */
export async function readEmailFile(file: File): Promise<{ subject: string; date: Date; html: string }> {
  const buf = new Uint8Array(await file.arrayBuffer())
  if (/\.msg$/i.test(file.name)) {
    // The package is CommonJS: depending on the bundler the class is the default export or nested one level down.
    const mod = (await import('@kenjiuno/msgreader')) as unknown as { default: unknown }
    const MsgReader = ((mod.default as { default?: unknown }).default ?? mod.default) as typeof import('@kenjiuno/msgreader').default
    const data = new MsgReader(buf.buffer).getFileData() as {
      subject?: string
      html?: Uint8Array
      bodyHtml?: string
      messageDeliveryTime?: string
      clientSubmitTime?: string
    }
    const html = data.bodyHtml ?? (data.html ? decode(data.html) : '')
    const when = data.messageDeliveryTime ?? data.clientSubmitTime
    return { subject: data.subject ?? file.name, date: when ? new Date(when) : new Date(file.lastModified), html }
  }
  const { default: PostalMime } = await import('postal-mime')
  const email = await PostalMime.parse(buf)
  return {
    subject: email.subject ?? file.name,
    date: email.date ? new Date(email.date) : new Date(file.lastModified),
    html: email.html ?? '',
  }
}

function decode(bytes: Uint8Array) {
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : utf8
}

const clean = (s: string) =>
  s
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()

/** Removes the personal subscriber code (e=…) Mailchimp adds to each link. */
export function cleanUrl(url: string) {
  try {
    const u = new URL(url)
    if (/list-manage\.com$/i.test(u.hostname)) u.searchParams.delete('e')
    return u.toString()
  } catch {
    return url
  }
}

/** Flattens the email HTML into lines tagged as section heading, item title or text. */
function toLines(html: string): Line[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('style, script, head, img').forEach((n) => n.remove())
  const lines: Line[] = []
  let cur: Line = { kind: 'text', text: '', bold: true, links: [] }
  let boldChars = 0
  let plainChars = 0
  const flush = () => {
    const text = clean(cur.text)
    if (text) lines.push({ ...cur, text, bold: boldChars > 0 && plainChars === 0 })
    cur = { kind: 'text', text: '', bold: true, links: [] }
    boldChars = plainChars = 0
  }
  const BLOCK = new Set(['P', 'DIV', 'LI', 'TR', 'TD', 'TABLE', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'BR'])

  const sizeOf = (el: Element | null): number | null => {
    for (let e = el; e && e !== doc.body; e = e.parentElement) {
      const m = (e.getAttribute('style') ?? '').match(/font-size:\s*(\d+)px/i)
      if (m) return Number(m[1])
    }
    return null
  }
  const isBold = (el: Element | null) => {
    for (let e = el; e && e !== doc.body; e = e.parentElement) {
      if (e.tagName === 'STRONG' || e.tagName === 'B') return true
      if (/font-weight:\s*(bold|[6-9]00)/i.test(e.getAttribute('style') ?? '')) return true
    }
    return false
  }

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const raw = node.textContent ?? ''
      if (!raw.trim()) {
        cur.text += raw.replace(/\s+/g, ' ')
        return
      }
      const parent = node.parentElement
      const size = sizeOf(parent)
      const kind: Line['kind'] =
        size && size >= 20 ? 'section' : size && size >= 17 && isBold(parent) ? 'title' : 'text'
      if (kind !== cur.kind && clean(cur.text)) flush()
      cur.kind = kind
      cur.text += raw
      if (isBold(parent)) boldChars += raw.trim().length
      else plainChars += raw.trim().length
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element
    const block = BLOCK.has(el.tagName)
    if (block) flush()
    if (el.tagName === 'LI') cur.text += '• '
    el.childNodes.forEach(walk)
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') ?? ''
      if (/^(https?:|mailto:)/i.test(href)) cur.links.push({ label: clean(el.textContent ?? ''), url: cleanUrl(href) })
    }
    if (block) flush()
  }
  walk(doc.body)
  flush()

  // Stop at the footer (unsubscribe, "This email was sent to …").
  const end = lines.findIndex((l) => /this email was sent to|why did I get this|unsubscribe/i.test(l.text))
  return end >= 0 ? lines.slice(0, end) : lines
}

/** Finds a deadline in the text ("closes at 17:00 on Wednesday 14 October", "by Sunday 18 October"…). */
function findDeadline(text: string, sent: Date): string | null {
  const re = new RegExp(
    `\\b(clos(?:e|es|ing)|deadline|by|due|until|before|submit)\\b[^.;]{0,60}?\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}(?:\\s+(\\d{4}))?`,
    'i',
  )
  const m = text.match(re)
  if (!m) return null
  return isoDate(Number(m[2]), m[3], m[4] ? Number(m[4]) : null, sent)
}

function isoDate(day: number, monthName: string, year: number | null, sent: Date) {
  const month = MONTHS.indexOf(monthName.toLowerCase())
  let y = year ?? sent.getFullYear()
  // A date months "before" the email is next year (e.g. a January date in an October email).
  if (!year && month < sent.getMonth() - 2) y += 1
  return `${y}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const ACTION = /regist|rsvp|form\b|survey|apply|book|sign.?up|submit/i
const USEFUL =
  /canvas|reading list|guidance|template|policy|dashboard|slides|resources|hub|flyers|materials|section|team|programme|q&a/i
const NAME_LIKE = /^(?:[A-Z][\p{L}'’.-]+\s?){1,4}(?:MP|KC)?$/u

/** A readable name for a vague link ("here") from its sentence, e.g. "Economics reading list". */
function nameFromSentence(line: string): string | null {
  const m = line.match(
    /((?:[A-Z][\w’'-]*|I{1,3}|\d+)(?:\s+(?:[A-Z][\w’'-]*|I{1,3})){0,3})\s+(reading list|survey|form|guidance(?: document)?|template|policy|dashboard|slides)/,
  )
  if (m) return `${m[1]} ${m[2]}`.replace(/^(The|This|Our|Your|A)\s+/, '')
  const k = line.match(/\b([\w-]+ policy|reading list|survey|form|guidance document|template|dashboard|slides|Canvas)\b/i)
  return k ? k[1].charAt(0).toUpperCase() + k[1].slice(1) : null
}

/** The links worth a button: actions first (register, form, survey, email), then useful pages; not every person's profile. */
function pickLinks(body: Line[]) {
  const seenUrl = new Set<string>()
  const seenLabel = new Set<string>()
  const scored = body
    .flatMap((l) => l.links.map((k) => ({ ...k, line: l.text })))
    .filter((k) => !seenUrl.has(k.url) && !!seenUrl.add(k.url))
    .map((k) => {
      let label = k.label.replace(/\s+/g, ' ').trim()
      const vague = GENERIC_LABEL.test(label) || label.length < 3
      if (vague)
        label = /regist/i.test(k.line)
          ? 'Register'
          : (nameFromSentence(k.line) ?? (/rsvp/i.test(k.line) ? 'RSVP' : 'Open link'))
      const mail = k.url.startsWith('mailto:')
      if (mail && !/^email/i.test(label)) label = `Email ${label}`
      const score =
        mail || ACTION.test(label) || (vague && ACTION.test(k.line))
          ? 3
          : USEFUL.test(label) || vague
            ? 2
            : NAME_LIKE.test(label)
              ? 0
              : 1
      label = label.charAt(0).toUpperCase() + label.slice(1)
      return { label: label.length > 60 ? `${label.slice(0, 57)}…` : label, url: k.url, score }
    })
    .filter((k) => !seenLabel.has(k.label) && !!seenLabel.add(k.label))
  const keep = scored.filter((k) => k.score > 0)
  return (keep.length ? keep : scored.slice(0, 2))
    .sort((x, y) => y.score - x.score)
    .slice(0, 4)
    .map(({ label, url }) => ({ label, url }))
}

const looksLikeWhen = (s: string) =>
  s.length <= 120 &&
  (/\b(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\b/i.test(s) || /\d{1,2}[:.]\d{2}/.test(s) || /^deadline\b/i.test(s))

const firstSentence = (s: string) => {
  const m = s.match(/^(.{20,200}?[.!?])(\s|$)/)
  const out = m ? m[1] : s
  return out.length > 180 ? `${out.slice(0, 177).trimEnd()}…` : out
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36) || 'item'

/** Builds the checklist from the newsletter's HTML. */
export function parseNewsletterHtml(html: string, subject: string, sent: Date): NewsletterInput {
  const lines = toLines(html)
  const introLines: string[] = []
  const items: NewsletterItem[] = []
  const ids = new Set<string>()
  let section: string | null = null
  let item: { title: string; body: Line[] } | null = null

  const finish = () => {
    if (!item || !section) return
    const body = item.body
    let when: string | null = null
    if (body[0]?.bold && looksLikeWhen(body[0].text)) when = body.shift()!.text.replace(/^deadline\s*/i, 'Deadline: ')
    const text = body.map((l) => l.text).join('\n')
    const flat = text.replace(/\n+/g, ' ')
    const due = findDeadline(`${when ?? ''} ${flat}`, sent)
    const links = pickLinks(body)
    let id = slug(item.title)
    for (let n = 2; ids.has(id); n++) id = `${slug(item.title).slice(0, 33)}-${n}`
    ids.add(id)
    items.push({
      id,
      category: section,
      title: item.title,
      summary: firstSentence(flat || when || item.title),
      detail: text.split('\n').join('\n\n') || null,
      due,
      when,
      ...(links.length ? { links } : {}),
    })
    item = null
  }

  for (const l of lines) {
    if (l.kind === 'section') {
      finish()
      section = l.text.replace(/\s+$/, '')
    } else if (l.kind === 'title') {
      if (item && !item.body.length)
        item.title = `${item.title} ${l.text}` // a title split over two lines
      else {
        finish()
        item = { title: l.text, body: [] }
      }
    } else if (item) item.body.push(l)
    else if (!section) introLines.push(l.text)
    else
      item = { title: l.text.length < 90 && l.bold ? l.text : section, body: l.text.length < 90 && l.bold ? [] : [l] }
  }
  finish()

  if (!items.length) throw new Error('Couldn’t find any items in this email. Is it the programme newsletter?')
  // The Monday the newsletter is for: the next Monday after it was sent.
  const monday = new Date(sent)
  monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7))
  const week = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
  return {
    title: clean(subject).slice(0, 120),
    week_of: week,
    intro: introLines.join('\n\n').slice(0, 2000) || null,
    items,
  }
}
