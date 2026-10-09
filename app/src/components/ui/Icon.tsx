/** Minimal inline icon set (stroke icons, 24×24 grid). No icon font or network request. */
const PATHS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  chat: 'M4 5h16v11H9l-5 4z',
  calendar: 'M4 6h16v14H4zM4 10h16M9 3v5M15 3v5',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  exit: 'M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5M10 8l-4 4 4 4M6 12h10',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  arrow: 'M7 17L17 7M9 7h8v8',
  sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  reply: 'M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z',
  copy: 'M8 8h11v12H8zM5 16V4h11',
  send: 'M21 3L3 10.5l7 2.5 2.5 7L21 3zM10 13l5-5',
  chart: 'M4 20V11M10 20V5M16 20v-7M21 20H3',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  )
}
