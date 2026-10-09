import { useEffect, useMemo, useRef, useState } from 'react'
import { parseChat, participants, type Message } from './lib/parser'
import { analyze, fmtWhen, type Scored } from './lib/analyze'
import { MODELS, hasWebGPU, isCached, loadModel, summarize } from './lib/llm'
import { buildDemoChat, DEMO_ME, DEMO_LAST_READ, DEMO_NAME } from './data/demo'
import { readChatFile, takeSharedChat, type ChatSource, type LoadedChat } from './lib/importFile'
import { cleanTitle, deadlineCalendar, hotTopics, hueFor, initials } from './lib/insights'
import ActivityChart from './components/ActivityChart'
import { displayName, isMe, mentionPattern, nameSuggestions } from './lib/identity'
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

const SOURCE_LABEL: Record<string, string> = { demo: 'Demo', whatsapp: 'WhatsApp', telegram: 'Telegram', text: 'Pasted' }

type LlmState = 'idle' | 'loading' | 'ready' | 'generating' | 'done' | 'error' | 'unsupported'
type View = 'brief' | 'insights' | 'chat'

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

const fmtTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const fmtHour = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function fmtDuration(ms: number) {
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.round(h / 24)}d`
}

// ---------- tiny icon set ----------
const ICONS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  chat: 'M4 5h16v11H9l-5 4z',
  calendar: 'M4 6h16v14H4zM4 10h16M9 3v5M15 3v5',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  exit: 'M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5M10 8l-4 4 4 4M6 12h10',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  arrow: 'M7 17L17 7M9 7h8v8',
  sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  chart: 'M4 20V11M10 20V5M16 20v-7M21 20H3',
}
function Icon({ name, size = 20 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name]} />
    </svg>
  )
}

function Avatar({ name, size = 26 }: { name: string; size?: number }) {
  const h = hueFor(name)
  return (
    <span className="avatar" title={name} style={{ width: size, height: size, fontSize: size * 0.4, background: `linear-gradient(135deg, hsl(${h} 85% 62%), hsl(${h + 8} 70% 32%))` }}>
      {initials(name)}
    </span>
  )
}

function Dots({ scored }: { scored: Scored[] }) {
  return <div className="dots">{scored.map(s => <i key={s.msg.id} className={s.priority} title={`${s.msg.author}: ${s.msg.text.slice(0, 60)}`} />)}</div>
}

function Gauge({ pct }: { pct: number }) {
  const r = 70, C = 2 * Math.PI * r, sweep = 0.75
  return (
    <svg viewBox="0 0 180 180" className="gauge">
      <defs>
        <linearGradient id="g-track" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3a2a22" /><stop offset="1" stopColor="#6b3a22" /></linearGradient>
        <linearGradient id="g-val" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#ffb02e" /><stop offset="1" stopColor="#ff7a2f" /></linearGradient>
      </defs>
      <circle cx="90" cy="90" r={r} fill="none" stroke="url(#g-track)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${C * sweep} ${C}`} transform="rotate(135 90 90)" />
      <circle cx="90" cy="90" r={r} fill="none" stroke="url(#g-val)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${C * sweep * pct} ${C}`} transform="rotate(135 90 90)" style={{ transition: 'stroke-dasharray .8s ease' }} />
    </svg>
  )
}

/** Bold the facts (times, days, deadlines) inside AI prose so it scans fast. */
function Prose({ text }: { text: string }) {
  const clean = text.replace(/\*\*/g, '').replace(/^#+\s*/gm, '').replace(/^\s*[-*•]\s+/gm, '').trim()
  const re = /(\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b|\b(?:today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|asap|urgent(?:ly)?|deadline)\b|₹\s?\d+)/gi
  return <p className="prose">{clean.split(re).map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</p>
}

function highlight(text: string, identity: string, query = '') {
  const parts = [mentionPattern(identity), '@everyone']
  if (query.trim()) parts.push(escapeRe(query.trim()))
  const re = new RegExp(`(${parts.join('|')})`, 'gi')
  return text.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))
}

export default function App() {
  // The app always opens on the demo chat so it's functional from the first second
  const [msgs, setMsgs] = useState<Message[]>(() => parseChat(buildDemoChat()))
  const [source, setSource] = useState<ChatSource | 'demo'>('demo')
  const [chatName, setChatName] = useState(DEMO_NAME)
  const [me, setMe] = useState(DEMO_ME)
  const [sinceIdx, setSinceIdx] = useState(DEMO_LAST_READ)
  const [isDemo, setIsDemo] = useState(true)
  const [showIntro, setShowIntro] = useState(() => {
    if (new URLSearchParams(location.search).has('shared')) return false
    try { return !localStorage.getItem('wdim-intro-seen') } catch { return true }
  })
  const [showPaste, setShowPaste] = useState(false)
  const [showWho, setShowWho] = useState(false)
  const [whoDraft, setWhoDraft] = useState('')
  const [view, setView] = useState<View>('brief')
  const [query, setQuery] = useState('')
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
  const fileInput = useRef<HTMLInputElement>(null)
  const online = useOnline()
  const install = useInstallPrompt()
  const [sharedNotice, setSharedNotice] = useState(false)

  // Chat shared into the installed app from WhatsApp's share sheet (handled locally by sw.js)
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('shared')) return
    history.replaceState(null, '', location.pathname)
    takeSharedChat()
      .then(chat => { if (chat) { open(chat); setSharedNotice(true); setTimeout(() => setSharedNotice(false), 5000) } })
      .catch(err => alert(`Couldn't read the shared chat: ${err.message}`))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const people = useMemo(() => participants(msgs), [msgs])
  const a = useMemo(() => (msgs.length ? analyze(msgs, me, sinceIdx, people) : null), [msgs, me, sinceIdx, people])
  const myName = displayName(me)
  const suggestions = useMemo(() => nameSuggestions(people, msgs.map(m => m.text)), [people, msgs])

  useEffect(() => { isCached(modelId).then(setCached) }, [modelId, llm])

  function resetSummary() {
    setSummary('')
    if (llm === 'done') setLlm('ready')
  }

  function open(chat: LoadedChat | (Omit<LoadedChat, 'source'> & { source: 'demo' }), meGuess?: string, lastRead?: number) {
    const parsed = chat.messages
    const demo = chat.source === 'demo'
    if (!parsed.length) { alert("Couldn't find any messages. Use a WhatsApp or Telegram export, or paste lines like \"Name: message\"."); return }
    const ppl = participants(parsed)
    setMsgs(parsed)
    setSource(chat.source)
    setChatName(chat.name)
    setIsDemo(demo)
    if (!demo) closeIntro()
    let remembered: string | null = null
    try { remembered = localStorage.getItem('wdim-identity') } catch { /* storage unavailable */ }
    // Your identity is free text and needn't be a poster in this chat; ask once if we don't know it
    // Telegram full-account exports include your own name, which we use as a starting suggestion
    const who = meGuess && ppl.includes(meGuess) ? meGuess : remembered ?? chat.me ?? ''
    setMe(who)
    if (!demo && !remembered) { setWhoDraft(chat.me ?? ''); setShowWho(true) }
    setSinceIdx(lastRead ?? defaultSince(parsed, who))
    setDone(new Set())
    setView('brief')
    setQuery('')
    resetSummary()
    window.scrollTo({ top: 0 })
  }

  // You've read everything up to your own last message; fall back to the last 80% if you never spoke
  function defaultSince(list: Message[], who: string) {
    for (let i = list.length - 1; i >= 0; i--) if (isMe(list[i].author, who)) return Math.min(i + 1, list.length - 1)
    return Math.floor(list.length * 0.2)
  }

  function onFile(f: File) {
    readChatFile(f, f.name)
      .then(chat => open(chat))
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
      await summarize(a, myName, setSummary, cancel.current)
      setGenMs(performance.now() - t0)
      setLlm('done')
    } catch (e) {
      console.error(e)
      setProgress({ pct: 0, text: String((e as Error).message || e) })
      setLlm('error')
    }
  }

  function jump(id: number) {
    setQuery('')
    setView('chat')
    setFlashId(id)
    setTimeout(() => document.getElementById(`m${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
    setTimeout(() => setFlashId(null), 2500)
  }

  function scrollToId(id: string, v: View = 'insights') {
    setView(v)
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  const toggleDone = (id: number) => setDone(d => { const n = new Set(d); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const loadDemo = () => open({ name: DEMO_NAME, messages: parseChat(buildDemoChat()), source: 'demo' }, DEMO_ME, DEMO_LAST_READ)
  function closeIntro() {
    setShowIntro(false)
    setShowPaste(false)
    try { localStorage.setItem('wdim-intro-seen', '1') } catch { /* storage unavailable */ }
  }
  useEffect(() => {
    if (!showIntro) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeIntro() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showIntro])
  const loaded = !!a
  const openTasks = a ? a.actions.filter(s => s.owner === myName && !done.has(s.msg.id)).length : 0

  function saveWho() {
    const v = whoDraft.split(',').map(x => x.trim()).filter(Boolean).join(', ')
    if (!v) return
    setMe(v)
    if (!isDemo) {
      setSinceIdx(defaultSince(msgs, v))
      try { localStorage.setItem('wdim-identity', v) } catch { /* storage unavailable */ }
    }
    resetSummary()
    setShowWho(false)
  }
  const addAlias = (n: string) => setWhoDraft(d => {
    const list = d.split(',').map(x => x.trim()).filter(Boolean)
    return list.some(x => x.toLowerCase() === n.toLowerCase()) ? d : [...list, n].join(', ')
  })

  // ---------------- shell ----------------
  const sidebar = (
    <aside className="sidebar">
      <button className="logo" onClick={() => setShowIntro(true)} title="About this app"><img src="./icons/icon-192.png" alt="" /></button>
      <nav className="rail">
        <button className={view === 'brief' ? 'on' : ''} onClick={() => scrollToId('top', 'brief')} title="Briefing"><Icon name="home" /></button>
        <button className={view === 'insights' ? 'on' : ''} onClick={() => scrollToId('top', 'insights')} title="Insights"><Icon name="chart" /></button>
        <button className={view === 'chat' && loaded ? 'on' : ''} disabled={!loaded} onClick={() => setView('chat')} title="Full chat"><Icon name="chat" /></button>
        <button disabled={!loaded} onClick={() => scrollToId('deadlines', 'insights')} title="Deadlines"><Icon name="calendar" /></button>
        <button onClick={() => fileInput.current?.click()} title="Open a chat export"><Icon name="upload" /></button>
      </nav>
      <nav className="rail bottom">
        {install && <button onClick={install} title="Install app"><Icon name="download" /></button>}
        <button className={online ? 'safe' : 'offline'} title={online ? 'Processed on this device · 0 bytes sent' : 'Offline · still working'}><Icon name="shield" /></button>
        {!isDemo && <button onClick={loadDemo} title="Back to the demo chat"><Icon name="exit" /></button>}
      </nav>
      <input ref={fileInput} type="file" accept=".txt,.zip,.json,.html,text/plain,application/zip,application/json,text/html" hidden onChange={e => { if (e.target.files?.[0]) onFile(e.target.files[0]); e.target.value = '' }} />
    </aside>
  )

  const q = query.trim().toLowerCase()
  const searchResults = a && q ? msgs.filter(m => m.text.toLowerCase().includes(q) || m.author.toLowerCase().includes(q)) : null

  const topbar = (
    <header className="topbar">
      <div className={`status-pill ${online ? '' : 'offline'}`}>
        <span className="sp-dot" />
        <span>{online ? 'On-device' : 'Offline'}</span>
        <span className="sp-sep" />
        <span className="sp-muted">0 bytes sent</span>
      </div>
      {isDemo && <button className="demo-pill" onClick={() => setShowIntro(true)} title="You're viewing sample data. Click to load your own chat.">Demo chat · use yours</button>}
      <label className="search">
        <Icon name="search" size={18} />
        <input
          value={query}
          disabled={!loaded}
          onChange={e => { setQuery(e.target.value); if (e.target.value) setView('chat') }}
          placeholder={loaded ? 'Search this chat (stays on your device)' : 'Open a chat to search'}
        />
        {query && <button className="clear" onClick={() => setQuery('')}>×</button>}
      </label>
      <div className="top-right">
        {a && (
          <button className="bell" onClick={() => scrollToId('todos', 'brief')} title="Tasks for you">
            <Icon name="bell" size={18} />
            {openTasks > 0 && <span className="badge">{openTasks}</span>}
          </button>
        )}
        {a ? (
          <button className="me" title={`You are: ${me || 'not set'} (click to change)`} onClick={() => { setWhoDraft(me); setShowWho(!showWho) }}>
            <Avatar name={myName} size={38} />
          </button>
        ) : <span className="avatar ghost">?</span>}
        {showWho && <div className="who-backdrop" onClick={() => setShowWho(false)} />}
        {showWho && (
          <div className="who-pop" role="dialog" aria-label="Who are you?">
            <h4>Who are you in this chat?</h4>
            <p>We use this to find your mentions, questions and tasks. You don't need to have posted in the group. Saved on this device only.</p>
            <input
              autoFocus
              value={whoDraft}
              onChange={e => setWhoDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveWho(); if (e.key === 'Escape') setShowWho(false) }}
              placeholder="e.g. Shashwat, Shash, 98765 43210"
            />
            {suggestions.length > 0 && (
              <div className="who-suggest">
                {suggestions.slice(0, 12).map(n => <button key={n} onClick={() => addAlias(n)}>{n}</button>)}
              </div>
            )}
            <small>Add nicknames or your phone number, separated by commas. WhatsApp often @mentions unsaved contacts by number.</small>
            <div className="who-actions">
              <button className="btn-ghost" onClick={() => setShowWho(false)}>Cancel</button>
              <button className="btn-orange" disabled={!whoDraft.trim()} onClick={saveWho}>Save</button>
            </div>
          </div>
        )}
      </div>
    </header>
  )

  const intro = showIntro && (
    <div className="intro" role="dialog" aria-modal="true" aria-labelledby="intro-title" onClick={closeIntro}>
      <div className="intro-card" onClick={e => e.stopPropagation()}>
        <div className="intro-glow" />
        <div className="intro-badge"><span className="sp-dot" />Demo chat</div>
        <h2 id="intro-title">You're looking at a <span>demo chat</span></h2>
        <p>
          This is a sample WhatsApp group, <b>{DEMO_NAME}</b>, with {msgs.length} messages and a few urgent asks hidden in the chatter.
          Explore it freely. Everything is processed <b>on your device</b>, and nothing is uploaded.
        </p>
        <div className="intro-facts">
          <span><b>{a?.stats.unread ?? 0}</b> unread</span>
          <span><b>{a?.stats.urgent ?? 0}</b> urgent</span>
          <span><b>0</b> bytes sent</span>
        </div>
        <div className="intro-actions">
          <button className="btn-orange" onClick={() => { if (!isDemo) loadDemo(); closeIntro() }} autoFocus>Explore the demo <Icon name="arrow" size={18} /></button>
          <button className="btn-ghost" onClick={() => fileInput.current?.click()}><Icon name="upload" size={18} /> Open my chat export</button>
          <button className="btn-link" onClick={() => setShowPaste(!showPaste)}>{showPaste ? 'Hide paste box' : 'Paste a chat instead'}</button>
        </div>
        {showPaste && (
          <div className="intro-paste">
            <textarea className="paste" value={paste} onChange={e => setPaste(e.target.value)} placeholder={'Ananya: @Shashwat can you send the deck by 5pm?\nRohan: venue is final, main auditorium'} autoFocus />
            <button className="btn-orange wide" disabled={!paste.trim()} onClick={() => open({ name: 'Pasted chat', messages: parseChat(paste), source: 'text' })}>Analyze</button>
          </div>
        )}
        <small className="intro-tip">Works with <b>WhatsApp</b> (.txt / .zip export) and <b>Telegram Desktop</b> (Export chat history → result.json or messages.html). Drop the file anywhere on the page. On Android, share a WhatsApp export straight to <b>Missed?</b></small>
      </div>
    </div>
  )

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true) } },
    onDragLeave: (e: React.DragEvent) => { if (e.currentTarget === e.target) setDragging(false) },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) },
  }

  const toast = sharedNotice && <div className="toast"><span className="dot" />Received from WhatsApp · processed on this device only</div>

  // ---------------- Dashboard ----------------
  if (!a) return null
  const myTodos = a.actions.filter(s => s.owner === myName)
  const otherTodos = a.actions.filter(s => s.owner !== myName)
  const inbox = a.scored.filter(s => !isMe(s.msg.author, me) && s.priority !== 'fyi').sort((x, y) => y.score - x.score)
  const fyi = a.scored.filter(s => !isMe(s.msg.author, me) && s.priority === 'fyi')
  const lastRead = msgs[Math.max(0, sinceIdx - 1)]
  const cal = deadlineCalendar(a)
  const topics = hotTopics(a, people)
  const noisePct = a.unread.length ? fyi.length / a.unread.length : 0
  const doneCount = myTodos.filter(s => done.has(s.msg.id)).length
  const modelName = MODELS.find(m => m.id === modelId)?.label.split(' (')[0]

  const DAY = 86400000
  const startOfDay = (d: Date) => new Date(d).setHours(0, 0, 0, 0)
  const upcoming = a.deadlines.filter(s => s.deadline!.getTime() >= a.now.getTime())
  const nextDue = upcoming[0]
  const due24 = upcoming.filter(s => s.deadline!.getTime() - a.now.getTime() < DAY)
  const questions = a.mentions.filter(s => s.flags.some(f => f.kind === 'question')).length
  const latestDecision = a.decisions[a.decisions.length - 1]

  type Prio = 'High' | 'Medium' | 'Low'
  const prioOf = (s: Scored): Prio => {
    const hrs = s.deadline ? (s.deadline.getTime() - a.now.getTime()) / 3600000 : Infinity
    if (s.priority === 'urgent' || hrs < 12) return 'High'
    if (hrs < 48 || s.priority === 'relevant') return 'Medium'
    return 'Low'
  }
  const groupOf = (s: Scored) => {
    if (!s.deadline) return 'Anytime'
    const diff = Math.round((startOfDay(s.deadline) - startOfDay(a.now)) / DAY)
    return diff <= 0 ? 'Today' : diff === 1 ? 'Tomorrow' : 'Upcoming'
  }
  const todoGroups = (['Today', 'Tomorrow', 'Upcoming', 'Anytime'] as const)
    .map(g => ({ g, items: myTodos.filter(s => groupOf(s) === g) }))
    .filter(x => x.items.length)

  const kpis = [
    { label: 'Mentions you', value: a.stats.mentions, unit: 'mentions', footL: 'Asked you a question', footR: String(questions), target: 'inbox' },
    { label: 'Due in 24 hours', value: due24.length, unit: 'deadlines', footL: 'Next', footR: nextDue ? fmtTime(nextDue.deadline!) : '—', target: 'deadlines' },
    { label: 'Decisions', value: a.decisions.length, unit: 'made', footL: 'Latest', footR: latestDecision ? fmtTime(latestDecision.msg.ts) : '—', target: 'decisions' },
    { label: 'Reading saved', value: `~${a.stats.minutesSaved}`, unit: 'min', footL: 'Chatter filtered', footR: `${Math.round(noisePct * 100)}%`, target: 'activity' },
  ]

  const aiBody = (
    <div className="ai-inline">
      <div className="ai-row">
        <span className="ai-name"><Icon name="sparkle" size={15} /> AI catch-up <small>{modelName} · on this device</small></span>
        {(llm === 'done' || llm === 'error') && <button className="btn-link" onClick={runAI}>Regenerate</button>}
        {llm === 'generating' && <button className="btn-link" onClick={() => (cancel.current.cancelled = true)}>Stop</button>}
      </div>
      {llm === 'unsupported' && <p className="prose dim">This browser has no WebGPU, so the on-device AI summary isn't available here. Everything else works offline.</p>}
      {(llm === 'idle' || llm === 'ready') && !summary && <p className="prose dim">Get a 3-sentence summary written by an AI running in this tab. {cached ? 'Model cached · works offline.' : 'One-time model download, then it works offline.'}</p>}
      {llm === 'loading' && <div className="progress"><div className="bar"><div style={{ width: `${progress.pct}%` }} /></div><small>{progress.text || 'Starting…'}</small></div>}
      {llm === 'error' && <p className="prose dim err">{progress.text}</p>}
      {summary && <Prose text={summary} />}
      {llm === 'generating' && <span className="cursor">▍</span>}
      {llm === 'done' && <small className="sub">Written on your device in {(genMs / 1000).toFixed(1)}s</small>}
      {(llm === 'idle' || llm === 'ready' || llm === 'error') && (
        <div className="ai-actions">
          <button className="btn-orange" onClick={runAI}><Icon name="sparkle" size={16} /> Summarize</button>
          <select className="model" value={modelId} onChange={e => setModelId(e.target.value)} disabled={llm === 'ready'}>
            {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
      )}
    </div>
  )

  const needsYou = (
    <div className="todo-panel">
      {myTodos.length === 0 && <p className="sub">Nothing assigned to you 🎉</p>}
      {todoGroups.map(({ g, items }) => (
        <div key={g} className="todo-group">
          <div className="tg-label">{g}</div>
          {items.map(s => {
            const p = prioOf(s)
            return (
              <div key={s.msg.id} className={`todo-row ${done.has(s.msg.id) ? 'is-done' : ''}`}>
                <button className="tick" onClick={() => toggleDone(s.msg.id)} aria-label="Mark done" />
                <span className="t-text" title={s.msg.text} onClick={() => jump(s.msg.id)}>
                  <span className="t-title">{cleanTitle(s.msg.text, people)}</span>
                  <small>{s.msg.author}{s.deadline ? ` · due ${fmtWhen(s.deadline, a.now)}` : ''}</small>
                </span>
                <span className={`prio ${p.toLowerCase()}`}>{p}</span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )

  const statusOf = (s: Scored) => {
    if (done.has(s.msg.id)) return { cls: 'done', label: 'done' }
    if (!s.deadline) return { cls: 'prog', label: 'open' }
    const ms = s.deadline.getTime() - a.now.getTime()
    return { cls: ms < 86400000 ? 'late' : 'prog', label: fmtWhen(s.deadline, a.now).split(' · ')[1] }
  }

  return (
    <div className={`backdrop ${dragging ? 'dropping' : ''}`} {...dropHandlers}>
      <div className="shell">
        {sidebar}
        <main className="main" id="top">
          {topbar}

          {view === 'chat' ? (
            <section className="tile chat-tile">
              <div className="tile-head">
                <div><h3>{searchResults ? `${searchResults.length} result${searchResults.length === 1 ? '' : 's'} for “${query.trim()}”` : chatName}</h3><small className="sub">{searchResults ? 'Searched locally on this device' : `${msgs.length} messages · ${a.unread.length} unread`}</small></div>
                <button className="pill-btn" onClick={() => { setQuery(''); setView('brief') }}>Back to briefing</button>
              </div>
              <div className="chat-scroll">
                {(searchResults ?? msgs).map(m => {
                  const i = m.id
                  const s = i >= sinceIdx ? a.scored[i - sinceIdx] : undefined
                  return (
                    <div key={m.id}>
                      {!searchResults && i === sinceIdx && <div className="unread-line"><span>{msgs.length - sinceIdx} unread</span></div>}
                      <div id={`m${m.id}`} className={`bubble ${isMe(m.author, me) ? 'mine' : ''} ${s ? s.priority : 'read'} ${flashId === m.id ? 'flash' : ''} ${searchResults ? 'clickable' : ''}`} onClick={() => { if (searchResults) jump(m.id) }}>
                        {!isMe(m.author, me) && <Avatar name={m.author} size={28} />}
                        <div className="b-body">
                          <div className="b-head"><b>{m.author}</b><span>{fmtTime(m.ts)}</span></div>
                          <div>{highlight(m.text, me, query)}</div>
                          {s && s.flags.length > 0 && <div className="chips">{s.flags.map((f, k) => <span key={k} className={`chip ${f.kind}`}>{f.label}</span>)}</div>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ) : view === 'brief' ? (
            <div className="bento brief">
              <section className="tile span-8 catchup">
                <div className="eyebrow">
                  <span className={`pill-btn sm src-${source}`}><i className="src-dot" />{SOURCE_LABEL[source]} · {chatName}</span>
                  <span>Away {fmtDuration(a.now.getTime() - (lastRead?.ts.getTime() ?? a.now.getTime()))}{lastRead ? ` · last read ${fmtTime(lastRead.ts)}` : ''}</span>
                </div>
                <h1>You missed {a.stats.unread} messages.<br /><span>{openTasks ? `${openTasks} need${openTasks === 1 ? 's' : ''} you.` : 'Nothing needs you.'}</span></h1>
                <div className="facts">
                  <span><b>{due24.length}</b> due in 24h</span>
                  <span><b>{a.decisions.length}</b> decisions</span>
                  <span><b>{Math.round(noisePct * 100)}%</b> was chatter</span>
                </div>
                {aiBody}
              </section>

              <section className="tile span-4 orange-tile next-up">
                <div className="silhouette">?</div>
                <span className="nu-label">Next up</span>
                {nextDue ? (
                  <>
                    <div className="nu-when">{fmtWhen(nextDue.deadline!, a.now).split(' · ')[1]}</div>
                    <div className="nu-title">{cleanTitle(nextDue.msg.text, people)}</div>
                    <div className="nu-meta">{nextDue.msg.author} · due {fmtTime(nextDue.deadline!)}</div>
                    <button className="nu-btn" onClick={() => jump(nextDue.msg.id)}>Open message <Icon name="arrow" size={16} /></button>
                  </>
                ) : <div className="nu-title">Nothing due soon 🎉</div>}
              </section>

              <section className="tile span-8" id="todos">
                <div className="tile-head">
                  <div><h3>Needs you</h3><small className="sub">Someone named you or asked you directly</small></div>
                  <span className="pill-btn sm">{doneCount}/{myTodos.length} done</span>
                </div>
                {needsYou}
              </section>

              <section className="tile span-4">
                <div className="tile-head"><h3>Decided while you were away</h3></div>
                <div className="mini-list">
                  {a.decisions.length === 0 && <p className="sub">No decisions spotted.</p>}
                  {a.decisions.slice(-4).reverse().map(s => (
                    <button key={s.msg.id} className="ml-row" onClick={() => jump(s.msg.id)}>
                      <Avatar name={s.msg.author} size={24} />
                      <span>{cleanTitle(s.msg.text, people)}</span>
                    </button>
                  ))}
                </div>
              </section>

              <button className="see-more span-12" onClick={() => scrollToId('top', 'insights')}>
                <span><b>See all insights</b><small>Deadline calendar · chat activity · hot topics · full inbox</small></span>
                <span className="circ-btn"><Icon name="arrow" size={18} /></span>
              </button>
            </div>
          ) : (
            <div className="bento">
              {/* KPI strip */}
              {kpis.map(k => (
                <section key={k.label} className="tile span-3 kpi">
                  <div className="kpi-head"><h3>{k.label}</h3><button className="kpi-go" onClick={() => scrollToId(k.target)} title={`Go to ${k.label.toLowerCase()}`}><Icon name="arrow" size={14} /></button></div>
                  <div className="kpi-panel">
                    <div className="kpi-val"><b>{k.value}</b><span>{k.unit}</span></div>
                    <div className="kpi-foot"><span>{k.footL}</span><b>{k.footR}</b></div>
                  </div>
                </section>
              ))}

              {/* Deadline calendar */}
              <section className="tile span-8 cal-tile" id="deadlines">
                <div className="cal-head">
                  <span className="pill-btn">Away {fmtDuration(a.now.getTime() - (lastRead?.ts.getTime() ?? a.now.getTime()))}</span>
                  <h3>Deadlines · {cal.days[0].toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}</h3>
                  <span className="pill-btn">{cal.later ? `+${cal.later} later` : 'Next 6 days'}</span>
                </div>
                <div className="cal">
                  <div className="cal-days">
                    {cal.days.map((d, i) => (
                      <div key={i} className={i === 0 ? 'today' : ''}><span>{d.toLocaleDateString(undefined, { weekday: 'short' })}</span><b>{d.getDate()}</b></div>
                    ))}
                  </div>
                  <div className="cal-body">
                    <div className="cal-hours">{cal.hours.map(h => <span key={h} style={{ top: `${((h - cal.startH) / cal.span) * 100}%` }}>{fmtHour(h)}</span>)}</div>
                    <div className="cal-grid">
                      {cal.days.map((_, i) => <i key={i} style={{ left: `${(i + 0.5) * (100 / cal.days.length)}%` }} />)}
                      {cal.chips.length === 0 && <div className="cal-empty">No deadlines in the next 6 days 🎉</div>}
                      {cal.chips.map(({ s, col, top }) => (
                        <button
                          key={s.msg.id}
                          className={`event ${s.owner === myName ? 'mine' : ''} ${done.has(s.msg.id) ? 'done' : ''}`}
                          style={{ left: `calc(${Math.min(col, cal.days.length - 2) * (100 / cal.days.length)}% + 4px)`, top: `${top}%` }}
                          onClick={() => jump(s.msg.id)}
                          title={s.msg.text}
                        >
                          <span className="ev-text"><b>{cleanTitle(s.msg.text, people)}</b><small>{s.msg.author} · due {fmtTime(s.deadline!)}</small></span>
                          <Avatar name={s.msg.author} size={24} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {nextDue && (
                  <button className="next-event" onClick={() => jump(nextDue.msg.id)}>
                    <span className="ne-label">Next deadline</span>
                    <span className="ne-row"><b>{cleanTitle(nextDue.msg.text, people)}</b><span>{fmtWhen(nextDue.deadline!, a.now)}</span></span>
                  </button>
                )}
                <div className="since">
                  <span>Last read</span>
                  <input type="range" min={0} max={msgs.length - 1} value={sinceIdx} onChange={e => { setSinceIdx(+e.target.value); resetSummary() }} />
                  <span>{lastRead ? `${lastRead.author}, ${fmtTime(lastRead.ts)}` : 'start'}</span>
                </div>
              </section>

              {/* Hot topics */}
              <section className="tile span-4 orange-tile">
                <div className="silhouette">?</div>
                <h2>Hot <span>topics</span></h2>
                <div className="orbit">
                  {topics.map((t, i) => (
                    <button key={t.word} className="o-pill" style={{ marginLeft: ['6%', '30%', '12%', '26%'][i] }} onClick={() => { setQuery(t.word); setView('chat') }}>
                      {i % 2 === 1 && <i className="o-dot l" />}{t.word}{i % 2 === 0 && <i className="o-dot r" />}
                    </button>
                  ))}
                  {topics.length === 0 && <span className="o-pill">Nothing yet</span>}
                </div>
              </section>

              {/* Inbox */}
                <section className="tile span-8" id="inbox">
                  <div className="tile-head"><h3>Priority inbox</h3><button className="more" onClick={() => setShowFyi(!showFyi)} title="Show chatter">•••</button></div>
                  <div className="well">
                    <div className="well-head"><span>{inbox.length} need attention</span><button className="pill-btn sm" onClick={() => setShowFyi(!showFyi)}>{showFyi ? 'Less' : `+${fyi.length} FYI`}</button></div>
                    <div className="papers">
                      {[...inbox, ...(showFyi ? fyi : [])].map(s => (
                        <button key={s.msg.id} className={`paper ${s.priority}`} onClick={() => jump(s.msg.id)}>
                          <div className="p-head"><b>{s.msg.author}</b><span>{fmtTime(s.msg.ts)}</span></div>
                          <div className="p-text">{highlight(s.msg.text, me)}</div>
                          <div className="chips">{s.flags.slice(0, 3).map((f, k) => <span key={k} className={`chip ${f.kind}`}>{f.label}</span>)}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </section>


              {/* Unread + noise gauge */}
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
                    <Gauge pct={noisePct} />
                    <div className="gauge-label"><b>{Math.round(noisePct * 100)}%</b><span>was just chatter</span></div>
                  </div>
                  <p className="sub center">~{a.stats.minutesSaved} min of reading saved</p>
                  <button className="btn-orange wide" onClick={() => scrollToId('todos', 'brief')}>Show what matters</button>
                </section>
              </div>


              {/* Activity chart */}
              <section className="tile span-12" id="activity">
                <ActivityChart msgs={msgs} scored={a.scored} sinceIdx={sinceIdx} onPick={jump} />
              </section>

              {/* Decisions + others */}
              <section className="tile span-6" id="decisions">
                <div className="tile-head"><h3>Decisions made</h3><span className="pill-btn sm">{a.decisions.length}</span></div>
                <div className="rows">
                  {a.decisions.length === 0 && <p className="sub">No decisions spotted.</p>}
                  {a.decisions.map(s => (
                    <div key={s.msg.id} className="row-item clickable" onClick={() => jump(s.msg.id)}>
                      <Avatar name={s.msg.author} size={26} />
                      <span className="r-text wrap">{cleanTitle(s.msg.text, people)}</span>
                      <span className="status done">{fmtTime(s.msg.ts)}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="tile span-6">
                <div className="tile-head"><h3>Others' tasks</h3><span className="pill-btn sm">{otherTodos.length}</span></div>
                <div className="rows">
                  {otherTodos.length === 0 && <p className="sub">None.</p>}
                  {otherTodos.map(s => {
                    const st = statusOf(s)
                    return (
                      <div key={s.msg.id} className="row-item clickable" onClick={() => jump(s.msg.id)}>
                        <span className="tag">{s.owner ?? 'Unassigned'}</span>
                        <span className="r-text wrap">{cleanTitle(s.msg.text, people)}</span>
                        <span className={`status ${st.cls}`}>{st.label}</span>
                      </div>
                    )
                  })}
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
      {toast}
      {intro}
      {dragging && <div className="drop-overlay"><Icon name="upload" size={40} /><b>Drop your chat export</b><small>WhatsApp .txt / .zip · Telegram result.json / messages.html · processed on this device</small></div>}
    </div>
  )
}
