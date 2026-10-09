import type { Nav, View } from '../nav'

const TABS: [View, string][] = [['brief', 'Briefing'], ['insights', 'Insights'], ['chat', 'Full chat']]

export function ViewTabs({ view, nav, meta }: { view: View; nav: Nav; meta?: string }) {
  return (
    <nav className="num-tabs" aria-label="Views">
      {TABS.map(([v, label], i) => (
        <button key={v} className={view === v ? 'on' : ''} aria-current={view === v ? 'page' : undefined} onClick={() => nav.go(v)}>
          <span className="nt-num">{String(i + 1).padStart(2, '0')}</span>{label}
        </button>
      ))}
      {meta && <span className="nt-meta">{meta}</span>}
    </nav>
  )
}
