/**
 * The app's only persistence layer: everything we keep lives in this browser's own storage.
 * Nothing is synced or uploaded. Every access is wrapped because storage can be unavailable
 * (private mode, blocked site data, quota), and the app must keep working without it.
 *
 * Keys are kept stable across versions so users don't lose their settings.
 */

type Area = 'local' | 'session'

function area(which: Area): Storage | null {
  try { return which === 'local' ? window.localStorage : window.sessionStorage } catch { return null }
}

function read(which: Area, key: string): string | null {
  try { return area(which)?.getItem(key) ?? null } catch { return null }
}

function write(which: Area, key: string, value: string | null): void {
  try {
    const s = area(which)
    if (!s) return
    if (value === null) s.removeItem(key)
    else s.setItem(key, value)
  } catch { /* full or blocked: the app degrades to in-memory state */ }
}

function readJson<T>(which: Area, key: string): T | null {
  const raw = read(which, key)
  if (!raw) return null
  try { return JSON.parse(raw) as T } catch { return null }
}

const KEYS = {
  identity: 'wdim-identity',
  introSeen: 'wdim-intro-seen',
  lastSeen: (source: string, chat: string) => `wdim-seen:${source}:${chat}`,
  telegram: 'wdim-tg-live',
} as const

export const storage = {
  /** "Who are you?": names, @usernames and phone numbers, comma-separated. */
  identity: {
    get: (): string | null => read('local', KEYS.identity),
    set: (value: string) => write('local', KEYS.identity, value),
  },
  /** Whether the demo notice was shown in this browser session. */
  introSeen: {
    get: (): boolean => read('session', KEYS.introSeen) === '1',
    set: () => write('session', KEYS.introSeen, '1'),
  },
  /** Timestamp of the newest message the user has seen in a given chat, for "since my last visit". */
  lastSeen: {
    get: (source: string, chat: string): number => Number(read('local', KEYS.lastSeen(source, chat)) ?? 0) || 0,
    set: (source: string, chat: string, ts: number) => write('local', KEYS.lastSeen(source, chat), String(ts)),
  },
  /** Live-Telegram state (bot token + received messages). Cleared completely on disconnect. */
  telegram: {
    get: <T>(): T | null => readJson<T>('local', KEYS.telegram),
    set: <T>(value: T | null) => write('local', KEYS.telegram, value === null ? null : JSON.stringify(value)),
  },
}
