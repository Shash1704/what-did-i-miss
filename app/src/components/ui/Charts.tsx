import type { Scored } from '../../core/analyze'

/** One dot per unread message, coloured by priority. */
export function Dots({ scored }: { scored: Scored[] }) {
  return <div className="dots">{scored.map(s => <i key={s.msg.id} className={s.priority} title={`${s.msg.author}: ${s.msg.text.slice(0, 60)}`} />)}</div>
}

const R = 70
const C = 2 * Math.PI * R
const SWEEP = 0.75

/** 270° arc gauge for a 0–1 value. */
export function Gauge({ pct }: { pct: number }) {
  return (
    <svg viewBox="0 0 180 180" className="gauge" role="img" aria-label={`${Math.round(pct * 100)}%`}>
      <defs>
        <linearGradient id="g-track" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3a2a22" /><stop offset="1" stopColor="#6b3a22" /></linearGradient>
        <linearGradient id="g-val" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#ffb02e" /><stop offset="1" stopColor="#ff7a2f" /></linearGradient>
      </defs>
      <circle cx="90" cy="90" r={R} fill="none" stroke="url(#g-track)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${C * SWEEP} ${C}`} transform="rotate(135 90 90)" />
      <circle cx="90" cy="90" r={R} fill="none" stroke="url(#g-val)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${C * SWEEP * pct} ${C}`} transform="rotate(135 90 90)" style={{ transition: 'stroke-dasharray .8s ease' }} />
    </svg>
  )
}
