export interface Message {
  id: number
  ts: Date
  author: string
  text: string
}

// Android: "12/10/2026, 14:05 - Name: msg"  |  "12/10/26, 2:05 pm - Name: msg"
const ANDROID = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([aApP]\.?\s?[mM]\.?)?\s+[-–]\s+([^:]+?):\s([\s\S]*)$/
// iOS: "[12/10/26, 2:05:33 PM] Name: msg"
const IOS = /^‎?\[(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([aApP]\.?\s?[mM]\.?)?\]\s+([^:]+?):\s([\s\S]*)$/
// Generic: "Name: msg"
const GENERIC = /^([A-Za-z][\w .'-]{0,30}):\s(.+)$/

function toDate(d: string, m: string, y: string, hh: string, mm: string, ss: string | undefined, ampm: string | undefined): Date {
  let day = +d, month = +m
  if (month > 12 && day <= 12) [day, month] = [month, day]
  let year = +y
  if (year < 100) year += 2000
  let hour = +hh
  if (ampm) {
    const pm = /p/i.test(ampm)
    if (pm && hour < 12) hour += 12
    if (!pm && hour === 12) hour = 0
  }
  return new Date(year, month - 1, day, hour, +mm, ss ? +ss : 0)
}

const SYSTEM = /(end-to-end encrypted|created group|added you|changed the subject|changed this group|left$|joined using|<Media omitted>|This message was deleted|image omitted|sticker omitted)/i

export function parseChat(raw: string): Message[] {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')
  const out: Message[] = []
  let timestamped = false

  for (const line of lines) {
    const m = line.match(ANDROID) || line.match(IOS)
    if (m) {
      timestamped = true
      const [, d, mo, y, hh, mm, ss, ampm, author, text] = m
      out.push({ id: out.length, ts: toDate(d, mo, y, hh, mm, ss, ampm), author: author.trim(), text: text.trim() })
    } else if (out.length && line.trim() && (timestamped || !GENERIC.test(line))) {
      out[out.length - 1].text += '\n' + line.trim()
    } else if (!timestamped) {
      const g = line.match(GENERIC)
      if (g) out.push({ id: out.length, ts: new Date(0), author: g[1].trim(), text: g[2].trim() })
    }
  }

  // Untimestamped paste: synthesize 2-minute spacing ending now
  if (!timestamped && out.length) {
    const now = Date.now()
    out.forEach((msg, i) => (msg.ts = new Date(now - (out.length - i) * 120000)))
  }

  return out.filter(msg => !SYSTEM.test(msg.text)).map((msg, i) => ({ ...msg, id: i }))
}

export function participants(msgs: Message[]): string[] {
  const counts = new Map<string, number>()
  msgs.forEach(m => counts.set(m.author, (counts.get(m.author) || 0) + 1))
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n)
}
