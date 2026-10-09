/**
 * Performance budget: a very busy group (10,000 messages) must be parsed and fully analysed
 * fast enough to feel instant. Runs in CI; the measured times are printed.
 */
import { describe, expect, it } from 'vitest'
import { analyze } from '../core/analyze'
import { buildBriefing } from '../core/briefing'
import { parseChat, participants } from '../core/parser'

const PEOPLE = ['Ananya', 'Rohan', 'Priya', 'Karthik', 'Meera', 'Arjun', 'Sneha', 'Shashwat']
const LINES = [
  'lol', 'ok', 'who is coming tonight?', 'Decided: we meet at 6pm', '@Shashwat can you send the deck by 5pm today?',
  'Karthik please pay the advance by Thursday', 'urgent!! the venue changed', 'nice', 'kal tak slides bhej dena', 'done ✅',
]

const pad = (x: number) => String(x).padStart(2, '0')

function bigChat(n: number): string {
  const start = new Date(2026, 9, 1, 8, 0).getTime()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(start + i * 45_000)
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())} - ${PEOPLE[i % PEOPLE.length]}: ${LINES[(i * 7) % LINES.length]}`
  }).join('\n')
}

describe('performance', () => {
  it('parses and analyses 10,000 messages within budget', () => {
    const text = bigChat(10_000)
    const t0 = performance.now()
    const msgs = parseChat(text)
    const t1 = performance.now()
    const a = analyze(msgs, 'Shashwat', 0, participants(msgs))
    const t2 = performance.now()
    buildBriefing(a, 'Shashwat', 'Shashwat', new Set())
    const t3 = performance.now()
    console.log(`10k messages → parse ${(t1 - t0).toFixed(0)} ms · analyse ${(t2 - t1).toFixed(0)} ms · briefing ${(t3 - t2).toFixed(0)} ms`)
    expect(msgs).toHaveLength(10_000)
    expect(t3 - t0).toBeLessThan(4000) // generous budget for slow CI machines
  })
})
