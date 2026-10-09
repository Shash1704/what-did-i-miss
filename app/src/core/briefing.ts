/**
 * Briefing view-model: turns an Analysis into exactly what the screens show (your tasks grouped
 * and prioritised, the next deadline, KPI figures, statuses). Pure and framework-free, so every
 * rule here is unit-tested independently of React.
 */
import { fmtWhen, type Analysis, type Scored } from './analyze'
import { isMe } from './identity'

const DAY = 86_400_000
const HOUR = 3_600_000

export type TaskPriority = 'High' | 'Medium' | 'Low'
export type TaskGroup = 'Today' | 'Tomorrow' | 'Upcoming' | 'Anytime'
export interface TaskStatus { cls: 'done' | 'claimed' | 'late' | 'prog'; label: string }

const startOfDay = (d: Date) => new Date(d).setHours(0, 0, 0, 0)
const firstName = (name: string) => name.split(/\s+/)[0]

/** High: urgent or due within 12h · Medium: due within 48h or relevant · Low: everything else. */
export function taskPriority(s: Scored, now: Date): TaskPriority {
  const hrs = s.deadline ? (s.deadline.getTime() - now.getTime()) / HOUR : Infinity
  if (s.priority === 'urgent' || hrs < 12) return 'High'
  if (hrs < 48 || s.priority === 'relevant') return 'Medium'
  return 'Low'
}

export function taskGroup(s: Scored, now: Date): TaskGroup {
  if (!s.deadline) return 'Anytime'
  const diff = Math.round((startOfDay(s.deadline) - startOfDay(now)) / DAY)
  return diff <= 0 ? 'Today' : diff === 1 ? 'Tomorrow' : 'Upcoming'
}

/** A task is closed if the user ticked it, or the chat shows it was finished ("done", "sent ✅"…). */
export const isClosed = (s: Scored, ticked: ReadonlySet<number>): boolean => ticked.has(s.msg.id) || s.resolution?.kind === 'done'

export function taskStatus(s: Scored, now: Date, ticked: ReadonlySet<number>): TaskStatus {
  if (isClosed(s, ticked)) {
    const byChat = s.resolution?.kind === 'done' && !ticked.has(s.msg.id)
    return { cls: 'done', label: byChat ? `done by ${firstName(s.resolution!.by)}` : 'done' }
  }
  if (s.resolution?.kind === 'claimed') return { cls: 'claimed', label: `${firstName(s.resolution.by)} is on it` }
  if (!s.deadline) return { cls: 'prog', label: 'open' }
  return { cls: s.deadline.getTime() - now.getTime() < DAY ? 'late' : 'prog', label: fmtWhen(s.deadline, now).split(' · ')[1] }
}

export interface Briefing {
  myTodos: Scored[]
  otherTodos: Scored[]
  todoGroups: { group: TaskGroup; items: Scored[] }[]
  topTaskId?: number
  openTasks: number
  doneCount: number
  inbox: Scored[]
  fyi: Scored[]
  /** Share of unread messages that were just chatter (0–1). */
  noise: number
  upcoming: Scored[]
  nextDue?: Scored
  due24: Scored[]
  questions: number
  latestDecision?: Scored
}

export function buildBriefing(a: Analysis, identity: string, myName: string, ticked: ReadonlySet<number>): Briefing {
  const myTodos = a.actions.filter(s => s.owner === myName)
  const fromOthers = a.scored.filter(s => !isMe(s.msg.author, identity))
  const inbox = fromOthers.filter(s => s.priority !== 'fyi').toSorted((x, y) => y.score - x.score)
  const fyi = fromOthers.filter(s => s.priority === 'fyi')
  const upcoming = a.deadlines.filter(s => s.deadline!.getTime() >= a.now.getTime())
  const order: TaskGroup[] = ['Today', 'Tomorrow', 'Upcoming', 'Anytime']
  const todoGroups = order
    .map(group => ({ group, items: myTodos.filter(s => taskGroup(s, a.now) === group) }))
    .filter(g => g.items.length)

  return {
    myTodos,
    otherTodos: a.actions.filter(s => s.owner !== myName),
    todoGroups,
    topTaskId: todoGroups.flatMap(g => g.items).find(s => !isClosed(s, ticked))?.msg.id,
    openTasks: myTodos.filter(s => !isClosed(s, ticked)).length,
    doneCount: myTodos.filter(s => isClosed(s, ticked)).length,
    inbox,
    fyi,
    noise: a.unread.length ? fyi.length / a.unread.length : 0,
    upcoming,
    nextDue: upcoming[0],
    due24: upcoming.filter(s => s.deadline!.getTime() - a.now.getTime() < DAY),
    questions: a.mentions.filter(s => s.flags.some(f => f.kind === 'question')).length,
    latestDecision: a.decisions.at(-1),
  }
}
