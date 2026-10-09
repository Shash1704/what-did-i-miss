import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icon'
import { IdentityPopover } from '../overlays/IdentityPopover'

interface Props {
  online: boolean
  isDemo: boolean
  query: string
  onQuery: (q: string) => void
  openTasks: number
  onBell: () => void
  identity: string
  myName: string
  suggestions: string[]
  whoOpen: boolean
  whoPrefill: string
  onWho: (open: boolean) => void
  onSaveIdentity: (identity: string) => void
  onDemoInfo: () => void
}

export function Topbar(p: Props) {
  return (
    <header className="topbar">
      <div className={`status-pill ${p.online ? '' : 'offline'}`}>
        <span className="sp-dot" />
        <span>{p.online ? 'On-device' : 'Offline'}</span>
        <span className="sp-sep" />
        <span className="sp-muted">0 bytes sent</span>
      </div>
      {p.isDemo && <button className="demo-pill" onClick={p.onDemoInfo} title="You're viewing sample data. Click to load your own chat.">Demo chat · use yours</button>}
      <label className="search">
        <Icon name="search" size={18} />
        <input value={p.query} onChange={e => p.onQuery(e.target.value)} placeholder="Search this chat (stays on your device)" aria-label="Search this chat" />
        {p.query && <button className="clear" onClick={() => p.onQuery('')} aria-label="Clear search">×</button>}
      </label>
      <div className="top-right">
        <button className="bell" onClick={p.onBell} title="Tasks for you" aria-label={`${p.openTasks} open tasks for you`}>
          <Icon name="bell" size={18} />
          {p.openTasks > 0 && <span className="badge">{p.openTasks}</span>}
        </button>
        <button className="me" title={`You are: ${p.identity || 'not set'} (click to change)`} onClick={() => p.onWho(!p.whoOpen)} aria-label="Who are you?">
          <Avatar name={p.myName} size={38} />
        </button>
        {p.whoOpen && <IdentityPopover initial={p.whoPrefill || p.identity} suggestions={p.suggestions} onSave={p.onSaveIdentity} onClose={() => p.onWho(false)} />}
      </div>
    </header>
  )
}
