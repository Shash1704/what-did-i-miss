import { fmtTime, plural } from '../../core/format'
import { isMe } from '../../core/identity'
import type { ChatSession } from '../../hooks/useChatSession'
import type { Nav } from '../nav'
import { Avatar } from '../ui/Avatar'
import { Highlight } from '../ui/Text'

/** The full chat (or local search results), with unread divider and priority highlighting. */
export default function ChatView({ s, nav, query, flashId }: { s: ChatSession; nav: Nav; query: string; flashId: number | null }) {
  const a = s.analysis!
  const q = query.trim().toLowerCase()
  const results = q ? s.msgs.filter(m => m.text.toLowerCase().includes(q) || m.author.toLowerCase().includes(q)) : null
  const list = results ?? s.msgs

  return (
    <section className="tile chat-tile">
      <div className="tile-head">
        <div>
          <h3>{results ? `${plural(results.length, 'result')} for “${query.trim()}”` : s.chatName}</h3>
          <small className="sub">{results ? 'Searched locally on this device' : `${plural(s.msgs.length, 'message')} · ${a.unread.length} unread`}</small>
        </div>
        <button className="pill-btn" onClick={() => nav.go('brief')}>Back to briefing</button>
      </div>
      <div className="chat-scroll">
        {list.map(m => {
          const scored = m.id >= s.sinceIdx ? a.scored[m.id - s.sinceIdx] : undefined
          const mine = isMe(m.author, s.identity)
          return (
            <div key={m.id} className="chat-row">
              {!results && m.id === s.sinceIdx && <div className="unread-line"><span>{s.msgs.length - s.sinceIdx} unread</span></div>}
              <div
                id={`m${m.id}`}
                className={`bubble ${mine ? 'mine' : ''} ${scored ? scored.priority : 'read'} ${flashId === m.id ? 'flash' : ''} ${results ? 'clickable' : ''}`}
                onClick={results ? () => nav.jump(m.id) : undefined}
              >
                {!mine && <Avatar name={m.author} size={28} />}
                <div className="b-body">
                  <div className="b-head"><b>{m.author}</b><span>{fmtTime(m.ts)}</span></div>
                  <div><Highlight text={m.text} identity={s.identity} query={query} /></div>
                  {scored && scored.flags.length > 0 && <div className="chips">{scored.flags.map(f => <span key={f.label} className={`chip ${f.kind}`}>{f.label}</span>)}</div>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
