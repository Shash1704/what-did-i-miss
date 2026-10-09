// "Who am I?" — a free-text identity (name, nicknames, phone number), comma-separated.
// You don't have to have posted in the chat: people may only @mention you.

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const isPhone = (s: string) => /^\+?[\d\s()-]{7,}$/.test(s)

export function myNames(identity: string): string[] {
  return identity.split(',').map(s => s.replace(/^[~@\s]+/, '').trim()).filter(Boolean)
}

/** Display name: the first non-phone alias. */
export function displayName(identity: string): string {
  const names = myNames(identity)
  return names.find(n => !isPhone(n)) ?? names[0] ?? 'You'
}

export function isMe(author: string, identity: string): boolean {
  const a = author.toLowerCase()
  if (a === 'you') return true
  return myNames(identity).some(n => {
    if (isPhone(n)) return a.replace(/\D/g, '').endsWith(n.replace(/\D/g, '').slice(-10))
    const ln = n.toLowerCase()
    return a === ln || a.split(/\s+/)[0] === ln.split(/\s+/)[0]
  })
}

/** Matches any way people refer to you: "@Shashwat", "Shashwat", "@919876543210". */
export function mentionPattern(identity: string): string {
  const parts = myNames(identity).flatMap(n => {
    if (isPhone(n)) return [`@?\\+?\\d*${n.replace(/\D/g, '').slice(-10)}\\b`]
    const first = n.split(/\s+/)[0]
    return [`@\\s?${escapeRe(n)}`, `\\b${escapeRe(first)}\\b`]
  })
  return parts.length ? parts.join('|') : '(?!)'
}

/** Name suggestions: everyone who posted plus anyone @mentioned by name. */
export function nameSuggestions(people: string[], texts: string[]): string[] {
  const seen = new Set(people.map(p => p.toLowerCase()))
  const extra: string[] = []
  for (const t of texts) {
    for (const m of t.matchAll(/@([A-Za-z][\w.]{1,24})/g)) {
      const n = m[1]
      if (/^(everyone|all|here|channel)$/i.test(n) || seen.has(n.toLowerCase())) continue
      seen.add(n.toLowerCase())
      extra.push(n)
    }
  }
  return [...people, ...extra]
}
