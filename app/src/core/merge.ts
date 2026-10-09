import type { Message } from './parser'

/**
 * Merge messages from several files of the same chat (e.g. Telegram's messages.html,
 * messages2.html…) into one chronological list, dropping duplicates. Pure.
 */
export function mergeMessages(lists: Message[][]): Message[] {
  const seen = new Set<string>()
  return lists.flat()
    .toSorted((x, y) => x.ts.getTime() - y.ts.getTime())
    .filter(m => {
      const key = `${m.ts.getTime()}|${m.author}|${m.text}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((m, i) => Object.assign({}, m, { id: i }))
}
