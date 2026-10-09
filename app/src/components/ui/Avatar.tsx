import { hueFor, initials } from '../../core/insights'

/** Initials on a warm gradient derived from the name (stable per person, no images loaded). */
export function Avatar({ name, size = 26 }: { name: string; size?: number }) {
  const h = hueFor(name)
  return (
    <span className="avatar" title={name} style={{ width: size, height: size, fontSize: size * 0.4, background: `linear-gradient(135deg, hsl(${h} 85% 62%), hsl(${h + 8} 70% 32%))` }}>
      {initials(name)}
    </span>
  )
}
