import { useState } from 'react'
import { fmtTime, plural } from '../../core/format'
import type { TelegramLive } from '../../hooks/useTelegramLive'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icon'

const BADGE: Record<TelegramLive['status'], string> = { off: 'Telegram · live', connecting: 'Connecting…', live: 'Live', error: 'Not connected' }

/** Connect your own Telegram bot (setup steps, token entry) and pick a live chat. */
export function TelegramModal({ tg, onOpenChat, onClose }: { tg: TelegramLive; onOpenChat: (id: string) => void; onClose: () => void }) {
  const [draft, setDraft] = useState('')
  const connect = async () => { await tg.connect(draft); setDraft('') }

  return (
    <div className="intro" role="dialog" aria-modal="true" aria-labelledby="tg-title" onClick={onClose}>
      <div className="intro-card tg-card" onClick={e => e.stopPropagation()}>
        <div className="intro-glow tg" />
        <div className="intro-badge"><span className={`tg-dot ${tg.status}`} />{BADGE[tg.status]}{tg.status === 'live' && tg.botName ? ` · @${tg.botName}` : ''}</div>
        <h2 id="tg-title">Connect <span>Telegram</span> live</h2>
        {!tg.connected ? (
          <>
            <p>Use <b>your own Telegram bot</b>. Your browser talks directly to Telegram, with no server of ours in between. Telegram holds a bot's messages for up to <b>24 hours</b>, so open the app after a lecture and everything you missed is waiting.</p>
            <ol className="tg-steps">
              <li>In Telegram, message <b>@BotFather</b> → <code>/newbot</code> → copy the <b>token</b> it gives you.</li>
              <li>Send BotFather <code>/setprivacy</code> → choose your bot → <b>Disable</b>, so it can read group messages.</li>
              <li><b>Add your bot to the group</b> you want to follow.</li>
              <li>Paste the token below.</li>
            </ol>
            <div className="tg-connect">
              <input type="password" autoComplete="off" spellCheck={false} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void connect() }} placeholder="Bot token, e.g. 123456:ABC-DEF…" aria-label="Bot token" />
              <button className="btn-orange" disabled={!draft.trim() || tg.status === 'connecting'} onClick={() => void connect()}>Connect</button>
            </div>
            {tg.error && <p className="err-line" role="alert">{tg.error}</p>}
            <small className="intro-tip">The token is stored only in this browser. It only sees messages sent <b>after</b> the bot joins; for older history, use a Telegram Desktop export.</small>
          </>
        ) : (
          <>
            <p>{tg.status === 'live' ? 'Listening. New messages arrive in a few seconds.' : tg.status === 'error' ? `Connection problem: ${tg.error}. Retrying…` : 'Connecting to Telegram…'} Send a message in a group your bot is in to see it appear.</p>
            <div className="tg-chats">
              {tg.chats.length === 0 && <div className="tg-empty">No messages yet. Add <b>@{tg.botName}</b> to a group and say hi.</div>}
              {tg.chats.map(c => (
                <button key={c.id} className="tg-chat" onClick={() => onOpenChat(c.id)}>
                  <Avatar name={c.title} size={34} />
                  <span><b>{c.title}</b><small>{plural(c.count, 'message')}{c.last ? ` · last ${fmtTime(new Date(c.last))}` : ''}</small></span>
                  <Icon name="arrow" size={16} />
                </button>
              ))}
            </div>
            <div className="intro-actions">
              <button className="btn-ghost" onClick={tg.disconnect}>Disconnect &amp; forget</button>
            </div>
            <small className="intro-tip">Messages are stored only in this browser. "Disconnect" deletes the token and every stored message.</small>
          </>
        )}
      </div>
    </div>
  )
}
