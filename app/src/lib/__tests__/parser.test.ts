import { describe, expect, it } from 'vitest'
import { detectDateOrder, parseChat, participants } from '../parser'

const NNBSP = ' ', LRM = '‎'
const day = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]

describe('parseChat: WhatsApp formats', () => {
  it('parses Android 24h and 12h lines', () => {
    const msgs = parseChat('09/10/2026, 14:05 - Ananya: hi\n9/10/26, 2:06 pm - Rohan: hello')
    expect(msgs.map(m => m.author)).toEqual(['Ananya', 'Rohan'])
    expect(day(msgs[0].ts)).toEqual([2026, 10, 9, 14, 5])
    expect(day(msgs[1].ts)).toEqual([2026, 10, 9, 14, 6])
  })

  it('parses iOS lines with narrow no-break space and left-to-right marks', () => {
    const msgs = parseChat(`[09/10/26, 9:05:40${NNBSP}PM] Ananya: hey\n${LRM}[09/10/26, 9:06:02${NNBSP}AM] Rohan: ${LRM}yo`)
    expect(msgs.map(m => [m.author, m.text])).toEqual([['Ananya', 'hey'], ['Rohan', 'yo']])
    expect(day(msgs[0].ts)).toEqual([2026, 10, 9, 21, 5])
    expect(day(msgs[1].ts)).toEqual([2026, 10, 9, 9, 6])
  })

  it('treats 12 AM as midnight and 12 PM as noon', () => {
    const [a, b] = parseChat('1/10/26, 12:30 am - A: x\n1/10/26, 12:30 pm - A: y')
    expect(a.ts.getHours()).toBe(0)
    expect(b.ts.getHours()).toBe(12)
  })

  it('joins multi-line messages and drops system lines', () => {
    const msgs = parseChat([
      '09/10/2026, 09:00 - Messages and calls are end-to-end encrypted. Tap to learn more.',
      '09/10/2026, 09:01 - Priya: first line',
      'second line',
      '09/10/2026, 09:02 - Rohan: <Media omitted>',
      '09/10/2026, 09:03 - Rohan: This message was deleted',
    ].join('\n'))
    expect(msgs).toHaveLength(1)
    expect(msgs[0].text).toBe('first line\nsecond line')
  })

  it('strips the "~" WhatsApp adds before non-contacts', () => {
    const msgs = parseChat(`[08/10/26, 9:01:12${NNBSP}PM] ~${NNBSP}Nishitha: hi`)
    expect(msgs[0].author).toBe('Nishitha')
  })

  it('falls back to "Name: message" for pasted chats', () => {
    const msgs = parseChat('Ananya: can you send the deck?\nRohan: on it')
    expect(msgs.map(m => m.author)).toEqual(['Ananya', 'Rohan'])
    expect(msgs[1].ts.getTime()).toBeGreaterThan(msgs[0].ts.getTime())
  })

  it('ranks participants by message count', () => {
    const msgs = parseChat('A: 1\nB: 2\nB: 3')
    expect(participants(msgs)).toEqual(['B', 'A'])
  })
})

describe('detectDateOrder', () => {
  it('detects day-first when a first number exceeds 12', () => {
    expect(detectDateOrder([[9, 10, '26'], [13, 10, '26']])).toBe('DMY')
  })
  it('detects month-first when a second number exceeds 12', () => {
    expect(detectDateOrder([[10, 9, '26'], [10, 13, '26']])).toBe('MDY')
  })
  it('uses chronology when every date is ambiguous', () => {
    // 12/9 → 1/10 runs forwards only as day-first (12 Sep → 1 Oct)
    expect(detectDateOrder([[12, 9, '26'], [1, 10, '26']])).toBe('DMY')
    // 9/12 → 10/1 runs forwards only as month-first (Sep 12 → Oct 1)
    expect(detectDateOrder([[9, 12, '26'], [10, 1, '26']])).toBe('MDY')
  })
  it('parses a US export with the right dates', () => {
    const msgs = parseChat('10/9/26, 9:01 PM - A: hi\n10/13/26, 8:00 AM - B: later')
    expect(day(msgs[0].ts)).toEqual([2026, 10, 9, 21, 1])
    expect(day(msgs[1].ts)).toEqual([2026, 10, 13, 8, 0])
  })
})
