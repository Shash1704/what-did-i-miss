import { Icon } from '../ui/Icon'
import type { Nav, View } from '../nav'

interface Props {
  view: View
  nav: Nav
  online: boolean
  isDemo: boolean
  telegramLive: boolean
  install: (() => Promise<void>) | null
  onAbout: () => void
  onOpenFiles: () => void
  onTelegram: () => void
  onBackToDemo: () => void
}

const PRIVACY_NOTE = 'Network locked by the browser (Content Security Policy): this page can only download the open-source AI model, so your chats can\'t be sent anywhere.'

export function Sidebar({ view, nav, online, isDemo, telegramLive, install, onAbout, onOpenFiles, onTelegram, onBackToDemo }: Props) {
  return (
    <aside className="sidebar">
      <button className="logo" onClick={onAbout} title="About this app"><img src="./icons/icon-192.png" alt="What Did I Miss?" /></button>
      <nav className="rail" aria-label="Main">
        <button className={view === 'brief' ? 'on' : ''} onClick={() => nav.go('brief')} title="Briefing" aria-label="Briefing"><Icon name="home" /></button>
        <button className={view === 'insights' ? 'on' : ''} onClick={() => nav.go('insights')} title="Insights" aria-label="Insights"><Icon name="chart" /></button>
        <button className={view === 'chat' ? 'on' : ''} onClick={() => nav.go('chat')} title="Full chat" aria-label="Full chat"><Icon name="chat" /></button>
        <button onClick={() => nav.go('insights', 'deadlines')} title="Deadlines" aria-label="Deadlines"><Icon name="calendar" /></button>
        <button onClick={onOpenFiles} title="Open a chat export" aria-label="Open a chat export"><Icon name="upload" /></button>
        <button className={telegramLive ? 'tg-live' : ''} onClick={onTelegram} title="Connect Telegram (live)" aria-label="Connect Telegram"><Icon name="send" /></button>
      </nav>
      <nav className="rail bottom" aria-label="App">
        {install && <button onClick={install} title="Install app" aria-label="Install app"><Icon name="download" /></button>}
        <button className={online ? 'safe' : 'offline'} title={`${online ? 'Processed on this device · 0 bytes sent' : 'Offline · still working'}. ${PRIVACY_NOTE}`} aria-label="Privacy status"><Icon name="shield" /></button>
        {!isDemo && <button onClick={onBackToDemo} title="Back to the demo chat" aria-label="Back to the demo chat"><Icon name="exit" /></button>}
      </nav>
    </aside>
  )
}
