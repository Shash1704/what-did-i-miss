import { useEffect, useMemo, useRef, useState } from 'react'
import { parseChat, participants, type Message } from './lib/parser'
import { analyze, fmtWhen, type Scored, type Priority } from './lib/analyze'
import { MODELS, hasWebGPU, isCached, loadModel, summarize } from './lib/llm'
import { buildDemoChat, DEMO_ME, DEMO_LAST_READ, DEMO_NAME } from './data/demo'
import './App.css'

type LlmState = 'idle' | 'loading' | 'ready' | 'generating' | 'done' | 'error' | 'unsupported'

const PRIORITY_META: Record<Priority, { label: string; dot: string }> = {
  urgent: { label: 'Urgent', dot: '🔴' },
  relevant: { label: 'Relevant', dot: '🟡' },
  fyi: { label: 'FYI', dot: '⚪' },
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function fmtDuration(ms: number) {
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.round(h / 24)}d`
}

function Markdown({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>)
  const blocks: React.ReactNode[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>)
    list = []
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const bullet = line.match(/^[-*•]\s+(.*)$/) || line.match(/^\d+\.\s+(.*)$/)
    if (bullet) { list.push(bullet[1]); continue }
    flush()
    const h = line.match(/^(?:#+\s*)?\*\*(.+?)\*\*:?$/) || line.match(/^#+\s*(.+)$/)
    blocks.push(h ? <h4 key={blocks.length}>{h[1]}</h4> : <p key={blocks.length}>{inline(line)}</p>)
  }
  flush()
  return <div className="md">{blocks}</div>
}

function highlight(text: string, me: string) {
  const first = me.split(/\s+/)[0]
  const re = new RegExp(`(@?${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b|@everyone)`, 'gi')
  return text.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))
}

export default function App() {
  const [raw, setRaw] = useState<string | null>(null)
  const [chatName, setChatName] = useState('')
  const [me, setMe] = useState('')
  const [sinceIdx, setSinceIdx] = useState(0)
  const [tab, setTab] = useState<'brief' | 'chat'>('brief')
  const [paste, setPaste] = useState('')
  const [dragging, setDragging] = useState(false)
  const [done, setDone] = useState<Set<number>>(new Set())
  const [showFyi, setShowFyi] = useState(false)
  const [flashId, setFlashId] = useState<number | null>(null)

  const [modelId, setModelId] = useState(MODELS[0].id)
  const [llm, setLlm] = useState<LlmState>(hasWebGPU() ? 'idle' : 'unsupported')
  const [progress, setProgress] = useState({ pct: 0, text: '' })
  const [summary, setSummary] = useState('')
  const [cached, setCached] = useState(false)
  const [genMs, setGenMs] = useState(0)
  const cancel = useRef({ cancelled: false })
  const online = useOnline()

  const msgs: Message[] = useMemo(() => (raw ? parseChat(raw) : []), [raw])
  const people = useMemo(() => participants(msgs), [msgs])
  const a = useMemo(() => (msgs.length && me ? analyze(msgs, me, sinceIdx, people) : null), [msgs, me, sinceIdx, people])

  useEffect(() => { isCached(modelId).then(setCached) }, [modelId, llm])

  function open(text: string, name: string, meGuess?: string, lastRead?: number) {
    const parsed = parseChat(text)
    if (!parsed.length) { alert("Couldn't find any messages. Paste a WhatsApp export or lines like \"Name: message\"."); return }
    const ppl = participants(parsed)
    setRaw(text)
    setChatName(name)
    setMe(meGuess && ppl.includes(meGuess) ? meGuess : ppl[0])
    setSinceIdx(lastRead ?? Math.floor(parsed.length * 0.2))
    setSummary('')
    setDone(new Set())
    setTab('brief')
    if (llm === 'done') setLlm('ready')
  }

  function onFile(f: File) {
    f.text().then(t => open(t, f.name.replace(/^WhatsApp Chat with /i, '').replace(/\.txt$/i, '')))
  }

  async function runAI() {
    if (!a) return
    cancel.current = { cancelled: false }
    try {
      setLlm('loading')
      await loadModel(modelId, r => setProgress({ pct: Math.round(r.progress * 100), text: r.text }))
      setLlm('generating')
      setSummary('')
      const t0 = performance.now()
      await summarize(a, me, setSummary, cancel.current)
      setGenMs(performance.now() - t0)
      setLlm('done')
    } catch (e) {
      console.error(e)
      setProgress({ pct: 0, text: String((e as Error).message || e) })
      setLlm('error')
    }
  }

  function jump(id: number) {
    setTab('chat')
    setFlashId(id)
    setTimeout(() => document.getElementById(`m${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
    setTimeout(() => setFlashId(null), 2500)
  }

  const badge = (
    <div className={`privacy ${online ? '' : 'offline'}`} title="Your chat is parsed and summarized entirely inside this browser tab. Nothing is uploaded.">
      <span className="lock">🔒</span> 100% on-device · 0 bytes sent
      <span className="net">{online ? '● online' : '✈ offline'}</span>
    </div>
  )

  // ---------------- Landing ----------------
  if (!a) {
    return (
      <div className="landing">
        <header className="topbar">
          <div className="logo">👀 What Did I Miss?</div>
          {badge}
        </header>
        <main className="hero">
          <h1>200 unread messages.<br /><span>Catch up in 10 seconds.</span></h1>
          <p className="sub">Drop in a group chat. Get your mentions, deadlines, decisions and to-dos, prioritized by urgency, plus an AI summary that runs <b>entirely on your device</b>. Your chats never leave your device.</p>
          <div className="cta">
            <button className="primary big" onClick={() => open(buildDemoChat(), DEMO_NAME, DEMO_ME, DEMO_LAST_READ)}>⚡ Try the demo chat</button>
          </div>
          <div
            className={`drop ${dragging ? 'over' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
          >
            <div>📂 Drop a <b>WhatsApp chat export (.txt)</b> here, or <label className="link">browse<input type="file" accept=".txt,text/plain" hidden onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} /></label></div>
            <small>WhatsApp → open chat → ⋮ → More → Export chat → Without media</small>
          </div>
          <details className="paste">
            <summary>…or paste chat text (Slack, Discord, Teams, anything as <code>Name: message</code>)</summary>
            <textarea value={paste} onChange={e => setPaste(e.target.value)} placeholder={'Ananya: @Shashwat can you send the deck by 5pm?\nRohan: venue is final, main auditorium'} />
            <button className="primary" disabled={!paste.trim()} onClick={() => open(paste, 'Pasted chat')}>Analyze</button>
          </details>
          <div className="features">
            <div><b>🎯 Prioritized</b><span>Urgent / Relevant / FYI scoring on every message</span></div>
            <div><b>📌 Never miss a mention</b><span>@mentions, questions to you, tasks with your name</span></div>
            <div><b>⏰ Deadline radar</b><span>"by Friday 6pm" → a real date, sorted soonest first</span></div>
            <div><b>🧠 Private AI</b><span>LLM runs in your browser via WebGPU. Works offline.</span></div>
          </div>
        </main>
      </div>
    )
  }

  // ---------------- Dashboard ----------------
  const myTodos = a.actions.filter(s => s.owner === me)
  const otherTodos = a.actions.filter(s => s.owner !== me)
  const groups: Record<Priority, Scored[]> = { urgent: [], relevant: [], fyi: [] }
  a.scored.filter(s => s.msg.author !== me).forEach(s => groups[s.priority].push(s))
  groups.urgent.sort((x, y) => y.score - x.score)
  const lastRead = msgs[Math.max(0, sinceIdx - 1)]

  const card = (s: Scored) => (
    <div key={s.msg.id} className={`item ${s.priority}`}>
      <div className="item-head">
        <b>{s.msg.author}</b>
        <span className="time">{fmtTime(s.msg.ts)}</span>
        <button className="jump" onClick={() => jump(s.msg.id)}>view in chat ↗</button>
      </div>
      <div className="item-text">{highlight(s.msg.text, me)}</div>
      {s.flags.length > 0 && <div className="chips">{s.flags.map((f, i) => <span key={i} className={`chip ${f.kind}`}>{f.label}</span>)}</div>}
    </div>
  )

  return (
    <div className="dash">
      <header className="topbar">
        <div className="logo" onClick={() => setRaw(null)} role="button">👀 What Did I Miss?</div>
        <div className="chatname">💬 {chatName}</div>
        <label className="me">I am
          <select value={me} onChange={e => { setMe(e.target.value); setSummary(''); if (llm === 'done') setLlm('ready') }}>
            {people.map(p => <option key={p}>{p}</option>)}
          </select>
        </label>
        {badge}
        <button className="ghost" onClick={() => setRaw(null)}>New chat</button>
      </header>

      <section className="since">
        <div className="since-label">
          <b>Last read:</b> {lastRead ? `${lastRead.author} at ${fmtTime(lastRead.ts)}` : 'nothing'} · away <b>{fmtDuration(a.now.getTime() - (lastRead?.ts.getTime() ?? a.now.getTime()))}</b>
        </div>
        <input type="range" min={0} max={msgs.length - 1} value={sinceIdx} onChange={e => { setSinceIdx(+e.target.value); setSummary(''); if (llm === 'done') setLlm('ready') }} />
      </section>

      <section className="stats">
        <div><b>{a.stats.unread}</b><span>unread</span></div>
        <div className="s-urgent"><b>{a.stats.urgent}</b><span>urgent</span></div>
        <div className="s-mention"><b>{a.stats.mentions}</b><span>mention you</span></div>
        <div className="s-deadline"><b>{a.stats.deadlines}</b><span>deadlines</span></div>
        <div className="s-action"><b>{myTodos.length}</b><span>tasks for you</span></div>
        <div className="s-saved"><b>~{a.stats.minutesSaved}m</b><span>reading saved</span></div>
      </section>

      <nav className="tabs">
        <button className={tab === 'brief' ? 'on' : ''} onClick={() => setTab('brief')}>Briefing</button>
        <button className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>Full chat ({msgs.length})</button>
      </nav>

      {tab === 'brief' ? (
        <div className="grid">
          <div className="col">
            <section className="panel ai">
              <div className="panel-head">
                <h3>🧠 AI catch-up <small>on-device LLM</small></h3>
                {(llm === 'idle' || llm === 'ready' || llm === 'done' || llm === 'error') && (
                  <div className="ai-controls">
                    <select value={modelId} onChange={e => setModelId(e.target.value)} disabled={llm === 'ready' || llm === 'done'}>
                      {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                    <button className="primary" onClick={runAI}>{llm === 'done' ? '↻ Regenerate' : '✨ Summarize'}</button>
                  </div>
                )}
                {llm === 'generating' && <button className="ghost" onClick={() => (cancel.current.cancelled = true)}>Stop</button>}
              </div>

              {llm === 'unsupported' && <p className="muted">This browser has no WebGPU, so the on-device LLM is unavailable. Everything below still works offline using the local rule engine. Try Chrome or Edge on desktop for the AI summary.</p>}
              {llm === 'idle' && !summary && <p className="muted">{cached ? '✅ Model is cached on this device and works offline. ' : 'First run downloads the model once (cached afterwards, then it works offline). '}Your messages are processed by a language model running in this tab through WebGPU. No server, no API calls.</p>}
              {llm === 'loading' && (
                <div className="progress">
                  <div className="bar"><div style={{ width: `${progress.pct}%` }} /></div>
                  <small>{progress.text || 'Starting…'}</small>
                </div>
              )}
              {llm === 'error' && <p className="err">⚠️ {progress.text}</p>}
              {summary && <Markdown text={summary} />}
              {llm === 'generating' && <span className="cursor">▍</span>}
              {llm === 'done' && <small className="muted">Generated on your device in {(genMs / 1000).toFixed(1)}s · {MODELS.find(m => m.id === modelId)?.label.split(' (')[0]}</small>}
            </section>

            <section className="panel">
              <div className="panel-head"><h3>📥 Priority inbox</h3></div>
              {(['urgent', 'relevant'] as Priority[]).map(p => groups[p].length > 0 && (
                <div key={p} className="group">
                  <h5>{PRIORITY_META[p].dot} {PRIORITY_META[p].label} <span>{groups[p].length}</span></h5>
                  {groups[p].map(card)}
                </div>
              ))}
              <div className="group">
                <h5 className="toggle" onClick={() => setShowFyi(!showFyi)}>{PRIORITY_META.fyi.dot} FYI / chatter <span>{groups.fyi.length}</span> <small>{showFyi ? 'hide' : 'show'}</small></h5>
                {showFyi && groups.fyi.map(card)}
              </div>
            </section>
          </div>

          <div className="col side">
            <section className="panel">
              <div className="panel-head"><h3>✅ Your to-dos</h3></div>
              {myTodos.length === 0 && <p className="muted">Nothing assigned to you 🎉</p>}
              {myTodos.map(s => (
                <label key={s.msg.id} className={`todo ${done.has(s.msg.id) ? 'done' : ''}`}>
                  <input type="checkbox" checked={done.has(s.msg.id)} onChange={() => setDone(d => { const n = new Set(d); n.has(s.msg.id) ? n.delete(s.msg.id) : n.add(s.msg.id); return n })} />
                  <div>
                    <div>{s.msg.text}</div>
                    <small>from {s.msg.author}{s.deadline && <> · <b className="due">⏰ {fmtWhen(s.deadline, a.now)}</b></>} · <a onClick={() => jump(s.msg.id)}>view</a></small>
                  </div>
                </label>
              ))}
            </section>

            <section className="panel">
              <div className="panel-head"><h3>⏰ Deadlines</h3></div>
              {a.deadlines.length === 0 && <p className="muted">No deadlines spotted.</p>}
              {a.deadlines.map(s => (
                <div key={s.msg.id} className="row" onClick={() => jump(s.msg.id)}>
                  <span className={`when ${s.deadline!.getTime() - a.now.getTime() < 86400000 ? 'soon' : ''}`}>{fmtWhen(s.deadline!, a.now)}</span>
                  <span className="what">{s.msg.text.slice(0, 110)}{s.msg.text.length > 110 ? '…' : ''}</span>
                </div>
              ))}
            </section>

            <section className="panel">
              <div className="panel-head"><h3>🏁 Decisions</h3></div>
              {a.decisions.length === 0 && <p className="muted">No decisions spotted.</p>}
              {a.decisions.map(s => (
                <div key={s.msg.id} className="row" onClick={() => jump(s.msg.id)}>
                  <span className="who">{s.msg.author} · {fmtTime(s.msg.ts)}</span>
                  <span className="what">{s.msg.text}</span>
                </div>
              ))}
            </section>

            <section className="panel">
              <div className="panel-head"><h3>👥 Others' tasks</h3></div>
              {otherTodos.length === 0 && <p className="muted">None.</p>}
              {otherTodos.map(s => (
                <div key={s.msg.id} className="row" onClick={() => jump(s.msg.id)}>
                  <span className="who">{s.owner ?? 'Unassigned'}</span>
                  <span className="what">{s.msg.text.slice(0, 110)}{s.msg.text.length > 110 ? '…' : ''}</span>
                </div>
              ))}
            </section>
          </div>
        </div>
      ) : (
        <section className="panel chat">
          {msgs.map((m, i) => {
            const s = i >= sinceIdx ? a.scored[i - sinceIdx] : undefined
            return (
              <div key={m.id}>
                {i === sinceIdx && <div className="unread-line">— {msgs.length - sinceIdx} unread messages —</div>}
                <div id={`m${m.id}`} className={`bubble ${m.author === me ? 'mine' : ''} ${s ? s.priority : 'read'} ${flashId === m.id ? 'flash' : ''}`}>
                  <div className="b-head"><b>{m.author}</b><span>{fmtTime(m.ts)}</span></div>
                  <div>{highlight(m.text, me)}</div>
                  {s && s.flags.length > 0 && <div className="chips">{s.flags.map((f, k) => <span key={k} className={`chip ${f.kind}`}>{f.label}</span>)}</div>}
                </div>
              </div>
            )
          })}
        </section>
      )}
      <footer>Built local-first · No servers · No tracking · Your chat stays in this tab</footer>
    </div>
  )
}
