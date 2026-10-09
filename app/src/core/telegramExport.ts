// Telegram Desktop exports ("Export chat history"): JSON (result.json) or HTML (messages.html).
// Both are parsed locally into the same Message shape the rest of the app uses.
import type { Message } from './parser'

type TgText = string | { type?: string; text?: string } | TgText[]

interface TgMessage {
  type?: string
  date?: string
  date_unixtime?: string
  from?: string | null
  text?: TgText
  sticker_emoji?: string
  forwarded_from?: string
}

interface TgChat { name?: string; type?: string; messages?: TgMessage[] }

interface TgExport extends TgChat {
  chats?: { list?: TgChat[] }
  personal_information?: { first_name?: string; last_name?: string; username?: string }
}

export interface ImportedChat { name: string; messages: Message[]; me?: string }

function flatten(t: TgText | undefined): string {
  if (t === null || t === undefined) return ''
  if (typeof t === 'string') return t
  if (Array.isArray(t)) return t.map(flatten).join('')
  return t.text ?? ''
}

function fromChat(chat: TgChat): Message[] {
  const out: Message[] = []
  for (const m of chat.messages ?? []) {
    if (m.type !== 'message') continue // service events: joins, pins, title changes…
    let text = flatten(m.text).trim()
    if (!text && m.sticker_emoji) text = m.sticker_emoji
    if (!text) continue // photo / file without caption
    if (m.forwarded_from) text = `[forwarded from ${m.forwarded_from}] ${text}`
    const ts = m.date_unixtime ? new Date(+m.date_unixtime * 1000) : new Date(m.date ?? 0)
    out.push({ id: out.length, ts, author: (m.from ?? 'Deleted Account').trim() || 'Unknown', text })
  }
  return out
}

export function looksLikeTelegramJson(data: unknown): data is TgExport {
  const d = data as TgExport
  return !!d && typeof d === 'object' && (Array.isArray(d.messages) || Array.isArray(d.chats?.list))
}

export function parseTelegramJson(data: TgExport): ImportedChat {
  const pi = data.personal_information
  const me = pi ? [pi.first_name, pi.last_name].filter(Boolean).join(' ') + (pi.username ? `, @${pi.username}` : '') : undefined

  // Single-chat export, or a full-account export: pick the chat with the most recent activity
  let chat: TgChat = data
  if (!Array.isArray(data.messages) && data.chats?.list?.length) {
    const lastTs = (c: TgChat) => +(c.messages?.at(-1)?.date_unixtime ?? 0)
    chat = data.chats.list.filter(c => c.messages?.length).toSorted((a, b) => lastTs(b) - lastTs(a))[0] ?? data.chats.list[0]
  }
  return { name: chat.name || 'Telegram chat', messages: fromChat(chat), me: me || undefined }
}

// "01.05.2024 10:01:02 UTC+05:30"
function parseTgHtmlDate(title: string): Date | null {
  const m = title.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})(?:\s+UTC([+-])(\d{2}):(\d{2}))?/)
  if (!m) return null
  const [, d, mo, y, hh, mm, ss, sign, oh, om] = m
  if (!sign) return new Date(+y, +mo - 1, +d, +hh, +mm, +ss)
  const offsetMin = (sign === '-' ? -1 : 1) * (+oh * 60 + +om)
  return new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss) - offsetMin * 60000)
}

export function looksLikeTelegramHtml(html: string): boolean {
  return /class="message (default|service)/.test(html) && /class="page_header"|class="history"/.test(html)
}

export function parseTelegramHtml(html: string): ImportedChat {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const name = doc.querySelector('.page_header .text')?.textContent?.trim() || 'Telegram chat'
  const out: Message[] = []
  let lastAuthor = 'Unknown'
  doc.querySelectorAll('.message.default').forEach(el => {
    const body = el.querySelector(':scope > .body') ?? el
    // "Joined" messages (consecutive from the same sender) omit the name
    const from = body.querySelector(':scope > .from_name')?.childNodes[0]?.textContent?.trim()
    if (from) lastAuthor = from
    const text = body.querySelector(':scope > .text')?.textContent?.trim() ?? ''
    const title = body.querySelector(':scope > .pull_right.date, .date')?.getAttribute('title') ?? ''
    const ts = parseTgHtmlDate(title)
    if (!text || !ts) return
    out.push({ id: out.length, ts, author: lastAuthor, text })
  })
  return { name, messages: out }
}
