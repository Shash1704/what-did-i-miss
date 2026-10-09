import { useEffect, useState } from 'react'
import { Icon } from '../ui/Icon'

interface Props {
  chatName: string
  messageCount: number
  unread: number
  urgent: number
  onExplore: () => void
  onOpenFiles: () => void
  onTelegram: () => void
  onPaste: (text: string) => void
  onClose: () => void
}

/** Full-screen notice that the app opens on sample data, with ways to load your own chat. */
export function IntroModal({ chatName, messageCount, unread, urgent, onExplore, onOpenFiles, onTelegram, onPaste, onClose }: Props) {
  const [showPaste, setShowPaste] = useState(false)
  const [paste, setPaste] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="intro" role="dialog" aria-modal="true" aria-labelledby="intro-title" onClick={onClose}>
      <div className="intro-card" onClick={e => e.stopPropagation()}>
        <div className="intro-glow" />
        <div className="intro-badge"><span className="sp-dot" />Demo chat</div>
        <h2 id="intro-title">You're looking at a <span>demo chat</span></h2>
        <p>
          This is a sample WhatsApp group, <b>{chatName}</b>, with {messageCount} messages and a few urgent asks hidden in the chatter.
          Explore it freely. Everything is processed <b>on your device</b>, and nothing is uploaded.
        </p>
        <div className="intro-facts">
          <span><b>{unread}</b> unread</span>
          <span><b>{urgent}</b> urgent</span>
          <span><b>0</b> bytes sent</span>
        </div>
        <div className="intro-actions">
          <button className="btn-orange" onClick={onExplore} autoFocus>Explore the demo <Icon name="arrow" size={18} /></button>
          <button className="btn-ghost" onClick={onOpenFiles}><Icon name="upload" size={18} /> Open my chat export</button>
          <button className="btn-link" onClick={onTelegram}>Connect Telegram (live)</button>
          <button className="btn-link" onClick={() => setShowPaste(v => !v)}>{showPaste ? 'Hide paste box' : 'Paste a chat instead'}</button>
        </div>
        {showPaste && (
          <div className="intro-paste">
            <textarea className="paste" value={paste} onChange={e => setPaste(e.target.value)} placeholder={'Ananya: @Shashwat can you send the deck by 5pm?\nRohan: venue is final, main auditorium'} autoFocus aria-label="Paste a chat" />
            <button className="btn-orange wide" disabled={!paste.trim()} onClick={() => onPaste(paste)}>Analyze</button>
          </div>
        )}
        <small className="intro-tip">Works with <b>WhatsApp</b> (.txt / .zip export) and <b>Telegram Desktop</b> (Export chat history → result.json or messages.html). Drop the file anywhere on the page. On Android, share a WhatsApp export straight to <b>Missed?</b></small>
      </div>
    </div>
  )
}
