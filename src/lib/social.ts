import type { Student } from './types'

const handle = (v: string) =>
  v
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?[^/]+\//, '')
    .replace(/[/?#].*$/, '')

function url(v: string) {
  const t = v.trim()
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

export function socialLinks(s: Student) {
  const links: { label: string; href: string; text: string }[] = []
  if (s.linkedin) links.push({ label: 'LinkedIn', href: url(s.linkedin), text: 'LinkedIn' })
  if (s.instagram) {
    const h = handle(s.instagram)
    links.push({ label: 'Instagram', href: `https://instagram.com/${h}`, text: `@${h}` })
  }
  if (s.x_handle) {
    const h = handle(s.x_handle)
    links.push({ label: 'X', href: `https://x.com/${h}`, text: `@${h}` })
  }
  if (s.whatsapp) {
    const digits = s.whatsapp.replace(/[^\d]/g, '')
    if (digits) links.push({ label: 'WhatsApp', href: `https://wa.me/${digits}`, text: s.whatsapp })
  }
  return links
}
