import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { plural } from './core/format'
import { mergeMessages } from './core/merge'
import { parseChat } from './core/parser'
import { useAssistant } from './hooks/useAssistant'
import { useInstallPrompt, useOnline } from './hooks/useBrowser'
import { useChatSession, type OpenableChat } from './hooks/useChatSession'
import { useTelegramLive } from './hooks/useTelegramLive'
import { importChat } from './engine'
import { takeSharedChat } from './services/importFile'
import { storage } from './services/storage'
import { Sidebar } from './components/layout/Sidebar'
import { Topbar } from './components/layout/Topbar'
import { ViewTabs } from './components/layout/ViewTabs'
import type { Nav, View } from './components/nav'
import { IntroModal } from './components/overlays/IntroModal'
import { TelegramModal } from './components/overlays/TelegramModal'
import { Icon } from './components/ui/Icon'
import { BriefingView } from './components/views/BriefingView'
import './App.css'

// Secondary views load on demand, keeping the first paint small
const InsightsView = lazy(() => import('./components/views/InsightsView'))
const ChatView = lazy(() => import('./components/views/ChatView'))

const FILE_TYPES = '.txt,.zip,.json,.html,text/plain,application/zip,application/json,text/html'

/** Composition root: wires the session, AI assistant and live Telegram hooks to the views. */
export default function App() {
  const session = useChatSession()
  const tg = useTelegramLive(session.replaceMessages)
  const ai = useAssistant(session.analysis, session.myName, `${session.source}:${session.chatName}`)
  const online = useOnline()
  const install = useInstallPrompt()

  const [view, setView] = useState<View>('brief')
  const [query, setQuery] = useState('')
  const [flashId, setFlashId] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [showIntro, setShowIntro] = useState(() => !new URLSearchParams(location.search).has('shared') && !storage.introSeen.get())
  const [showTg, setShowTg] = useState(false)
  const [who, setWho] = useState({ open: false, prefill: '' })
  const [sharedNotice, setSharedNotice] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const closeIntro = useCallback(() => { setShowIntro(false); storage.introSeen.set() }, [])

  function openChat(chat: OpenableChat, opts?: { identity?: string; lastRead?: number }) {
    try {
      if (chat.source !== 'telegram-live') tg.unfollow()
      const { askIdentity, prefill } = session.open(chat, opts)
      if (chat.source !== 'demo') closeIntro()
      setWho({ open: askIdentity, prefill })
      setView('brief')
      setQuery('')
      window.scrollTo({ top: 0 })
    } catch (err) {
      alert((err as Error).message)
    }
  }

  function backToDemo() {
    tg.unfollow()
    session.loadDemo()
    setView('brief')
    setQuery('')
  }

  /** One or more files; several files of one chat (e.g. messages.html, messages2.html) are merged. */
  async function openFiles(files: File[]) {
    if (!files.length) return
    try {
      const results = await Promise.all(files.map(f => importChat(f, f.name)))
      const failed = results.find(r => !r.ok)
      if (failed && !failed.ok) throw failed.error
      const chats = results.flatMap(r => (r.ok ? [r.value] : []))
      const chat = chats.length === 1 ? chats[0] : { ...chats[0], messages: mergeMessages(chats.map(c => c.messages)), me: chats.find(c => c.me)?.me }
      openChat(chat)
    } catch (err) {
      alert(`Couldn't read that file: ${(err as Error).message}`)
    }
  }

  function openLiveChat(id: string) {
    const chat = tg.openChat(id)
    if (chat) openChat({ ...chat, source: 'telegram-live' })
    setShowTg(false)
  }

  // A chat shared into the installed app from WhatsApp's share sheet (received locally by sw.js)
  const openChatRef = useRef(openChat)
  useEffect(() => { openChatRef.current = openChat })
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('shared')) return
    history.replaceState(null, '', location.pathname)
    takeSharedChat()
      .then(chat => {
        if (!chat) return
        openChatRef.current(chat)
        setSharedNotice(true)
        setTimeout(() => setSharedNotice(false), 5000)
      })
      .catch(err => alert(`Couldn't read the shared chat: ${(err as Error).message}`))
  }, [])

  const nav: Nav = {
    jump(id) {
      setQuery('')
      setView('chat')
      setFlashId(id)
      setTimeout(() => document.getElementById(`m${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
      setTimeout(() => setFlashId(null), 2500)
    },
    go(next, anchor = 'top') {
      setView(next)
      if (next !== 'chat') setQuery('')
      setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    },
    search(q) {
      setQuery(q)
      setView('chat')
    },
  }

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true) } },
    onDragLeave: (e: React.DragEvent) => { if (e.currentTarget === e.target) setDragging(false) },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setDragging(false); void openFiles([...e.dataTransfer.files]) },
  }

  const { analysis, briefing } = session
  if (!analysis || !briefing) return null

  return (
    <div className={`backdrop ${dragging ? 'dropping' : ''}`} {...dropHandlers}>
      <div className="shell">
        <Sidebar
          view={view}
          nav={nav}
          online={online}
          isDemo={session.isDemo}
          telegramLive={tg.status === 'live'}
          install={install}
          onAbout={() => setShowIntro(true)}
          onOpenFiles={() => fileInput.current?.click()}
          onTelegram={() => setShowTg(true)}
          onBackToDemo={backToDemo}
        />
        <main className="main" id="top">
          <Topbar
            online={online}
            isDemo={session.isDemo}
            query={query}
            onQuery={q => { setQuery(q); if (q) setView('chat') }}
            openTasks={briefing.openTasks}
            onBell={() => nav.go('brief', 'todos')}
            identity={session.identity}
            myName={session.myName}
            suggestions={session.suggestions}
            whoOpen={who.open}
            whoPrefill={who.prefill}
            onWho={open => setWho({ open, prefill: '' })}
            onSaveIdentity={session.saveIdentity}
            onDemoInfo={() => setShowIntro(true)}
          />
          <ViewTabs view={view} nav={nav} meta={view === 'chat' ? plural(session.msgs.length, 'message') : undefined} />
          <Suspense fallback={<section className="tile loading-tile" role="status">Loading…</section>}>
            {view === 'brief' && <BriefingView s={session} ai={ai} nav={nav} live={session.source === 'telegram-live' && tg.status === 'live'} />}
            {view === 'insights' && <InsightsView s={session} nav={nav} />}
            {view === 'chat' && <ChatView s={session} nav={nav} query={query} flashId={flashId} />}
          </Suspense>
        </main>
      </div>

      <input ref={fileInput} type="file" accept={FILE_TYPES} multiple hidden onChange={e => { if (e.target.files?.length) void openFiles([...e.target.files]); e.target.value = '' }} />

      {sharedNotice && <div className="toast" role="status"><span className="dot" />Received from WhatsApp · processed on this device only</div>}
      {showIntro && (
        <IntroModal
          chatName={session.chatName}
          messageCount={session.msgs.length}
          unread={analysis.stats.unread}
          urgent={analysis.stats.urgent}
          onExplore={() => { if (!session.isDemo) backToDemo(); closeIntro() }}
          onOpenFiles={() => fileInput.current?.click()}
          onTelegram={() => { closeIntro(); setShowTg(true) }}
          onPaste={text => openChat({ name: 'Pasted chat', messages: parseChat(text), source: 'text' })}
          onClose={closeIntro}
        />
      )}
      {showTg && <TelegramModal tg={tg} onOpenChat={openLiveChat} onClose={() => setShowTg(false)} />}
      {dragging && (
        <div className="drop-overlay">
          <Icon name="upload" size={40} />
          <b>Drop your chat export</b>
          <small>WhatsApp .txt / .zip · Telegram result.json / messages.html · processed on this device</small>
        </div>
      )}
    </div>
  )
}
