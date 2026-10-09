import { describe, expect, it } from 'vitest'
import { analyze } from '../analyze'
import { buildBriefing, isClosed, taskGroup, taskPriority, taskStatus } from '../briefing'
import { buildIcs } from '../calendar'
import { mergeMessages } from '../merge'
import { parseChat, participants } from '../parser'

const chat = parseChat([
  '09/10/2026, 09:00 - Shashwat: heading out',
  '09/10/2026, 09:30 - Ananya: @Shashwat can you send the sponsor deck by 5pm today? Urgent!!',
  '09/10/2026, 09:40 - Rohan: Shashwat please book the hall by Monday',
  '09/10/2026, 09:45 - Meera: lol',
  '09/10/2026, 09:50 - Priya: Final: venue moved to Main Auditorium.',
  '09/10/2026, 10:00 - Rohan: Karthik can you pay the DJ advance by tomorrow?',
  '09/10/2026, 10:05 - Karthik: sure, will do',
].join('\n'))
const a = analyze(chat, 'Shashwat', 1, participants(chat))
const none = new Set<number>()
const b = buildBriefing(a, 'Shashwat', 'Shashwat', none)
const find = (needle: string) => a.scored.find(s => s.msg.text.includes(needle))!

describe('briefing view-model', () => {
  it('splits your tasks from others and counts open ones', () => {
    expect(b.myTodos.map(s => s.msg.author)).toEqual(['Ananya', 'Rohan'])
    expect(b.otherTodos.map(s => s.owner)).toEqual(['Karthik'])
    expect(b.openTasks).toBe(2)
  })

  it('groups and prioritises your tasks by deadline', () => {
    expect(taskGroup(find('sponsor deck'), a.now)).toBe('Today')
    expect(taskPriority(find('sponsor deck'), a.now)).toBe('High')
    expect(b.todoGroups[0].group).toBe('Today')
    expect(b.topTaskId).toBe(find('sponsor deck').msg.id)
  })

  it('treats ticked or chat-confirmed tasks as closed', () => {
    const ticked = new Set([find('sponsor deck').msg.id])
    expect(isClosed(find('sponsor deck'), ticked)).toBe(true)
    expect(buildBriefing(a, 'Shashwat', 'Shashwat', ticked).openTasks).toBe(1)
    expect(taskStatus(find('DJ advance'), a.now, none)).toEqual({ cls: 'claimed', label: 'Karthik is on it' })
  })

  it('finds the next deadline and decisions', () => {
    expect(b.nextDue?.msg.text).toContain('sponsor deck')
    expect(b.latestDecision?.msg.author).toBe('Priya')
    expect(b.noise).toBeGreaterThan(0)
  })
})

describe('calendar export', () => {
  it('writes a valid VEVENT per deadline with a 1-hour reminder', () => {
    const ics = buildIcs(b.upcoming, { chatName: 'Fest; Ops', titleOf: s => s.msg.text, now: new Date(Date.UTC(2026, 9, 9)) })
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(b.upcoming.length)
    expect(ics).toContain('TRIGGER:-PT1H')
    expect(ics).toContain(String.raw`Fest\; Ops`) // special characters are escaped
    expect(ics.includes('\r\n')).toBe(true)
  })
})

describe('merging multi-file exports', () => {
  it('orders chronologically and drops duplicates', () => {
    const p1 = parseChat('09/10/2026, 10:00 - A: second\n09/10/2026, 09:00 - B: first')
    const p2 = parseChat('09/10/2026, 09:00 - B: first\n09/10/2026, 11:00 - C: third')
    const merged = mergeMessages([p1, p2])
    expect(merged.map(m => m.text)).toEqual(['first', 'second', 'third'])
    expect(merged.map(m => m.id)).toEqual([0, 1, 2])
  })
})
