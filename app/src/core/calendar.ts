/** iCalendar (.ics) export of deadlines, so they open in Apple / Google / Outlook Calendar. Pure. */
import type { Scored } from './analyze'

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const escapeText = (t: string) => t.replace(/[\\;,]/g, m => `\\${m}`).replace(/\n/g, '\\n')

export function buildIcs(items: Scored[], opts: { chatName: string; titleOf: (s: Scored) => string; now?: Date }): string {
  const now = opts.now ?? new Date()
  const events = items.filter(s => s.deadline).map(s => [
    'BEGIN:VEVENT',
    `UID:wdim-${s.msg.ts.getTime()}-${s.msg.id}@whatdidimiss`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(s.deadline!)}`,
    `DTEND:${stamp(new Date(s.deadline!.getTime() + 30 * 60_000))}`,
    `SUMMARY:${escapeText(opts.titleOf(s).slice(0, 90))}`,
    `DESCRIPTION:${escapeText(`From ${s.msg.author} in ${opts.chatName}: ${s.msg.text}`)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Deadline in 1 hour', 'END:VALARM',
    'END:VEVENT',
  ].join('\r\n'))
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//What Did I Miss//EN', ...events, 'END:VCALENDAR'].join('\r\n')
}
