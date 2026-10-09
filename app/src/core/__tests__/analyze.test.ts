import { describe, expect, it } from 'vitest'
import { analyze } from '../analyze'
import { parseChat, participants } from '../parser'

const chat = [
  '09/10/2026, 09:00 - Shashwat: heading to labs',
  '09/10/2026, 09:30 - Ananya: @Shashwat can you send the sponsor deck by 5pm today? Urgent!!',
  '09/10/2026, 09:40 - Rohan: Final: venue moved to Main Auditorium.',
  '09/10/2026, 09:45 - Meera: lol paneer puffs today',
  '09/10/2026, 09:50 - Rohan: Karthik can you pay the DJ advance by Thursday?',
  '09/10/2026, 10:00 - Priya: what time is it',
].join('\n')

const msgs = parseChat(chat)
const a = analyze(msgs, 'Shashwat', 1, participants(msgs))
const byText = (needle: string) => a.scored.find(s => s.msg.text.includes(needle))!

describe('analyze', () => {
  it('only counts messages after the read point', () => {
    expect(a.unread).toHaveLength(5)
  })

  it('flags an urgent personal ask with its deadline', () => {
    const s = byText('sponsor deck')
    expect(s.priority).toBe('urgent')
    expect(s.owner).toBe('Shashwat')
    expect(s.flags.map(f => f.kind)).toEqual(expect.arrayContaining(['mention', 'question', 'deadline', 'action', 'urgent']))
    expect(s.deadline?.getHours()).toBe(17)
  })

  it('detects decisions without treating chatter as urgent', () => {
    expect(a.decisions.map(s => s.msg.text)).toEqual(['Final: venue moved to Main Auditorium.'])
    expect(byText('paneer').priority).toBe('fyi')
    expect(byText('what time').priority).toBe('fyi')
  })

  it("assigns other people's tasks to them", () => {
    expect(byText('DJ advance').owner).toBe('Karthik')
  })

  it('orders deadlines soonest first', () => {
    const due = a.deadlines.map(s => s.deadline!.getTime())
    expect(due).toEqual(due.toSorted((x, y) => x - y))
  })
})

describe('follow-ups', () => {
  const thread = [
    '09/10/2026, 09:00 - Shashwat: brb',
    '09/10/2026, 10:00 - Rohan: Who is handling the judges lunch? Need a name by tonight',
    '09/10/2026, 10:02 - Meera: not me',
    '09/10/2026, 10:03 - Arjun: ok fine I will take it',
    '09/10/2026, 10:10 - Priya: decided fee is 200. Please update the form',
    '09/10/2026, 10:12 - Sneha: yes mine, will update tonight',
    '09/10/2026, 11:30 - Sneha: Registration form is updated to 200 ✅',
    '09/10/2026, 11:40 - Ananya: Karthik can you pay the DJ advance by Thursday?',
    '09/10/2026, 11:45 - Meera: lol',
  ].join('\n')
  const m = parseChat(thread)
  const r = analyze(m, 'Shashwat', 1, participants(m))
  const find = (needle: string) => r.scored.find(s => s.msg.text.includes(needle))!

  it('assigns an unassigned ask to whoever claims it', () => {
    expect(find('judges lunch').owner).toBe('Arjun')
    expect(find('judges lunch').resolution?.kind).toBe('claimed')
  })
  it('marks a task done when the claimer reports completion', () => {
    const s = find('update the form')
    expect([s.owner, s.resolution?.kind]).toEqual(['Sneha', 'done'])
  })
  it('leaves tasks open when nobody follows up', () => {
    expect(find('DJ advance').resolution).toBeUndefined()
  })
})
