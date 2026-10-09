import { useMemo, useState } from 'react'
import type { Message } from '../lib/parser'
import type { Scored } from '../lib/analyze'

const W = 1000, H = 230, PAD_L = 44, PAD_R = 16, PAD_T = 34, PAD_B = 30

const fmtTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/** Smooth line through points (cardinal spline → cubic béziers). */
function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return ''
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2
    const t = 0.18
    // Clamp control points between the two endpoints' y so the curve never overshoots below zero
    const lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1])
    const clampY = (v: number) => Math.min(hi, Math.max(lo, v))
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, clampY(p1[1] + (p2[1] - p0[1]) * t)]
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, clampY(p2[1] - (p3[1] - p1[1]) * t)]
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`
  }
  return d
}

interface Props {
  msgs: Message[]
  scored: Scored[]
  sinceIdx: number
  onPick: (id: number) => void
}

export default function ActivityChart({ msgs, scored, sinceIdx, onPick }: Props) {
  const [range, setRange] = useState<'all' | 'unread'>('all')
  const [hover, setHover] = useState<number | null>(null)

  const data = useMemo(() => {
    const domainMsgs = range === 'unread' ? msgs.slice(sinceIdx) : msgs
    if (domainMsgs.length < 2) return null
    const t0 = domainMsgs[0].ts.getTime(), t1 = domainMsgs[domainMsgs.length - 1].ts.getTime()
    const span = Math.max(t1 - t0, 60000)
    const binMs = Math.max(5 * 60000, Math.ceil(span / 28 / 60000) * 60000)
    const nBins = Math.max(2, Math.ceil(span / binMs) + 1)
    const bins = new Array(nBins).fill(0)
    domainMsgs.forEach(m => bins[Math.min(nBins - 1, Math.floor((m.ts.getTime() - t0) / binMs))]++)
    const max = Math.max(...bins, 1)
    const x = (t: number) => PAD_L + ((t - t0) / (binMs * (nBins - 1))) * (W - PAD_L - PAD_R)
    const y = (v: number) => H - PAD_B - (v / max) * (H - PAD_T - PAD_B)
    const pts: [number, number][] = bins.map((v, i) => [x(t0 + i * binMs), y(v)])
    // Interpolate between bin points so markers sit on the plotted line
    const valueAt = (t: number) => {
      const f = Math.min(nBins - 1, Math.max(0, (t - t0) / binMs))
      const i = Math.floor(f), j = Math.min(nBins - 1, i + 1)
      return bins[i] + (bins[j] - bins[i]) * (f - i)
    }
    const peakIdx = bins.indexOf(max)
    const ticks = Array.from({ length: 5 }, (_, i) => t0 + (i / 4) * binMs * (nBins - 1))
    return { t0, binMs, bins, max, x, y, pts, valueAt, peakIdx, ticks }
  }, [msgs, sinceIdx, range])

  if (!data) return null
  const { x, y, pts, max, valueAt, peakIdx, ticks, t0, binMs } = data
  const line = smoothPath(pts)
  const area = `${line} L${pts[pts.length - 1][0]},${H - PAD_B} L${pts[0][0]},${H - PAD_B} Z`
  const lastReadTs = msgs[Math.max(0, sinceIdx - 1)]?.ts.getTime() ?? t0
  const shadeX = Math.max(PAD_L, x(lastReadTs))
  const urgent = scored.filter(s => s.priority === 'urgent' && s.msg.ts.getTime() >= t0)
  const hovered = urgent.find(s => s.msg.id === hover)
  const unreadCount = msgs.length - sinceIdx

  return (
    <div className="activity">
      <div className="act-head">
        <h3>Chat activity</h3>
        <div className="seg">
          <button className={range === 'all' ? 'on' : ''} onClick={() => setRange('all')}>All</button>
          <button className={range === 'unread' ? 'on' : ''} onClick={() => setRange('unread')}>Unread</button>
        </div>
      </div>
      <div className="act-panel">
        <div className="act-figure">
          <b>{unreadCount}</b>
          <span>messages while you were away · peak <em>{max} in {Math.round(binMs / 60000)} min</em> at {fmtTime(new Date(t0 + peakIdx * binMs))}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="act-svg" onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="act-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ff7a2f" stopOpacity=".35" />
              <stop offset="1" stopColor="#ff7a2f" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map(f => (
            <g key={f}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y(max * f)} y2={y(max * f)} className="act-grid" />
              <text x={PAD_L - 10} y={y(max * f) + 4} className="act-label" textAnchor="end">{Math.round(max * f)}</text>
            </g>
          ))}
          {range === 'all' && <>
            <rect x={shadeX} y={PAD_T - 14} width={W - PAD_R - shadeX} height={H - PAD_B - PAD_T + 14} className="act-shade" />
            <line x1={shadeX} x2={shadeX} y1={PAD_T - 14} y2={H - PAD_B} className="act-cut" />
            <text x={shadeX + 8} y={PAD_T - 2} className="act-label strong">Unread →</text>
          </>}
          <path d={area} fill="url(#act-fill)" />
          <path d={line} className="act-line" />
          {ticks.map((t, i) => (
            <text key={i} x={x(t)} y={H - 8} className="act-label" textAnchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}>{fmtTime(new Date(t))}</text>
          ))}
          {urgent.map(s => {
            const cx = x(s.msg.ts.getTime()), cy = y(valueAt(s.msg.ts.getTime()))
            return (
              <g key={s.msg.id} className="act-pt" onMouseEnter={() => setHover(s.msg.id)} onClick={() => onPick(s.msg.id)}>
                <circle cx={cx} cy={cy} r={16} fill="transparent" />
                <circle cx={cx} cy={cy} r={hover === s.msg.id ? 8 : 6} className="act-dot" />
              </g>
            )
          })}
          {hovered && (() => {
            const cx = x(hovered.msg.ts.getTime()), cy = y(valueAt(hovered.msg.ts.getTime()))
            const label = `${hovered.msg.author} · ${fmtTime(hovered.msg.ts)}`
            const wBox = Math.max(140, label.length * 8.6)
            const bx = Math.min(Math.max(cx - wBox / 2, PAD_L), W - PAD_R - wBox)
            return (
              <g pointerEvents="none">
                <line x1={cx} x2={cx} y1={cy} y2={H - PAD_B} className="act-cut dashed" />
                <rect x={bx} y={cy - 46} width={wBox} height={30} rx={8} className="act-tip" />
                <text x={bx + wBox / 2} y={cy - 26} textAnchor="middle" className="act-tip-text">{label}</text>
              </g>
            )
          })()}
        </svg>
        {hovered && <div className="act-quote">“{hovered.msg.text.slice(0, 140)}{hovered.msg.text.length > 140 ? '…' : ''}”</div>}
        {!hovered && <div className="act-quote muted">Hover an orange dot to preview an urgent message · click to open it</div>}
      </div>
    </div>
  )
}
