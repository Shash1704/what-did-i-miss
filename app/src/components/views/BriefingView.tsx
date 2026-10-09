import { Fragment } from 'react'
import { fmtWhen } from '../../core/analyze'
import { isClosed, taskPriority } from '../../core/briefing'
import { fmtDuration, fmtTime, plural } from '../../core/format'
import { cleanTitle } from '../../core/insights'
import type { Assistant } from '../../hooks/useAssistant'
import type { ChatSession, SincePreset } from '../../hooks/useChatSession'
import { MODELS } from '../../services/llm'
import type { Nav } from '../nav'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icon'
import { Prose } from '../ui/Text'

const SOURCE_LABEL: Record<string, string> = { demo: 'Demo', whatsapp: 'WhatsApp', telegram: 'Telegram', 'telegram-live': 'Telegram live', text: 'Pasted' }

/** The home screen: answer first. Headline, AI catch-up, next deadline, your tasks, recent decisions. */
export function BriefingView({ s, ai, nav, live }: { s: ChatSession; ai: Assistant; nav: Nav; live: boolean }) {
  const a = s.analysis!
  const b = s.briefing!
  const away = fmtDuration(a.now.getTime() - (s.lastRead?.ts.getTime() ?? a.now.getTime()))
  const first = s.myName.split(/\s+/)[0]

  return (
    <div className="bento brief">
      <section className="tile span-8 catchup">
        <div className="eyebrow">
          <span className={`pill-btn sm src-${s.source}`}><i className="src-dot" />{SOURCE_LABEL[s.source]} · {s.chatName}{live ? ' ●' : ''}</span>
          <label className="since-pill" title="What counts as missed">
            <Icon name="calendar" size={14} />
            <select value={s.sincePreset} onChange={e => s.applySince(e.target.value as SincePreset)} aria-label="What counts as missed">
              {s.visitIdx > 0 && <option value="visit">Since my last visit</option>}
              <option value="mine">Since my last message</option>
              <option value="1h">Last hour</option>
              <option value="today">Today</option>
              <option value="24h">Last 24 hours</option>
              <option value="all">Everything</option>
              {s.sincePreset === 'custom' && <option value="custom">Since {s.lastRead ? fmtTime(s.lastRead.ts) : 'start'}</option>}
            </select>
            <span className="sp-range">{s.lastRead ? fmtTime(s.lastRead.ts) : 'start'} → {fmtTime(a.now)} · away {away}</span>
          </label>
        </div>
        {/\p{L}/u.test(s.myName) && s.myName !== 'You' && <div className="greeting">Hi {first} 👋</div>}
        <h1>You missed {plural(a.stats.unread, 'message')}.<br /><span>{b.openTasks ? `${b.openTasks} need${b.openTasks === 1 ? 's' : ''} you.` : 'Nothing needs you.'}</span></h1>
        <div className="facts">
          <span><b>{b.due24.length}</b> due in 24h</span>
          <span><b>{a.decisions.length}</b> decisions</span>
          <span><b>{Math.round(b.noise * 100)}%</b> was chatter</span>
        </div>
        <AiCatchup ai={ai} />
      </section>

      <section className="tile span-4 orange-tile next-up">
        <div className="silhouette">?</div>
        <span className="nu-label">Next up</span>
        {b.nextDue ? (
          <>
            <div className="nu-when">{fmtWhen(b.nextDue.deadline!, a.now).split(' · ')[1]}</div>
            <div className="nu-title">{cleanTitle(b.nextDue.msg.text, s.people)}</div>
            <div className="nu-meta">{b.nextDue.msg.author} · due {fmtTime(b.nextDue.deadline!)}</div>
            <button className="nu-btn" onClick={() => nav.jump(b.nextDue!.msg.id)}>Open message <Icon name="arrow" size={16} /></button>
          </>
        ) : <div className="nu-title">Nothing due soon 🎉</div>}
      </section>

      <section className="tile span-8" id="todos">
        <div className="tile-head">
          <div><h3>Needs you</h3><small className="sub">Someone named you or asked you directly</small></div>
          <span className="pill-btn sm">{b.doneCount}/{b.myTodos.length} done</span>
        </div>
        <NeedsYou s={s} ai={ai} nav={nav} />
      </section>

      <section className="tile span-4">
        <div className="tile-head"><h3>Decided while you were away</h3></div>
        <div className="mini-list">
          {a.decisions.length === 0 && <p className="sub">No decisions spotted.</p>}
          {a.decisions.slice(-4).toReversed().map(d => (
            <button key={d.msg.id} className="ml-row" onClick={() => nav.jump(d.msg.id)}>
              <Avatar name={d.msg.author} size={24} />
              <span>{cleanTitle(d.msg.text, s.people)}</span>
            </button>
          ))}
        </div>
      </section>

      <button className="see-more span-12" onClick={() => nav.go('insights')}>
        <span><b>See all insights</b><small>Deadline calendar · chat activity · hot topics · full inbox</small></span>
        <span className="circ-btn"><Icon name="arrow" size={18} /></span>
      </button>
    </div>
  )
}

function AiCatchup({ ai }: { ai: Assistant }) {
  const idle = ai.status === 'idle' || ai.status === 'ready'
  return (
    <div className="ai-inline">
      <div className="ai-row">
        <span className="ai-name"><Icon name="sparkle" size={15} /> AI catch-up <small>{ai.modelName} · on this device{ai.modelNote && ai.status !== 'done' ? ` · ${ai.modelNote.toLowerCase()}` : ''}</small></span>
        {(ai.status === 'done' || ai.status === 'error') && <button className="btn-link" onClick={() => void ai.runSummary()}>Regenerate</button>}
        {ai.status === 'generating' && <button className="btn-link" onClick={ai.stop}>Stop</button>}
      </div>
      {ai.status === 'unsupported' && <p className="prose dim">This browser has no WebGPU, so the on-device AI summary isn't available here. Everything else works offline.</p>}
      {idle && !ai.summary && <p className="prose dim">Get a 3-sentence summary written by an AI running in this tab. {ai.cached ? 'Model cached · works offline.' : 'One-time model download, then it works offline.'}</p>}
      {ai.status === 'loading' && <div className="progress" role="status"><div className="bar"><div style={{ width: `${ai.progress.pct}%` }} /></div><small>{ai.progress.text || 'Starting…'}</small></div>}
      {ai.status === 'error' && <p className="prose dim err" role="alert">{ai.progress.text}</p>}
      {ai.summary && <Prose text={ai.summary} />}
      {ai.status === 'generating' && <span className="cursor">▍</span>}
      {ai.status === 'done' && <small className="sub">Written on your device in {(ai.genMs / 1000).toFixed(1)}s</small>}
      {(idle || ai.status === 'error') && (
        <div className="ai-actions">
          <button className="btn-orange" onClick={() => void ai.runSummary()}><Icon name="sparkle" size={16} /> Summarize</button>
          <select className="model" value={ai.modelId} title={ai.modelNote} onChange={e => ai.chooseModel(e.target.value)} disabled={ai.status === 'ready'} aria-label="AI model">
            {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
      )}
    </div>
  )
}

function NeedsYou({ s, ai, nav }: { s: ChatSession; ai: Assistant; nav: Nav }) {
  const a = s.analysis!
  const b = s.briefing!
  return (
    <div className="todo-panel">
      {b.myTodos.length === 0 && <p className="sub">Nothing assigned to you 🎉</p>}
      {b.todoGroups.map(({ group, items }) => (
        <div key={group} className="todo-group">
          <div className="tg-label">{group}</div>
          {items.map(t => {
            const prio = taskPriority(t, a.now)
            const draft = ai.drafts[t.msg.id]
            const busy = draft?.status === 'loading' || draft?.status === 'writing'
            return (
              <Fragment key={t.msg.id}>
                <div className={`todo-row ${isClosed(t, s.ticked) ? 'is-done' : ''} ${t.msg.id === b.topTaskId ? 'top' : ''}`}>
                  <button className="tick" onClick={() => s.toggleTicked(t.msg.id)} aria-label="Mark done" aria-pressed={isClosed(t, s.ticked)} />
                  <span className="t-text" title={t.msg.text} onClick={() => nav.jump(t.msg.id)}>
                    <span className="t-title">{cleanTitle(t.msg.text, s.people)}</span>
                    <small>{t.msg.author}{t.deadline ? ` · due ${fmtWhen(t.deadline, a.now)}` : ''}</small>
                  </span>
                  <span className={`prio ${prio.toLowerCase()}`}>{prio}</span>
                  {ai.status !== 'unsupported' && (
                    <button className="reply-btn" title="Draft a reply with the on-device AI" disabled={ai.status === 'generating' || busy} onClick={() => void ai.makeDraft(t)}>
                      <Icon name="reply" size={14} />{draft ? 'Redo' : 'Reply'}
                    </button>
                  )}
                </div>
                {draft && (
                  <div className={`draft ${draft.status}`} aria-live="polite">
                    <span className="draft-text">{draft.text}{draft.status === 'writing' && <span className="cursor">▍</span>}</span>
                    {draft.status === 'done' && <button className="copy-btn" onClick={() => void ai.copyDraft(t.msg.id)}><Icon name="copy" size={13} />{draft.copied ? 'Copied!' : 'Copy'}</button>}
                  </div>
                )}
              </Fragment>
            )
          })}
        </div>
      ))}
    </div>
  )
}
