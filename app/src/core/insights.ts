import type { Analysis, Scored } from './analyze'

const STOP = new Set(`a about above after again all also am an and any are as at be because been before being below between both but by can
could did do does doing done down during each few for from further had has have having he her here hers him his how i if in into is it its
itself just let lets me more most my no nor not now of off on once only or other our ours out over own same she should so some such than
that the their them then there these they this those through to too under until up very was we were what when where which while who whom
why will with would you your yours yes yeah ok okay okk lol lmao haha hmm guys bro bhai ya yaa pls please thanks thank thx sure anyone
someone everyone today tomorrow tonight morning evening day days time need needs want get got going go one two will shall also still
really right well much many even back make made know think see come came take said says say tell told give gave like just also already
done mine yours ours nope fine noted good great nice cool same random btw abt wat wht hai hain kya toh bhi nahi kal aaj abhi
monday tuesday wednesday thursday friday saturday sunday week weeks hour hours minute minutes pm am eod asap urgent important update
reminder final finally decided confirmed media omitted message deleted
send sent accept fill book pay bring share check call called post take keep give make team core group chat guys stop resend pain
whole everything something nothing thing things stuff work done doing tell asked asking ask`.split(/\s+/))

export interface Topic { word: string; weight: number }

/** Most-discussed keywords in the unread messages, weighted by how important each message was. */
export function hotTopics(a: Analysis, people: string[], n = 4): Topic[] {
  const names = new Set(people.flatMap(p => p.toLowerCase().split(/\s+/)))
  const counts = new Map<string, number>()
  for (const s of a.scored) {
    const seen = new Set<string>()
    for (const raw of s.msg.text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []) {
      const w = raw.replace(/'s$/, '').replace(/s$/, m => (raw.length > 5 ? '' : m))
      if (STOP.has(w) || names.has(w) || seen.has(w)) continue
      seen.add(w)
      counts.set(w, (counts.get(w) ?? 0) + 1 + s.score / 4)
    }
  }
  return [...counts.entries()].toSorted((x, y) => y[1] - x[1]).slice(0, n).map(([word, weight]) => ({ word, weight }))
}

/** Strip greetings / leading mentions so a message reads well as a short title. */
export function cleanTitle(text: string, people: string[]): string {
  let t = text.replace(/\s+/g, ' ').trim()
  const lead = new RegExp(`^(@\\w+|${people.map(p => p.split(/\s+/)[0]).join('|')})[,:]?\\s+(bro|da|yaar)?[,:]?\\s*`, 'i')
  for (let i = 0; i < 2; i++) t = t.replace(lead, '').replace(/^(reminder|important|update|fyi|note|btw)\s*[:\-–]\s*/i, '').replace(/^@\w+\s*/, '')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export interface CalChip { s: Scored; col: number; top: number }
export interface Calendar { days: Date[]; hours: number[]; startH: number; span: number; chips: CalChip[]; later: number }

/** Lays out upcoming deadlines on a 6-day × hours grid (positions in %). */
export function deadlineCalendar(a: Analysis, nDays = 6): Calendar {
  const day0 = new Date(a.now); day0.setHours(0, 0, 0, 0)
  const days = Array.from({ length: nDays }, (_, i) => new Date(day0.getTime() + i * 86400000))
  const end = day0.getTime() + nDays * 86400000
  const upcoming = a.deadlines.filter(s => s.deadline!.getTime() >= a.now.getTime() - 3600000)
  const inRange = upcoming.filter(s => s.deadline!.getTime() < end)

  const hrs = inRange.map(s => s.deadline!.getHours() + s.deadline!.getMinutes() / 60)
  const startH = Math.max(0, Math.min(8, ...hrs.map(Math.floor)))
  const endH = Math.min(24, Math.max(startH + 5, ...hrs.map(h => Math.ceil(h) + 1)))
  const span = endH - startH
  const step = Math.max(1, Math.ceil(span / 5))
  const hours: number[] = []
  for (let h = startH; h < endH; h += step) hours.push(h)

  const chips: CalChip[] = inRange
    .map(s => {
      const d = s.deadline!
      const col = Math.floor((new Date(d).setHours(0, 0, 0, 0) - day0.getTime()) / 86400000)
      const top = ((d.getHours() + d.getMinutes() / 60 - startH) / span) * 100
      return { s, col, top }
    })
    .toSorted((x, y) => x.col - y.col || x.top - y.top)

  // Nudge overlapping chips in the same column
  const MIN_GAP = 22
  for (let i = 1; i < chips.length; i++) {
    const prev = chips[i - 1]
    if (chips[i].col === prev.col && chips[i].top - prev.top < MIN_GAP) chips[i].top = prev.top + MIN_GAP
  }
  return { days, hours, startH, span, chips, later: upcoming.length - inRange.length }
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

export function hueFor(name: string): number {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360
  return 10 + (h % 40) // warm range: reds → oranges → ambers
}
