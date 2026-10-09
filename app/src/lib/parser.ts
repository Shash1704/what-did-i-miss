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

export type DateOrder = 'DMY' | 'MDY'

function toDate(order: DateOrder, a: string, b: string, y: string, hh: string, mm: string, ss: string | undefined, ampm: string | undefined): Date {
  let [day, month] = order === 'DMY' ? [+a, +b] : [+b, +a]
  if (month > 12 && day <= 12) [day, month] = [month, day] // impossible month: the other order must be right
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

// WhatsApp marks people who aren't in your contacts as "~ Name" (often with a narrow no-break space)
// and sprinkles invisible left-to-right marks; strip both so names and @mentions match.
function cleanAuthor(raw: string): string {
  return raw.replace(/[\u200e\u200f\u202a-\u202e]/g, '').replace(/^[~\s\u00a0\u202f]+/, '').trim()
}

/**
 * WhatsApp writes dates in the phone's locale: 09/10/26 is 9 Oct in India but Sep 10 in the US.
 * Decide once per file: a first number > 12 proves day-first, a second number > 12 proves month-first;
 * if the file never disambiguates, pick the order whose timestamps run forwards most consistently.
 */
export function detectDateOrder(pairs: [number, number, string][]): DateOrder {
  let dayFirst = false, monthFirst = false
  for (const [a, b] of pairs) { if (a > 12) dayFirst = true; if (b > 12) monthFirst = true }
  if (dayFirst !== monthFirst) return dayFirst ? 'DMY' : 'MDY'
  const backwards = (order: DateOrder) => {
    let n = 0, prev = -Infinity
    for (const [a, b, y] of pairs) {
      const [d, m] = order === 'DMY' ? [a, b] : [b, a]
      const key = (+y % 100) * 10000 + m * 100 + d
      if (key < prev) n++
      prev = key
    }
    return n
  }
  const dmy = backwards('DMY'), mdy = backwards('MDY')
  if (dmy !== mdy) return dmy < mdy ? 'DMY' : 'MDY'
  // Still a tie: browser language is unreliable (many Indian users run en-US browsers), so use the
  // device's time zone. Month-first is essentially a US convention; everywhere else is day-first.
  return usesMonthFirst() ? 'MDY' : 'DMY'
}

const US_ZONES = /^(America\/(New_York|Chicago|Denver|Phoenix|Los_Angeles|Anchorage|Detroit|Boise|Indiana\/.*|Kentucky\/.*|North_Dakota\/.*|Juneau|Sitka|Nome|Adak|Menominee)|Pacific\/Honolulu|US\/.*)$/
function usesMonthFirst(): boolean {
  try { return US_ZONES.test(Intl.DateTimeFormat().resolvedOptions().timeZone) } catch { return false }
}

const SYSTEM = /(end-to-end encrypted|created group|added you|changed the subject|changed this group|left$|joined using|<Media omitted>|This message was deleted|image omitted|sticker omitted)/i

export function parseChat(raw: string): Message[] {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')
  const matches = lines.map(line => line.match(ANDROID) || line.match(IOS))
  const order = detectDateOrder(matches.filter((m): m is RegExpMatchArray => !!m).map(m => [+m[1], +m[2], m[3]]))
  const out: Message[] = []
  let timestamped = false

  lines.forEach((line, i) => {
    const m = matches[i]
    if (m) {
      timestamped = true
      const [, a, b, y, hh, mm, ss, ampm, author, text] = m
      out.push({ id: out.length, ts: toDate(order, a, b, y, hh, mm, ss, ampm), author: cleanAuthor(author), text: text.replace(/\u200e/g, '').trim() })
    } else if (out.length && line.trim() && (timestamped || !GENERIC.test(line))) {
      out[out.length - 1].text += '\n' + line.trim()
    } else if (!timestamped) {
      const g = line.match(GENERIC)
      if (g) out.push({ id: out.length, ts: new Date(0), author: g[1].trim(), text: g[2].trim() })
    }
  })

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
