import { useEffect, useMemo, useRef, useState } from 'react'
import { parseChat, participants, type Message } from './lib/parser'
import { analyze, fmtWhen, type Scored, type Priority } from './lib/analyze'
import { MODELS, hasWebGPU, isCached, loadModel, summarize } from './lib/llm'
import { buildDemoChat, DEMO_ME, DEMO_LAST_READ, DEMO_NAME } from './data/demo'
import { readChatFile, takeSharedChat } from './lib/importFile'
import './App.css'

interface InstallPrompt extends Event { prompt: () => Promise<void> }

function useInstallPrompt() {
  const [evt, setEvt] = useState<InstallPrompt | null>(null)
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setEvt(e as InstallPrompt) }
    const installed = () => setEvt(null)
    window.addEventListener('beforeinstallprompt', on)
    window.addEventListener('appinstalled', installed)
    return () => { window.removeEventListener('beforeinstallprompt', on); window.removeEventListener('appinstalled', installed) }
  }, [])
  return evt ? () => evt.prompt().finally(() => setEvt(null)) : null
}

type LlmState = 'idle' | 'loading' | 'ready' | 'generating' | 'done' | 'error' | 'unsupported'

const PRIORITY_LABEL: Record<Priority, string> = { urgent: 'Urgent', relevant: 'Relevant', fyi: 'FYI / chatter' }

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

const pad2 = (n: number) => String(n).padStart(2, '0') + '.'

function Arrow({ dir = 'right' }: { dir?: 'right' | 'down' | 'diag' | 'up' }) {
  const rot = { right: 0, down: 90, diag: 45, up: -90 }[dir]
  return (
    <svg className="arrow" viewBox="0 0 24 24" width="1em" height="1em" style={{ transform: `rotate(${rot}deg)` }} aria-hidden>
      <path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
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

function CardFoot({ n, children }: { n: number; children?: React.ReactNode }) {
  return (
    <div className="card-foot">
      <span className="num">{pad2(n)}</span>
      <div className="foot-action">{children}</div>
    </div>
  )
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
  const install = useInstallPrompt()
  const [sharedNotice, setSharedNotice] = useState(false)

  // Chat shared into the installed app from WhatsApp's share sheet (handled locally by sw.js)
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('shared')) return
    history.replaceState(null, '', location.pathname)
    takeSharedChat()
      .then(chat => { if (chat) { open(chat.text, chat.name); setSharedNotice(true); setTimeout(() => setSharedNotice(false), 5000) } })
      .catch(err => alert(`Couldn't read the shared chat: ${err.message}`))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const msgs: Message[] = useMemo(() => (raw ? parseChat(raw) : []), [raw])
  const people = useMemo(() => participants(msgs), [msgs])
  const a = useMemo(() => (msgs.length && me ? analyze(msgs, me, sinceIdx, people) : null), [msgs, me, sinceIdx, people])

  useEffect(() => { isCached(modelId).then(setCached) }, [modelId, llm])

  function resetSummary() {
    setSummary('')
    if (llm === 'done') setLlm('ready')
  }

  function open(text: string, name: string, meGuess?: string, lastRead?: number) {
    const parsed = parseChat(text)
    if (!parsed.length) { alert("Couldn't find any messages. Paste a WhatsApp export or lines like \"Name: message\"."); return }
    const ppl = participants(parsed)
    setRaw(text)
    setChatName(name)
    let remembered: string | null = null
    try { remembered = localStorage.getItem('wdim-me') } catch { /* storage unavailable */ }
    setMe(meGuess && ppl.includes(meGuess) ? meGuess : remembered && ppl.includes(remembered) ? remembered : ppl[0])
    setSinceIdx(lastRead ?? Math.floor(parsed.length * 0.2))
    setDone(new Set())
    setTab('brief')
    resetSummary()
    window.scrollTo({ top: 0 })
  }

  function onFile(f: File) {
    readChatFile(f, f.name)
      .then(chat => open(chat.text, chat.name))
      .catch(err => alert(`Couldn't read that file: ${err.message}`))
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

  const brand = <div className="brand" onClick={() => setRaw(null)} role="button">WhatDidIMiss<sup>®</sup></div>
  const badge = (
    <div className={`privacy ${online ? '' : 'offline'}`} title="Your chat is parsed and summarized entirely inside this browser tab. Nothing is uploaded.">
      <span className="dot" />{online ? 'On-device · 0 bytes sent' : 'Offline · still working'}
    </div>
  )

  // ---------------- Landing ----------------
  if (!a) {
    const tryDemo = () => open(buildDemoChat(), DEMO_NAME, DEMO_ME, DEMO_LAST_READ)
    return (
      <div className="page">
        <header className="nav">
          {brand}
          <div className="nav-right">
            {badge}
            {install && <button className="install" onClick={install}>Install app <Arrow dir="down" /></button>}
            <span className="menu"><i /><i />MENU</span>
          </div>
        </header>

        <section className="card screen-mist hero">
          <div className="hero-top">
            <h1>What did<br />I miss?</h1>
            <p className="caption">Catch up on an overwhelming group chat<br />in seconds. Private AI that runs on your device.</p>
          </div>
          <button className="rule-row" onClick={tryDemo}>
            <span>Try the demo chat</span><Arrow />
          </button>
          <div className="hero-stats">
            <div className="metric"><span className="m-label">Unread messages <span className="circ"><Arrow dir="down" /></span></span><span className="m-val">200<small>+</small></span></div>
            <div className="metric"><span className="m-label">Time to catch up <span className="circ"><Arrow dir="up" /></span></span><span className="m-val">10<small>sec</small></span></div>
          </div>
          <CardFoot n={1}><button className="details" onClick={tryDemo}>Open demo <span className="circ solid"><Arrow /></span></button></CardFoot>
        </section>

        <div className="trio">
          <section
            className={`card screen-cream drop ${dragging ? 'over' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
          >
            <h2>Drop your<br />chat export <Arrow dir="diag" /></h2>
            <div className="split-cap">
              <p><b>Android:</b> install this app, then in WhatsApp open a chat → ⋮ → More → Export chat → share to <b>Missed?</b></p>
              <p><b>iPhone / desktop:</b> Export chat → Save to Files, then drop the .txt or .zip here.</p>
            </div>
            <label className="rule-row as-label">
              <span>Browse files</span><Arrow />
              <input type="file" accept=".txt,.zip,text/plain,application/zip" hidden onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
            <CardFoot n={2} />
          </section>

          <section className="card screen-deep">
            <h2>Paste any<br />chat <Arrow dir="diag" /></h2>
            <div className="band"><span>Formats</span><span>Supported</span></div>
            <table className="spec">
              <tbody>
                <tr><td>WhatsApp</td><td>Android &amp; iOS export</td></tr>
                <tr><td>Slack</td><td>Copied thread</td></tr>
                <tr><td>Discord</td><td>Copied channel</td></tr>
                <tr><td>Teams</td><td>Copied chat</td></tr>
                <tr><td>Anything</td><td>Name: message</td></tr>
              </tbody>
            </table>
            <textarea value={paste} onChange={e => setPaste(e.target.value)} placeholder={'Ananya: @Shashwat can you send the deck by 5pm?\nRohan: venue is final, main auditorium'} />
            <CardFoot n={3}>
              <button className="details" disabled={!paste.trim()} onClick={() => open(paste, 'Pasted chat')}>Analyze <span className="circ solid"><Arrow /></span></button>
            </CardFoot>
          </section>

          <section className="card screen-ember">
            <h2>Private by<br />design <Arrow dir="diag" /></h2>
            <div className="split-cap">
              <p>No server, no API keys and no tracking. The LLM runs in your browser through WebGPU.</p>
              <p>The model is cached once, then everything works with Wi-Fi off.</p>
            </div>
            <div className="boxed">
              <div className="box-tabs"><span className="on">Bytes uploaded</span><span>Servers</span><span>Trackers</span></div>
              <small>Your chat data sent anywhere</small>
              <div className="giant">0</div>
            </div>
            <CardFoot n={4} />
          </section>
        </div>
        <footer>Built local-first · No servers · No tracking · Your chat stays in this tab</footer>
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
  const upcoming = a.deadlines.filter(s => s.deadline!.getTime() >= a.now.getTime())
  const nextDue = upcoming[0]

  const item = (s: Scored) => (
    <div key={s.msg.id} className={`item ${s.priority}`}>
      <div className="item-head">
        <span className="who">{s.msg.author}</span>
        <span className="time">{fmtTime(s.msg.ts)}</span>
        <button className="jump" onClick={() => jump(s.msg.id)}>View <Arrow dir="diag" /></button>
      </div>
      <div className="item-text">{highlight(s.msg.text, me)}</div>
      {s.flags.length > 0 && <div className="chips">{s.flags.map((f, i) => <span key={i} className={`chip ${f.kind}`}>{f.label}</span>)}</div>}
    </div>
  )

  return (
    <div className="page">
      <header className="nav">
        {brand}
        <div className="nav-right">
          {badge}
          <label className="me">I am
            <select value={me} onChange={e => { setMe(e.target.value); resetSummary(); try { localStorage.setItem('wdim-me', e.target.value) } catch { /* storage unavailable */ } }}>
              {people.map(p => <option key={p}>{p}</option>)}
            </select>
          </label>
          <button className="menu" onClick={() => setRaw(null)}><i /><i />NEW CHAT</button>
        </div>
      </header>

      {sharedNotice && <div className="toast"><span className="dot" />Received from WhatsApp · processed on this device only</div>}
      <section className="card screen-mist overview">
        <div className="ov-left">
          <h1 className="ov-title">You missed<br />{a.stats.unread} messages</h1>
          <p className="caption">{chatName} · away {fmtDuration(a.now.getTime() - (lastRead?.ts.getTime() ?? a.now.getTime()))}<br />Last read: {lastRead ? `${lastRead.author} at ${fmtTime(lastRead.ts)}` : 'nothing'}</p>
          <div className="since">
            <div className="rule-label"><span>Since you left</span><span>Drag to change</span></div>
            <input type="range" min={0} max={msgs.length - 1} value={sinceIdx} onChange={e => { setSinceIdx(+e.target.value); resetSummary() }} />
          </div>
        </div>
        <div className="ov-right">
          <div className="metric"><span className="m-label">Urgent <span className="circ"><Arrow dir="up" /></span></span><span className="m-val">{a.stats.urgent}<small>items</small></span></div>
          <div className="metric"><span className="m-label">Mention you <span className="circ"><Arrow dir="diag" /></span></span><span className="m-val">{a.stats.mentions}<small>times</small></span></div>
          <div className="metric"><span className="m-label">Tasks for you <span className="circ"><Arrow dir="down" /></span></span><span className="m-val">{myTodos.length}<small>to-dos</small></span></div>
          <div className="metric"><span className="m-label">Reading saved <span className="circ"><Arrow /></span></span><span className="m-val">~{a.stats.minutesSaved}<small>min</small></span></div>
        </div>
      </section>

      <nav className="tabs">
        <button className={tab === 'brief' ? 'on' : ''} onClick={() => setTab('brief')}>Briefing</button>
        <button className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>Full chat</button>
        <span className="tab-meta">{msgs.length} messages · {a.stats.deadlines} deadlines · {a.decisions.length} decisions</span>
      </nav>

      {tab === 'brief' ? (
        <div className="grid">
          <section className="card screen-deep ai">
            <h2>AI catch-up <Arrow dir="diag" /></h2>
            <div className="band"><span>On-device LLM</span><span>{MODELS.find(m => m.id === modelId)?.label.split(' (')[0]}</span></div>

            {llm === 'unsupported' && <p className="note">This browser has no WebGPU, so the on-device LLM is unavailable. Everything else still works offline using the local rule engine. Use desktop Chrome or Edge for the AI summary.</p>}
            {llm === 'idle' && !summary && <p className="note">{cached ? 'Model cached on this device · works offline. ' : 'First run downloads the model once, then it is cached and works offline. '}A language model runs inside this tab through WebGPU. No server, no API calls.</p>}
            {llm === 'loading' && (
              <div className="progress">
                <div className="bar"><div style={{ width: `${progress.pct}%` }} /></div>
                <small>{progress.text || 'Starting…'}</small>
              </div>
            )}
            {llm === 'error' && <p className="note err">{progress.text}</p>}
            {summary && <Markdown text={summary} />}
            {llm === 'generating' && <span className="cursor">▍</span>}
            {llm === 'done' && <p className="note">Generated on your device in {(genMs / 1000).toFixed(1)}s</p>}

            <CardFoot n={1}>
              {(llm === 'idle' || llm === 'ready' || llm === 'done' || llm === 'error') && (
                <>
                  <select className="model" value={modelId} onChange={e => setModelId(e.target.value)} disabled={llm === 'ready' || llm === 'done'}>
                    {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                  <button className="details" onClick={runAI}>{llm === 'done' ? 'Regenerate' : 'Summarize'} <span className="circ solid"><Arrow /></span></button>
                </>
              )}
              {llm === 'loading' && <span className="foot-text">Loading model · {progress.pct}%</span>}
              {llm === 'generating' && <button className="details" onClick={() => (cancel.current.cancelled = true)}>Stop <span className="circ solid">■</span></button>}
            </CardFoot>
          </section>

          <section className="card screen-ember todos">
            <h2>Your to-dos <Arrow dir="diag" /></h2>
            <div className="split-cap">
              <p>Tasks where someone named you or asked you directly.</p>
              <p>{nextDue ? `Next deadline ${fmtWhen(nextDue.deadline!, a.now).split(' · ')[1]}.` : 'No deadlines spotted.'}</p>
            </div>
            <div className="list">
              {myTodos.length === 0 && <p className="note">Nothing assigned to you.</p>}
              {myTodos.map(s => (
                <label key={s.msg.id} className={`todo ${done.has(s.msg.id) ? 'done' : ''}`}>
                  <input type="checkbox" checked={done.has(s.msg.id)} onChange={() => setDone(d => { const n = new Set(d); n.has(s.msg.id) ? n.delete(s.msg.id) : n.add(s.msg.id); return n })} />
                  <div>
                    <div className="todo-text">{s.msg.text}</div>
                    <small>{s.msg.author}{s.deadline && <> · <b>{fmtWhen(s.deadline, a.now)}</b></>} · <a onClick={() => jump(s.msg.id)}>view</a></small>
                  </div>
                </label>
              ))}
            </div>
            <CardFoot n={2}><span className="foot-text">{done.size} of {myTodos.length} done</span></CardFoot>
          </section>

          <section className="card screen-mist inbox">
            <h2>Priority inbox <Arrow dir="diag" /></h2>
            {(['urgent', 'relevant'] as Priority[]).map(p => groups[p].length > 0 && (
              <div key={p} className="group">
                <div className="rule-label"><span>{PRIORITY_LABEL[p]}</span><span>{groups[p].length}</span></div>
                {groups[p].map(item)}
              </div>
            ))}
            {showFyi && (
              <div className="group">
                <div className="rule-label"><span>{PRIORITY_LABEL.fyi}</span><span>{groups.fyi.length}</span></div>
                {groups.fyi.map(item)}
              </div>
            )}
            <CardFoot n={3}>
              <button className="details" onClick={() => setShowFyi(!showFyi)}>{showFyi ? 'Hide' : 'Show'} {groups.fyi.length} FYI <span className="circ solid"><Arrow dir={showFyi ? 'up' : 'down'} /></span></button>
            </CardFoot>
          </section>

          <div className="stack">
            <section className="card screen-deep">
              <h2>Deadlines <Arrow dir="diag" /></h2>
              <div className="band"><span>When</span><span>What</span></div>
              <table className="spec clickable">
                <tbody>
                  {upcoming.length === 0 && <tr><td colSpan={2}>No upcoming deadlines.</td></tr>}
                  {upcoming.map(s => (
                    <tr key={s.msg.id} onClick={() => jump(s.msg.id)}>
                      <td className={`when ${s.deadline!.getTime() - a.now.getTime() < 86400000 ? 'soon' : ''}`}>{fmtWhen(s.deadline!, a.now).replace(' · ', '\n')}</td>
                      <td>{s.msg.text.slice(0, 90)}{s.msg.text.length > 90 ? '…' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <CardFoot n={4}>{nextDue && <span className="foot-text">Next {fmtWhen(nextDue.deadline!, a.now).split(' · ')[1]}</span>}</CardFoot>
            </section>

            <section className="card screen-cream">
              <h2>Decisions <Arrow dir="diag" /></h2>
              <table className="spec clickable">
                <tbody>
                  {a.decisions.length === 0 && <tr><td colSpan={2}>No decisions spotted.</td></tr>}
                  {a.decisions.map(s => (
                    <tr key={s.msg.id} onClick={() => jump(s.msg.id)}>
                      <td className="who">{s.msg.author}<br /><small>{fmtTime(s.msg.ts)}</small></td>
                      <td>{s.msg.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <CardFoot n={5} />
            </section>

            <section className="card screen-mist">
              <h2>Others' tasks <Arrow dir="diag" /></h2>
              <table className="spec clickable">
                <tbody>
                  {otherTodos.length === 0 && <tr><td colSpan={2}>None.</td></tr>}
                  {otherTodos.map(s => (
                    <tr key={s.msg.id} onClick={() => jump(s.msg.id)}>
                      <td className="who">{s.owner ?? 'Unassigned'}</td>
                      <td>{s.msg.text.slice(0, 100)}{s.msg.text.length > 100 ? '…' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <CardFoot n={6} />
            </section>
          </div>
        </div>
      ) : (
        <section className="card screen-mist chat">
          <div className="chat-scroll">
            {msgs.map((m, i) => {
              const s = i >= sinceIdx ? a.scored[i - sinceIdx] : undefined
              return (
                <div key={m.id}>
                  {i === sinceIdx && <div className="unread-line"><span>{msgs.length - sinceIdx} unread</span></div>}
                  <div id={`m${m.id}`} className={`bubble ${m.author === me ? 'mine' : ''} ${s ? s.priority : 'read'} ${flashId === m.id ? 'flash' : ''}`}>
                    <div className="b-head"><b>{m.author}</b><span>{fmtTime(m.ts)}</span></div>
                    <div>{highlight(m.text, me)}</div>
                    {s && s.flags.length > 0 && <div className="chips">{s.flags.map((f, k) => <span key={k} className={`chip ${f.kind}`}>{f.label}</span>)}</div>}
                  </div>
                </div>
              )
            })}
          </div>
          <CardFoot n={7}><button className="details" onClick={() => setTab('brief')}>Back to briefing <span className="circ solid"><Arrow /></span></button></CardFoot>
        </section>
      )}
      <footer>Built local-first · No servers · No tracking · Your chat stays in this tab</footer>
    </div>
  )
}
