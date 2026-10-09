import { useState } from 'react'
import { fmtWhen } from '../../core/analyze'
import { isClosed, taskStatus } from '../../core/briefing'
import { buildIcs } from '../../core/calendar'
import { fmtDuration, fmtHour, fmtTime } from '../../core/format'
import { cleanTitle, deadlineCalendar, hotTopics } from '../../core/insights'
import type { ChatSession } from '../../hooks/useChatSession'
import { downloadFile, safeFileName } from '../../services/download'
import type { Nav } from '../nav'
import { Avatar } from '../ui/Avatar'
import { Dots, Gauge } from '../ui/Charts'
import { Icon } from '../ui/Icon'
import { Highlight } from '../ui/Text'
import ActivityChart from './ActivityChart'

const TOPIC_OFFSETS = ['6%', '30%', '12%', '26%']

/** Details on demand: KPIs, deadline calendar, topics, inbox, noise, activity, decisions, others' tasks. */
export default function InsightsView({ s, nav }: { s: ChatSession; nav: Nav }) {
  const [showFyi, setShowFyi] = useState(false)
  const a = s.analysis!
  const b = s.briefing!
  const cal = deadlineCalendar(a)
  const topics = hotTopics(a, s.people)
  const noisePct = Math.round(b.noise * 100)
  const title = (t: { msg: { text: string } }) => cleanTitle(t.msg.text, s.people)

  const kpis = [
    { label: 'Mentions you', value: a.stats.mentions, unit: 'mentions', footL: 'Asked you a question', footR: String(b.questions), target: 'inbox' },
    { label: 'Due in 24 hours', value: b.due24.length, unit: 'deadlines', footL: 'Next', footR: b.nextDue ? fmtTime(b.nextDue.deadline!) : '—', target: 'deadlines' },
    { label: 'Decisions', value: a.decisions.length, unit: 'made', footL: 'Latest', footR: b.latestDecision ? fmtTime(b.latestDecision.msg.ts) : '—', target: 'decisions' },
    { label: 'Reading saved', value: `~${a.stats.minutesSaved}`, unit: 'min', footL: 'Chatter filtered', footR: `${noisePct}%`, target: 'activity' },
  ]

  const exportCalendar = () => downloadFile(
    `${safeFileName(s.chatName)} deadlines.ics`,
    buildIcs(b.upcoming, { chatName: s.chatName, titleOf: title }),
    'text/calendar',
  )

  return (
    <div className="bento">
      {kpis.map(k => (
        <section key={k.label} className="tile span-3 kpi">
          <div className="kpi-head"><h3>{k.label}</h3><button className="kpi-go" onClick={() => nav.go('insights', k.target)} title={`Go to ${k.label.toLowerCase()}`} aria-label={`Go to ${k.label.toLowerCase()}`}><Icon name="arrow" size={14} /></button></div>
          <div className="kpi-panel">
            <div className="kpi-val"><b>{k.value}</b><span>{k.unit}</span></div>
            <div className="kpi-foot"><span>{k.footL}</span><b>{k.footR}</b></div>
          </div>
        </section>
      ))}

      <section className="tile span-8 cal-tile" id="deadlines">
        <div className="cal-head">
          <span className="pill-btn">Away {fmtDuration(a.now.getTime() - (s.lastRead?.ts.getTime() ?? a.now.getTime()))}</span>
          <h3>Deadlines · {cal.days[0].toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}</h3>
          <span className="cal-actions">
            <span className="pill-btn">{cal.later ? `+${cal.later} later` : 'Next 6 days'}</span>
            {b.upcoming.length > 0 && <button className="pill-btn add-cal" onClick={exportCalendar} title="Download an .ics file for Apple / Google / Outlook Calendar"><Icon name="calendar" size={13} /> Add to calendar</button>}
          </span>
        </div>
        <div className="cal">
          <div className="cal-days">
            {cal.days.map((d, i) => <div key={d.getTime()} className={i === 0 ? 'today' : ''}><span>{d.toLocaleDateString(undefined, { weekday: 'short' })}</span><b>{d.getDate()}</b></div>)}
          </div>
          <div className="cal-body">
            <div className="cal-hours">{cal.hours.map(h => <span key={h} style={{ top: `${((h - cal.startH) / cal.span) * 100}%` }}>{fmtHour(h)}</span>)}</div>
            <div className="cal-grid">
              {cal.days.map((d, i) => <i key={d.getTime()} style={{ left: `${(i + 0.5) * (100 / cal.days.length)}%` }} />)}
              {cal.chips.length === 0 && <div className="cal-empty">No deadlines in the next 6 days 🎉</div>}
              {cal.chips.map(({ s: t, col, top }) => (
                <button
                  key={t.msg.id}
                  className={`event ${t.owner === s.myName ? 'mine' : ''} ${isClosed(t, s.ticked) ? 'done' : ''}`}
                  style={{ left: `calc(${Math.min(col, cal.days.length - 2) * (100 / cal.days.length)}% + 4px)`, top: `${top}%` }}
                  onClick={() => nav.jump(t.msg.id)}
                  title={t.msg.text}
                >
                  <span className="ev-text"><b>{title(t)}</b><small>{t.msg.author} · due {fmtTime(t.deadline!)}</small></span>
                  <Avatar name={t.msg.author} size={24} />
                </button>
              ))}
            </div>
          </div>
        </div>
        {b.nextDue && (
          <button className="next-event" onClick={() => nav.jump(b.nextDue!.msg.id)}>
            <span className="ne-label">Next deadline</span>
            <span className="ne-row"><b>{title(b.nextDue)}</b><span>{fmtWhen(b.nextDue.deadline!, a.now)}</span></span>
          </button>
        )}
        <div className="since">
          <span>Last read</span>
          <input type="range" min={0} max={s.msgs.length - 1} value={s.sinceIdx} onChange={e => s.setSinceManually(+e.target.value)} aria-label="Last read message" />
          <span>{s.lastRead ? `${s.lastRead.author}, ${fmtTime(s.lastRead.ts)}` : 'start'}</span>
        </div>
      </section>

      <section className="tile span-4 orange-tile">
        <div className="silhouette">?</div>
        <h2>Hot <span>topics</span></h2>
        <div className="orbit">
          {topics.map((t, i) => (
            <button key={t.word} className="o-pill" style={{ marginLeft: TOPIC_OFFSETS[i] }} onClick={() => nav.search(t.word)}>
              {i % 2 === 1 && <i className="o-dot l" />}{t.word}{i % 2 === 0 && <i className="o-dot r" />}
            </button>
          ))}
          {topics.length === 0 && <span className="o-pill">Nothing yet</span>}
        </div>
      </section>

      <section className="tile span-8" id="inbox">
        <div className="tile-head"><h3>Priority inbox</h3><button className="more" onClick={() => setShowFyi(v => !v)} title="Show chatter" aria-label="Toggle chatter">•••</button></div>
        <div className="well">
          <div className="well-head"><span>{b.inbox.length} need attention</span><button className="pill-btn sm" onClick={() => setShowFyi(v => !v)}>{showFyi ? 'Less' : `+${b.fyi.length} FYI`}</button></div>
          <div className="papers">
            {[...b.inbox, ...(showFyi ? b.fyi : [])].map(t => (
              <button key={t.msg.id} className={`paper ${t.priority}`} onClick={() => nav.jump(t.msg.id)}>
                <div className="p-head"><b>{t.msg.author}</b><span>{fmtTime(t.msg.ts)}</span></div>
                <div className="p-text"><Highlight text={t.msg.text} identity={s.identity} /></div>
                <div className="chips">{t.flags.slice(0, 3).map(f => <span key={f.label} className={`chip ${f.kind}`}>{f.label}</span>)}</div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="span-4 col-stack">
        <section className="tile score-tile">
          <div className="orb" />
          <h3>Unread</h3>
          <div className="score"><b>{a.stats.unread}</b><span>{a.stats.urgent} urgent<br />{a.stats.mentions} mention you</span></div>
          <Dots scored={a.scored} />
        </section>
        <section className="tile gauge-tile">
          <h3>Noise filtered</h3>
          <div className="gauge-wrap">
            <Gauge pct={b.noise} />
            <div className="gauge-label"><b>{noisePct}%</b><span>was just chatter</span></div>
          </div>
          <p className="sub center">~{a.stats.minutesSaved} min of reading saved</p>
          <button className="btn-orange wide" onClick={() => nav.go('brief', 'todos')}>Show what matters</button>
        </section>
      </div>

      <section className="tile span-12" id="activity">
        <ActivityChart msgs={s.msgs} scored={a.scored} sinceIdx={s.sinceIdx} onPick={nav.jump} />
      </section>

      <section className="tile span-6" id="decisions">
        <div className="tile-head"><h3>Decisions made</h3><span className="pill-btn sm">{a.decisions.length}</span></div>
        <div className="rows">
          {a.decisions.length === 0 && <p className="sub">No decisions spotted.</p>}
          {a.decisions.map(d => (
            <button key={d.msg.id} className="row-item clickable" onClick={() => nav.jump(d.msg.id)}>
              <Avatar name={d.msg.author} size={26} />
              <span className="r-text wrap">{title(d)}</span>
              <span className="status done">{fmtTime(d.msg.ts)}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="tile span-6">
        <div className="tile-head"><h3>Others' tasks</h3><span className="pill-btn sm">{b.otherTodos.length}</span></div>
        <div className="rows">
          {b.otherTodos.length === 0 && <p className="sub">None.</p>}
          {b.otherTodos.map(t => {
            const st = taskStatus(t, a.now, s.ticked)
            return (
              <button key={t.msg.id} className="row-item clickable" onClick={() => nav.jump(t.msg.id)}>
                <span className="tag">{t.owner ?? 'Unassigned'}</span>
                <span className="r-text wrap">{title(t)}</span>
                <span className={`status ${st.cls}`}>{st.label}</span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
