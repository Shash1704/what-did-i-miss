/** Small, locale-aware formatting helpers shared by the UI. Pure functions. */

export const fmtTime = (d: Date): string => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

export const fmtHour = (h: number): string => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

export const fmtDayTime = (d: Date): string => d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })

/** "45m", "3h 12m", "4d" */
export function fmtDuration(ms: number): string {
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.round(h / 24)}d`
}

export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

export const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
