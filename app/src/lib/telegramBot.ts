// Live Telegram via the user's OWN bot (official Bot API). The browser talks straight to
// api.telegram.org: no server of ours in between. Telegram queues a bot's undelivered messages
// for up to 24 hours, which suits "what did I miss": open the app later and they're waiting.
// The token and received messages are stored only in this browser (localStorage).
import type { Message } from './parser'

const KEY = 'wdim-tg-live'
const MAX_PER_CHAT = 3000

interface StoredMsg { ts: number; author: string; text: string }
export interface TgStore {
  token: string
  bot: string
  offset: number
  chats: Record<string, { title: string; msgs: StoredMsg[] }>
}
export interface LiveChatInfo { id: string; title: string; count: number; last?: number }

interface TgUser { first_name?: string; last_name?: string; username?: string }
interface TgMsg { message_id: number; date: number; chat: { id: number; title?: string; first_name?: string; type: string }; from?: TgUser; text?: string; caption?: string; sender_chat?: { title?: string } }
interface TgUpdate { update_id: number; message?: TgMsg; edited_message?: TgMsg; channel_post?: TgMsg }

export function loadStore(): TgStore | null {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) as TgStore : null } catch { return null }
}
export function saveStore(s: TgStore | null) {
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY) } catch { /* storage full or unavailable */ }
}

/**
 * Pull the bot token out of whatever was pasted: BotFather's whole message, a "bot" prefix,
 * quotes, spaces or invisible characters. A token looks like 123456789:AAH… (digits, colon, 35 chars).
 */
export function extractToken(pasted: string): string | null {
  const m = pasted.replace(/[\u200b-\u200f\u2060\ufeff]/g, '').match(/(\d{5,15}):([A-Za-z0-9_-]{30,})/)
  return m ? `${m[1]}:${m[2]}` : null
}

async function call<T>(token: string, method: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<T> {
  // Simple GET (no custom headers) so the browser needs no CORS preflight
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}${qs ? `?${qs}` : ''}`, { signal })
  const body = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }))
  if (!body.ok) {
    const code = body.error_code ?? res.status
    if (code === 401 || code === 404) throw new Error('Telegram rejected this token. Copy it again from @BotFather (it looks like 123456789:AAH…), or send /token to BotFather to get a fresh one.')
    if (code === 409) throw new Error('Another app is already reading this bot\'s messages (a webhook or another open tab). Close other tabs, or create a fresh bot.')
    throw new Error(body.description || 'Telegram request failed')
  }
  return body.result as T
}

/** Validate the token and make sure updates can be pulled (no webhook set on the bot). */
export async function connectBot(pasted: string): Promise<TgStore> {
  const token = extractToken(pasted)
  if (!token) throw new Error("That doesn't look like a bot token. In @BotFather's message, copy the line that looks like 123456789:AAH… (numbers, a colon, then about 35 letters).")
  const me = await call<{ username: string }>(token, 'getMe')
  const hook = await call<{ url: string }>(token, 'getWebhookInfo')
  if (hook.url) throw new Error('This bot has a webhook set, so its messages go elsewhere. Use a fresh bot from @BotFather.')
  const prev = loadStore()
  return prev && prev.token === token ? prev : { token, bot: me.username, offset: 0, chats: {} }
}

const fullName = (u?: TgUser) => [u?.first_name, u?.last_name].filter(Boolean).join(' ') || (u?.username ? `@${u.username}` : '')

/** Long-poll once (up to ~25s). Returns ids of chats that received messages. */
export async function pollOnce(store: TgStore, signal: AbortSignal): Promise<string[]> {
  const updates = await call<TgUpdate[]>(store.token, 'getUpdates', {
    offset: String(store.offset),
    timeout: '25',
    allowed_updates: JSON.stringify(['message', 'channel_post']),
  }, signal)
  const changed = new Set<string>()
  for (const u of updates) {
    store.offset = u.update_id + 1
    const m = u.message ?? u.channel_post
    const text = m?.text ?? m?.caption
    if (!m || !text) continue
    const id = String(m.chat.id)
    const chat = store.chats[id] ??= { title: m.chat.title || m.chat.first_name || 'Telegram chat', msgs: [] }
    chat.title = m.chat.title || chat.title
    chat.msgs.push({ ts: m.date * 1000, author: fullName(m.from) || m.sender_chat?.title || chat.title, text })
    if (chat.msgs.length > MAX_PER_CHAT) chat.msgs.splice(0, chat.msgs.length - MAX_PER_CHAT)
    changed.add(id)
  }
  return [...changed]
}

export function listChats(store: TgStore): LiveChatInfo[] {
  return Object.entries(store.chats)
    .map(([id, c]) => ({ id, title: c.title, count: c.msgs.length, last: c.msgs.at(-1)?.ts }))
    .sort((a, b) => (b.last ?? 0) - (a.last ?? 0))
}

export function chatMessages(store: TgStore, id: string): Message[] {
  return (store.chats[id]?.msgs ?? []).map((m, i) => ({ id: i, ts: new Date(m.ts), author: m.author, text: m.text }))
}
