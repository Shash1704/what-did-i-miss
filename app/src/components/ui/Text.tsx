import { mentionPattern } from '../../core/identity'
import { escapeRe } from '../../core/format'

const FACTS = /(\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b|\b(?:today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|asap|urgent(?:ly)?|deadline)\b|₹\s?\d+)/gi

/** AI prose with the facts (times, days, deadlines) in bold so it scans fast. Renders text only, never HTML. */
export function Prose({ text }: { text: string }) {
  const clean = text.replace(/\*\*/g, '').replace(/^#+\s*/gm, '').replace(/^\s*[-*•]\s+/gm, '').replace(/[[\]]/g, '').trim()
  // Segments of a fixed string never reorder, so their index is a stable key
  // oxlint-disable-next-line react/no-array-index-key
  return <p className="prose">{clean.split(FACTS).map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</p>
}

/** A message with the user's mentions (and an optional search query) highlighted. */
export function Highlight({ text, identity, query = '' }: { text: string; identity: string; query?: string }) {
  const parts = [mentionPattern(identity), '@everyone']
  if (query.trim()) parts.push(escapeRe(query.trim()))
  const re = new RegExp(`(${parts.join('|')})`, 'gi')
  // oxlint-disable-next-line react/no-array-index-key
  return <>{text.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>
}
