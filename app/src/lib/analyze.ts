import * as chrono from 'chrono-node'
import type { Message } from './parser'
import { displayName, isMe, mentionPattern } from './identity'

export type Priority = 'urgent' | 'relevant' | 'fyi'

export interface Flag {
  kind: 'mention' | 'question' | 'deadline' | 'decision' | 'action' | 'urgent' | 'everyone'
  label: string
}

export interface Scored {
  msg: Message
  score: number
  priority: Priority
  flags: Flag[]
  deadline?: Date
  owner?: string
}

export interface Analysis {
  now: Date
  unread: Message[]
  scored: Scored[]
  mentions: Scored[]
  actions: Scored[]
  decisions: Scored[]
  deadlines: Scored[]
  stats: { unread: number; mentions: number; urgent: number; deadlines: number; actions: number; minutesSaved: number }
}

const DECISION = /\b(decided|decision|finali[sz]ed|finally decided|final(?=[.,!:]|\s*$)|it'?s final|confirmed|let'?s go with|going with|we'?ll go with|agreed|locked|approved|settled|sticking with|changed? to|moved? to|pakka|tay (?:hua|hai|ho gaya)|fix (?:hai|ho gaya)|final hai)\b/i
const ACTION = /\b(can you|could you|pls|please|need(s)? to|have to|must|todo|to-do|assign(ed)?|handle|take care of|send|submit|share|fill|book|pay|bring|update|follow up|reply|confirm|order|who'?s handling|someone|bhej\w*|kar\s?(?:de|do|dena|dijiye|lo)|kardo|karo|de\s?dena|dedo)\b/i
const URGENT = /\b(urgent|asap|immediately|right now|eod|end of day|emergency|critical|important|mandatory|reminder|last chance|deadline|expires?)\b|!!+|‼️|🚨|⚠️/i
const DEADLINE_WORDS = /\b(by|before|due|deadline|until|till|latest|expires?|expiring|meeting|mandatory)\b/i
const EVERYONE = /@(everyone|all|channel|here)\b|\beveryone\b|\ball of you\b/i

/**
 * Hinglish → English hints so the date parser and keyword rules understand Indian group chats:
 * "kal subah 9 baje tak" → "tomorrow morning by 9", "aaj raat tak" → "tonight by", "jaldi" → "asap".
 * Bare "kal" is left alone: it means both yesterday and tomorrow.
 */
export function normalizeHinglish(text: string): string {
  return text
    .replace(/\baaj raat\b/gi, 'tonight')
    .replace(/\bkal subah\b/gi, 'tomorrow morning')
    .replace(/\bkal (?:shaam|sham)\b/gi, 'tomorrow evening')
    .replace(/\bkal raat\b/gi, 'tomorrow night')
    .replace(/\bkal tak\b/gi, 'by tomorrow')
    .replace(/\bparson tak\b/gi, 'within 2 days')
    .replace(/\b(\d{1,2})\s*baje\s+tak\b/gi, 'by $1')
    .replace(/\b(\d{1,2})\s*baje\b/gi, 'at $1')
    .replace(/\btak\b/gi, 'by')
    .replace(/\baaj\b/gi, 'today')
    .replace(/\bjaldi\b/gi, 'asap')
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findDeadline(text: string, ref: Date): Date | undefined {
  const results = chrono.parse(text, ref, { forwardDate: true })
  for (const r of results) {
    if (/^\d+$/.test(r.text.trim())) continue
    const known = r.start.isCertain('weekday') || r.start.isCertain('day') || r.start.isCertain('hour')
    if (!known && !/\b(today|tonight|tomorrow|eod)\b/i.test(r.text)) continue
    const d = r.start.date()
    if (d.getTime() >= ref.getTime() - 60000) return d
  }
  if (/\beod\b|end of day/i.test(text)) {
    const d = new Date(ref)
    d.setHours(18, 0, 0, 0)
    return d
  }
  return undefined
}

// The person a request is addressed to, even if they never posted: "Karthik can you…", "@meher please…"
const ADDRESSEE = /(?:^|[.!?]\s+)@?([A-Z][a-z]{2,15})[,:]?\s+(?:can|could|will|would|pls|please|plz|kindly|you)\b|@([A-Za-z][\w.]{2,24})\s+(?:can|could|pls|please|plz|kindly)\b/
const NOT_NAMES = /^(you|we|they|someone|anyone|everyone|who|guys|team|also|ok|okay|so|and|but|hey|hi|pls|please)$/i
function addressee(text: string): string | undefined {
  const m = text.match(ADDRESSEE)
  const name = m?.[1] ?? m?.[2]
  if (!name || NOT_NAMES.test(name)) return undefined
  return name.charAt(0).toUpperCase() + name.slice(1)
}

export function fmtWhen(d: Date, now: Date): string {
  const diff = d.getTime() - now.getTime()
  const abs = Math.abs(diff)
  const h = Math.round(abs / 3600000)
  const rel = abs < 3600000 ? `${Math.max(1, Math.round(abs / 60000))}m` : h < 48 ? `${h}h` : `${Math.round(h / 24)}d`
  const day = d.toLocaleDateString(undefined, { weekday: 'short' })
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${day} ${time} · ${diff >= 0 ? `in ${rel}` : `${rel} ago`}`
}

/** `identity` is free text: "Shashwat, Shash, 9198…" (see lib/identity.ts). */
export function analyze(all: Message[], identity: string, sinceIdx: number, people: string[]): Analysis {
  const now = all.length ? all[all.length - 1].ts : new Date()
  const unread = all.slice(sinceIdx)
  const me = displayName(identity)
  const meRe = new RegExp(`(${mentionPattern(identity)})`, 'i')
  const others = people.filter(p => !isMe(p, identity))

  const scored: Scored[] = unread.map(msg => {
    const flags: Flag[] = []
    let score = 0
    const raw = msg.text
    const t = normalizeHinglish(raw)
    const fromMe = isMe(msg.author, identity)
    const mentionsMe = !fromMe && meRe.test(t)
    const everyone = EVERYONE.test(t)

    if (mentionsMe) { flags.push({ kind: 'mention', label: 'mentions you' }); score += 5 }
    else if (everyone) { flags.push({ kind: 'everyone', label: '@everyone' }); score += 2 }
    if ((mentionsMe || everyone) && t.includes('?')) { flags.push({ kind: 'question', label: 'asks you' }); score += 2 }

    const isAction = ACTION.test(t) && (t.includes('?') || /\b(need|must|pls|please|todo|assign|have to|by)\b/i.test(t) || mentionsMe)
    const target = isAction ? addressee(t) : undefined

    // A deadline needs an explicit cue ("by", "due", "before"…), or a time phrase inside a request
    // aimed at a specific person ("@Shashwat bring the cable tomorrow morning").
    const deadline = findDeadline(t, msg.ts)
    const implicit = isAction && (mentionsMe || !!target) && !!deadline && !/^\s*today\s*$/i.test(chrono.parse(t, msg.ts)[0]?.text ?? '')
    if (deadline && t.length > 25 && deadline.getTime() >= now.getTime() - 3600000 && (DEADLINE_WORDS.test(t) || implicit)) {
      const hrs = (deadline.getTime() - now.getTime()) / 3600000
      flags.push({ kind: 'deadline', label: `due ${fmtWhen(deadline, now).split(' · ')[0]}` })
      score += hrs < 24 ? 5 : 3
    }
    if (DECISION.test(t)) { flags.push({ kind: 'decision', label: 'decision' }); score += 3 }
    if (isAction) { flags.push({ kind: 'action', label: 'action item' }); score += mentionsMe ? 3 : 1 }
    if (URGENT.test(t)) { flags.push({ kind: 'urgent', label: 'urgent' }); score += 3 }

    if (fromMe) score = 0
    if (t.length < 12 && !mentionsMe) score = Math.min(score, 1)

    let owner: string | undefined
    if (isAction) {
      if (mentionsMe) owner = me
      else owner = others.find(p => new RegExp(`\\b${escapeRe(p.split(/\s+/)[0])}\\b`, 'i').test(t))
        ?? target
        ?? (everyone ? 'Everyone' : undefined)
    }

    const priority: Priority = score >= 8 ? 'urgent' : score >= 3 ? 'relevant' : 'fyi'
    return { msg, score, priority, flags, deadline: flags.some(f => f.kind === 'deadline') ? deadline : undefined, owner }
  })

  const has = (s: Scored, k: Flag['kind']) => s.flags.some(f => f.kind === k)
  const mentions = scored.filter(s => has(s, 'mention'))
  const actions = scored.filter(s => has(s, 'action') && s.score >= 3)
    .sort((a, b) => (b.owner === me ? 1 : 0) - (a.owner === me ? 1 : 0) || b.score - a.score)
  const decisions = scored.filter(s => has(s, 'decision') && s.score >= 3)
  const deadlines = scored.filter(s => s.deadline).sort((a, b) => a.deadline!.getTime() - b.deadline!.getTime())

  const words = unread.reduce((n, m) => n + m.text.split(/\s+/).length, 0)
  return {
    now, unread, scored, mentions, actions, decisions, deadlines,
    stats: {
      unread: unread.length,
      mentions: mentions.length,
      urgent: scored.filter(s => s.priority === 'urgent').length,
      deadlines: deadlines.length,
      actions: actions.length,
      minutesSaved: Math.max(1, Math.round(words / 200 + unread.length * 0.05)),
    },
  }
}
